
import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

const random = (min, max) => Math.random() * (max - min) + min;

export class Bullet extends Entity {
  constructor(x, y, angle, vx = 0, vy = 0) {
    const direction = Vector2.fromAngle(angle, 360);

    super({
      x,
      y,
      vx: direction.x + vx,
      vy: direction.y + vy,
      angle,
      radius: 4,
      kind: "bullet"
    });

    this.ttl = 1.8;
    this.damageAmount = 1;
  }

  update(dt) {
    super.update(dt);
    this.ttl -= dt;

    if (this.ttl <= 0) {
      this.alive = false;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class Ship extends Entity {
  #hp = 3;

  constructor(x, y) {
    super({ x, y, radius: 16, kind: "ship" });
    this.fireCooldown = 0;
    this.invulnerable = 0;
    this.score = 0;
    this.thrusting = false;
  }

  get hp() {
    return this.#hp;
  }

  update(dt, input = {}, world) {
    if (input.left) this.angle -= 3.5 * dt;
    if (input.right) this.angle += 3.5 * dt;

    this.thrusting = Boolean(input.up);

    if (this.thrusting) {
      this.vel.addInPlace(Vector2.fromAngle(this.angle, 220 * dt));
    }

    this.vel = this.vel.scale(Math.pow(0.985, dt * 60));

    const speed = this.vel.length();
    const maxSpeed = 280;

    if (speed > maxSpeed) {
      this.vel = this.vel.normalize().scale(maxSpeed);
    }

    super.update(dt);

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    if (input.fire && this.fireCooldown === 0 && world) {
      this.fire(world);
    }
  }

  fire(world) {
    if (this.fireCooldown > 0) return;

    const nose = this.pos.add(
      Vector2.fromAngle(this.angle, this.radius + 5)
    );

    const bullet = new Bullet(
      nose.x,
      nose.y,
      this.angle,
      this.vel.x * 0.5,
      this.vel.y * 0.5
    );

    world.spawn(bullet);
    this.fireCooldown = this.rapidFire > 0 ? 0.08 : 0.25;
  }

  damage(amount = 1) {
    if (this.invulnerable > 0 || !this.alive) return;

    this.#hp -= amount;

    if (this.#hp <= 0) {
      this.alive = false;
    } else {
      this.invulnerable = 0.8;
    }
  }

  draw(ctx) {
    if (this.invulnerable > 0 && Math.floor(this.invulnerable * 12) % 2 === 0) {
      return;
    }

    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);

    ctx.strokeStyle = "#7dd3fc";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(19, 0);
    ctx.lineTo(-13, -12);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-13, 12);
    ctx.closePath();
    ctx.stroke();

    if (this.thrusting) {
      ctx.strokeStyle = "#fb923c";
      ctx.beginPath();
      ctx.moveTo(-9, -5);
      ctx.lineTo(-19 - Math.random() * 5, 0);
      ctx.lineTo(-9, 5);
      ctx.stroke();
    }

    ctx.restore();
  }
}

export class Asteroid extends Entity {
  constructor(x, y, radius = random(18, 34)) {
    const angle = random(0, Math.PI * 2);
    const speed = random(25, 85);

    super({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      angle: random(0, Math.PI * 2),
      radius,
      kind: "asteroid"
    });

    this.spin = random(-0.8, 0.8);
    this.hp = radius > 27 ? 2 : 1;
  }

  update(dt, input, world) {
    super.update(dt);
    this.angle += this.spin * dt;

    if (this.pos.x < this.radius || this.pos.x > world.width - this.radius) {
      this.vel.x *= -1;
    }

    if (this.pos.y < this.radius || this.pos.y > world.height - this.radius) {
      this.vel.y *= -1;
    }

    this.pos.x = Math.max(this.radius, Math.min(world.width - this.radius, this.pos.x));
    this.pos.y = Math.max(this.radius, Math.min(world.height - this.radius, this.pos.y));
  }

  damage(amount = 1) {
    this.hp -= amount;

    if (this.hp <= 0) {
      this.alive = false;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = "#a3a3a3";
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2;
      const radius = this.radius * (i % 2 === 0 ? 1 : 0.78);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

export class Explosion extends Entity {
  constructor(x, y) {
    super({ x, y, radius: 1, kind: "explosion" });

    this.ttl = 0.65;
    this.particles = Array.from({ length: 20 }, () => ({
      pos: new Vector2(x, y),
      vel: Vector2.fromAngle(random(0, Math.PI * 2), random(35, 150)),
      radius: random(1, 4)
    }));
  }

  update(dt) {
    this.ttl -= dt;

    for (const particle of this.particles) {
      particle.pos.addInPlace(particle.vel.scale(dt));
    }

    if (this.ttl <= 0) {
      this.alive = false;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.ttl / 0.65);
    ctx.fillStyle = "#fb923c";

    for (const particle of this.particles) {
      ctx.beginPath();
      ctx.arc(
        particle.pos.x,
        particle.pos.y,
        particle.radius,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }
}

export class Pickup extends Entity {
  constructor(x, y, type = "shield") {
    super({ x, y, radius: 13, kind: "pickup" });
    this.pickupType = type;
    this.ttl = 12;
  }

  update(dt) {
    this.ttl -= dt;

    if (this.ttl <= 0) {
      this.alive = false;
    }
  }

  applyTo(ship) {
    if (this.pickupType === "shield") {
      ship.invulnerable = Math.max(ship.invulnerable, 5);
    } else if (this.pickupType === "rapid") {
      ship.fireCooldown = 0;
      ship.rapidFire = 5;
    }

    this.alive = false;
  }

  draw(ctx) {
    ctx.save();
    ctx.strokeStyle = this.pickupType === "shield" ? "#86efac" : "#f9a8d4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.pickupType === "shield" ? "S" : "R", this.pos.x, this.pos.y);
    ctx.restore();
  }
}

// Композиція: цю поведінку можна приєднати до різних сутностей.
export function addHoming(entity, target, turnSpeed = 2) {
  entity.homing = {
    target,
    turnSpeed
  };
}

export function updateHoming(entity, dt) {
  const homing = entity.homing;

  if (!homing || !homing.target?.alive) return;

  const direction = homing.target.pos.sub(entity.pos).normalize();
  const desiredAngle = Math.atan2(direction.y, direction.x);
  let difference = desiredAngle - entity.angle;

  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;

  entity.angle += Math.max(
    -homing.turnSpeed * dt,
    Math.min(homing.turnSpeed * dt, difference)
  );

  const speed = entity.vel.length() || 100;
  entity.vel = Vector2.fromAngle(entity.angle, speed);
}
