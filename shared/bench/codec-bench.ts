
import { performance } from "node:perf_hooks";
import {
  encodeSnapshot,
  decodeSnapshot,
  encodeInput,
  decodeInput,
  type Snapshot,
  type InputFrame,
} from "../src/codec.ts";

const players = Array.from({ length: 4 }, (_, slot) => ({
  slot,
  lastProcessedSeq: 1000 + slot,
  x: 100.123 + slot * 50,
  y: 200.456 + slot * 30,
  vx: 12.34,
  vy: -56.78,
  angle: 1.2345,
  hp: 100,
  alive: true,
  score: 0,
}));

const asteroids = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  x: 100 + i * 40,
  y: 120 + i * 20,
  vx: 12.3,
  vy: -5.6,
  radius: 24,
  angle: 0.8,
  hp: 2,
}));

const bullets = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  owner: i % 4,
  x: 100 + i * 10,
  y: 200 + i * 5,
  vx: 300,
  vy: -20,
  ttl: 0.8,
}));

const snapshot: Snapshot = {
  tick: 3000,
  players,
  asteroids,
  bullets,
  pickups: [],
};

const input: InputFrame = {
  seq: 3000,
  tick: 3000,
  turn: 1,
  thrust: true,
  fire: false,
};

const json = JSON.stringify({ type: "snapshot", ...snapshot });
const binary = encodeSnapshot(snapshot);
const iterations = 100000;

function measure(
  codec: string,
  encode: () => ArrayBuffer | Buffer | Uint8Array,
  decode: (value: ArrayBuffer | Buffer | Uint8Array) => unknown,
  bytes: number,
) {
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    decode(encode());
  }

  const elapsed = performance.now() - start;

  return {
    codec,
    bytesPerSnapshot: bytes,
    downKBs: (bytes * 30 / 1024).toFixed(3),
    encodeDecodeUs: ((elapsed * 1000) / iterations).toFixed(3),
  };
}

const results = [
  measure(
    "JSON",
    () => Buffer.from(json),
    (v) => JSON.parse(v.toString()),
    Buffer.byteLength(json),
  ),
  measure(
    "Binary DataView",
    () => binary,
    (v) => decodeSnapshot(v),
    binary.byteLength,
  ),
];

console.log(
  "Snapshot benchmark: 4 players, 8 asteroids, 12 bullets, 30 Hz, 100,000 iterations",
);
console.table(results);

const jsonInput = Buffer.byteLength(JSON.stringify(input));
const binaryInput = encodeInput(input).byteLength;

console.log(`Client upload JSON: ${(jsonInput * 30 / 1024).toFixed(3)} KB/s`);
console.log(`Client upload binary: ${(binaryInput * 30 / 1024).toFixed(3)} KB/s`);
