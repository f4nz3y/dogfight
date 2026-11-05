// @ts-nocheck
import { Transform } from "node:stream";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { once } from "node:events";
import path from "node:path";

class JsonLinesTransform extends Transform {
  constructor() {
    super({ writableObjectMode: true });
  }

  _transform(event, encoding, callback) {
    try {
      callback(null, `${JSON.stringify(event)}\n`);
    } catch (error) {
      callback(error);
    }
  }
}

export class MatchLog {
  constructor(directory, roomId) {
    this.directory = directory;
    this.roomId = roomId;
    this.fileName = `${roomId}-${Date.now()}.ndjson`;
    this.filePath = path.join(directory, this.fileName);
    this.transform = new JsonLinesTransform();
    this.closed = false;
    this.closing = false;
    this.queue = Promise.resolve();
    this.pipelinePromise = null;
  }

  async start() {
    await mkdir(this.directory, { recursive: true });
    const output = createWriteStream(this.filePath, { flags: "a" });
    this.pipelinePromise = pipeline(this.transform, output);
    this.pipelinePromise.catch((error) => {
      if (!this.closed) console.error("[LOG] Pipeline error:", error);
    });
    return this.fileName;
  }

  append(event) {
    if (this.closed || this.closing) {
      return Promise.reject(new Error("Match log is closed"));
    }

    this.queue = this.queue.then(async () => {
      if (this.closed) return;
      if (!this.transform.write(event)) {
        await once(this.transform, "drain");
      }
    });

    return this.queue;
  }

  async close() {
    if (this.closed) return;
    if (this.closing) {
      await this.pipelinePromise;
      return;
    }

    this.closing = true;
    await this.queue;
    this.transform.end();
    await this.pipelinePromise;
    this.closed = true;
  }
}
