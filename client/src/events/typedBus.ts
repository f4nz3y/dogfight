/** Generic event bus: the event name determines the exact payload type. */
export class TypedBus<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<(payload: Events[keyof Events]) => void>>();

  on<Key extends keyof Events>(name: Key, listener: (payload: Events[Key]) => void): () => void {
    const bucket = this.listeners.get(name) ?? new Set<(payload: Events[keyof Events]) => void>();
    bucket.add(listener as (payload: Events[keyof Events]) => void);
    this.listeners.set(name, bucket);
    return () => {
      bucket.delete(listener as (payload: Events[keyof Events]) => void);
      if (bucket.size === 0) this.listeners.delete(name);
    };
  }

  emit<Key extends keyof Events>(name: Key, payload: Events[Key]): void {
    for (const listener of this.listeners.get(name) ?? []) listener(payload);
  }
}

export interface GameEvents {
  fired: { readonly x: number; readonly y: number };
  hit: { readonly x: number; readonly y: number };
  exploded: { readonly x: number; readonly y: number };
}
