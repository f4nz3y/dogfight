export class Lobby extends EventTarget {
  constructor() {
    super();
    this.rooms = [];
    this.playerName = "Player";
    this.selectedRoom = null;
    this.controller = null;
    this.refreshTimer = null;
    this.visible = false;
  }

  emit(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  async refresh() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(5000)
    ]);

    try {
      const response = await fetch("/api/rooms", { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.rooms)) {
        throw new Error("Некоректна відповідь сервера зі списком кімнат");
      }
      if (signal.aborted || !this.visible) return;
      this.rooms = data.rooms;
      this.emit("roomsChanged", this.rooms);
    } catch (error) {
      if (error.name === "AbortError" || !this.visible) return;
      const message = error.name === "TimeoutError"
        ? "Сервер не відповів протягом 5 секунд"
        : `Не вдалося завантажити список кімнат: ${error.message}`;
      this.emit("error", { message, error });
    }
  }

  async createRoom(name) {
    const roomName = String(name || "").trim();
    if (roomName.length < 2 || roomName.length > 40) {
      throw new Error("Назва кімнати має містити від 2 до 40 символів");
    }

    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: roomName })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

    await this.refresh();
    return data.room;
  }

  startRefreshing(interval = 5000) {
    this.visible = true;
    this.stopRefreshing();
    this.refresh();
    this.refreshTimer = setInterval(() => {
      if (this.visible) this.refresh();
    }, interval);
  }

  stopRefreshing() {
    if (this.refreshTimer !== null) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  leave() {
    this.visible = false;
    this.stopRefreshing();
    this.controller?.abort();
    this.controller = null;
  }

  join(roomId, playerName) {
    const room = this.rooms.find((item) => item.id === roomId);
    if (!room) throw new Error("Кімнату не знайдено");
    if (room.players >= room.maxPlayers) throw new Error("Кімната заповнена");

    this.playerName = String(playerName || "").trim() || "Player";
    this.selectedRoom = room;
    this.leave();
    this.emit("joined", { playerName: this.playerName, room });
    return room;
  }
}
