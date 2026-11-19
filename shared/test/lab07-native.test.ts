import test from "node:test";
import assert from "node:assert/strict";
import {createShipState,integrate,hashState,mulberry32} from "../src/sim.ts";
import {encodeInput,decodeInput,INPUT_BYTES} from "../src/codec.ts";
for(let seed=1;seed<=65;seed++){
 test(`determinism #${seed}`,()=>{
  const a=createShipState(seed,seed),b=createShipState(seed,seed);
  const random=mulberry32(seed);
  for(let i=0;i<100;i++){
   const input={turn:Math.floor(random()*3)-1,thrust:i%2===0};
   Object.assign(a,integrate(a,input));Object.assign(b,integrate(b,input));
   assert.ok(a.x>=16&&a.x<=884&&a.y>=16&&a.y<=584);
  }
  assert.equal(hashState(a),hashState(b));
 });
}
for(let i=0;i<10;i++)test(`codec #${i}`,()=>{
 const input={seq:i,tick:i*5,turn:(i%3-1),thrust:i%2===0,fire:i%2!==0};
 const bytes=encodeInput(input);assert.equal(bytes.byteLength,INPUT_BYTES);
 assert.deepEqual(decodeInput(bytes),input);
});
