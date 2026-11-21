export const MAX_BUFFERED_BYTES = 64 * 1024;

export function canSend(bufferedAmount: number): boolean {
  return bufferedAmount <= MAX_BUFFERED_BYTES;
}