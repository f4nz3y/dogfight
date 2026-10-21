
import { findCollisions } from "./collision.js";
import {
  Asteroid,
  Explosion,
  Pickup,
  Ship,
  updateHoming
} from "./entities.js";

export class World {
  #entities = new Map();

  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.player = null;
    this.score = 0;
    this.respawnTimer = 0;
    this.pickupTimer = 0;
  }

  spawn(entity) {
    this.#entities.set(entity.id, entity);

    if (entity.kind === "ship") {
      this.player = entity;
    }

    return entity;
  }

  despawn(id) {
    const entity = this.#entities.get(id);

    if (entity) {
      entity.alive = false;
    }
  }

  get(id) {
    return this.#entities.get(id);
  }

  *[Symbol.iterator]() {
    yield* this.#entities.values();
  }

  *ofKind(kind) {
    for (const entity of this) {
      if (entity.kind === kind && entity.alive) {
        yield entity;
      }
    }
  }

  createAsteroids(count) {
    for (let i = 0; i < count; i++) {
      this.spawn(
        new Asteroid(
          Math.random() * this.width,
          Math.random() * this.height
        )
      );
    }
  }

  step(dt, inputs = {}) {
    for (const entity of this) {
      if (!entity.alive) continue;

      if (entity.kind === "ship") {
        entity.update(dt, inputs, this);

        if (entity.kind === "ship" && entity.rapidFire > 0) {
            entity.rapidFire = Math.max(0, entity.rapidFire - dt);
        }
      } else {
        entity.update(dt, inputs, this);
      }

      updateHoming(entity, dt);
    }

    this.#resolveCollisions();

    if (!this.player || !this.player.alive) {
      this.respawnTimer += dt;

      if (this.respawnTimer >= 2) {
        this.#respawn();
      }
    } else {
      this.respawnTimer = 0;
    }

    this.pickupTimer += dt;

    if (this.pickupTimer >= 10) {
      this.pickupTimer = 0;

      const type = Math.random() < 0.5 ? "shield" : "rapid";
      this.spawn(
        new Pickup(
          30 + Math.random() * (this.width - 60),
          30 + Math.random() * (this.height - 60),
          type
        )
      );
    }

    // Відкладене видалення після завершення обробки кадру.
    for (const [id, entity] of this.#entities) {
      if (!entity.alive) {
        this.#entities.delete(id);
      }
    }
  }

  #resolveCollisions() {
    const pairs = findCollisions(this);

    for (const [a, b] of pairs) {
      if (!a.alive || !b.alive) continue;

      if (a.kind === "bullet" && b.kind === "asteroid") {
        b.damage(a.damageAmount);
        a.alive = false;

        if (!b.alive) {
          this.score += 10;
          this.spawn(new Explosion(b.pos.x, b.pos.y));
        }

        continue;
      }

      if (b.kind === "bullet" && a.kind === "asteroid") {
        a.damage(b.damageAmount);
        b.alive = false;

        if (!a.alive) {
          this.score += 10;
          this.spawn(new Explosion(a.pos.x, a.pos.y));
        }

        continue;
      }

      if (a.kind === "ship" && b.kind === "asteroid") {
        a.damage(1);

        if (!a.alive) {
            this.spawn(new Explosion(a.pos.x, a.pos.y));
            this.player = null;
        }

        continue;
      }

      if (b.kind === "ship" && a.kind === "asteroid") {
        b.damage(1);

        if (!b.alive) {
          this.spawn(new Explosion(b.pos.x, b.pos.y));
          this.player = null;
        }

        continue;
      }

      if (a.kind === "ship" && b.kind === "pickup") {
        b.applyTo(a);
        this.score += 5;
        continue;
      }

      if (b.kind === "ship" && a.kind === "pickup") {
        a.applyTo(b);
        this.score += 5;
      }
    }
  }

  #respawn() {
    const ship = new Ship(this.width / 2, this.height / 2);
    ship.invulnerable = 2;

    this.spawn(ship);
    this.player = ship;
    this.respawnTimer = 0;
  }
}
