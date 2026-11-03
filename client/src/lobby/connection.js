export class GameConnection extends EventTarget {
  constructor({
    maxReconnectAttempts = 5,
    reconnectBaseDelay = 1000,
    reconnectMaxDelay = 10000
  } = {}) {
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
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  get url() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${location.host}/ws`;
  }

  connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.socket?.readyState === WebSocket.CONNECTING && this.connectPromise) {
      return this.connectPromise;
    }

    this.manuallyClosed = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    this.connectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      let settled = false;

      socket.addEventListener("open", () => {
        settled = true;
        this.connectPromise = null;
        this.reconnectAttempts = 0;
        this.emit("open");
        this.sendDesiredJoin();
        resolve();
      });

      socket.addEventListener("message", (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          this.emit("error", { message: "Сервер надіслав некоректне JSON-повідомлення" });
          return;
        }
        this.emit(message.type || "message", message);
      });

      socket.addEventListener("error", () => {
        this.emit("socketError", { message: "Помилка WebSocket-з'єднання" });
        if (!settled) {
          settled = true;
          this.connectPromise = null;
          reject(new Error("Не вдалося встановити WebSocket-з'єднання"));
        }
      });

      socket.addEventListener("close", (event) => {
        this.connectPromise = null;
        this.joinSentForSocket = null;
        this.emit("close", { code: event.code, reason: event.reason });
        if (!this.manuallyClosed && this.desiredRoom) this.scheduleReconnect();
      });
    });

    return this.connectPromise;
  }

  sendRaw(message) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ v: 1, ...message }));
    return true;
  }

  sendDesiredJoin() {
    if (!this.desiredRoom || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (this.joinSentForSocket === this.socket) return;

    const sent = this.sendRaw({
      type: "join",
      room: this.desiredRoom.room,
      name: this.desiredRoom.name
    });
    if (sent) this.joinSentForSocket = this.socket;
  }

  async join(room, name) {
    this.manuallyClosed = false;
    this.desiredRoom = {
      room: String(room),
      name: String(name || "Player").trim() || "Player"
    };

    await this.connect();
    this.sendDesiredJoin();
  }

  chat(text) {
    const value = String(text || "").trim();
    if (!value) return false;
    return this.sendRaw({ type: "chat", text: value });
  }

  leave() {
    this.desiredRoom = null;
    this.joinSentForSocket = null;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    return this.sendRaw({ type: "leave" });
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.manuallyClosed || !this.desiredRoom) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit("reconnectFailed", {
        message: "Не вдалося відновити WebSocket-з'єднання"
      });
      return;
    }

    const delay = Math.min(
      this.reconnectBaseDelay * (2 ** this.reconnectAttempts),
      this.reconnectMaxDelay
    );
    this.reconnectAttempts += 1;
    console.info(`[CLIENT WS] Повторне підключення через ${delay} мс`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {
        // Наступна спроба буде запланована після події close.
      });
    }, delay);
  }

  close() {
    this.manuallyClosed = true;
    this.desiredRoom = null;
    this.reconnectAttempts = 0;
    this.joinSentForSocket = null;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(1000, "Client closed");
    }
  }
}
