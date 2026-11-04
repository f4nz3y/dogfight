// Binary protocol v4, all multibyte fields little-endian.
// INPUT: 13 bytes.
// SNAPSHOT header: type u8, version u8, tick u32, playerCount u8, asteroidCount u8, bulletCount u8, pickupCount u8.
// Player: slot u16, lastSeq u32, x/y/vx/vy f32, angle i16, hp u8, alive u8, score u32 (30 bytes).
// Asteroid: id u16, x/y/vx/vy/radius f32, angle i16, hp u8 (25 bytes).
// Bullet: id u32, owner u16, x/y/vx/vy/ttl f32 (26 bytes).
// Pickup: id u16, x/y f32, type u8, ttl f32 (15 bytes).
export const PROTOCOL_VERSION = 4;
export const MESSAGE_INPUT = 1;
export const MESSAGE_SNAPSHOT = 2;
export const INPUT_BYTES = 13;
const HEADER = 10, PLAYER = 30, ASTEROID = 25, BULLET = 26, PICKUP = 15;
const PICKUP_TYPES = { shield: 1, rapid: 2 };
const PICKUP_NAMES = { 1: "shield", 2: "rapid" };

export function encodeInput(input) {
  const buffer = new ArrayBuffer(INPUT_BYTES), v = new DataView(buffer);
  v.setUint8(0, MESSAGE_INPUT); v.setUint8(1, PROTOCOL_VERSION);
  v.setUint32(2, input.seq >>> 0, true); v.setUint32(6, input.tick >>> 0, true);
  v.setInt8(10, Math.max(-1, Math.min(1, input.turn | 0)));
  v.setUint8(11, input.thrust ? 1 : 0); v.setUint8(12, input.fire ? 1 : 0);
  return buffer;
}
export function decodeInput(data) {
  const v = new DataView(data.buffer || data, data.byteOffset || 0, data.byteLength);
  if (v.byteLength !== INPUT_BYTES || v.getUint8(0) !== MESSAGE_INPUT || v.getUint8(1) !== PROTOCOL_VERSION) throw new Error("Invalid binary input frame");
  const turn = v.getInt8(10), thrust = v.getUint8(11), fire = v.getUint8(12);
  if (turn < -1 || turn > 1 || thrust > 1 || fire > 1) throw new Error("Invalid input controls");
  return { seq: v.getUint32(2, true), tick: v.getUint32(6, true), turn, thrust: !!thrust, fire: !!fire };
}
export function encodeSnapshot(s) {
  const players=s.players||[], asteroids=s.asteroids||[], bullets=s.bullets||[], pickups=s.pickups||[];
  if ([players,asteroids,bullets,pickups].some(list => list.length>255)) throw new Error("Snapshot entity limit exceeded");
  const buffer=new ArrayBuffer(HEADER+players.length*PLAYER+asteroids.length*ASTEROID+bullets.length*BULLET+pickups.length*PICKUP), v=new DataView(buffer);
  v.setUint8(0,MESSAGE_SNAPSHOT); v.setUint8(1,PROTOCOL_VERSION); v.setUint32(2,s.tick>>>0,true);
  v.setUint8(6,players.length); v.setUint8(7,asteroids.length); v.setUint8(8,bullets.length); v.setUint8(9,pickups.length);
  let o=HEADER;
  for(const p of players){
    v.setUint16(o,p.slot,true);o+=2;v.setUint32(o,p.lastProcessedSeq>>>0,true);o+=4;
    for(const k of ["x","y","vx","vy"]){v.setFloat32(o,p[k],true);o+=4;}
    v.setInt16(o,Math.max(-32768,Math.min(32767,Math.round(p.angle*1000))),true);o+=2;
    v.setUint8(o,Math.max(0,Math.min(255,p.hp ?? 3)));o+=1;v.setUint8(o,p.alive===false?0:1);o+=1;
    v.setUint32(o,Math.max(0,p.score||0)>>>0,true);o+=4;
  }
  for(const a of asteroids){
    v.setUint16(o,a.id,true);o+=2;
    for(const k of ["x","y","vx","vy","radius"]){v.setFloat32(o,a[k],true);o+=4;}
    v.setInt16(o,Math.max(-32768,Math.min(32767,Math.round(a.angle*1000))),true);o+=2;
    v.setUint8(o,a.hp);o+=1;
  }
  for(const b of bullets){
    v.setUint32(o,b.id>>>0,true);o+=4;v.setUint16(o,b.owner,true);o+=2;
    for(const k of ["x","y","vx","vy","ttl"]){v.setFloat32(o,b[k],true);o+=4;}
  }
  for(const item of pickups){
    v.setUint16(o,item.id,true);o+=2;
    v.setFloat32(o,item.x,true);o+=4;v.setFloat32(o,item.y,true);o+=4;
    v.setUint8(o,PICKUP_TYPES[item.type] || 1);o+=1;
    v.setFloat32(o,item.ttl,true);o+=4;
  }
  return buffer;
}
export function decodeSnapshot(data) {
  const v=new DataView(data.buffer||data,data.byteOffset||0,data.byteLength);
  if(v.byteLength<HEADER||v.getUint8(0)!==MESSAGE_SNAPSHOT||v.getUint8(1)!==PROTOCOL_VERSION) throw new Error("Invalid binary snapshot frame");
  const pc=v.getUint8(6),ac=v.getUint8(7),bc=v.getUint8(8),kc=v.getUint8(9);
  if(v.byteLength!==HEADER+pc*PLAYER+ac*ASTEROID+bc*BULLET+kc*PICKUP) throw new Error("Invalid snapshot length");
  const s={tick:v.getUint32(2,true),players:[],asteroids:[],bullets:[],pickups:[]};let o=HEADER;
  for(let i=0;i<pc;i++){
    const p={slot:v.getUint16(o,true)};o+=2;p.lastProcessedSeq=v.getUint32(o,true);o+=4;
    for(const k of ["x","y","vx","vy"]){p[k]=v.getFloat32(o,true);o+=4;}
    p.angle=v.getInt16(o,true)/1000;o+=2;p.hp=v.getUint8(o);o+=1;p.alive=!!v.getUint8(o);o+=1;
    p.score=v.getUint32(o,true);o+=4;s.players.push(p);
  }
  for(let i=0;i<ac;i++){
    const a={id:v.getUint16(o,true)};o+=2;
    for(const k of ["x","y","vx","vy","radius"]){a[k]=v.getFloat32(o,true);o+=4;}
    a.angle=v.getInt16(o,true)/1000;o+=2;a.hp=v.getUint8(o);o+=1;s.asteroids.push(a);
  }
  for(let i=0;i<bc;i++){
    const b={id:v.getUint32(o,true)};o+=4;b.owner=v.getUint16(o,true);o+=2;
    for(const k of ["x","y","vx","vy","ttl"]){b[k]=v.getFloat32(o,true);o+=4;}
    s.bullets.push(b);
  }
  for(let i=0;i<kc;i++){
    const item={id:v.getUint16(o,true)};o+=2;
    item.x=v.getFloat32(o,true);o+=4;item.y=v.getFloat32(o,true);o+=4;
    item.type=PICKUP_NAMES[v.getUint8(o)]||"shield";o+=1;
    item.ttl=v.getFloat32(o,true);o+=4;s.pickups.push(item);
  }
  return s;
}
