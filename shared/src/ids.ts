/** Branded identifiers prevent accidentally mixing ids, simulation ticks and input sequences. */
export type Brand<Value, Name extends string> = Value & { readonly __brand: Name };
export type EntityId = Brand<number, "EntityId">;
export type Tick = Brand<number, "Tick">;
export type Seq = Brand<number, "Seq">;

export function asEntityId(value: number): EntityId {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("EntityId must be a non-negative safe integer");
  return value as EntityId;
}
