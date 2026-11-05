import test from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/realtime/match.ts";

function makeMatch() {
  const room = { id: "test-room", arena: { seed: 12345, width: 900, height: 600, asteroidCount: 8 } };
  const match = new Match(room);
  match.schedule = () => {};
  match.tick = 1000;
  match.nextPickupSpawnTick = match.tick + 300;
  match.add({ id: "p1", name: "Player 1", socket: { readyState: 3 } });
  match.add({ id: "p2", name: "Player 2", socket: { readyState: 3 } });
  return match;
}

test("a second player with a fresh client tick is accepted in an older running room", () => {
  const match = makeMatch();
  try {
    const second = match.players.get("p2");
    match.enqueue(second, { seq: 1, tick: 1, turn: 1, thrust: true, fire: false });
    match.step();
    assert.equal(second.lastProcessedSeq, 1);
    assert.notEqual(second.state.x, 0);
  } finally {
    match.stop();
  }
});

test("held fire is rate-limited to one shot every eight server ticks", () => {
  const match = makeMatch();
  try {
    const player = match.players.get("p2");
    player.lastInput = { turn: 0, thrust: false, fire: true };
    player.nextFireTick = match.tick + 1;
    for (let i = 0; i < 17; i++) match.step();
    assert.equal(match.nextBulletId - 1, 3);
  } finally {
    match.stop();
  }
});

test("asteroid destruction awards score to the bullet owner", () => {
  const match = makeMatch();
  try {
    const player = match.players.get("p2");
    match.asteroids = [{ id: 99, x: 500, y: 300, vx: 0, vy: 0, radius: 20, angle: 0, spin: 0, hp: 1 }];
    match.bullets = [{ id: 1, owner: player.slot, x: 500, y: 300, vx: 0, vy: 0, ttl: 1 }];
    match.step();
    assert.equal(player.score, 10);
    assert.equal(match.asteroids.length, 0);
  } finally {
    match.stop();
  }
});

test("collecting a pickup applies its effect and awards score", () => {
  const match = makeMatch();
  try {
    const player = match.players.get("p2");
    match.asteroids = [];
    match.pickups = [{ id: 1, x: player.state.x, y: player.state.y, type: "rapid", ttl: 10 }];
    match.step();
    assert.equal(player.score, 5);
    assert.ok(player.rapidFireUntilTick > match.tick);
    assert.equal(match.pickups.length, 0);
  } finally {
    match.stop();
  }
});
