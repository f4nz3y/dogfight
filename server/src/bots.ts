// Bot inputs use the same control shape as human players.
type Point = {x:number;y:number};
export function botInput(self: Point & {angle:number}, target: Point, tick:number) {
 const angle = Math.atan2(target.y-self.y,target.x-self.x);
 const delta = Math.atan2(Math.sin(angle-self.angle),Math.cos(angle-self.angle));
 const distance = Math.hypot(target.x-self.x,target.y-self.y);
 return {turn: delta>0.12?1:delta< -0.12?-1:0,thrust:distance>90 || tick%45<12,fire:Math.abs(delta)<0.35};
}
