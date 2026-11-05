// @ts-nocheck
import { EventEmitter } from "node:events";
import { randomUUID, randomInt } from "node:crypto";

const DEFAULT_ARENA = Object.freeze({
  width: 900,
  height: 600,
  asteroidCount: 8,
  background: "#080c18",
  seed: randomInt(1, 0xffffffff)
});

export class Room extends EventEmitter {
  constructor({ id = randomUUID(), name, maxPlayers = 4, arena = {} }) {
    super();
    this.id = id;
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.arena = { ...DEFAULT_ARENA, ...arena, seed: arena.seed ?? randomInt(1, 0xffffffff) };
    this.players = new Map();
    this.createdAt = Date.now();
  }

  emitRoomEvent(type, data = {}) {
    const event = {
      t: Date.now(),
      type,
      roomId: this.id,
      ...data
    };
    this.emit("event", event);
    return event;
  }

  join(player) {
    if (this.players.has(player.id)) return;
    if (this.players.size >= this.maxPlayers) throw new Error("Room is full");

    this.players.set(player.id, player);
    this.emitRoomEvent("join", {
      player: { id: player.id, name: player.name }
    });
    this.emit("join", player);
    this.emit("roster", this.getRoster());
  }

  leave(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;

    this.players.delete(playerId);
    this.emitRoomEvent("leave", {
      player: { id: player.id, name: player.name }
    });
    this.emit("leave", player);
    this.emit("roster", this.getRoster());

    if (this.players.size === 0) {
      this.emitRoomEvent("empty");
      this.emit("empty");
    }
  }

  chat(player, text) {
    const message = {
      id: randomUUID(),
      playerId: player.id,
      playerName: player.name,
      text,
      timestamp: Date.now()
    };
    this.emitRoomEvent("chat", { message });
    this.emit("chat", message);
    return message;
  }

  getRoster() {
    return [...this.players.values()].map(({ id, name }) => ({ id, name }));
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      players: this.players.size,
      maxPlayers: this.maxPlayers,
      capacity: this.maxPlayers,
      arena: { ...this.arena },
      createdAt: this.createdAt
    };
  }
}

export class RoomManager extends EventEmitter {
  constructor({ maxRooms = 20, maxPlayersPerRoom = 4 } = {}) {
    super();
    this.rooms = new Map();
    this.maxRooms = maxRooms;
    this.maxPlayersPerRoom = maxPlayersPerRoom;
  }

  createRoom(name, arena) {
    if (this.rooms.size >= this.maxRooms) throw new Error("Server room limit reached");

    const room = new Room({
      name,
      maxPlayers: this.maxPlayersPerRoom,
      arena
    });
    this.rooms.set(room.id, room);
    this.emit("roomCreated", room);
    return room;
  }

  getRoom(id) {
    return this.rooms.get(id);
  }

  listRooms() {
    return [...this.rooms.values()].map((room) => room.toJSON());
  }
}
