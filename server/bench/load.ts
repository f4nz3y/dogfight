
import WebSocket from "ws";

const base = process.env.BASE_URL || "http://127.0.0.1:3001";
const counts = [8, 32, 64, 128];
const playersPerRoom = 16;

for (const n of counts) {
  const roomCount = Math.ceil(n / playersPerRoom);
  const roomIds: string[] = [];

  for (let i = 0; i < roomCount; i++) {
    const response = await fetch(`${base}/api/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: `Load-${n}-${i}-${Date.now()}`
      })
    });

    const result = await response.json();

    if (!response.ok || !result.room?.id) {
      throw new Error(`Room creation failed: ${JSON.stringify(result)}`);
    }

    roomIds.push(result.room.id);
  }

  const clients: WebSocket[] = [];
  let bytes = 0;
  let connected = 0;
  let rejected = 0;

  const start = performance.now();

  for (let i = 0; i < n; i++) {
    const roomIndex = Math.floor(i / playersPerRoom);
    const roomId = roomIds[roomIndex];

    const ws = new WebSocket(
      base.replace(/^http/, "ws") + "/ws"
    );

    clients.push(ws);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        v: 1,
        type: "join",
        room: roomId,
        name: `Load${i}`
      }));
    });

    ws.on("message", data => {
      bytes += data.length;

      try {
        const message = JSON.parse(data.toString());

        if (message.type === "joined") {
            connected++;
        }

        if (message.type === "error") {
          rejected++;
        }
      } catch {
        // Binary messages are included in bytes.
      }
    });
  }

  await new Promise(resolve => setTimeout(resolve, 5000));

  const stats = await fetch(`${base}/api/stats`)
    .then(r => r.json());

  const elapsed = (performance.now() - start) / 1000;

  console.log(JSON.stringify({
    clients: n,
    connected,
    rejected,
    seconds: +elapsed.toFixed(2),
    bytesPerSecond: Math.round(bytes / elapsed),
    rss: stats.memory?.rss,
    utilization: stats.eventLoopUtilization?.utilization,
    tickP99Ms: Math.max(
  0,
  ...stats.matches
    .filter((match: { players: number }) => match.players > 0)
    .map((match: { tickP99Ms: number }) => match.tickP99Ms)
),
matches: stats.matches
  }));

  for (const ws of clients) {
    ws.close();
  }

  await new Promise(resolve => setTimeout(resolve, 300));
}
