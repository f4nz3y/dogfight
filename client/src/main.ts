// @ts-nocheck
import "./style.css";

import { fetchJson, loadAll } from "./assets/loader.ts";
import { GameAudio } from "./audio/audio.ts";
import { Lobby } from "./lobby/Lobby.ts";
import { LobbyView } from "./lobby/lobbyView.ts";
import { GameConnection } from "./lobby/connection.ts";
import { World } from "./sim/world.ts";
import { Ship } from "./sim/entities.ts";
import { drawWorld } from "./render/sprites.ts";
import { emitGameEvent } from "./events/gameEvents.ts";
import { createShipState, integrate } from "@dogfight/shared";

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
connection.addEventListener("joined", (event) => {
  localSlot = event.detail.slot ?? 0;
  localNetState = createShipState(localSlot, event.detail.room.arena.seed, event.detail.room.arena.width, event.detail.room.arena.height);
  snapshotHistory = [];
  previousAudioSnapshot = null;
  authoritativeHp = 3;
  connection.pendingInputs.length = 0;
  inputSequence = 0;
  clientTick = 0;
});
connection.addEventListener("snapshot", (event) => {
  const snapshot = event.detail;

  // Звукові події відтворюються за змінами авторитетного стану.
  if (previousAudioSnapshot) {
    const previousAsteroids = new Map((previousAudioSnapshot.asteroids || []).map(a => [a.id, a]));
    const currentAsteroids = new Map((snapshot.asteroids || []).map(a => [a.id, a]));
    for (const [id, oldAsteroid] of previousAsteroids) {
      const current = currentAsteroids.get(id);
      if (!current) {
        emitGameEvent("exploded", { x: oldAsteroid.x, y: oldAsteroid.y });
      } else if (current.hp < oldAsteroid.hp) {
        emitGameEvent("hit", { x: current.x, y: current.y });
      }
    }
    const previousBulletIds = new Set((previousAudioSnapshot.bullets || []).map(b => b.id));
    for (const bullet of snapshot.bullets || []) {
      if (!previousBulletIds.has(bullet.id) && bullet.owner !== localSlot) {
        emitGameEvent("fired");
      }
    }
    const oldOwn = (previousAudioSnapshot.players || []).find(p => p.slot === localSlot);
    const newOwn = (snapshot.players || []).find(p => p.slot === localSlot);
    if (oldOwn && newOwn && newOwn.hp < oldOwn.hp) {
      emitGameEvent("hit", { x: newOwn.x, y: newOwn.y });
    }
  }
  previousAudioSnapshot = snapshot;
  const receivedAt = performance.now();
  snapshotHistory.push({ receivedAt, snapshot });
  if (snapshotHistory.length > 20) snapshotHistory.shift();
  const own = snapshot.players.find((player) => player.slot === localSlot);
  if (own) {
    authoritativeHp = own.hp ?? 3;
    scoreLabel.textContent = String(own.score ?? 0);
    if (world?.player) world.player.alive = own.alive !== false;
  }
  if (own && localNetState) {
    const before = { ...localNetState };
    localNetState = { slot: own.slot, x: own.x, y: own.y, vx: own.vx, vy: own.vy, angle: own.angle };
    if (own.alive !== false) {
      connection.pendingInputs = connection.pendingInputs.filter((input) => input.seq > own.lastProcessedSeq);
      for (const pending of connection.pendingInputs) localNetState = integrate(localNetState, pending, NETWORK_DT);
    } else {
      connection.pendingInputs.length = 0;
    }
    const correctionX = before.x - localNetState.x;
    const correctionY = before.y - localNetState.y;
    connection.correctionMagnitude = Math.hypot(correctionX, correctionY);
    visualCorrection.x += correctionX;
    visualCorrection.y += correctionY;
  }
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
const NETWORK_DT = 1 / 30;
let localNetState = null;
let localSlot = -1;
let inputSequence = 0;
let clientTick = 0;
let networkTimer = null;
let snapshotHistory = [];
let previousAudioSnapshot = null;
let authoritativeHp = 3;
let interpolationDelay = 100;
let visualCorrection = { x: 0, y: 0 };
let lastVisualFrame = 0;
let lastNetSampleAt = 0;
let lastNetBytesIn = 0;
let lastNetBytesOut = 0;
let netBytesPerSecond = { in: 0, out: 0 };

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
  console.log("[DEBUG] Відкрито лобі");
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
  hpLabel.textContent = "3";
  scoreLabel.textContent = "0";

  const ship = new Ship(arena.width / 2, arena.height / 2);
  world.spawn(ship);
  // Asteroids are server-authoritative and arrive in snapshots.

  roomNameLabel.textContent = room.name;
  lastNetSampleAt = 0; lastNetBytesIn = connection.bytesIn; lastNetBytesOut = connection.bytesOut;
  accumulator = 0;
  previousTime = 0;

  if (animationId !== null) cancelAnimationFrame(animationId);
  clearInterval(networkTimer);
  networkTimer = setInterval(sendNetworkInput, 1000 / 30);
  animationId = requestAnimationFrame(frame);
}

function readInput() {
  return {
    turn: (keys.has("ArrowRight") || keys.has("d") || keys.has("D") ? 1 : 0) -
      (keys.has("ArrowLeft") || keys.has("a") || keys.has("A") ? 1 : 0),
    thrust: keys.has("ArrowUp") || keys.has("w") || keys.has("W"),
    fire: keys.has(" ")
  };
}

function sendNetworkInput() {
  if (!localNetState || gameScreen.hidden || authoritativeHp <= 0) return;
  const input = readInput();
  const packet = { seq: ++inputSequence, tick: ++clientTick, turn: input.turn, thrust: input.thrust, fire: input.fire };
  localNetState = integrate(localNetState, packet, NETWORK_DT);
  connection.pendingInputs.push(packet);
  if (connection.pendingInputs.length > 120) connection.pendingInputs.shift();
  connection.sendInput(packet);
}

function simulate(dt) {
  if (!world) return;
  world.step(dt, {}, { spawnPickups: false });
  if (world.player && localNetState) {
    world.player.pos.x = localNetState.x;
    world.player.pos.y = localNetState.y;
    world.player.vel.x = localNetState.vx;
    world.player.vel.y = localNetState.vy;
    world.player.angle = localNetState.angle;
  }
  hpLabel.textContent = String(authoritativeHp);

}

function render() {
  const visualNow = performance.now();
  const visualDt = lastVisualFrame ? (visualNow - lastVisualFrame) / 1000 : 0;
  lastVisualFrame = visualNow;
  const smoothing = Math.exp(-visualDt / 0.1);
  visualCorrection.x *= smoothing;
  visualCorrection.y *= smoothing;
  if (world?.player && localNetState) {
    world.player.pos.x = localNetState.x + visualCorrection.x;
    world.player.pos.y = localNetState.y + visualCorrection.y;
    world.player.angle = localNetState.angle;
  }

  ctx.fillStyle = "#080c18";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawWorld(ctx, world, {
    ship: assets.ship,
    asteroid: assets.asteroid,
    bullet: assets.bullet
  });

  const renderAt = performance.now() - interpolationDelay;
  let older = null, newer = null;
  for (const entry of snapshotHistory) {
    if (entry.receivedAt <= renderAt) older = entry;
    if (entry.receivedAt >= renderAt) { newer = entry; break; }
  }
  older ||= snapshotHistory[0] || null;
  newer ||= snapshotHistory[snapshotHistory.length - 1] || null;
  const t = older && newer && older !== newer
    ? Math.max(0, Math.min(1, (renderAt - older.receivedAt) / Math.max(1, newer.receivedAt - older.receivedAt))) : 1;
  const interpolate = (a, b, keys) => {
    if (!a) return b;
    if (!b) return a;
    const value = { ...b };
    for (const key of keys) value[key] = a[key] + (b[key] - a[key]) * t;
    if (Number.isFinite(a.angle) && Number.isFinite(b.angle)) {
      let d = b.angle - a.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      value.angle = a.angle + d * t;
    }
    return value;
  };
  const oldPlayers = older?.snapshot.players || [], newPlayers = newer?.snapshot.players || [];
  for (const remote of newPlayers) {
    if (remote.slot === localSlot) continue;
    const a = oldPlayers.find(item => item.slot === remote.slot);
    const state = interpolate(a, remote, ["x", "y"]);
    ctx.save(); ctx.translate(state.x, state.y); ctx.rotate(state.angle);
    ctx.strokeStyle = "#f472b6"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-14, -12); ctx.lineTo(-8, 0); ctx.lineTo(-14, 12); ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  const oldAsteroids = older?.snapshot.asteroids || [], newAsteroids = newer?.snapshot.asteroids || [];
  const asteroidIds = new Set([...oldAsteroids, ...newAsteroids].map(a => a.id));
  for (const id of asteroidIds) {
    const a = oldAsteroids.find(item => item.id === id), b = newAsteroids.find(item => item.id === id);
    const state = interpolate(a, b, ["x", "y", "radius"]);
    if (!state) continue;
    ctx.save(); ctx.translate(state.x, state.y); ctx.rotate(state.angle || 0);
    ctx.strokeStyle = "#a3a3a3"; ctx.lineWidth = 2; ctx.beginPath();
    for (let i=0;i<9;i++) { const angle=i/9*Math.PI*2, radius=state.radius*(i%2===0?1:.78), x=Math.cos(angle)*radius, y=Math.sin(angle)*radius; if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y); }
    ctx.closePath(); ctx.stroke(); ctx.restore();
  }
  const oldBullets = older?.snapshot.bullets || [], newBullets = newer?.snapshot.bullets || [];
  for (const bullet of newBullets) {
    const a = oldBullets.find(item => item.id === bullet.id);
    const state = interpolate(a, bullet, ["x", "y"]);
    ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(state.x, state.y, 4, 0, Math.PI * 2); ctx.fill();
  }
  const newPickups = newer?.snapshot.pickups || [];
  for (const pickup of newPickups) {
    ctx.save();
    ctx.strokeStyle = pickup.type === "shield" ? "#86efac" : "#f9a8d4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pickup.type === "shield" ? "S" : "R", pickup.x, pickup.y);
    ctx.restore();
  }
  $("#net-rtt").textContent = `${connection.rttMs.toFixed(1)} ms`;
  $("#net-age").textContent = connection.lastSnapshotAt ? `${(performance.now() - connection.lastSnapshotAt).toFixed(1)} ms` : "—";
  if (visualNow - lastNetSampleAt >= 1000) {
    const seconds = lastNetSampleAt ? (visualNow - lastNetSampleAt) / 1000 : 1;
    netBytesPerSecond = {
      in: Math.round((connection.bytesIn - lastNetBytesIn) / seconds),
      out: Math.round((connection.bytesOut - lastNetBytesOut) / seconds)
    };
    lastNetSampleAt = visualNow;
    lastNetBytesIn = connection.bytesIn;
    lastNetBytesOut = connection.bytesOut;
  }
  $("#net-bytes").textContent = `${netBytesPerSecond.in} / ${netBytesPerSecond.out} B/s`;
  $("#net-pending").textContent = String(connection.pendingInputs.length);
  $("#net-correction").textContent = `${connection.correctionMagnitude.toFixed(2)} px`;
  $("#net-interpolation").textContent = `${interpolationDelay} ms`;
  $("#net-status").textContent = snapshotHistory.length
    ? `Tick ${snapshotHistory[snapshotHistory.length - 1].snapshot.tick}; гравців: ${snapshotHistory[snapshotHistory.length - 1].snapshot.players.length}`
    : "Очікування першого snapshot…";

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
  console.log("[DEBUG] 1. Натиснуто кнопку");

  try {
    console.log("[DEBUG] 2. Починаємо audio.unlock()");
    await audio.unlock();
    console.log("[DEBUG] 3. audio.unlock() завершився");

    const roomId = $("#room-id").value.trim();
    const playerName = $("#player-name").value.trim() || "Player";

    console.log("[DEBUG] 4. roomId:", roomId);
    console.log("[DEBUG] 4. playerName:", playerName);

    connection.setNetworkConditions({
      latency: $("#latency-input").value,
      jitter: $("#jitter-input").value,
      drop: $("#drop-input").value
    });

    if (!roomId) {
      throw new Error("Спочатку вибери кімнату.");
    }

    const room = lobby.join(roomId, playerName);

    console.log("[DEBUG] 5. Кімнату знайдено:", room);

    $("#lobby-status").textContent = "Підключення до кімнати...";
    $("#chat-messages").replaceChildren();

    const joinedPromise = waitForServerJoin();

    console.log("[DEBUG] 6. Викликаємо connection.join()");

    await connection.join(room.id, lobby.playerName);

    console.log("[DEBUG] 7. connection.join() завершився");

    const joined = await joinedPromise;

    console.log("[DEBUG] 8. Отримано підтвердження сервера:", joined);

    startGame(joined.room);
  } catch (error) {
    console.error("[DEBUG] ПОМИЛКА ПРИЄДНАННЯ:", error);

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
$("#interpolation-input").addEventListener("input", (event) => {
  interpolationDelay = Number(event.target.value);
  $("#net-interpolation").textContent = `${interpolationDelay} ms`;
});

$("#cancel-loading").addEventListener("click", () => {
  loadingController?.abort();
});

$("#leave-game").addEventListener("click", () => {
  connection.leave();
  clearInterval(networkTimer);
  networkTimer = null;
  localNetState = null;
  localSlot = -1;
  snapshotHistory = [];
  previousAudioSnapshot = null;
  authoritativeHp = 3;
  visualCorrection = { x: 0, y: 0 };
  lastVisualFrame = 0;

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
