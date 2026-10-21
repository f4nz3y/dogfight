
import { Vector2 } from "./vector.js";

export class Entity {
  static #nextId = 1;

  #id = Entity.#nextId++;

  constructor({
    x = 0,
    y = 0,
    vx = 0,
    vy = 0,
    angle = 0,
    radius = 10,
    kind = "entity"
  } = {}) {
    this.pos = new Vector2(x, y);
    this.vel = new Vector2(vx, vy);
    this.angle = angle;
    this.radius = radius;
    this.kind = kind;
    this.alive = true;
  }

  get id() {
    return this.#id;
  }

  update(dt) {
    this.pos.addInPlace(this.vel.scale(dt));
  }

  damage() {
    // Базова сутність не має власного здоров'я.
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}
