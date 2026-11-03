import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { validateMessage } from "./protocol.js";
import { config } from "./config.js";

const MAX_BUFFERED_BYTES = 64 * 1024;

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
  for (const player of room.players.values()) {
    send(player.socket, message);
  }
}

function sendError(socket, message) {
  send(socket, { v: 1, type: "error", message });
}

function createRateLimiter() {
  return {
    tokens: 10,
    updatedAt: Date.now(),

    allow() {
      const now = Date.now();
      const elapsedSeconds = (now - this.updatedAt) / 1000;
      this.tokens = Math.min(10, this.tokens + elapsedSeconds * 5);
      this.updatedAt = now;

      if (this.tokens < 1) return false;
      this.tokens -= 1;
      return true;
    }
  };
}

export function attachWebSocket(server, roomManager) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: config.maxPayload
  });

  server.on("upgrade", (request, socket, head) => {
    let pathname;

    try {
      pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (webSocket) => {
      wss.emit("connection", webSocket, request);
    });
  });

  wss.on("connection", (socket) => {
    console.log("[WS] Client connected");
    socket.player = null;
    socket.room = null;
    socket.isAlive = true;

    const limiter = createRateLimiter();
    const joinTimeout = setTimeout(() => {
      if (!socket.player) socket.close(1008, "Join timeout");
    }, 10000);

    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.on("error", (error) => {
      console.error("[WS] Socket error:", error.message);
    });

    socket.on("message", (raw) => {
      if (!limiter.allow()) {
        socket.close(1008, "Rate limit exceeded");
        return;
      }

      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
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

        const player = {
          id: randomUUID(),
          name: message.name.trim(),
          socket
        };

        try {
          room.join(player);
        } catch (error) {
          sendError(socket, error.message);
          return;
        }

        socket.player = player;
        socket.room = room;
        clearTimeout(joinTimeout);

        send(socket, {
          v: 1,
          type: "joined",
          playerId: player.id,
          room: room.toJSON()
        });

        sendToRoom(room, {
          v: 1,
          type: "roster",
          players: room.getRoster()
        });

        console.log(`[WS] ${player.name} joined ${room.name}`);
        return;
      }

      if (!socket.player || !socket.room) {
        sendError(socket, "Join a room first");
        return;
      }

      if (message.type === "chat") {
        const chatMessage = socket.room.chat(
          socket.player,
          message.text.trim()
        );

        sendToRoom(socket.room, {
          v: 1,
          type: "chat",
          message: chatMessage
        });
        return;
      }

      if (message.type === "leave") {
        const room = socket.room;
        const playerId = socket.player.id;
        socket.player = null;
        socket.room = null;

        room.leave(playerId);
        send(socket, { v: 1, type: "left" });
        sendToRoom(room, {
          v: 1,
          type: "roster",
          players: room.getRoster()
        });
      }
    });

    socket.on("close", () => {
      clearTimeout(joinTimeout);

      if (socket.room && socket.player) {
        const room = socket.room;
        const playerId = socket.player.id;
        socket.room = null;
        socket.player = null;
        room.leave(playerId);
        sendToRoom(room, {
          v: 1,
          type: "roster",
          players: room.getRoster()
        });
      }

      console.log("[WS] Client disconnected");
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;

      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }

      socket.isAlive = false;
      socket.ping();
    }
  }, 15000);
  heartbeat.unref();

  wss.on("error", (error) => {
    console.error("[WS] Server error:", error);
  });

  return {
    wss,

    async close() {
      clearInterval(heartbeat);
      for (const socket of wss.clients) {
        socket.close(1001, "Server shutting down");
      }
      await new Promise((resolve) => wss.close(resolve));
    }
  };
}
