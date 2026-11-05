// @ts-nocheck
import {
  createShipState, createAsteroids, integrate, stepAsteroids, mulberry32,
  encodeSnapshot, DT, TICK_RATE
} from "@dogfight/shared";

const INTERVAL = 1000 / TICK_RATE;
const ASTEROID_RESPAWN_TICKS = TICK_RATE * 3;
const SHIP_RESPAWN_TICKS = TICK_RATE * 2;
const SHIP_RADIUS = 16;
const BULLET_RADIUS = 4;
const PICKUP_RADIUS = 13;
const PICKUP_RESPAWN_TICKS = TICK_RATE * 10;
const MAX_PICKUPS = 3;

export class Match {
  constructor(room) {
    this.room = room;
    this.tick = 0;
    this.players = new Map();
    this.running = false;
    this.nextTarget = 0;
    this.timer = null;
    this.lastTickAt = 0;
    this.lastTickDurationMs = 0;
    this.lastJitterMs = 0;
    this.totalBytesOut = 0;
    this.totalBytesIn = 0;
    this.tickCount = 0;
    this.seed = room.arena.seed >>> 0;
    this.targetAsteroidCount = room.arena.asteroidCount || 8;
    this.asteroids = createAsteroids(
      this.seed, this.targetAsteroidCount,
      room.arena.width, room.arena.height
    );
    this.nextAsteroidId = this.targetAsteroidCount + 1;
    this.asteroidRespawns = [];
    this.bullets = [];
    this.nextBulletId = 1;
    this.pickups = [];
    this.nextPickupId = 1;
    this.nextPickupSpawnTick = PICKUP_RESPAWN_TICKS;
    this.pickupRandom = mulberry32((this.seed ^ 0x51ed270b) >>> 0);
  }

  add(player) {
    if (this.players.has(player.id)) return;
    const used = new Set([...this.players.values()].map(p => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const state = createShipState(slot, this.seed, this.room.arena.width, this.room.arena.height);
    const entry = {
      id: player.id, name: player.name, socket: player.socket, slot, state,
      lastProcessedSeq: 0, pending: [],
      lastInput: { turn: 0, thrust: false, fire: false },
      nextFireTick: this.tick + 1, rapidFireUntilTick: 0, score: 0,
      hp: 3, invulnerableTicks: 0, respawnAtTick: 0
    };
    this.players.set(player.id, entry);
    player.socket.matchEntry = entry;
    if (!this.running) this.start();
  }

  remove(id) {
    this.players.delete(id);
    if (this.players.size === 0) this.stop();
  }

  enqueue(entry, input) {
    if (!this.players.has(entry.id) || input.seq <= entry.lastProcessedSeq) return;
    // input.tick is client-local and resets on each connection; never compare it to room tick.\n    if (input.seq > entry.lastProcessedSeq + 120) return;
    if (entry.pending.length >= 120 || entry.pending.some(x => x.seq === input.seq)) return;
    entry.pending.push(input);
    entry.pending.sort((a, b) => a.seq - b.seq);
  }

  start() {
    this.running = true;
    this.nextTarget = performance.now() + INTERVAL;
    this.schedule();
  }

  schedule() {
    if (!this.running) return;
    this.timer = setTimeout(() => this.step(), Math.max(0, this.nextTarget - performance.now()));
  }

  spawnBullet(player) {
    const { state, slot } = player;
    const angle = state.angle;
    this.bullets.push({
      id: this.nextBulletId++,
      owner: slot,
      x: state.x + Math.cos(angle) * 22,
      y: state.y + Math.sin(angle) * 22,
      vx: Math.cos(angle) * 360 + state.vx * 0.5,
      vy: Math.sin(angle) * 360 + state.vy * 0.5,
      ttl: 1.2
    });
    // Cooldown is tick-based: one shot per cooldown, never catch up with a burst.
  }

  damagePlayer(player) {
    if (player.hp <= 0 || player.invulnerableTicks > 0) return;
    player.hp = Math.max(0, player.hp - 1);
    player.invulnerableTicks = TICK_RATE;
    if (player.hp === 0) player.respawnAtTick = this.tick + SHIP_RESPAWN_TICKS;
  }

  respawnAsteroids(width, height) {
    const due = this.asteroidRespawns.filter(item => item.tick <= this.tick);
    this.asteroidRespawns = this.asteroidRespawns.filter(item => item.tick > this.tick);
    for (const item of due) {
      if (this.asteroids.length >= this.targetAsteroidCount) break;
      const seed = (this.seed ^ Math.imul(item.id, 0x9e3779b9)) >>> 0;
      const asteroid = createAsteroids(seed, 1, width, height, item.id)[0];
      // Avoid spawning directly on top of a ship.
      const occupied = [...this.players.values()].some(p =>
        p.hp > 0 && Math.hypot(p.state.x - asteroid.x, p.state.y - asteroid.y) < SHIP_RADIUS + asteroid.radius + 30
      );
      if (occupied) {
        this.asteroidRespawns.push({ ...item, tick: this.tick + TICK_RATE });
      } else {
        this.asteroids.push(asteroid);
      }
    }
  }

  step() {
    if (!this.running) return;
    const started = performance.now();
    const actual = this.lastTickAt ? started - this.lastTickAt : INTERVAL;
    this.lastJitterMs = actual - INTERVAL;
    this.lastTickAt = started;
    this.tick++;

    const { width, height } = this.room.arena;

    for (const player of this.players.values()) {
      if (player.invulnerableTicks > 0) player.invulnerableTicks--;
      if (player.hp === 0) {
        if (this.tick >= player.respawnAtTick) {
          player.state = createShipState(player.slot, (this.seed ^ this.tick) >>> 0, width, height);
          player.hp = 3;
          player.invulnerableTicks = TICK_RATE * 2;
          player.lastInput = { turn: 0, thrust: false, fire: false };
        }
        continue;
      }

      for (const input of player.pending.splice(0)) {
        if (input.seq <= player.lastProcessedSeq) continue;
        player.lastInput = input;
        player.lastProcessedSeq = input.seq;
      }

      player.state = integrate(player.state, player.lastInput, DT, width, height);
      if (player.lastInput.fire && this.tick >= player.nextFireTick) {
        this.spawnBullet(player);
        player.nextFireTick = this.tick + (this.tick < player.rapidFireUntilTick ? 3 : 8);
      }
    }

    stepAsteroids(this.asteroids, DT, width, height);

    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * DT;
      bullet.y += bullet.vy * DT;
      bullet.ttl -= DT;
    }

    // Server-authoritative bullet/asteroid collisions.
    for (const bullet of this.bullets) {
      if (bullet.ttl <= 0) continue;
      const hit = this.asteroids.find(a =>
        Math.hypot(a.x - bullet.x, a.y - bullet.y) <= a.radius + BULLET_RADIUS
      );
      if (hit) {
        hit.hp--;
        bullet.ttl = 0;
        if (hit.hp <= 0) {
          const owner = [...this.players.values()].find(p => p.slot === bullet.owner);
          if (owner) owner.score += 10;
          this.asteroids = this.asteroids.filter(a => a.id !== hit.id);
          this.asteroidRespawns.push({ id: this.nextAsteroidId++, tick: this.tick + ASTEROID_RESPAWN_TICKS });
        }
      }
    }

    // Asteroids damage ships on contact; invulnerability prevents repeated tick damage.
    for (const player of this.players.values()) {
      if (player.hp <= 0 || player.invulnerableTicks > 0) continue;
      const asteroid = this.asteroids.find(a =>
        Math.hypot(a.x - player.state.x, a.y - player.state.y) <= a.radius + SHIP_RADIUS
      );
      if (asteroid) this.damagePlayer(player);
    }

    // Server-authoritative pickup collection and effects.
    for (const player of this.players.values()) {
      if (player.hp <= 0) continue;
      for (const pickup of this.pickups) {
        if (pickup.ttl <= 0 || pickup.collected) continue;
        if (Math.hypot(pickup.x - player.state.x, pickup.y - player.state.y) > PICKUP_RADIUS + SHIP_RADIUS) continue;
        pickup.collected = true;
        player.score += 5;
        if (pickup.type === "shield") {
          player.invulnerableTicks = Math.max(player.invulnerableTicks, TICK_RATE * 5);
        } else {
          player.rapidFireUntilTick = this.tick + TICK_RATE * 5;
          player.nextFireTick = Math.min(player.nextFireTick, this.tick);
        }
      }
    }
    this.pickups = this.pickups.filter(p => !p.collected && p.ttl > 0);
    for (const pickup of this.pickups) pickup.ttl -= DT;
    if (this.tick >= this.nextPickupSpawnTick && this.pickups.length < MAX_PICKUPS) {
      const { width: w, height: h } = this.room.arena;
      const x = 35 + this.pickupRandom() * (w - 70);
      const y = 35 + this.pickupRandom() * (h - 70);
      const type = this.pickupRandom() < 0.5 ? "shield" : "rapid";
      this.pickups.push({ id: this.nextPickupId++, x, y, type, ttl: 12 });
      this.nextPickupSpawnTick = this.tick + PICKUP_RESPAWN_TICKS;
    } else if (this.pickups.length >= MAX_PICKUPS) {
      this.nextPickupSpawnTick = Math.max(this.nextPickupSpawnTick, this.tick + TICK_RATE);
    }

    this.bullets = this.bullets.filter(b =>
      b.ttl > 0 && b.x >= 0 && b.x <= width && b.y >= 0 && b.y <= height
    );
    this.respawnAsteroids(width, height);

    const snapshot = {
      tick: this.tick,
      players: [...this.players.values()].map(p => ({
        slot: p.slot, lastProcessedSeq: p.lastProcessedSeq,
        ...p.state, hp: p.hp, alive: p.hp > 0, score: p.score
      })),
      asteroids: this.asteroids.map(a => ({ ...a })),
      bullets: this.bullets.map(b => ({ ...b })),
      pickups: this.pickups.map(({ id, x, y, type, ttl }) => ({ id, x, y, type, ttl }))
    };
    const binary = encodeSnapshot(snapshot);

    for (const player of this.players.values()) {
      const socket = player.socket;
      if (socket.readyState !== 1) continue;
      const conditions = socket.netConditions || { latency: 0, jitter: 0, drop: 0 };
      if (Math.random() * 100 < conditions.drop) continue;
      const delay = Math.max(0, conditions.latency / 2 + (Math.random() * 2 - 1) * conditions.jitter / 2);
      const send = () => {
        if (socket.readyState !== 1) return;
        if (process.env.SNAPSHOT_CODEC === "json") {
          const text = JSON.stringify({ v: 1, type: "snapshot", ...snapshot });
          socket.send(text);
          this.totalBytesOut += Buffer.byteLength(text);
        } else {
          socket.send(binary, { binary: true }, error => {
            if (error) console.error("[MATCH] Snapshot send error:", error.message);
          });
          this.totalBytesOut += binary.byteLength;
        }
      };
      if (delay > 0) setTimeout(send, delay);
      else send();
    }

    this.lastTickDurationMs = performance.now() - started;
    this.tickCount++;
    this.nextTarget += INTERVAL;
    const now = performance.now();
    if (this.nextTarget < now - INTERVAL) this.nextTarget = now + INTERVAL;
    this.schedule();
  }

  stats() {
    return {
      tick: this.tick, tickRate: TICK_RATE, players: this.players.size,
      asteroids: this.asteroids.length, bullets: this.bullets.length,
      tickDurationMs: +this.lastTickDurationMs.toFixed(3),
      tickJitterMs: +this.lastJitterMs.toFixed(3),
      bytesOut: this.totalBytesOut, bytesIn: this.totalBytesIn
    };
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = null;
    this.bullets = [];
    this.pickups = [];
  }
}
