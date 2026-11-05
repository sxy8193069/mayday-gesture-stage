const test=require('node:test');
const assert=require('node:assert/strict');
const {sample}=require('../src/motion.js');
const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-8,`${i}: ${v} != ${b[i]}`));
test('曲线从当前位置和速度开始，抵达目标后停止',()=>{
  const from=[-3,2,5],velocity=[.7,-.4,.2],target=[4,-1,0],arc=[.2,.5,-.3];
  near(sample(from,velocity,target,arc,0,1.8),[...from,...velocity]);
  near(sample(from,velocity,target,arc,1,1.8),[...target,0,0,0]);
});
test('中途反向时保持位置及一阶速度连续',()=>{
  for(const t of [.05,.25,.55,.9]){
    const frame=sample([-3,2,5],[0,0,0],[4,-1,0],[.2,.5,-.3],t,2.8);
    const reverse=sample(frame.slice(0,3),frame.slice(3),[-3,2,5],[-.3,.2,.4],0,1.4);
    near(frame,reverse);
  }
});
test('曲线速度与位置的数值导数一致',()=>{
  for(const t of [.1,.3,.6,.85]){
    const args=[[-2,1,3],[.8,.1,-.5],[4,2,-1],[.2,.3,.6]],seconds=1.8,epsilon=1e-5;
    const a=sample(...args,t-epsilon,seconds),b=sample(...args,t+epsilon,seconds),v=sample(...args,t,seconds);
    for(let i=0;i<3;i++)assert.ok(Math.abs((b[i]-a[i])/(2*epsilon*seconds)-v[i+3])<1e-6);
  }
});
