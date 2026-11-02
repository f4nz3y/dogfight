
import { gameEvents } from "../events/gameEvents.js";

export class GameAudio {
  constructor() {
    this.context = null;
    this.buffers = {};
    this.unlocked = false;

    this.onFired = () => this.play("shoot");
    this.onExploded = () => this.play("explosion");
    this.onHit = () => this.play("hit");

    gameEvents.addEventListener("fired", this.onFired);
    gameEvents.addEventListener("exploded", this.onExploded);
    gameEvents.addEventListener("hit", this.onHit);
  }

  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    this.unlocked = true;
  }

  setBuffers(buffers) {
    this.buffers = buffers;
  }

  play(name) {
    if (!this.unlocked || !this.context) return;

    const buffer = this.buffers[name];
    if (!buffer) return;

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();

    source.buffer = buffer;
    gain.gain.value = 0.45;

    source.connect(gain);
    gain.connect(this.context.destination);
    source.start();
  }

  destroy() {
    gameEvents.removeEventListener("fired", this.onFired);
    gameEvents.removeEventListener("exploded", this.onExploded);
    gameEvents.removeEventListener("hit", this.onHit);

    this.context?.close();
  }
}
