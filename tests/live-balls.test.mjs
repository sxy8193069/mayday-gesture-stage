import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createGlowBall} from '../src/live-balls.mjs';
import {sampleSurface,installReveal} from '../src/geometry.mjs';

test('五色球完整球面可采样，五官和球壳按同一实体显隐',()=>{
 const texture=new THREE.Texture(),tints=[];
 for(let i=0;i<5;i++){
  const b=createGlowBall(i,texture);b.root.position.set(0,3.3,2.25);
  const surface=sampleSurface(b.root,300,5525);assert.equal(surface.positions.length,900);
  const positions=Array.from({length:300},(_,n)=>Math.hypot(surface.positions[n*3],surface.positions[n*3+1]-3.3,surface.positions[n*3+2]-2.25));
  assert(positions.every(r=>r>1.5&&r<1.75),'采样应覆盖整个球壳，不能只剩五官');
  const reveal={value:.3};installReveal(b.root,reveal);assert.equal(b.shell.uniforms.uEntityReveal,reveal);tints.push(b.shell.uniforms.base.value.getHex());
  b.update(1,.3);const eye=b.eyes[0].scale.y;b.update(2.15-i*.73,.3);assert(b.eyes[0].scale.y<eye);
 }
 assert.equal(new Set(tints).size,5);
});

test('右手位置改变球体眼神与姿态，释放后回到原有动作',()=>{
 const b=createGlowBall(2,new THREE.Texture());b.update(1,1,{x:0,y:0,strength:0});
 const neutral={p:b.pupils[0].pupil.position.clone(),r:b.root.rotation.clone()};
 b.update(1,1,{x:1,y:.8,strength:1});
 assert(b.pupils[0].pupil.position.x>neutral.p.x+.05,'眼神应随右手向右移动');
 assert(b.root.rotation.y>neutral.r.y+.05,'球体应有轻微转身');
 b.update(1,1,{x:0,y:0,strength:0});assert.deepEqual(b.pupils[0].pupil.position,neutral.p);
});
