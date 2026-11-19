// Run with server already running: npm run load
import WebSocket from "ws";
const base=process.env.BASE_URL||"http://127.0.0.1:3001";
const room=await fetch(`${base}/api/rooms`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:`Load ${Date.now()}`})}).then(r=>r.json());
if(!room.room?.id)throw new Error(JSON.stringify(room));
const id=room.room.id;
const counts=[8,32,64,128];
for(const n of counts){
 const clients:WebSocket[]=[];
 let bytes=0;
 const start=performance.now();
 for(let i=0;i<n;i++){
  const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws');clients.push(ws);
  ws.on('open',()=>ws.send(JSON.stringify({v:1,type:'join',room:id,name:`Load${i}`})));
  ws.on('message',data=>{bytes+=data.length;});
 }
 await new Promise(resolve=>setTimeout(resolve,5000));
 const stats=await fetch(`${base}/api/stats`).then(r=>r.json());
 const elapsed=(performance.now()-start)/1000;
 console.log(JSON.stringify({clients:n,seconds:+elapsed.toFixed(2),bytesPerSecond:Math.round(bytes/elapsed),rss:stats.memory?.rss,utilization:stats.eventLoopUtilization?.utilization,matches:stats.matches}));
 for(const ws of clients)ws.close();
 await new Promise(resolve=>setTimeout(resolve,300));
}
