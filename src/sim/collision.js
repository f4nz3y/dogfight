
export function circlesOverlap(a, b) {
  const dx = a.pos.x - b.pos.x;
  const dy = a.pos.y - b.pos.y;
  const distanceSquared = dx * dx + dy * dy;
  const radiusSum = a.radius + b.radius;

  return distanceSquared <= radiusSum * radiusSum;
}

export function findCollisions(world) {
  const entities = [...world];
  const pairs = [];

  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];

    if (!a.alive) continue;

    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];

      if (!b.alive) continue;
      if (a.kind === "explosion" || b.kind === "explosion") continue;

      if (circlesOverlap(a, b)) {
        pairs.push([a, b]);
      }
    }
  }

  return pairs;
}
