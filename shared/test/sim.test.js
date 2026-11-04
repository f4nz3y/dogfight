import test from "node:test";
import assert from "node:assert/strict";
import { createShipState, createAsteroids, integrate, hashState } from "../src/sim.js";
import { encodeInput, decodeInput, encodeSnapshot, decodeSnapshot } from "../src/codec.js";

test("shared simulation imports in Node and is deterministic", () => {
  const a = createShipState(1, 42), b = createShipState(1, 42);
  const inputs = Array.from({ length: 1000 }, (_, i) => ({ turn: i % 120 < 60 ? 1 : -1, thrust: i % 3 !== 0 }));
  for (const input of inputs) { Object.assign(a, integrate(a, input, 1 / 30)); Object.assign(b, integrate(b, input, 1 / 30)); }
  assert.equal(hashState(a), hashState(b));
});
test("seeded asteroid generation is deterministic and independent", () => {
  assert.deepEqual(createAsteroids(1234, 8), createAsteroids(1234, 8));
  assert.notDeepEqual(createAsteroids(1234, 8), createAsteroids(5678, 8));
});
test("binary input round trip", () => {
  const input = { seq: 123, tick: 77, turn: -1, thrust: true, fire: false };
  assert.deepEqual(decodeInput(encodeInput(input)), input);
});
test("binary snapshot round trip includes players, asteroids and bullets", () => {
  const snapshot = {
    tick: 9,
    players: [{ slot: 2, lastProcessedSeq: 44, x: 10.25, y: 20.5, vx: 3, vy: -4, angle: 1.2, hp: 2, alive: true, score: 35 }],
    asteroids: [{ id: 3, x: 100.25, y: 200.5, vx: 3, vy: -4, radius: 24, angle: 1.2, hp: 2 }],
    bullets: [{ id: 1234, owner: 2, x: 10, y: 20, vx: 300, vy: -20, ttl: .8 }],
    pickups: [{ id: 5, x: 300.5, y: 240.25, type: "rapid", ttl: 8.5 }]
  };
  const decoded = decodeSnapshot(encodeSnapshot(snapshot));
  assert.equal(decoded.tick, 9);
  assert.equal(decoded.players[0].slot, 2);
  assert.equal(decoded.players[0].lastProcessedSeq, 44);
  assert.equal(decoded.players[0].hp, 2);
  assert.equal(decoded.players[0].alive, true);
  assert.equal(decoded.players[0].score, 35);
  assert.equal(decoded.asteroids[0].id, 3);
  assert.equal(decoded.asteroids[0].hp, 2);
  assert.equal(decoded.bullets[0].id, 1234);
  assert.equal(decoded.pickups[0].id, 5);
  assert.equal(decoded.pickups[0].type, "rapid");
  assert.ok(Math.abs(decoded.pickups[0].ttl - 8.5) < 0.0001);
  for (const key of ["x", "y", "vx", "vy"]) assert.ok(Math.abs(decoded.players[0][key] - snapshot.players[0][key]) < .00001);
  assert.ok(Math.abs(decoded.players[0].angle - 1.2) < .00051);
  assert.ok(Math.abs(decoded.asteroids[0].angle - 1.2) < .00051);
});
