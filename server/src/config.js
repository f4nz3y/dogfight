
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(currentDir, "..");

function readNumber(name, fallback, min, max) {
  const raw = process.env[name];

  if (raw === undefined || raw === "") {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid configuration: ${name}`);
  }

  return value;
}

export const config = {
  host: process.env.HOST || "127.0.0.1",
  port: readNumber("PORT", 3001, 1, 65535),

  logDir: path.resolve(
    serverDir,
    process.env.LOG_DIR || "logs"
  ),

  maxPayload: readNumber("MAX_PAYLOAD", 1024, 100, 1024 * 1024),
  maxRooms: readNumber("MAX_ROOMS", 20, 1, 1000),
  maxPlayersPerRoom: readNumber("MAX_PLAYERS_PER_ROOM", 4, 1, 100)
};

export const projectDir = path.resolve(serverDir, "..");
export const clientDistDir = path.join(projectDir, "client", "dist");
