// Replay JSON decoding off the main thread; the ArrayBuffer is transferred.
self.onmessage=(event:MessageEvent<ArrayBuffer>)=>{
 const bytes=new Uint8Array(event.data);
 const lines=new TextDecoder().decode(bytes).split("\n");
 let valid=0;
 for(const line of lines){if(!line.trim())continue;try{JSON.parse(line);valid++;}catch{}}
 self.postMessage({valid,bytes:bytes.byteLength});
};
