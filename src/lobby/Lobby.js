
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
    this.dispatchEvent(
      new CustomEvent(name, { detail })
    );
  }

  async refresh() {
    this.controller?.abort();

    const controller = new AbortController();
    this.controller = controller;

    const timeoutSignal = AbortSignal.timeout(5000);
    const signal = AbortSignal.any([
      controller.signal,
      timeoutSignal
    ]);

    try {
      const response = await fetch("/api/rooms.json", { signal });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (signal.aborted || !this.visible) return;

      this.rooms = data.rooms;
      this.emit("roomsChanged", this.rooms);
    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }

        const message = error.name === "TimeoutError"
            ? "Сервер не відповів протягом 5 секунд"
            : "Не вдалося завантажити список кімнат";

        this.emit("error", {
            message,
            error
        });
    }
  }

  startRefreshing(interval = 5000) {
    this.visible = true;
    this.refresh();

    this.stopRefreshing();

    this.refreshTimer = setInterval(() => {
      if (this.visible) {
        this.refresh();
      }
    }, interval);
  }

  stopRefreshing() {
    clearInterval(this.refreshTimer);
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

    if (!room) {
      throw new Error("Кімнату не знайдено");
    }

    if (room.players >= room.maxPlayers) {
      throw new Error("Кімната заповнена");
    }

    this.playerName = playerName.trim() || "Player";
    this.selectedRoom = room;

    this.leave();

    this.emit("joined", {
      playerName: this.playerName,
      room
    });

    return room;
  }
}
