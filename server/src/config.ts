import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(currentDir, "..");

const envSchema = z.object({
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_DIR: z.string().default("logs"),
  MAX_PAYLOAD: z.coerce.number().int().min(100).max(1024 * 1024).default(1024),
  MAX_ROOMS: z.coerce.number().int().min(1).max(1000).default(20),
  MAX_PLAYERS_PER_ROOM: z.coerce.number().int().min(1).max(100).default(16),
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().min(1).max(10000).default(32),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  VERSION: z.string().default("dev")
});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  throw new Error(`Invalid server configuration: ${parsedEnv.error.message}`);
}
const env = parsedEnv.data;

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly logDir: string;
  readonly maxPayload: number;
  readonly maxRooms: number;
  readonly maxPlayersPerRoom: number;
  readonly maxConnectionsPerIp: number;
  readonly allowedOrigins: string[];
  readonly logLevel: string;
  readonly version: string;
}

export const config = {
  host: env.HOST,
  port: env.PORT,
  logDir: path.resolve(serverDir, env.LOG_DIR),
  maxPayload: env.MAX_PAYLOAD,
  maxRooms: env.MAX_ROOMS,
  maxPlayersPerRoom: env.MAX_PLAYERS_PER_ROOM,
  maxConnectionsPerIp: env.MAX_CONNECTIONS_PER_IP,
  allowedOrigins: env.ALLOWED_ORIGINS.split(",").map(x => x.trim()).filter(Boolean),
  logLevel: env.LOG_LEVEL,
  version: env.VERSION
} satisfies ServerConfig;

export const projectDir = path.resolve(serverDir, "..");
export const clientDistDir = path.join(projectDir, "client", "dist");
