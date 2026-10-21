function drawStars(ctx, width, height) {
  ctx.fillStyle = "#091222";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#7185a8";

  for (let i = 0; i < 90; i++) {
    const x = (i * 127.1) % width;
    const y = (i * 311.7) % height;
    const radius = i % 7 === 0 ? 1.5 : 0.7;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "#243650";
  ctx.lineWidth = 0.5;

  for (let x = 0; x < width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y < height; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

export function drawShip(ctx, ship) {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  if (ship.thrust) {
    ctx.beginPath();
    ctx.moveTo(-13, -5);
    ctx.lineTo(-27 - Math.random() * 7, 0);
    ctx.lineTo(-13, 5);
    ctx.closePath();

    ctx.fillStyle = "#ff9b54";
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-12, -11);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-12, 11);
  ctx.closePath();

  ctx.fillStyle = "#b8f1ff";
  ctx.fill();

  ctx.strokeStyle = "#52d8ff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

export function drawHud(stats, elements) {
  elements.steps.textContent = `${stats.stepsPerSecond} steps/s`;

  elements.fps.textContent = `${stats.framesPerSecond} FPS`;

  elements.frameTime.textContent = `${stats.frameTime.toFixed(2)} ms`;
}

export function renderScene(ctx, width, height, ship, stats, elements) {
  drawStars(ctx, width, height);
  drawShip(ctx, ship);
  drawHud(stats, elements);
}
