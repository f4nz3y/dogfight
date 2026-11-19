import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createShipState, integrate, hashState, mulberry32, createAsteroids, stepAsteroids } from "../src/sim.ts";
import { encodeInput, decodeInput, encodeSnapshot, decodeSnapshot, INPUT_BYTES } from "../src/codec.ts";
import { validateMessage } from "../src/protocol.ts";
const valid = fc.record({ seq:fc.integer({min:0,max:100000}), tick:fc.integer({min:0,max:100000}), turn:fc.constantFrom(-1,0,1), thrust:fc.boolean(), fire:fc.boolean() });
const sample = {tick:2,players:[],asteroids:[],bullets:[],pickups:[]};
describe("lab 07 properties",()=>{
 it("input round trip",()=>fc.assert(fc.property(valid, x=>{expect(decodeInput(encodeInput(x))).toEqual(x);}),{numRuns:300}));
 it("input encoded length",()=>fc.assert(fc.property(valid,x=>{expect(encodeInput(x).byteLength).toBe(INPUT_BYTES);}),{numRuns:300}));
 it("garbage never yields an unexpected exception",()=>fc.assert(fc.property(fc.uint8Array({maxLength:100}),x=>{try{decodeInput(x); }catch(e){expect(e).toBeInstanceOf(Error);}}),{numRuns:300}));
 it("ship remains in arena for random inputs",()=>fc.assert(fc.property(fc.array(fc.record({turn:fc.constantFrom(-1,0,1),thrust:fc.boolean()}),{minLength:1000,maxLength:1000}),commands=>{let ship=createShipState(0);for(const cmd of commands){ship=integrate(ship,cmd);if(ship.x<16||ship.x>884||ship.y<16||ship.y>584)return false;}return true;}),{numRuns:12}));
 it("valid join messages are accepted",()=>fc.assert(fc.property(fc.stringMatching(/^[a-zA-Z]{1,12}$/),name=>{expect(validateMessage({v:1,type:"join",room:"test",name}).valid).toBe(true);}),{numRuns:100}));
 it("mutated messages are rejected",()=>fc.assert(fc.property(fc.stringMatching(/^[a-zA-Z]{1,12}$/),name=>{expect(validateMessage({v:1,type:"join",room:"test",name,unknown:1}).valid).toBe(false);}),{numRuns:100}));
});
describe("simulation regression matrix",()=>{
 for(let seed=1;seed<=65;seed++){
  it(`deterministic seed ${seed}`,()=>{let a=createShipState(seed,seed),b=createShipState(seed,seed);const rand=mulberry32(seed);for(let i=0;i<80;i++){const input={turn:(Math.floor(rand()*3)-1) as -1|0|1,thrust:i%2===0};a=integrate(a,input);b=integrate(b,input);}expect(hashState(a)).toBe(hashState(b));expect(a).toEqual(b);});
 }
 it("snapshot empty round trip",()=>expect(decodeSnapshot(encodeSnapshot(sample))).toEqual(sample));
 it("asteroids bounce within arena",()=>{const ast=createAsteroids(3);for(let i=0;i<100;i++)stepAsteroids(ast,1/30);for(const a of ast){expect(a.x).toBeGreaterThanOrEqual(a.radius);expect(a.y).toBeGreaterThanOrEqual(a.radius);}});
});
