// @ts-nocheck
export const gameEvents = new EventTarget();

export function emitGameEvent(name, detail = {}) {
  gameEvents.dispatchEvent(
    new CustomEvent(name, { detail })
  );
}
