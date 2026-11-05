import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('../src/star-flow.mjs').catch(()=>null);
test('流场在星空稳定后持续移动，速度与位移导数一致',()=>{
 assert.equal(typeof module?.sampleFlow,'function','应提供连续星光流场');
 const base=[1,3,2],palm={x:0,y:3,strength:.8,vx:.2,vy:-.1,vs:.05},h=.01;
 const at=t=>module.sampleFlow(base,.37,2+t,{...palm,x:palm.x+palm.vx*t,y:palm.y+palm.vy*t,strength:palm.strength+palm.vs*t});
 const a=at(-h),b=at(0),c=at(h);
 assert(Math.hypot(...b.slice(3))>.025);
 for(let i=0;i<3;i++)assert(Math.abs((c[i]-a[i])/(2*h)-b[i+3])<.0002,'速度应包含掌心移动引起的变化');
});
test('掌心只扰动邻近星光，输入释放后保持环境漂移',()=>{
 assert.equal(typeof module?.sampleFlow,'function');
 const near=[1,3,2],far=[24,20,-15],off={x:0,y:3,strength:0},on={...off,strength:1};
 const delta=base=>{const a=module.sampleFlow(base,.5,1,off),b=module.sampleFlow(base,.5,1,on);return Math.hypot(...b.slice(0,3).map((n,i)=>n-a[i]));};
 assert(delta(near)>.1);assert(delta(far)<.001);
 const a=module.sampleFlow(near,.5,1,off),b=module.sampleFlow(near,.5,2,off);assert(Math.hypot(...b.slice(0,3).map((n,i)=>n-a[i]))>.025);
});
