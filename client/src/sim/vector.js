
export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  add(v) {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  sub(v) {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  scale(s) {
    return new Vector2(this.x * s, this.y * s);
  }

  length() {
    return Math.hypot(this.x, this.y);
  }

  normalize() {
    const len = this.length();
    return len === 0 ? new Vector2() : this.scale(1 / len);
  }

  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return new Vector2(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    );
  }

  dot(v) {
    return this.x * v.x + this.y * v.y;
  }

  addInPlace(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  static fromAngle(angle, magnitude = 1) {
    return new Vector2(
      Math.cos(angle) * magnitude,
      Math.sin(angle) * magnitude
    );
  }
}
