import "./style.css";

import { createLoop } from "./loop.js";
import { createInput } from "./input.js";
import { createShip, integrate } from "./sim/ship.js";
import { wrapAround } from "./sim/arena.js";
import { setupCanvas } from "./render/canvas.js";
import { renderScene } from "./render/draw.js";

const canvas = document.querySelector("#game-canvas");
const resetButton = document.querySelector("#reset-button");

const elements = {
  steps: document.querySelector("#steps"),
  fps: document.querySelector("#fps"),
  frameTime: document.querySelector("#frame-time"),
};

if (!canvas || !resetButton) {
  throw new Error("Не знайдено необхідні HTML-елементи.");
}

const surface = setupCanvas(canvas);
const input = createInput(window);

let ship = createShip(surface.width / 2, surface.height / 2);
let previousShip = { ...ship };

function lerp(a, b, alpha) {
  return a + (b - a) * alpha;
}

function lerpAngle(a, b, alpha) {
  const difference = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

  return a + difference * alpha;
}

function interpolateShip(previous, current, alpha) {
  return {
    x: lerp(previous.x, current.x, alpha),
    y: lerp(previous.y, current.y, alpha),
    vx: lerp(previous.vx, current.vx, alpha),
    vy: lerp(previous.vy, current.vy, alpha),
    angle: lerpAngle(previous.angle, current.angle, alpha),
    thrust: current.thrust,
  };
}

function simulate(dt) {
  previousShip = { ...ship };

  integrate(ship, input, dt);

  wrapAround(ship, surface.width, surface.height);

  input.endFrame();
}

function render(alpha) {
  const ctx = surface.ctx;

  const displayedShip = interpolateShip(previousShip, ship, alpha);

  const stats = loop.getStats();

  renderScene(ctx, surface.width, surface.height, displayedShip, stats, elements);
}

const loop = createLoop({
  step: 1 / 60,
  simulate,
  render,
});

resetButton.addEventListener("click", () => {
  ship = createShip(surface.width / 2, surface.height / 2);

  previousShip = { ...ship };
});

window.addEventListener("beforeunload", () => {
  loop.stop();
  surface.destroy();
});

loop.start();
