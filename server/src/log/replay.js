import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export async function* readReplay(filePath) {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      yield JSON.parse(line);
    }
  } finally {
    lines.close();
    stream.destroy();
  }
}
