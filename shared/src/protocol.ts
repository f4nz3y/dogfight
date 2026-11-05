import { z } from "zod";

export const PROTOCOL_VERSION = 1;

const joinSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal("join"),
  room: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(24)
}).strict();
const chatSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal("chat"),
  text: z.string().trim().min(1).max(300)
}).strict();
const leaveSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal("leave")
}).strict();
const pingSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal("ping"),
  clientTime: z.number().finite()
}).strict();

export const clientMessageSchema = z.discriminatedUnion("type", [
  joinSchema, chatSchema, leaveSchema, pingSchema
]);
export const roomCreateSchema = z.object({
  name: z.string().trim().min(2).max(40)
}).strict();
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type JoinMessage = Extract<ClientMessage, { type: "join" }>;
export type ChatMessage = Extract<ClientMessage, { type: "chat" }>;
export type LeaveMessage = Extract<ClientMessage, { type: "leave" }>;
export type PingMessage = Extract<ClientMessage, { type: "ping" }>;

export type ValidationResult =
  | { readonly valid: true; readonly message: ClientMessage }
  | { readonly valid: false; readonly error: string };

/** Validate untrusted WebSocket JSON at the network boundary. */
export function validateMessage(message: unknown): ValidationResult {
  const result = clientMessageSchema.safeParse(message);
  if (!result.success) {
    return { valid: false, error: result.error.issues[0]?.message ?? "Invalid message" };
  }
  return { valid: true, message: result.data };
}
