import {test,expect} from "@playwright/test";
test("two independent browsers join, exchange roster and chat",async({browser,request})=>{
 const created=await request.post('/api/rooms',{data:{name:'E2E room'}});
 expect(created.ok()).toBeTruthy();const {room}=await created.json();
 const a=await browser.newContext(),b=await browser.newContext();
 try{
  const pa=await a.newPage(),pb=await b.newPage();
  await pa.goto('/');await pb.goto('/');
  const join=async(page,name)=>page.evaluate(({id,name})=>new Promise((resolve,reject)=>{
   const ws=new WebSocket(`ws://${location.host}/ws`);
   ws.onopen=()=>ws.send(JSON.stringify({v:1,type:'join',room:id,name}));
   ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='joined'){(window as any).__labSocket=ws;resolve(m);}};
   ws.onerror=()=>reject(new Error('WebSocket failed'));
  }),{id:room.id,name});
  await join(pa,'Alpha');await join(pb,'Beta');
  await expect.poll(async()=>{const r=await request.get('/api/rooms');const data=await r.json();return data.rooms.find((x:{id:string})=>x.id===room.id)?.players;}).toBe(2);
  const received=pb.evaluate(()=>new Promise(resolve=>{const ws=(window as any).__labSocket;ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='chat')resolve(m.message.text);};}));
  await pa.evaluate(()=>(window as any).__labSocket.send(JSON.stringify({v:1,type:'chat',text:'Hello from Alpha'})));
  expect(await received).toBe('Hello from Alpha');
 }finally{await a.close();await b.close();}
});
