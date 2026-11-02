
export function drawSprite(ctx, entity, assets) {
  const sprite = assets[entity.kind];

  if (!sprite) {
    entity.draw(ctx);
    return;
  }

  const size = entity.radius * 2;

  ctx.save();
  ctx.translate(entity.pos.x, entity.pos.y);

  if (entity.kind === "ship" || entity.kind === "bullet") {
    ctx.rotate(entity.angle);
  }

  ctx.drawImage(
    sprite,
    -size / 2,
    -size / 2,
    size,
    size
  );

  ctx.restore();
}

export function drawWorld(ctx, world, assets) {
  for (const entity of world) {
    if (!entity.alive) continue;

    if (entity.kind === "explosion" || entity.kind === "pickup") {
      entity.draw(ctx);
    } else {
      drawSprite(ctx, entity, assets);
    }
  }
}
