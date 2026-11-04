import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { validateMessage } from "./protocol.js";
import { decodeInput } from "@dogfight/shared";
import { config } from "./config.js";
import { Match } from "./realtime/match.js";

const MAX_BUFFERED_BYTES = 64 * 1024;
const matches = new Map();

function send(socket, message) {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
    console.warn("[WS] Slow client: outbound message skipped");
    return;
  }
  socket.send(JSON.stringify(message), (error) => {
    if (error) console.error("[WS] Send error:", error.message);
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

export function getRealtimeStats() {
  return [...matches.values()].map((match) => match.stats());
}

export function attachWebSocket(server, roomManager) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: config.maxPayload });

  server.on("upgrade", (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url, `http://${request.headers.host}`);
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (webSocket) => {
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
    socket.on("error", (error) => console.error("[WS] Socket error:", error.message));

    socket.on("message", (raw, isBinary) => {
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

      if (message?.type === "ping") {
        const conditions = socket.netConditions;
        const delay = Math.max(0, conditions.latency +
          (Math.random() * 2 - 1) * conditions.jitter);
        setTimeout(() => {
          send(socket, { v: 1, type: "pong", clientTime: message.clientTime, serverTime: performance.now() });
        }, delay);
        return;
      }

      const validation = validateMessage(message);
      if (!validation.valid) {
        sendError(socket, validation.error);
        socket.close(1008, validation.error.slice(0, 100));
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
        console.log(`[WS] ${player.name} joined ${room.name} (slot ${socket.matchEntry.slot})`);
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

  wss.on("error", (error) => console.error("[WS] Server error:", error));

  return {
    wss,
    async close() {
      clearInterval(heartbeat);
      for (const match of matches.values()) match.stop();
      matches.clear();
      for (const socket of wss.clients) socket.close(1001, "Server shutting down");
      await new Promise((resolve) => wss.close(resolve));
    }
  };
}
