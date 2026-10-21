
import "./style.css";
import { World } from "./sim/world.js";
import { Ship, addHoming } from "./sim/entities.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const hpLabel = document.querySelector("#hp");
const scoreLabel = document.querySelector("#score");
const resetButton = document.querySelector("#reset");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const STEP = 1 / 60;

let world;
let keys = new Set();
let accumulator = 0;
let previousTime = 0;

function resetGame() {
  world = new World(WIDTH, HEIGHT);
  world.spawn(new Ship(WIDTH / 2, HEIGHT / 2));
  world.createAsteroids(8);

  // Демонстрація композиції: один астероїд має поведінку наведення.
  const target = world.player;
  const asteroid = [...world.ofKind("asteroid")][0];

  if (asteroid && target) {
    addHoming(asteroid, target, 0.35);
  }

  accumulator = 0;
}

function getInputs() {
  return {
    left: keys.has("ArrowLeft") || keys.has("a") || keys.has("A"),
    right: keys.has("ArrowRight") || keys.has("d") || keys.has("D"),
    up: keys.has("ArrowUp") || keys.has("w") || keys.has("W"),
    fire: keys.has(" ")
  };
}

function simulate(dt) {
  world.step(dt, getInputs());

  hpLabel.textContent = world.player ? world.player.hp : "0";
  scoreLabel.textContent = String(world.score);
}

function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  // Декоративне зоряне тло.
  ctx.fillStyle = "#080c18";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#64748b";

  for (let i = 0; i < 65; i++) {
    const x = (i * 137) % WIDTH;
    const y = (i * 83) % HEIGHT;
    ctx.fillRect(x, y, 2, 2);
  }

  for (const entity of world) {
    if (!entity.alive) continue;

    entity.draw(ctx);
  }

  if (!world.player && world.respawnTimer > 0) {
    ctx.fillStyle = "#fca5a5";
    ctx.font = "24px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      `Корабель знищено. Відродження через ${Math.max(0, 2 - world.respawnTimer).toFixed(1)} с`,
      WIDTH / 2,
      40
    );
  }
}

function frame(time) {
  if (!previousTime) previousTime = time;

  const elapsed = Math.min((time - previousTime) / 1000, 0.1);
  previousTime = time;
  accumulator += elapsed;

  while (accumulator >= STEP) {
    simulate(STEP);
    accumulator -= STEP;
  }

  render();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
    event.preventDefault();
  }

  keys.add(event.key);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
});

window.addEventListener("blur", () => {
  keys.clear();
});

resetButton.addEventListener("click", () => {
  resetGame();
});

resetGame();
requestAnimationFrame(frame);
