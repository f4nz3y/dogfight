const ROTATION_SPEED = 3.2;
const THRUST_POWER = 250;
const DRAG = 0.985;
const MAX_SPEED = 420;
const BRAKE_FACTOR = 0.94;

export function createShip(x = 0, y = 0) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    thrust: false,
  };
}

export function integrate(ship, input, dt) {
  if (input.isDown("KeyA") || input.isDown("ArrowLeft")) {
    ship.angle -= ROTATION_SPEED * dt;
  }

  if (input.isDown("KeyD") || input.isDown("ArrowRight")) {
    ship.angle += ROTATION_SPEED * dt;
  }

  ship.thrust = input.isDown("KeyW") || input.isDown("ArrowUp");

  if (ship.thrust) {
    ship.vx += Math.cos(ship.angle) * THRUST_POWER * dt;
    ship.vy += Math.sin(ship.angle) * THRUST_POWER * dt;
  }

  const dragFactor = Math.pow(DRAG, dt * 60);

  ship.vx *= dragFactor;
  ship.vy *= dragFactor;

  if (input.isDown("KeyS") || input.isDown("ArrowDown")) {
    ship.vx *= Math.pow(BRAKE_FACTOR, dt * 60);
    ship.vy *= Math.pow(BRAKE_FACTOR, dt * 60);
  }

  const speed = Math.hypot(ship.vx, ship.vy);

  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    ship.vx *= scale;
    ship.vy *= scale;
  }

  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
}
