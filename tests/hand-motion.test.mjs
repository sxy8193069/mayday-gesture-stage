import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandMotion} from '../src/hand-motion.mjs';

test('低频采样的缓慢移动保持连续，跟随误差有限',()=>{
 const motion=createHandMotion();let lastInput=-1000,previous=0,maxStep=0,maxLag=0;
 for(let now=0;now<=1800;now+=1000/60){
  if(now-lastInput>=120){motion.push({left:{x:now*.0004,y:.1,open:true},right:null},now-65);lastInput=now;}
  const p=motion.update(now,1/60).left;
  maxStep=Math.max(maxStep,Math.abs(p.x-previous));previous=p.x;
  if(now>500)maxLag=Math.max(maxLag,Math.abs(p.x-now*.0004));
 }
 assert(maxStep<.018,`帧间位移过大 ${maxStep}`);assert(maxLag<.065,`跟随拖延过大 ${maxLag}`);
});

test('短暂手型波动和单次丢手不反复关闭涟漪',()=>{
 const motion=createHandMotion();let minimum=1;
 for(let now=0;now<=2200;now+=20){
  if(now%100===0)motion.push({left:now===1200?null:{x:.2,y:.1,open:now!==1700},right:null},now-60);
  const p=motion.update(now,.02).left;if(now>800)minimum=Math.min(minimum,p.strength);
 }
 assert(minimum>.95,`短暂波动造成强度骤降 ${minimum}`);
});

test('持续收手后涟漪衰减，握拳不会被长期保持为张手',()=>{
 const motion=createHandMotion();let p;
 for(let now=0;now<=1700;now+=20){
  if(now%100===0)motion.push({left:{x:.2,y:.1,open:now<1000},right:null},now);
  p=motion.update(now,.02).left;
 }
 assert(p.strength<.005);
});

test('识别停止后效果自动淡出，右手眼神归中',()=>{
 const motion=createHandMotion();let p;
 for(let now=0;now<=1800;now+=20){
  if(now<=800&&now%100===0)motion.push({left:{x:.4,y:.2,open:true},right:{x:.5,y:-.1}},now);
  p=motion.update(now,.02);
 }
 assert(p.left.strength<.005);assert(p.right.strength<.005);assert(Math.abs(p.right.x)<.005);
});

test('坐标突变不跳帧，停住后不持续漂移',()=>{
 const motion=createHandMotion();let previous=0,maxStep=0,p;
 for(let now=0;now<=2400;now+=20){
  if(now%100===0)motion.push({left:{x:now<1000?.7:-.6,y:0,open:true},right:null},now);
  p=motion.update(now,.02).left;maxStep=Math.max(maxStep,Math.abs(p.x-previous));previous=p.x;
 }
 assert(maxStep<.23);assert(Math.abs(p.x+.6)<.005);assert(Math.abs(p.vx)<.01);
});

test('旧识别帧不得覆盖新坐标，清除输入后平滑归位',()=>{
 const motion=createHandMotion();let p;
 for(let now=0;now<=700;now+=20){
  if(now%100===0)motion.push({left:{x:.2,y:0,open:true},right:{x:now<300?.5:.65,y:0}},now);
  p=motion.update(now,.02);
 }
 motion.push({left:{x:-1,y:0,open:true},right:{x:-1,y:0}},400);
 assert(motion.update(720,.02).right.x>.4);
 motion.push(null,740);
 for(let now=740;now<=1400;now+=20)p=motion.update(now,.02);
 assert(p.left.strength<.005);assert(p.right.strength<.005);assert(Math.abs(p.right.x)<.005);
});
