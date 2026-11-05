// Deterministic simulation shared by Node.js and browser clients.
export interface ShipInput {
  readonly turn?: -1 | 0 | 1;
  readonly thrust?: boolean;
  readonly fire?: boolean;
}
export interface ShipState {
  readonly slot: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
}
export interface MutableShipState {
  slot: number; x: number; y: number; vx: number; vy: number; angle: number;
}
export interface AsteroidState {
  id: number; x: number; y: number; vx: number; vy: number;
  radius: number; angle: number; spin: number; hp: number;
}
export const SHIP_TUNING = Object.freeze({
  turnSpeed: 3.5, acceleration: 220, drag: 0.985, maxSpeed: 280
} as const);
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function nextRandom(): number {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createShipState(slot: number, seed = 12345, width = 900, height = 600): MutableShipState {
  const random = mulberry32((seed ^ (slot * 0x9e3779b9)) >>> 0);
  return { slot, x: 120 + random() * (width - 240), y: 100 + random() * (height - 200), vx: 0, vy: 0, angle: random() * Math.PI * 2 };
}

export function createAsteroids(seed: number, count = 8, width = 900, height = 600, firstId = 1): AsteroidState[] {
  const random = mulberry32(seed >>> 0);
  return Array.from({ length: count }, (_, index): AsteroidState => {
    const radius = 18 + random() * 16;
    const angle = random() * Math.PI * 2;
    const speed = 25 + random() * 60;
    return {
      id: firstId + index,
      x: radius + random() * (width - radius * 2),
      y: radius + random() * (height - radius * 2),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      angle: random() * Math.PI * 2,
      spin: random() * 1.6 - 0.8,
      hp: radius > 27 ? 2 : 1
    };
  });
}

export function integrate(state: ShipState, input: ShipInput = {}, dt = DT, width = 900, height = 600): MutableShipState {
  const next: MutableShipState = { ...state };
  const turn = Math.max(-1, Math.min(1, Number(input.turn) || 0));
  next.angle += turn * SHIP_TUNING.turnSpeed * dt;
  while (next.angle > Math.PI) next.angle -= Math.PI * 2;
  while (next.angle < -Math.PI) next.angle += Math.PI * 2;
  if (input.thrust) {
    next.vx += Math.cos(next.angle) * SHIP_TUNING.acceleration * dt;
    next.vy += Math.sin(next.angle) * SHIP_TUNING.acceleration * dt;
  }
  const drag = Math.pow(SHIP_TUNING.drag, dt * 60);
  next.vx *= drag; next.vy *= drag;
  const speed = Math.hypot(next.vx, next.vy);
  if (speed > SHIP_TUNING.maxSpeed) {
    const scale = SHIP_TUNING.maxSpeed / speed;
    next.vx *= scale; next.vy *= scale;
  }
  next.x += next.vx * dt; next.y += next.vy * dt;
  const margin = 16;
  if (next.x < margin) { next.x = margin; next.vx = Math.abs(next.vx); }
  if (next.x > width - margin) { next.x = width - margin; next.vx = -Math.abs(next.vx); }
  if (next.y < margin) { next.y = margin; next.vy = Math.abs(next.vy); }
  if (next.y > height - margin) { next.y = height - margin; next.vy = -Math.abs(next.vy); }
  return next;
}

export function stepAsteroids(asteroids: AsteroidState[], dt: number, width = 900, height = 600): void {
  for (const asteroid of asteroids) {
    asteroid.x += asteroid.vx * dt;
    asteroid.y += asteroid.vy * dt;
    asteroid.angle += asteroid.spin * dt;
    if (asteroid.x < asteroid.radius || asteroid.x > width - asteroid.radius) {
      asteroid.vx *= -1;
      asteroid.x = Math.max(asteroid.radius, Math.min(width - asteroid.radius, asteroid.x));
    }
    if (asteroid.y < asteroid.radius || asteroid.y > height - asteroid.radius) {
      asteroid.vy *= -1;
      asteroid.y = Math.max(asteroid.radius, Math.min(height - asteroid.radius, asteroid.y));
    }
  }
}

export function hashState(state: ShipState): string {
  const text = [state.x, state.y, state.vx, state.vy, state.angle].map(value => Number(value).toFixed(8)).join("|");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
