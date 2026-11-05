// Binary protocol v4. All multibyte fields are little-endian.
export const PROTOCOL_VERSION = 4;
export const MESSAGE_INPUT = 1;
export const MESSAGE_SNAPSHOT = 2;
export const INPUT_BYTES = 13;
const HEADER = 10, PLAYER = 30, ASTEROID = 25, BULLET = 26, PICKUP = 15;

export interface InputFrame {
  seq: number; tick: number; turn: -1 | 0 | 1; thrust: boolean; fire: boolean;
}
export interface PlayerSnapshot {
  slot: number; lastProcessedSeq: number; x: number; y: number; vx: number; vy: number;
  angle: number; hp: number; alive: boolean; score: number;
}
export interface AsteroidSnapshot {
  id: number; x: number; y: number; vx: number; vy: number; radius: number; angle: number; hp: number;
}
export interface BulletSnapshot {
  id: number; owner: number; x: number; y: number; vx: number; vy: number; ttl: number;
}
export type PickupType = "shield" | "rapid";
export interface PickupSnapshot { id: number; x: number; y: number; type: PickupType; ttl: number; }
export interface Snapshot {
  tick: number;
  players: PlayerSnapshot[];
  asteroids: AsteroidSnapshot[];
  bullets: BulletSnapshot[];
  pickups: PickupSnapshot[];
}
const PICKUP_TYPES: Record<PickupType, number> = { shield: 1, rapid: 2 };
const PICKUP_NAMES: Record<number, PickupType> = { 1: "shield", 2: "rapid" };

function viewOf(data: ArrayBuffer | ArrayBufferView): DataView {
  if (data instanceof ArrayBuffer) return new DataView(data);
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}
function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
function assertFinite(values: readonly number[], label: string): void {
  if (values.some(value => !Number.isFinite(value))) throw new Error(`Invalid ${label} numeric value`);
}

export function encodeInput(input: InputFrame): ArrayBuffer {
  if (!Number.isInteger(input.seq) || input.seq < 0 || !Number.isInteger(input.tick) || input.tick < 0) {
    throw new Error("Invalid input sequence or tick");
  }
  const buffer = new ArrayBuffer(INPUT_BYTES), view = new DataView(buffer);
  view.setUint8(0, MESSAGE_INPUT); view.setUint8(1, PROTOCOL_VERSION);
  view.setUint32(2, input.seq >>> 0, true); view.setUint32(6, input.tick >>> 0, true);
  view.setInt8(10, clampInt(input.turn, -1, 1));
  view.setUint8(11, input.thrust ? 1 : 0); view.setUint8(12, input.fire ? 1 : 0);
  return buffer;
}
export function decodeInput(data: ArrayBuffer | ArrayBufferView): InputFrame {
  const view = viewOf(data);
  if (view.byteLength !== INPUT_BYTES || view.getUint8(0) !== MESSAGE_INPUT || view.getUint8(1) !== PROTOCOL_VERSION) {
    throw new Error("Invalid binary input frame");
  }
  const turn = view.getInt8(10), thrust = view.getUint8(11), fire = view.getUint8(12);
  if (turn < -1 || turn > 1 || thrust > 1 || fire > 1) throw new Error("Invalid input controls");
  return { seq: view.getUint32(2, true), tick: view.getUint32(6, true), turn: turn as -1 | 0 | 1, thrust: thrust === 1, fire: fire === 1 };
}
export function encodeSnapshot(snapshot: Snapshot): ArrayBuffer {
  const { players = [], asteroids = [], bullets = [], pickups = [] } = snapshot;
  if ([players, asteroids, bullets, pickups].some(list => list.length > 255)) throw new Error("Snapshot entity limit exceeded");
  for (const p of players) assertFinite([p.x,p.y,p.vx,p.vy,p.angle], "player");
  for (const a of asteroids) assertFinite([a.x,a.y,a.vx,a.vy,a.radius,a.angle], "asteroid");
  for (const b of bullets) assertFinite([b.x,b.y,b.vx,b.vy,b.ttl], "bullet");
  for (const item of pickups) assertFinite([item.x,item.y,item.ttl], "pickup");
  const buffer = new ArrayBuffer(HEADER + players.length*PLAYER + asteroids.length*ASTEROID + bullets.length*BULLET + pickups.length*PICKUP);
  const view = new DataView(buffer);
  view.setUint8(0, MESSAGE_SNAPSHOT); view.setUint8(1, PROTOCOL_VERSION); view.setUint32(2, snapshot.tick >>> 0, true);
  view.setUint8(6, players.length); view.setUint8(7, asteroids.length); view.setUint8(8, bullets.length); view.setUint8(9, pickups.length);
  let offset = HEADER;
  for (const player of players) {
    view.setUint16(offset, player.slot, true); offset += 2;
    view.setUint32(offset, player.lastProcessedSeq >>> 0, true); offset += 4;
    for (const value of [player.x,player.y,player.vx,player.vy]) { view.setFloat32(offset,value,true); offset += 4; }
    view.setInt16(offset,clampInt(Math.round(player.angle*1000),-32768,32767),true); offset += 2;
    view.setUint8(offset,clampInt(player.hp,0,255)); offset += 1;
    view.setUint8(offset,player.alive ? 1 : 0); offset += 1;
    view.setUint32(offset,Math.max(0,player.score)>>>0,true); offset += 4;
  }
  for (const asteroid of asteroids) {
    view.setUint16(offset,asteroid.id,true); offset += 2;
    for (const value of [asteroid.x,asteroid.y,asteroid.vx,asteroid.vy,asteroid.radius]) { view.setFloat32(offset,value,true); offset += 4; }
    view.setInt16(offset,clampInt(Math.round(asteroid.angle*1000),-32768,32767),true); offset += 2;
    view.setUint8(offset,clampInt(asteroid.hp,0,255)); offset += 1;
  }
  for (const bullet of bullets) {
    view.setUint32(offset,bullet.id>>>0,true); offset += 4;
    view.setUint16(offset,bullet.owner,true); offset += 2;
    for (const value of [bullet.x,bullet.y,bullet.vx,bullet.vy,bullet.ttl]) { view.setFloat32(offset,value,true); offset += 4; }
  }
  for (const item of pickups) {
    view.setUint16(offset,item.id,true); offset += 2;
    view.setFloat32(offset,item.x,true); offset += 4;
    view.setFloat32(offset,item.y,true); offset += 4;
    view.setUint8(offset,PICKUP_TYPES[item.type]); offset += 1;
    view.setFloat32(offset,item.ttl,true); offset += 4;
  }
  return buffer;
}
export function decodeSnapshot(data: ArrayBuffer | ArrayBufferView): Snapshot {
  const view = viewOf(data);
  if (view.byteLength < HEADER || view.getUint8(0) !== MESSAGE_SNAPSHOT || view.getUint8(1) !== PROTOCOL_VERSION) {
    throw new Error("Invalid binary snapshot frame");
  }
  const playerCount=view.getUint8(6), asteroidCount=view.getUint8(7), bulletCount=view.getUint8(8), pickupCount=view.getUint8(9);
  const expectedLength=HEADER+playerCount*PLAYER+asteroidCount*ASTEROID+bulletCount*BULLET+pickupCount*PICKUP;
  if (view.byteLength !== expectedLength) throw new Error("Invalid snapshot length");
  const snapshot: Snapshot = { tick:view.getUint32(2,true), players:[], asteroids:[], bullets:[], pickups:[] };
  let offset=HEADER;
  for(let index=0;index<playerCount;index++){
    const slot=view.getUint16(offset,true);offset+=2;
    const lastProcessedSeq=view.getUint32(offset,true);offset+=4;
    const x=view.getFloat32(offset,true);offset+=4;
    const y=view.getFloat32(offset,true);offset+=4;
    const vx=view.getFloat32(offset,true);offset+=4;
    const vy=view.getFloat32(offset,true);offset+=4;
    const angle=view.getInt16(offset,true)/1000;offset+=2;
    const hp=view.getUint8(offset);offset+=1;
    const alive=view.getUint8(offset)===1;offset+=1;
    const score=view.getUint32(offset,true);offset+=4;
    snapshot.players.push({slot,lastProcessedSeq,x,y,vx,vy,angle,hp,alive,score});
  }
  for(let index=0;index<asteroidCount;index++){
    const id=view.getUint16(offset,true);offset+=2;
    const x=view.getFloat32(offset,true);offset+=4;
    const y=view.getFloat32(offset,true);offset+=4;
    const vx=view.getFloat32(offset,true);offset+=4;
    const vy=view.getFloat32(offset,true);offset+=4;
    const radius=view.getFloat32(offset,true);offset+=4;
    const angle=view.getInt16(offset,true)/1000;offset+=2;
    const hp=view.getUint8(offset);offset+=1;
    snapshot.asteroids.push({id,x,y,vx,vy,radius,angle,hp});
  }
  for(let index=0;index<bulletCount;index++){
    const id=view.getUint32(offset,true);offset+=4;
    const owner=view.getUint16(offset,true);offset+=2;
    const x=view.getFloat32(offset,true);offset+=4;
    const y=view.getFloat32(offset,true);offset+=4;
    const vx=view.getFloat32(offset,true);offset+=4;
    const vy=view.getFloat32(offset,true);offset+=4;
    const ttl=view.getFloat32(offset,true);offset+=4;
    snapshot.bullets.push({id,owner,x,y,vx,vy,ttl});
  }
  for(let index=0;index<pickupCount;index++){
    const id=view.getUint16(offset,true);offset+=2;
    const x=view.getFloat32(offset,true);offset+=4;
    const y=view.getFloat32(offset,true);offset+=4;
    const type=PICKUP_NAMES[view.getUint8(offset)];offset+=1;
    const ttl=view.getFloat32(offset,true);offset+=4;
    if (!type) throw new Error("Invalid pickup type");
    snapshot.pickups.push({id,x,y,type,ttl});
  }
  return snapshot;
}
