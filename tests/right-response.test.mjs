import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHandMotion} from '../src/hand-motion.mjs';
import {createGlowBall} from '../src/live-balls.mjs';

test('右手以初次入镜位置为中立点，小幅移动及时产生可见响应',()=>{
 const motion=createHandMotion();let p;
 for(let now=0;now<=600;now+=20){
  if(now%100===0)motion.push({left:null,right:{x:.45,y:.15}},now-60);
  p=motion.update(now,.02).right;
 }
 assert(Math.abs(p.x)<.02,'手在画面右侧停住时，球体应看向中立方向');
 for(let now=620;now<=720;now+=20){
  if(now===620||now===720)motion.push({left:null,right:{x:.53,y:.15}},now-60);
  p=motion.update(now,.02).right;
 }
 assert(p.x>.2,'舒适范围的小幅移动应被放大');
 assert(p.x>p.bodyX,'眼神应先于身体跟随');
});

test('短暂漏识别保持右手响应，持续丢手后自然归中',()=>{
 const motion=createHandMotion();let p;
 for(let now=0;now<=1200;now+=20){
  if(now%100===0)motion.push({left:null,right:now>=1000?null:{x:now<400?.4:.5,y:0}},now-60);
  p=motion.update(now,.02).right;
 }
 assert(p.strength>.95,'200毫秒短暂遮挡不应反复归中');
 for(let now=1220;now<=2200;now+=20)p=motion.update(now,.02).right;
 assert(p.strength<.005);assert(Math.abs(p.x)<.005);assert(Math.abs(p.bodyX)<.01);
});

test('主动控制时自动游移让位，球体转向足够明显',()=>{
 const ball=createGlowBall(2,new THREE.Texture());
 ball.update(0,1,{x:.3,y:0,bodyX:.3,bodyY:0,strength:1});
 assert(ball.root.rotation.y>.055,'轻移时转向应能被看见');
 const first=ball.pupils[0].pupil.position.x;
 ball.update(3.5,1,{x:.3,y:0,bodyX:.3,bodyY:0,strength:1});
 assert(Math.abs(ball.pupils[0].pupil.position.x-first)<.008,'自动眼神不能盖过手动控制');
});

test('五球停手回应各不相同，持续停住只回应一次，移动后可再次回应',()=>{
 const poses=[];
 for(let index=0;index<5;index++){
  const ball=createGlowBall(index,new THREE.Texture()),reference=createGlowBall(index,new THREE.Texture());
  const gaze={x:.3,y:.1,bodyX:.3,bodyY:.1,strength:1,tracked:true,vx:0,vy:0,movementId:0};
  for(let frame=0;frame<=180;frame++){
   const time=frame/60;ball.update(time,1,gaze);reference.update(time,1,{...gaze,tracked:false});
   if(frame===69){
    const difference=[ball.root.rotation.x-reference.root.rotation.x,ball.root.rotation.z-reference.root.rotation.z,ball.eyes[0].scale.y-reference.eyes[0].scale.y,ball.eyes[1].scale.y-reference.eyes[1].scale.y];
    assert(Math.max(...difference.map(Math.abs))>.025,`第${index+1}球应有可见回应`);poses.push(difference.map(x=>x.toFixed(3)).join(','));
   }
  }
  assert.equal(ball.inspect().reactionCount,1,'持续停住不能循环播放回应');
  for(let frame=181;frame<=330;frame++)ball.update(frame/60,1,{...gaze,vx:frame<200?.5:0,movementId:1});
  assert.equal(ball.inspect().reactionCount,2);
 }
 assert.equal(new Set(poses).size,5);
});

test('同一颗球短暂丢失跟随后，原地恢复识别不能再次回应',()=>{
 for(let index=0;index<5;index++){
  const ball=createGlowBall(index,new THREE.Texture());
  const gaze={x:.3,y:.1,bodyX:.3,bodyY:.1,strength:1,tracked:true,vx:0,vy:0};
  for(let frame=0;frame<=540;frame++){
   const lost=frame>=180&&frame<192;
   ball.update(frame/60,1,{...gaze,tracked:!lost});
  }
  assert.equal(ball.inspect().reactionCount,1,'恢复识别不能代替移动重新触发回应');
 }
});

test('真实轨迹漏检后恢复产生的归位速度不能重新触发停手回应',()=>{
 for(const duration of [400,500,600,800]){
  const motion=createHandMotion(),ball=createGlowBall(2,new THREE.Texture());
  for(let now=0;now<=10000;now+=20){
   if(now%100===0)motion.push({left:null,right:now>=4000&&now<4000+duration?null:{x:now<400?.4:.5,y:.1}},now);
   ball.update(now/1000,1,motion.update(now,.02).right);
  }
  assert.equal(ball.inspect().reactionCount,1,`原地漏检${duration}毫秒不能视为重新移动`);
  for(let now=10020;now<=14000;now+=20){
   if(now%100===0)motion.push({left:null,right:{x:.56,y:.1}},now);
   ball.update(now/1000,1,motion.update(now,.02).right);
  }
  assert.equal(ball.inspect().reactionCount,2,'新的真实移动后仍应可以再次回应');
 }
});
