import test from "node:test";
import assert from "node:assert/strict";
import { validateMessage, roomCreateSchema } from "@dogfight/shared";

test("protocol accepts a valid join message and returns a narrowed payload", () => {
  const result = validateMessage({ v: 1, type: "join", room: "room-a", name: "Pilot" });
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.message.type, "join");
    assert.equal(result.message.room, "room-a");
  }
});

test("protocol rejects malformed controls and unknown message types", () => {
  assert.equal(validateMessage({ v: 1, type: "input", turn: 1000000000 }).valid, false);
  assert.equal(validateMessage({ v: 1, type: "chat", text: "" }).valid, false);
  assert.equal(validateMessage({ v: 2, type: "leave" }).valid, false);
  assert.equal(validateMessage(null).valid, false);
});

test("HTTP room creation input is validated at the boundary", () => {
  assert.equal(roomCreateSchema.safeParse({ name: "Arena" }).success, true);
  assert.equal(roomCreateSchema.safeParse({ name: "x" }).success, false);
  assert.equal(roomCreateSchema.safeParse({ name: "Valid", admin: true }).success, false);
});
