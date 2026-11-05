// @ts-nocheck
import http from "node:http";
import path from "node:path";
import { createReadStream } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { MatchLog } from "./log/matchlog.ts";
import { attachWebSocket, getRealtimeStats } from "./ws.ts";
import { config, clientDistDir } from "./config.ts";
import { RoomManager } from "./rooms.ts";
import { roomCreateSchema } from "@dogfight/shared/protocol";

const roomManager = new RoomManager({
  maxRooms: config.maxRooms,
  maxPlayersPerRoom: config.maxPlayersPerRoom
});

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ico": "image/x-icon"
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data));
}

async function readBody(request, limit = 16 * 1024) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function serveStatic(response, pathname) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: "Invalid URL encoding" });
    return;
  }

  const relativePath = decodedPath === "/"
    ? "index.html"
    : decodedPath.replace(/^\/+/, "");

  const root = path.resolve(clientDistDir);
  const filePath = path.resolve(root, relativePath);

  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    sendJson(response, 403, { error: "Forbidden path" });
    return;
  }

  try {
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) {
      sendJson(response, 404, { error: "File not found" });
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": fileInfo.size,
      "Cache-Control": "no-cache"
    });

    await pipeline(createReadStream(filePath), response);
  } catch (error) {
    if (!response.headersSent) {
      sendJson(response, 404, { error: "File not found" });
    } else {
      response.destroy(error);
    }
  }
}

// Кожна кімната має послідовну чергу запису подій.
// Після empty поточний файл закривається; наступна сесія отримає новий файл.
const roomLogQueues = new Map();
const activeRoomLogs = new Map();

function attachRoomLogging(room) {
  let queue = Promise.resolve();
  let currentLog = null;

  room.on("event", (event) => {
    queue = queue.then(async () => {
      if (!currentLog) {
        currentLog = new MatchLog(config.logDir, room.id);
        await currentLog.start();
        activeRoomLogs.set(room.id, currentLog);
        console.log(`[LOG] Started: ${currentLog.fileName}`);
      }

      await currentLog.append(event);

      if (event.type === "empty") {
        await currentLog.close();
        activeRoomLogs.delete(room.id);
        console.log(`[LOG] Closed room ${room.id}`);
        currentLog = null;
      }
    }).catch((error) => {
      console.error("[LOG] Room event could not be written:", error);
    });

    roomLogQueues.set(room.id, queue);
  });
}

roomManager.on("roomCreated", attachRoomLogging);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        status: "ok",
        uptime: process.uptime()
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/rooms") {
      sendJson(response, 200, { rooms: roomManager.listRooms() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/stats") {
      sendJson(response, 200, {
        tickRate: 30,
        matches: getRealtimeStats()
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      let body;
      try {
        body = JSON.parse(await readBody(request));
      } catch (error) {
        sendJson(response, error.statusCode || 400, {
          error: error.statusCode === 413 ? "Request body too large" : "Invalid JSON"
        });
        return;
      }

      const roomBody = roomCreateSchema.safeParse(body);
      if (!roomBody.success) {
        sendJson(response, 400, {
          error: "Room name must contain 2–40 characters"
        });
        return;
      }

      try {
        const room = roomManager.createRoom(roomBody.data.name);
        sendJson(response, 201, { room: room.toJSON() });
      } catch (error) {
        sendJson(response, 409, { error: error.message });
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/replays") {
      await mkdir(config.logDir, { recursive: true });
      const files = (await readdir(config.logDir))
        .filter((file) => file.endsWith(".ndjson"));
      sendJson(response, 200, { replays: files });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/replays/")) {
      let fileName;
      try {
        fileName = decodeURIComponent(url.pathname.slice("/api/replays/".length));
      } catch {
        sendJson(response, 400, { error: "Invalid replay name" });
        return;
      }

      if (!/^[a-f0-9-]+-\d+\.ndjson$/i.test(fileName)) {
        sendJson(response, 400, { error: "Invalid replay name" });
        return;
      }

      const logRoot = path.resolve(config.logDir);
      const filePath = path.resolve(logRoot, fileName);
      if (!filePath.startsWith(`${logRoot}${path.sep}`)) {
        sendJson(response, 403, { error: "Forbidden path" });
        return;
      }

      try {
        const fileInfo = await stat(filePath);
        response.writeHead(200, {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Content-Length": fileInfo.size,
          "Content-Disposition": `attachment; filename="${fileName}"`
        });
        await pipeline(createReadStream(filePath), response);
      } catch (error) {
        if (!response.headersSent) sendJson(response, 404, { error: "Replay not found" });
        else response.destroy(error);
      }
      return;
    }

    // Навмисно блокувальний маршрут для демонстрації event loop.
    if (request.method === "GET" && url.pathname === "/api/slow") {
      const requested = Number(url.searchParams.get("ms") || 500);
      const ms = Number.isFinite(requested)
        ? Math.max(0, Math.min(2000, Math.trunc(requested)))
        : 500;

      const end = Date.now() + ms;
      while (Date.now() < end) {
        // Навмисне синхронне блокування event loop.
      }

      sendJson(response, 200, {
        blockedForMs: ms,
        note: "This endpoint intentionally blocks the event loop"
      });
      return;
    }

    // Потокова генерація NDJSON, 1–200 MB.
    if (request.method === "GET" && url.pathname === "/api/large-stream") {
      const requested = Number(url.searchParams.get("mb") || 10);
      const mb = Number.isFinite(requested)
        ? Math.max(1, Math.min(200, Math.trunc(requested)))
        : 10;
      const targetBytes = mb * 1024 * 1024;

      response.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="sample-${mb}mb.ndjson"`,
        "Cache-Control": "no-store"
      });

      async function* generate() {
        let sent = 0;
        let index = 0;

        while (sent < targetBytes) {
          const line = `${JSON.stringify({
            index,
            timestamp: Date.now(),
            payload: "x".repeat(900)
          })}\n`;
          const chunk = Buffer.from(line);
          sent += chunk.length;
          index += 1;
          yield chunk;

          if (index % 100 === 0) {
            await new Promise((resolve) => setImmediate(resolve));
          }
        }
      }

      await pipeline(Readable.from(generate()), response);
      return;
    }

    if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
      await serveStatic(response, url.pathname);
      return;
    }

    sendJson(response, 404, { error: "Route not found" });
  } catch (error) {
    console.error("[HTTP] Request error:", error);
    if (!response.headersSent) {
      sendJson(response, error.statusCode || 500, {
        error: error.statusCode === 413 ? "Request body too large" : "Internal server error"
      });
    } else {
      response.destroy(error);
    }
  }
});

const webSocket = attachWebSocket(server, roomManager);

async function startServer() {
  roomManager.createRoom("Training Room");
  await mkdir(config.logDir, { recursive: true });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });

  console.log(`[SERVER] Listening on http://${config.host}:${config.port}`);
  console.log("[WS] WebSocket endpoint: /ws");
}

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[SERVER] ${signal} received; shutting down...`);

  await webSocket.close();

  for (const queue of roomLogQueues.values()) {
    await queue;
  }

  for (const log of activeRoomLogs.values()) {
    try {
      await log.close();
    } catch (error) {
      console.error("[LOG] Shutdown error:", error.message);
    }
  }
  activeRoomLogs.clear();

  await new Promise((resolve) => {
    server.close(() => resolve());
  });

  process.exit(0);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

startServer().catch((error) => {
  console.error("[SERVER] Startup failed:", error);
  process.exitCode = 1;
});
