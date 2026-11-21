// @ts-nocheck
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { decodeInput } from "@dogfight/shared/codec";
import { validateMessage } from "@dogfight/shared/protocol";
import { config } from "./config.ts";
import { canSend } from "./backpressure.ts";
import { Match } from "./realtime/match.ts";
import { botInput } from "./bots.ts";
import { log, rejectConnection, recordInbound, recordOutbound } from "./observability.ts";

const matches = new Map();

function send(socket, message) {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (!canSend(socket.bufferedAmount)) {
    log("warn", "ws.slow_client", {
      reason: "outbound_message_skipped"
    });
    return;
  }
  const serialized = JSON.stringify(message);
  recordOutbound(Buffer.byteLength(serialized));
  socket.send(serialized, (error) => {
    if (error) {
      log("error", "ws.send.error", {
      error: error.message
      });
    }
  });
}

function sendToRoom(room, message) {
  for (const player of room.players.values()) send(player.socket, message);
}

function sendError(socket, message) {
  send(socket, { v: 1, type: "error", message });
}

function createRateLimiter() {
  return {
    tokens: 60,
    updatedAt: Date.now(),
    allow() {
      const now = Date.now();
      this.tokens = Math.min(60, this.tokens + ((now - this.updatedAt) / 1000) * 60);
      this.updatedAt = now;
      if (this.tokens < 1) return false;
      this.tokens -= 1;
      return true;
    }
  };
}

function getMatch(room) {
  let match = matches.get(room.id);
  if (!match) {
    match = new Match(room);
    matches.set(room.id, match);
  }
  return match;
}

export function addBots(room, count) {
 if (!Number.isInteger(count) || count < 1 || count > 32) throw new Error("count must be 1..32");
 if (room.players.size + count > room.maxPlayers) throw new Error("Room capacity exceeded");
 const match = getMatch(room);
 const ids = [];
 for (let i=0;i<count;i++) {
   const socket = {
  readyState: WebSocket.OPEN,
  bufferedAmount: 0,
  send(_data, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    if (typeof cb === "function") {
      cb(null);
    }
  }
};
   const player = {id:randomUUID(),name:`Bot ${room.players.size+1}`,socket,isBot:true};
   room.join(player); match.add(player); ids.push(player.id);
 }
 for (const player of room.players.values()) if (!player.isBot) send(player.socket,{v:1,type:"roster",players:room.getRoster()});
 return ids;
}
export function getRealtimeStats() {
  return [...matches.entries()].map(([roomId, match]) => ({
    roomId,
    ...match.stats()
  }));
}

export function attachWebSocket(server, roomManager) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: config.maxPayload });
  const ipConnections = new Map();
  let stopping = false;
  const failUpgrade = (socket, status, reason) => {
    rejectConnection(reason);
    socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
  };

  server.on("upgrade", (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url, `http://${request.headers.host}`);
    } catch {
      socket.destroy();
      return;
    }
    if (stopping) { failUpgrade(socket, 503, "Shutting down"); return; }
    const origin = request.headers.origin;
    if (origin && !config.allowedOrigins.includes(origin)) {
      failUpgrade(socket, 403, "Origin not allowed"); return;
    }
    const ip = request.socket.remoteAddress || "unknown";
    if ((ipConnections.get(ip) || 0) >= config.maxConnectionsPerIp) {
      failUpgrade(socket, 429, "Too many connections"); return;
    }
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    ipConnections.set(ip, (ipConnections.get(ip) || 0) + 1);
    let upgraded = false;
    socket.once("close", () => {
      if (!upgraded) ipConnections.set(ip, Math.max(0, (ipConnections.get(ip) || 1) - 1));
    });
    wss.handleUpgrade(request, socket, head, (webSocket) => {
      upgraded = true;
      webSocket.once("close", () => ipConnections.set(ip, Math.max(0, (ipConnections.get(ip) || 1) - 1)));
      webSocket.netConditions = {
        latency: Math.max(0, Math.min(500, Number(url.searchParams.get("latency")) || 0)),
        jitter: Math.max(0, Math.min(200, Number(url.searchParams.get("jitter")) || 0)),
        drop: Math.max(0, Math.min(20, Number(url.searchParams.get("drop")) || 0))
      };
      wss.emit("connection", webSocket, request);
    });
  });

  wss.on("connection", (socket) => {
    socket.player = null;
    socket.room = null;
    socket.isAlive = true;
    const limiter = createRateLimiter();
    const joinTimeout = setTimeout(() => {
      if (!socket.player) socket.close(1008, "Join timeout");
    }, 10000);

    socket.on("pong", () => { socket.isAlive = true; });
    socket.on("error", (error) => {
      log("error", "ws.socket.error", {
        error: error.message
      });
    });

    socket.on("message", (raw, isBinary) => {
      recordInbound(raw.length);
      if (isBinary) {
        if (!socket.player || !socket.matchEntry) return;
        let input;
        try {
          input = decodeInput(raw);
        } catch (error) {
          sendError(socket, error.message);
          return;
        }
        if (!limiter.allow()) return;
        const conditions = socket.netConditions;
        if (Math.random() * 100 < conditions.drop) return;
        const delay = Math.max(0, conditions.latency / 2 +
          (Math.random() * 2 - 1) * conditions.jitter / 2);
        const deliver = () => {
          if (socket.readyState !== WebSocket.OPEN || !socket.matchEntry) return;
          const match = matches.get(socket.room?.id);
          match?.enqueue(socket.matchEntry, input);
          if (match) match.totalBytesIn += raw.length;
        };
        if (delay > 0) setTimeout(deliver, delay);
        else deliver();
        return;
      }

      if (!limiter.allow()) {
        socket.close(1008, "Rate limit exceeded");
        return;
      }

      let message;
      try { message = JSON.parse(raw.toString()); }
      catch {
        sendError(socket, "Invalid JSON");
        socket.close(1008, "Invalid JSON");
        return;
      }

      const validation = validateMessage(message);
      if (!validation.valid) {
        sendError(socket, validation.error);
        socket.close(1008, validation.error.slice(0, 100));
        return;
      }
      message = validation.message;

      if (message.type === "ping") {
        const conditions = socket.netConditions;
        const delay = Math.max(0, conditions.latency +
          (Math.random() * 2 - 1) * conditions.jitter);
        setTimeout(() => {
          send(socket, { v: 1, type: "pong", clientTime: message.clientTime, serverTime: performance.now() });
        }, delay);
        return;
      }

      if (message.type === "join") {
        if (socket.player) {
          sendError(socket, "Already joined");
          return;
        }
        const room = roomManager.getRoom(message.room);
        if (!room) {
          sendError(socket, "Room not found");
          return;
        }
        const player = { id: randomUUID(), name: message.name.trim(), socket };
        try { room.join(player); }
        catch (error) { sendError(socket, error.message); return; }
        socket.player = player;
        socket.room = room;
        clearTimeout(joinTimeout);

        const match = getMatch(room);
        match.add(player);
        send(socket, {
          v: 1, type: "joined", playerId: player.id, slot: socket.matchEntry.slot,
          room: room.toJSON()
        });
        sendToRoom(room, { v: 1, type: "roster", players: room.getRoster() });
        log("info", "player.joined", { roomId: room.id, playerId: player.id, slot: socket.matchEntry.slot });
        return;
      }

      if (!socket.player || !socket.room) {
        sendError(socket, "Join a room first");
        return;
      }

      if (message.type === "chat") {
        const chatMessage = socket.room.chat(socket.player, message.text.trim());
        sendToRoom(socket.room, { v: 1, type: "chat", message: chatMessage });
        return;
      }

      if (message.type === "leave") {
        const room = socket.room;
        const playerId = socket.player.id;
        matches.get(room.id)?.remove(playerId);
        socket.matchEntry = null;
        socket.player = null;
        socket.room = null;
        room.leave(playerId);
        send(socket, { v: 1, type: "left" });
        sendToRoom(room, { v: 1, type: "roster", players: room.getRoster() });
        return;
      }
    });

    socket.on("close", () => {
      clearTimeout(joinTimeout);
      if (socket.room && socket.player) {
        const room = socket.room;
        const playerId = socket.player.id;
        matches.get(room.id)?.remove(playerId);
        socket.matchEntry = null;
        socket.room = null;
        socket.player = null;
        room.leave(playerId);
        sendToRoom(room, { v: 1, type: "roster", players: room.getRoster() });
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (!socket.isAlive) { socket.terminate(); continue; }
      socket.isAlive = false;
      socket.ping();
    }
  }, 15000);
  heartbeat.unref();

  wss.on("error", (error) => {
    log("error", "ws.server.error", {
      error: error.message,
      stack: error.stack
    });
  });

  return {
    wss,
    getConnectionCount() { return wss.clients.size; },
    async close() {
      stopping = true;
      clearInterval(heartbeat);
      for (const match of matches.values()) match.stop();
      matches.clear();
      for (const socket of wss.clients) {
        send(socket, { v: 1, type: "shutdown", message: "Server restarting" });
        socket.close(1001, "Server restarting");
      }
      await Promise.race([
        new Promise(resolve => wss.close(resolve)),
        new Promise(resolve => setTimeout(() => {
          for (const socket of wss.clients) socket.terminate();
          resolve();
        }, 3000))
      ]);
    }
  };
}
