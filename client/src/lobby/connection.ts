// @ts-nocheck
import { decodeSnapshot, encodeInput } from "@dogfight/shared/codec";

export class GameConnection extends EventTarget {
  constructor({ maxReconnectAttempts = 5, reconnectBaseDelay = 1000, reconnectMaxDelay = 10000 } = {}) {
    super();
    this.socket = null;
    this.maxReconnectAttempts = maxReconnectAttempts;
    this.reconnectBaseDelay = reconnectBaseDelay;
    this.reconnectMaxDelay = reconnectMaxDelay;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.manuallyClosed = false;
    this.desiredRoom = null;
    this.connectPromise = null;
    this.joinSentForSocket = null;
    this.conditions = { latency: 0, jitter: 0, drop: 0 };
    this.bytesIn = 0;
    this.bytesOut = 0;
    this.rttMs = 0;
    this.lastSnapshotAt = 0;
    this.pendingInputs = [];
    this.correctionMagnitude = 0;
    this.lastPingAt = 0;
    this.pingTimer = null;
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  setNetworkConditions({ latency = 0, jitter = 0, drop = 0 } = {}) {
    this.conditions = {
      latency: Math.max(0, Math.min(500, Number(latency) || 0)),
      jitter: Math.max(0, Math.min(200, Number(jitter) || 0)),
      drop: Math.max(0, Math.min(20, Number(drop) || 0))
    };
  }

  get url() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const host = import.meta.env.DEV
    ? `${location.hostname}:3001`
    : location.host;

  const query = new URLSearchParams(this.conditions);

  return `${protocol}//${host}/ws?${query}`;
}

  connect() {
  console.log("[WS DEBUG] connect() викликано");
  console.log("[WS DEBUG] Поточний socket:", this.socket?.readyState);
  console.log("[WS DEBUG] URL:", this.url);

  if (this.socket?.readyState === WebSocket.OPEN) {
    console.log("[WS DEBUG] Сокет уже відкритий");
    return Promise.resolve();
  }

  if (this.socket?.readyState === WebSocket.CONNECTING && this.connectPromise) {
    console.log("[WS DEBUG] Сокет уже підключається, очікуємо");
    return this.connectPromise;
  }

  this.manuallyClosed = false;
  clearTimeout(this.reconnectTimer);
  this.reconnectTimer = null;

  this.connectPromise = new Promise((resolve, reject) => {
    console.log("[WS DEBUG] Створюємо WebSocket");

    const socket = new WebSocket(this.url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;

    let settled = false;

    socket.addEventListener("open", () => {
      console.log("[WS DEBUG] Подія OPEN");

      settled = true;
      this.connectPromise = null;
      this.reconnectAttempts = 0;

      this.emit("open");
      this.sendDesiredJoin();
      this.startPing();

      resolve();
    });

    socket.addEventListener("message", (event) => {
      console.log("[WS DEBUG] Отримано:", event.data);

      if (event.data instanceof ArrayBuffer) {
        this.bytesIn += event.data.byteLength;

        try {
          const snapshot = decodeSnapshot(event.data);
          this.lastSnapshotAt = performance.now();
          this.emit("snapshot", snapshot);
        } catch (error) {
          this.emit("error", {
            message: `Некоректний binary snapshot: ${error.message}`
          });
        }

        return;
      }

      this.bytesIn += new TextEncoder().encode(String(event.data)).byteLength;

      let message;

      try {
        message = JSON.parse(event.data);
      } catch {
        this.emit("error", {
          message: "Сервер надіслав некоректне JSON-повідомлення"
        });
        return;
      }

      if (message.type === "snapshot") this.lastSnapshotAt = performance.now();

      if (message.type === "pong") {
        this.rttMs = performance.now() - this.lastPingAt;
      }

      this.emit(message.type || "message", message);
    });

    socket.addEventListener("error", (event) => {
      console.error("[WS DEBUG] Подія ERROR:", event);

      this.emit("socketError", {
        message: "Помилка WebSocket-з'єднання"
      });

      if (!settled) {
        settled = true;
        this.connectPromise = null;
        reject(new Error("Не вдалося встановити WebSocket-з'єднання"));
      }
    });

    socket.addEventListener("close", (event) => {
      console.warn(
        "[WS DEBUG] Подія CLOSE:",
        event.code,
        event.reason
      );

      this.stopPing();
      this.connectPromise = null;
      this.joinSentForSocket = null;

      this.emit("close", {
        code: event.code,
        reason: event.reason
      });

      if (!this.manuallyClosed && this.desiredRoom) {
        this.scheduleReconnect();
      }
    });
  });

  return this.connectPromise;
}

  sendRaw(message) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    const text = JSON.stringify({ v: 1, ...message });
    this.socket.send(text);
    this.bytesOut += new TextEncoder().encode(text).byteLength;
    return true;
  }

  sendInput(input) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    const packet = encodeInput(input);
    this.socket.send(packet);
    this.bytesOut += packet.byteLength;
    return true;
  }

  startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.lastPingAt = performance.now();
      this.sendRaw({ type: "ping", clientTime: this.lastPingAt });
    }, 1000);
  }

  stopPing() {
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  sendDesiredJoin() {
  console.log("[GAME CONNECTION] sendDesiredJoin викликано");
  console.log("[GAME CONNECTION] desiredRoom:", this.desiredRoom);
  console.log("[GAME CONNECTION] socket state:", this.socket?.readyState);

  if (!this.desiredRoom || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
    console.warn("[GAME CONNECTION] JOIN не надіслано: немає кімнати або з'єднання");
    return;
  }

  if (this.joinSentForSocket === this.socket) {
    console.warn("[GAME CONNECTION] JOIN для цього сокета вже надсилався");
    return;
  }

  const sent = this.sendRaw({
    type: "join",
    room: this.desiredRoom.room,
    name: this.desiredRoom.name
  });

  console.log("[GAME CONNECTION] JOIN надіслано:", sent);

  if (sent) {
    this.joinSentForSocket = this.socket;
  }
}

  async join(room, name) {
    this.manuallyClosed = false;
    this.desiredRoom = { room: String(room), name: String(name || "Player").trim() || "Player" };
    await this.connect();
    this.sendDesiredJoin();
  }

  chat(text) {
    const value = String(text || "").trim();
    return value ? this.sendRaw({ type: "chat", text: value }) : false;
  }

  leave() {
    this.desiredRoom = null;
    this.joinSentForSocket = null;
    this.pendingInputs.length = 0;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    return this.sendRaw({ type: "leave" });
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.manuallyClosed || !this.desiredRoom) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit("reconnectFailed", { message: "Не вдалося відновити WebSocket-з'єднання" });
      return;
    }
    const delay = Math.min(this.reconnectBaseDelay * (2 ** this.reconnectAttempts), this.reconnectMaxDelay);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, delay);
  }

  close() {
    this.manuallyClosed = true;
    this.desiredRoom = null;
    this.reconnectAttempts = 0;
    this.joinSentForSocket = null;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopPing();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "Client closed");
  }
}
