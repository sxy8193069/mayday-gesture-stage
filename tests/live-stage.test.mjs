import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';

const loadMotion=()=>import('../src/live-stage.mjs');
const close=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
function closeVector(actual,expected,tolerance=1e-6){
  actual.toArray().forEach((value,index)=>close(value,expected.getComponent(index),tolerance));
}
async function createStage(){
  const oldDocument=globalThis.document,oldImage=globalThis.Image;
  const gradient={addColorStop(){}};
  const context=new Proxy({
    createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,
    measureText:text=>({width:String(text).length*20})
  },{get:(target,key)=>key in target?target[key]:()=>{}});
  globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>context})};
  globalThis.Image=class {async decode(){}};
  try{
    const {createModels}=await import('../src/models.mjs');
    return (await createModels({capabilities:{getMaxAnisotropy:()=>1}})).stage.scene;
  }finally{
    if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
    if(oldImage===undefined)delete globalThis.Image;else globalThis.Image=oldImage;
  }
}

test('右手左右移动带动舞台扫灯和蓝色应援光区',async()=>{
 const {prepareStageMotion}=await loadMotion();
 const stage=await createStage(),motion=prepareStageMotion(stage,new THREE.Texture());
 motion.update(3,-1,1,{x:-.7,bodyX:-.7,strength:1});const left=motion.inspect();
 motion.update(3,-1,1,{x:.7,bodyX:.7,strength:1});const right=motion.inspect();
 assert(right.beamX-left.beamX>3,'扫灯应明显跟随右手方向');
 assert(right.handWaveX-left.handWaveX>5,'蓝色应援光区应从左移向右');
 assert(right.handWaveStrength>.8);
 motion.update(3,-1,1,{x:0,strength:0});assert.equal(motion.inspect().handWaveStrength,0);
});

test('动态模块无需 DOM 即可导入，静态合批保留动态子树',async()=>{
  assert.equal(globalThis.document,undefined);
  const {batchKeepingMotion}=await loadMotion();
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial();
  for(let i=0;i<2;i++)root.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
  const arm=new THREE.Group();arm.userData.dynamic=true;root.add(arm);
  const hand=new THREE.Mesh(new THREE.SphereGeometry(),material);arm.add(hand);
  batchKeepingMotion(root);
  assert.equal(arm.parent,root);
  assert.equal(hand.parent,arm);
  assert.equal(root.children.filter(object=>object.isMesh).length,1);
});

test('合批后手臂、麦克风、鼓槌与镲片持续运动且可按时间重放',async()=>{
  const {batchKeepingMotion,prepareStageMotion}=await loadMotion();
  const stage=await createStage(),motion=prepareStageMotion(stage,new THREE.Texture());
  const singer=stage.getObjectByName('ashin'),drummer=stage.getObjectByName('guanyou');
  const vocalArm=singer.userData.arms[1],drumArm=drummer.userData.arms[0];
  const cymbal=stage.getObjectByName('animated-cymbal');
  batchKeepingMotion(stage);
  motion.update(0);const before=motion.inspect(),cymbalBefore=cymbal.rotation.z;
  motion.update(.25);const changed=motion.inspect();
  assert.notEqual(changed.armY,before.armY);
  assert.notEqual(cymbal.rotation.z,cymbalBefore);
  for(const arm of [vocalArm,drumArm]){
    assert.ok(arm.hand.parent);
    arm.lower.updateMatrix();
    closeVector(new THREE.Vector3(0,arm.lowerLength/2,0).applyMatrix4(arm.lower.matrix),arm.hand.position);
  }
  closeVector(vocalArm.mic.position,vocalArm.hand.position.clone().sub(new THREE.Vector3(...vocalArm.end)));
  drumArm.stick.updateMatrix();
  closeVector(new THREE.Vector3(0,-drumArm.stickLength/2,0).applyMatrix4(drumArm.stick.matrix),drumArm.hand.position);
  motion.update(0);
  assert.deepEqual(motion.inspect(),before);
});

test('观众所有身体组件和光晕共用人物变换，接触阴影保持落地',async()=>{
  const {batchKeepingMotion,prepareStageMotion}=await loadMotion();
  const stage=await createStage(),crowd=stage.getObjectByName('audience-blocks');
  const batches=[];
  crowd.traverse(object=>{if(object.isInstancedMesh)batches.push({object,base:new Float32Array(object.instanceMatrix.array)});});
  const motion=prepareStageMotion(stage,new THREE.Texture());batchKeepingMotion(stage);
  const heads=crowd.getObjectByName('crowd-head'),headBase=new Float32Array(heads.instanceMatrix.array);
  const contact=crowd.getObjectByName('crowd-contact'),contactBase=new Float32Array(contact.instanceMatrix.array);
  motion.update(.7);
  const deltas=Array.from({length:heads.count},(_,index)=>{
    const current=new THREE.Matrix4();heads.getMatrixAt(index,current);
    return current.multiply(new THREE.Matrix4().fromArray(headBase,index*16).invert());
  });
  const expected=new THREE.Matrix4(),actual=new THREE.Matrix4();
  for(const {object,base}of batches){
    if(object===contact)continue;
    for(let i=0;i<object.count;i++){
      expected.fromArray(base,i*16).premultiply(deltas[object.userData.personIds[i]]);
      object.getMatrixAt(i,actual);
      actual.elements.forEach((value,j)=>close(value,expected.elements[j],3e-6));
    }
  }
  assert.deepEqual(contact.instanceMatrix.array,contactBase);
  const attrs=crowd.getObjectByName('crowd-blue-light-halos').geometry.attributes;
  for(const [i,segment]of crowd.userData.lightSegments.entries()){
    for(const [attribute,endpoint]of [['stickStart','start'],['stickEnd','end']]){
      const expectedPoint=new THREE.Vector3(...segment[endpoint]).applyMatrix4(deltas[segment.personId]);
      closeVector(new THREE.Vector3().fromBufferAttribute(attrs[attribute],i),expectedPoint,3e-6);
    }
  }
});

test('扫灯与地光合批后仍更新，不改摄像机、背景或舞台根变换',async()=>{
  const {batchKeepingMotion,prepareStageMotion}=await loadMotion();
  const stage=await createStage(),background=stage.background,stagePosition=stage.position.clone();
  const camera=new THREE.PerspectiveCamera();camera.position.set(1,2,3);stage.add(camera);
  const motion=prepareStageMotion(stage,new THREE.Texture());
  const structure=stage.getObjectByName('stage-structure');
  const cones=structure.children.filter(object=>object.isMesh&&object.geometry.type==='ConeGeometry'&&object.userData.dynamic);
  const pools=structure.children.filter(object=>object.isMesh&&object.geometry.type==='PlaneGeometry'&&object.userData.dynamic);
  assert.equal(cones.length,6);assert.equal(pools.length,6);
  batchKeepingMotion(stage);motion.update(0);const before=motion.inspect();motion.update(2);
  assert.notEqual(motion.inspect().beamX,before.beamX);
  assert.notEqual(motion.inspect().crowdX,before.crowdX);
  for(let i=0;i<cones.length;i++){
    assert.equal(cones[i].parent,structure);assert.equal(pools[i].parent,structure);
    cones[i].updateMatrix();
    const end=new THREE.Vector3(0,-1,0).applyMatrix4(cones[i].matrix);
    close(end.x,pools[i].position.x);close(end.z,pools[i].position.z);close(end.y,.31);
  }
  assert.equal(stage.background,background);closeVector(stage.position,stagePosition);closeVector(camera.position,new THREE.Vector3(1,2,3));
});

test('庆祝展开扫灯并带起光浪，结束恢复，重复触发可重放',async()=>{
 const {prepareStageMotion}=await loadMotion(),stage=await createStage();
 const motion=prepareStageMotion(stage,new THREE.Texture());motion.update(2,-1);
 const normal=motion.inspect();motion.update(2,1.2);const peak=motion.inspect();
 assert(peak.beamStrength>normal.beamStrength+.05,'庆祝应增强扫灯');
 assert(peak.crowdGlow>normal.crowdGlow+.1,'庆祝应增强观众蓝色光浪');
 motion.update(2,7);assert.deepEqual(motion.inspect(),normal);
 motion.update(2,1.2);assert.deepEqual(motion.inspect(),peak);
});
