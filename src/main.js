
import "./style.css";

import { fetchJson, loadAll } from "./assets/loader.js";
import { GameAudio } from "./audio/audio.js";
import { Lobby } from "./lobby/Lobby.js";
import { LobbyView } from "./lobby/lobbyView.js";
import { World } from "./sim/world.js";
import { Ship } from "./sim/entities.js";
import { drawWorld } from "./render/sprites.js";

const $ = (selector) => document.querySelector(selector);

const loadingScreen = $("#loading-screen");
const lobbyScreen = $("#lobby-screen");
const gameScreen = $("#game-screen");

const progressBar = $("#progress-bar");
const progressText = $("#progress-text");
const loadingStatus = $("#loading-status");
const loadingError = $("#loading-error");
const retryButton = $("#retry-loading");

const canvas = $("#game");
const ctx = canvas.getContext("2d");

const hpLabel = $("#hp");
const scoreLabel = $("#score");
const roomNameLabel = $("#room-name");

const audio = new GameAudio();
const lobby = new Lobby();

new LobbyView(lobby, {
  roomList: $("#room-list"),
  status: $("#lobby-status"),
  roomId: $("#room-id")
});

let assets = null;
let world = null;
let keys = new Set();

let accumulator = 0;
let previousTime = 0;
let animationId = null;
let loadingController = null;

const STEP = 1 / 60;

function showScreen(screen) {
  loadingScreen.hidden = screen !== loadingScreen;
  lobbyScreen.hidden = screen !== lobbyScreen;
  gameScreen.hidden = screen !== gameScreen;
}

async function loadGameAssets() {
  retryButton.hidden = true;
  loadingError.textContent = "";
  progressBar.style.width = "0%";
  progressText.textContent = "0%";
  loadingStatus.textContent = "Завантаження маніфесту...";

  loadingController = new AbortController();

  try {
    const manifest = await fetchJson(
      "/assets/manifest.json",
      loadingController.signal
    );

    loadingStatus.textContent = "Завантаження ресурсів...";

    if (!audio.context) {
      audio.context = new AudioContext();
    }

    const loaded = await loadAll(manifest, {
      audioContext: audio.context,
      signal: loadingController.signal,

      onProgress({ completed, total, ratio, name }) {
        const percent = Math.round(ratio * 100);

        progressBar.style.width = `${percent}%`;
        progressText.textContent = `${percent}%`;
        loadingStatus.textContent =
          `Завантажено ${completed} із ${total}: ${name}`;
      }
    });

    assets = loaded;

    audio.setBuffers({
      shoot: loaded.shoot,
      hit: loaded.hit,
      explosion: loaded.explosion
    });

    loadingStatus.textContent = "Завантаження завершено!";
    progressText.textContent = "100%";

    openLobby();
  } catch (error) {
  loadingStatus.textContent =
    error.name === "AbortError"
      ? "Завантаження скасовано."
      : "Не вдалося завантажити ресурси.";

  loadingError.textContent = error.message;
  retryButton.hidden = false;
  }
}

function openLobby() {
  showScreen(lobbyScreen);
  lobby.startRefreshing();
}

function startGame(room) {
  lobby.leave();

  showScreen(gameScreen);

  const arena = room.arena;

  canvas.width = arena.width;
  canvas.height = arena.height;

  world = new World(arena.width, arena.height);

  const ship = new Ship(arena.width / 2, arena.height / 2);
  world.spawn(ship);
  world.createAsteroids(arena.asteroidCount);

  roomNameLabel.textContent = room.name;

  accumulator = 0;
  previousTime = 0;

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
  }

  animationId = requestAnimationFrame(frame);
}

function simulate(dt) {
  const inputs = {
    left: keys.has("ArrowLeft") || keys.has("a") || keys.has("A"),
    right: keys.has("ArrowRight") || keys.has("d") || keys.has("D"),
    up: keys.has("ArrowUp") || keys.has("w") || keys.has("W"),
    fire: keys.has(" ")
  };

  world.step(dt, inputs);

  hpLabel.textContent = world.player ? world.player.hp : "0";
  scoreLabel.textContent = String(world.score);
}

function render() {
  ctx.fillStyle = "#080c18";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawWorld(ctx, world, {
    ship: assets.ship,
    asteroid: assets.asteroid,
    bullet: assets.bullet
  });

  if (!world.player && world.respawnTimer > 0) {
    ctx.fillStyle = "#fca5a5";
    ctx.font = "24px Arial";
    ctx.textAlign = "center";

    ctx.fillText(
      `Відродження через ${Math.max(0, 2 - world.respawnTimer).toFixed(1)} с`,
      canvas.width / 2,
      40
    );
  }
}

function frame(time) {
  if (!world || gameScreen.hidden) return;

  if (!previousTime) previousTime = time;

  const elapsed = Math.min((time - previousTime) / 1000, 0.1);
  previousTime = time;

  accumulator += elapsed;

  while (accumulator >= STEP) {
    simulate(STEP);
    accumulator -= STEP;
  }

  render();
  animationId = requestAnimationFrame(frame);
}

$("#join-button").addEventListener("click", async () => {
  try {
    await audio.unlock();

    const roomId = $("#room-id").value;
    const playerName = $("#player-name").value;

    if (!roomId) {
      $("#lobby-status").textContent = "Спочатку вибери кімнату.";
      return;
    }

    const room = lobby.join(roomId, playerName);
    startGame(room);
  } catch (error) {
    $("#lobby-status").textContent = error.message;
  }
});

$("#refresh-button").addEventListener("click", () => {
  lobby.refresh();
});

$("#cancel-loading").addEventListener("click", () => {
  loadingController?.abort();
});

$("#leave-game").addEventListener("click", () => {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  keys.clear();
  openLobby();
});

retryButton.addEventListener("click", () => {
  loadGameAssets();
});

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

// Завантаження починається після відкриття сторінки.
showScreen(loadingScreen);
loadGameAssets();
