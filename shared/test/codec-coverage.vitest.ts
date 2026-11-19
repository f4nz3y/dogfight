import {describe,it,expect} from 'vitest';
import {encodeInput,decodeInput,encodeSnapshot,decodeSnapshot,INPUT_BYTES,PROTOCOL_VERSION,MESSAGE_SNAPSHOT} from '../src/codec.ts';
import {binarySnapshotCodec,jsonCodec} from '../src/codecTypes.ts';
import {asEntityId} from '../src/ids.ts';
import {assertNever} from '../src/model.ts';
import * as publicApi from '../src/index.ts';

const full = {
 tick:123,
 players:[{slot:7,lastProcessedSeq:19,x:10.5,y:20.25,vx:-3.5,vy:0.125,angle:1.25,hp:88,alive:true,score:999},
 {slot:8,lastProcessedSeq:20,x:0,y:1,vx:2,vy:3,angle:-1.25,hp:0,alive:false,score:0}],
 asteroids:[{id:3,x:10,y:20,vx:1,vy:2,radius:14,angle:0.5,hp:3}],
 bullets:[{id:100,owner:7,x:11,y:12,vx:13,vy:14,ttl:1.5}],
 pickups:[{id:9,x:1,y:2,type:'shield' as const,ttl:5},{id:10,x:3,y:4,type:'rapid' as const,ttl:6}]
};
const empty = {tick:0,players:[],asteroids:[],bullets:[],pickups:[]};

describe('binary codec complete entity coverage',()=>{
 it('round trips every entity type and both pickup types',()=>{
  const bytes=encodeSnapshot(full);
  const decoded=decodeSnapshot(bytes);
  expect(decoded).toEqual(full);
  expect(decodeSnapshot(new Uint8Array(bytes))).toEqual(full);
  expect(decodeSnapshot(new DataView(bytes))).toEqual(full);
  expect(bytes.byteLength).toBe(10+2*30+25+26+2*15);
 });
 it('clamps angle, hp and score to representable ranges',()=>{
  const sample={...full,players:[{...full.players[0],angle:100,hp:999,score:-5},{...full.players[1],angle:-100,hp:-20,score:10}],asteroids:[{...full.asteroids[0],angle:100,hp:500}]};
  const decoded=decodeSnapshot(encodeSnapshot(sample));
  expect(decoded.players[0]).toMatchObject({angle:32.767,hp:255,score:0});
  expect(decoded.players[1]).toMatchObject({angle:-32.768,hp:0,score:10});
  expect(decoded.asteroids[0]).toMatchObject({angle:32.767,hp:255});
 });
 it('rejects oversized entity arrays',()=>{
  for(const key of ['players','asteroids','bullets','pickups'] as const){
   const entities=Array.from({length:256},()=>full[key][0]);
   expect(()=>encodeSnapshot({...empty,[key]:entities})).toThrow(/limit/);
  }
 });
 it('rejects nonfinite coordinates for each entity class',()=>{
  expect(()=>encodeSnapshot({...full,players:[{...full.players[0],x:NaN}]})).toThrow(/player/);
  expect(()=>encodeSnapshot({...full,asteroids:[{...full.asteroids[0],radius:Infinity}]})).toThrow(/asteroid/);
  expect(()=>encodeSnapshot({...full,bullets:[{...full.bullets[0],ttl:-Infinity}]})).toThrow(/bullet/);
  expect(()=>encodeSnapshot({...full,pickups:[{...full.pickups[0],y:NaN}]})).toThrow(/pickup/);
 });
 it('rejects truncated, wrong type, wrong version and incorrect length snapshots',()=>{
  const bytes=encodeSnapshot(full);
  expect(()=>decodeSnapshot(new Uint8Array(9))).toThrow(/frame/);
  const wrongType=bytes.slice(0);new DataView(wrongType).setUint8(0,1);
  expect(()=>decodeSnapshot(wrongType)).toThrow(/frame/);
  const wrongVersion=bytes.slice(0);new DataView(wrongVersion).setUint8(1,PROTOCOL_VERSION+1);
  expect(()=>decodeSnapshot(wrongVersion)).toThrow(/frame/);
  expect(()=>decodeSnapshot(bytes.slice(0,-1))).toThrow(/length/);
  expect(()=>decodeSnapshot(new Uint8Array(bytes.byteLength+1))).toThrow(/frame|length/);
 });
 it('rejects unknown pickup identifiers',()=>{
  const bytes=encodeSnapshot({...empty,pickups:[full.pickups[0]]});
  new DataView(bytes).setUint8(10+2+4+4,99);
  expect(()=>decodeSnapshot(bytes)).toThrow(/pickup type/);
 });
 it('round trips empty snapshots through public API and wrapper',()=>{
  expect(decodeSnapshot(encodeSnapshot(empty))).toEqual(empty);
  expect(binarySnapshotCodec.decode(binarySnapshotCodec.encode(full))).toEqual(full);
  expect(publicApi.MESSAGE_SNAPSHOT).toBe(MESSAGE_SNAPSHOT);
 });
});

describe('input codec edge and malformed cases',()=>{
 it('supports typed-array slices with nonzero byte offset',()=>{
  const encoded=new Uint8Array(encodeInput({seq:42,tick:12,turn:-1,thrust:true,fire:false}));
  const padded=new Uint8Array(INPUT_BYTES+4);padded.set(encoded,2);
  expect(decodeInput(padded.subarray(2,2+INPUT_BYTES))).toEqual({seq:42,tick:12,turn:-1,thrust:true,fire:false});
 });
 it('rejects invalid input counters',()=>{
  for(const seq of [-1,1.5,NaN]) expect(()=>encodeInput({seq,tick:0,turn:0,thrust:false,fire:false})).toThrow();
  for(const tick of [-1,1.5,Infinity]) expect(()=>encodeInput({seq:0,tick,turn:0,thrust:false,fire:false})).toThrow();
 });
 it('rejects invalid input lengths, types and versions',()=>{
  const good=encodeInput({seq:1,tick:2,turn:0,thrust:false,fire:true});
  expect(()=>decodeInput(new Uint8Array(4))).toThrow();
  for(const [index,value] of [[0,99],[1,99]] as const){const bad=good.slice(0);new DataView(bad).setUint8(index,value);expect(()=>decodeInput(bad)).toThrow();}
 });
 it('rejects invalid turn, thrust and fire bytes',()=>{
  const good=encodeInput({seq:1,tick:2,turn:0,thrust:false,fire:true});
  for(const [index,value] of [[10,5],[11,2],[12,2]] as const){const bad=good.slice(0);new DataView(bad).setUint8(index,value);expect(()=>decodeInput(bad)).toThrow(/controls/);}
 });
 it('clamps invalid turn at encoding boundary',()=>{
  const result=decodeInput(encodeInput({seq:1,tick:1,turn:5 as 1,thrust:true,fire:true}));
  expect(result.turn).toBe(1);
 });
});

describe('additional shared module coverage',()=>{
 it('checks branded identifier validation',()=>{
  expect(asEntityId(0)).toBe(0);
  expect(asEntityId(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  for(const value of [-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1]) expect(()=>asEntityId(value)).toThrow(RangeError);
 });
 it('checks exhaustive discriminant error',()=>{
  expect(()=>assertNever('invalid' as never)).toThrow(/Unhandled entity variant/);
 });
 it('validates JSON codec decoding and rejects invalid payloads',()=>{
  const codec=jsonCodec((value):value is {ok:boolean}=>typeof value==='object'&&value!==null&&'ok' in value&&typeof (value as {ok:unknown}).ok==='boolean');
  expect(codec.decode(codec.encode({ok:true}))).toEqual({ok:true});
  expect(()=>codec.decode('{"ok":123}')).toThrow(/Invalid JSON/);
  expect(()=>codec.decode('{')).toThrow(SyntaxError);
 });
});
