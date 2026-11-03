import "./style.css";

import { fetchJson, loadAll } from "./assets/loader.js";
import { GameAudio } from "./audio/audio.js";
import { Lobby } from "./lobby/Lobby.js";
import { LobbyView } from "./lobby/lobbyView.js";
import { GameConnection } from "./lobby/connection.js";
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
const connection = new GameConnection();

new LobbyView(lobby, {
  roomList: $("#room-list"),
  status: $("#lobby-status"),
  roomId: $("#room-id")
});

connection.addEventListener("open", () => {
  $("#connection-status").textContent = "WebSocket підключено";
});

connection.addEventListener("close", () => {
  if (!connection.manuallyClosed && connection.desiredRoom) {
    $("#connection-status").textContent = "З'єднання втрачено. Спроба відновлення...";
  } else {
    $("#connection-status").textContent = "WebSocket відключено";
  }
});

connection.addEventListener("reconnectFailed", () => {
  $("#connection-status").textContent = "Не вдалося відновити WebSocket-з'єднання";
});

connection.addEventListener("error", (event) => {
  $("#lobby-status").textContent = event.detail.message || "Помилка сервера";
});

connection.addEventListener("joined", (event) => {
  $("#connection-status").textContent = `Підключено до кімнати ${event.detail.room.name}`;
});

connection.addEventListener("roster", (event) => {
  const roster = $("#roster");
  roster.replaceChildren();

  for (const player of event.detail.players || []) {
    const item = document.createElement("li");
    item.textContent = player.name;
    roster.append(item);
  }
});

connection.addEventListener("chat", (event) => {
  const message = event.detail.message;
  if (!message) return;

  const line = document.createElement("p");
  line.textContent = `${message.playerName}: ${message.text}`;
  $("#chat-messages").append(line);
});

function waitForServerJoin(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup(() => reject(new Error("Час очікування відповіді сервера вичерпано")));
    }, timeoutMs);

    const onJoined = (event) => cleanup(() => resolve(event.detail));
    const onError = (event) => cleanup(() => reject(new Error(event.detail.message)));

    function cleanup(done) {
      clearTimeout(timer);
      connection.removeEventListener("joined", onJoined);
      connection.removeEventListener("error", onError);
      done();
    }

    connection.addEventListener("joined", onJoined);
    connection.addEventListener("error", onError);
  });
}

let assets = null;
let world = null;
const keys = new Set();

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
        loadingStatus.textContent = `Завантажено ${completed} із ${total}: ${name}`;
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
    loadingStatus.textContent = error.name === "AbortError"
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

  const arena = room.arena || {
    width: 900,
    height: 600,
    asteroidCount: 8
  };

  canvas.width = arena.width;
  canvas.height = arena.height;
  world = new World(arena.width, arena.height);

  const ship = new Ship(arena.width / 2, arena.height / 2);
  world.spawn(ship);
  world.createAsteroids(arena.asteroidCount);

  roomNameLabel.textContent = room.name;
  accumulator = 0;
  previousTime = 0;

  if (animationId !== null) cancelAnimationFrame(animationId);
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

    const roomId = $("#room-id").value.trim();
    const playerName = $("#player-name").value.trim() || "Player";

    if (!roomId) throw new Error("Спочатку вибери кімнату.");

    const room = lobby.join(roomId, playerName);
    $("#lobby-status").textContent = "Підключення до кімнати...";
    $("#chat-messages").replaceChildren();

    const joinedPromise = waitForServerJoin();
    await connection.join(room.id, lobby.playerName);
    const joined = await joinedPromise;

    startGame(joined.room);
  } catch (error) {
    connection.close();
    $("#lobby-status").textContent = error.message;
    openLobby();
  }
});

$("#create-room-button").addEventListener("click", async () => {
  try {
    const room = await lobby.createRoom(
      `Room ${new Date().toLocaleTimeString()}`
    );
    $("#room-id").value = room.id;
    $("#lobby-status").textContent =
      `Створено кімнату ${room.name}. Тепер можна приєднатися.`;
  } catch (error) {
    $("#lobby-status").textContent = error.message;
  }
});

$("#chat-send").addEventListener("click", () => {
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text) return;

  if (!connection.chat(text)) {
    $("#connection-status").textContent = "Повідомлення не надіслано: немає з'єднання";
    return;
  }

  input.value = "";
});

$("#chat-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") $("#chat-send").click();
});

$("#refresh-button").addEventListener("click", () => {
  lobby.refresh();
});

$("#cancel-loading").addEventListener("click", () => {
  loadingController?.abort();
});

$("#leave-game").addEventListener("click", () => {
  connection.leave();

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  world = null;
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

showScreen(loadingScreen);
loadGameAssets();
