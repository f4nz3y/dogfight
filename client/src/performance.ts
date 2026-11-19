/** Fixed-capacity frame timings, no per-frame allocations. */
export class FrameMetrics {
 private values = new Float32Array(1800);
 private index = 0;
 private count = 0;
 add(ms: number): void {this.values[this.index]=ms;this.index=(this.index+1)%this.values.length;this.count=Math.min(this.count+1,this.values.length);}
 summary(): {p50:number;p95:number;p99:number;samples:number} {
  const sorted=Array.from(this.values.subarray(0,this.count)).sort((a,b)=>a-b);
  const at=(q:number)=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(q*(sorted.length-1)))]:0;
  return {p50:at(.5) ?? 0,p95:at(.95) ?? 0,p99:at(.99) ?? 0,samples:sorted.length};
 }
}
export const frameMetrics=new FrameMetrics();
