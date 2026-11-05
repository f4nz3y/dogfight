import type { Snapshot } from "./codec.ts";

/** Common contract for JSON and binary wire encoders. */
export interface Codec<Message, Encoded> {
  encode(message: Message): Encoded;
  decode(encoded: Encoded): Message;
}
export const binarySnapshotCodec: Codec<Snapshot, ArrayBuffer> = {
  encode: (snapshot) => {
    // Kept as a separate import boundary to avoid coupling protocol declarations to DataView details.
    return encodeBinarySnapshot(snapshot);
  },
  decode: (frame) => decodeBinarySnapshot(frame)
};
import { decodeSnapshot as decodeBinarySnapshot, encodeSnapshot as encodeBinarySnapshot } from "./codec.ts";

export const jsonCodec = <Message>(isMessage: (value: unknown) => value is Message): Codec<Message, string> => ({
  encode: (message) => JSON.stringify(message),
  decode: (encoded) => {
    const parsed: unknown = JSON.parse(encoded);
    if (!isMessage(parsed)) throw new Error("Invalid JSON protocol message");
    return parsed;
  }
});
