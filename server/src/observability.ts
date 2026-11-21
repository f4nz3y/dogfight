import { performance } from "node:perf_hooks";
import { config } from "./config.ts";

import pino from "pino";

const logger = pino({
  level: config.logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label })
  }
});

export function log(
  level: "debug" | "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {}
) {
  logger[level]({ ...fields, event }, event);
}
const rejected = new Map<string, number>();
export function rejectConnection(reason: string) {
  rejected.set(reason, (rejected.get(reason) || 0) + 1);
  log("warn", "ws.rejected", { reason });
}
let receivedMessages = 0;
let sentMessages = 0;
let receivedBytes = 0;
let sentBytes = 0;
export function recordInbound(bytes: number) { receivedMessages++; receivedBytes += bytes; }
export function recordOutbound(bytes: number) { sentMessages++; sentBytes += bytes; }
export function metrics(roomManager: any, realtime: any[], connections: number) {
  const rooms = roomManager.listRooms();
  const tickP99 = Math.max(0, ...realtime.map(m => m.tickP99Ms || 0));
  const elu = performance.eventLoopUtilization().utilization;
  const lines = [
    '# TYPE dogfight_connected_players gauge', `dogfight_connected_players ${connections}`,
    '# TYPE dogfight_rooms gauge', `dogfight_rooms ${rooms.length}`,
    '# TYPE dogfight_tick_p99_ms gauge', `dogfight_tick_p99_ms ${tickP99}`,
    '# TYPE dogfight_event_loop_utilization gauge', `dogfight_event_loop_utilization ${elu}`,
    '# TYPE dogfight_rss_bytes gauge', `dogfight_rss_bytes ${process.memoryUsage().rss}`,
    '# TYPE dogfight_ws_messages_received_total counter', `dogfight_ws_messages_received_total ${receivedMessages}`,
    '# TYPE dogfight_ws_messages_sent_total counter', `dogfight_ws_messages_sent_total ${sentMessages}`,
    '# TYPE dogfight_ws_bytes_received_total counter', `dogfight_ws_bytes_received_total ${receivedBytes}`,
    '# TYPE dogfight_ws_bytes_sent_total counter', `dogfight_ws_bytes_sent_total ${sentBytes}`,
    '# TYPE dogfight_ws_rejected_total counter',
    ...(rejected.size === 0
  ? ['dogfight_ws_rejected_total 0']
  : [...rejected].map(
      ([reason, count]) =>
        `dogfight_ws_rejected_total{reason="${reason}"} ${count}`
    ))
  ];
  return lines.join("\n") + "\n";
}
