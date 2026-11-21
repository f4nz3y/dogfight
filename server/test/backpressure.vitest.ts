import { describe, expect, it } from "vitest";
import { canSend, MAX_BUFFERED_BYTES } from "../src/backpressure.ts";

describe("WebSocket backpressure policy", () => {
  it("allows sending when buffer is empty", () => {
    expect(canSend(0)).toBe(true);
  });

  it("allows sending below the limit", () => {
    expect(canSend(MAX_BUFFERED_BYTES - 1)).toBe(true);
  });

  it("allows sending exactly at the limit", () => {
    expect(canSend(MAX_BUFFERED_BYTES)).toBe(true);
  });

  it("rejects sending above the limit", () => {
    expect(canSend(MAX_BUFFERED_BYTES + 1)).toBe(false);
  });

  it("rejects sending when buffer is significantly overloaded", () => {
    expect(canSend(1024 * 1024)).toBe(false);
  });
});
