import type { EntityId, Seq, Tick } from "./ids.ts";

export interface ReadonlyVector2 {
  readonly x: number;
  readonly y: number;
}
export interface ShipEntitySnapshot {
  readonly kind: "ship";
  readonly id: EntityId;
  readonly position: ReadonlyVector2;
  readonly velocity: ReadonlyVector2;
  readonly hp: number;
  readonly score: number;
  readonly lastProcessedSeq: Seq;
}
export interface BulletEntitySnapshot {
  readonly kind: "bullet";
  readonly id: EntityId;
  readonly owner: EntityId;
  readonly position: ReadonlyVector2;
  readonly velocity: ReadonlyVector2;
  readonly ttl: number;
}
export interface AsteroidEntitySnapshot {
  readonly kind: "asteroid";
  readonly id: EntityId;
  readonly position: ReadonlyVector2;
  readonly velocity: ReadonlyVector2;
  readonly radius: number;
  readonly hp: number;
}
export interface PickupEntitySnapshot {
  readonly kind: "pickup";
  readonly id: EntityId;
  readonly position: ReadonlyVector2;
  readonly pickupType: "shield" | "rapid";
  readonly ttl: number;
}
export type EntitySnapshot =
  | ShipEntitySnapshot
  | BulletEntitySnapshot
  | AsteroidEntitySnapshot
  | PickupEntitySnapshot;

export interface InputCommand {
  readonly seq: Seq;
  readonly tick: Tick;
  readonly turn: -1 | 0 | 1;
  readonly thrust: boolean;
  readonly fire: boolean;
}
export function assertNever(value: never): never {
  throw new Error(`Unhandled entity variant: ${String(value)}`);
}
