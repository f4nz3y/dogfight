// Node worker transfer/clone microbenchmark (repeat on your own machine).
import { Worker } from "node:worker_threads";
const worker=new Worker(`const {parentPort}=require('node:worker_threads');parentPort.on('message', b=>parentPort.postMessage(b.byteLength));`,{eval:true});
for(const transfer of [false,true]){
 const bytes=new ArrayBuffer(50*1024*1024);
 const started=performance.now();
 const reply=new Promise<number>(resolve=>worker.once('message',resolve));
 if(transfer)worker.postMessage(bytes,[bytes]);else worker.postMessage(bytes);
 await reply;
 console.log(JSON.stringify({mode:transfer?'transfer':'clone',ms:+(performance.now()-started).toFixed(2),senderBytes:bytes.byteLength}));
}
await worker.terminate();
