import * as THREE from '../vendor/three.module.js';
import {createModels} from './models.mjs';
import {sampleSurface,installReveal} from './geometry.mjs';
import {createGlowBall,lightTexture} from './live-balls.mjs';
import {prepareStageMotion,batchKeepingMotion} from './live-stage.mjs';
import {createAtmosphere,createConfetti} from './effects.mjs';
import {flowGLSL,sampleFlow} from './star-flow.mjs';
import {createHandMotion} from './hand-motion.mjs';

const COUNT=7200;
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const palette=['#f83f2a','#ffce28','#ed6cac','#13b6e2','#19bc55'].map(c=>new THREE.Color(c));

function particleMaterial(){
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
    uniforms:{uAge:{value:10},uDuration:{value:1},uTime:{value:0},uAlpha:{value:1},uSize:{value:1},uFlow:{value:1},uPalm:{value:new THREE.Vector3(0,3.3,0)}},
    vertexShader:`attribute vec3 aStart;attribute vec3 aVelocity;attribute vec3 aTarget;attribute vec3 aArc;
      attribute vec3 aFromColor;attribute vec3 aToColor;attribute float aDelay;attribute float aSeed;
      uniform float uAge,uDuration,uTime,uAlpha,uSize,uFlow;uniform vec3 uPalm;varying vec3 particleColor;varying float particleAlpha;
      ${flowGLSL}
      void main(){
        float t=clamp((uAge-aDelay)/uDuration,0.0,1.0),t2=t*t,t3=t2*t;
        vec3 p=(2.0*t3-3.0*t2+1.0)*aStart+(t3-2.0*t2+t)*uDuration*aVelocity+(-2.0*t3+3.0*t2)*aTarget;
        p+=16.0*t2*(1.0-t)*(1.0-t)*aArc;
        float flowWeight=t3*(t*(t*6.0-15.0)+10.0);
        p+=starFlow(aTarget,aSeed,uTime,uPalm)*flowWeight*uFlow;
        vec4 viewPosition=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*viewPosition;
        gl_PointSize=clamp(uSize*(1.2+aSeed*1.5)*20.0/max(1.0,-viewPosition.z),1.0,8.0);
        particleColor=mix(aFromColor,aToColor,t*t*(3.0-2.0*t));
        particleAlpha=uAlpha*(0.68+0.32*sin(uTime*.75+aSeed*62.8));
      }`,
    fragmentShader:`varying vec3 particleColor;varying float particleAlpha;
      void main(){float radius=length(gl_PointCoord-.5)*2.0;if(radius>1.0)discard;
        float light=exp(-radius*radius*3.5)*(1.0-smoothstep(.65,1.0,radius));
        gl_FragColor=vec4(particleColor*1.5,light*particleAlpha);
        #include <colorspace_fragment>
      }`
  });
}
function starField(){
  let seed=5525;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  const positions=new Float32Array(COUNT*3),colors=new Float32Array(COUNT*3),delays=new Float32Array(COUNT),seeds=new Float32Array(COUNT);
  for(let i=0;i<COUNT;i++){
    positions.set([(rnd()-.5)*27,(rnd()-.5)*18+4,(rnd()-.5)*21],i*3);
    const color=i%29===0?new THREE.Color('#cedcff'):palette[i%5];color.toArray(colors,i*3);seeds[i]=rnd();delays[i]=rnd()*.12;
  }
  return {positions,colors,delays,seeds};
}

function releaseResources(world,renderer){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  world?.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    object.shadow?.dispose();
    for(const mat of [object.material,object.customDepthMaterial].flat().filter(Boolean)){
      materials.add(mat);for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);
    }
  });
  geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());renderer.dispose();
}

export async function createScene({reduced=false}={}){
  const canvas=document.createElement('canvas');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
  let world;
  try{
  renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
  const models=await createModels(renderer),stageRoot=new THREE.Group(),texture=lightTexture();world=models.stage.scene;stageRoot.name='interactive-stage';
  world.background=new THREE.Color('#050c18');world.fog.color.set('#050c18');
  for(const child of [...world.children])if(child.isPoints){world.remove(child);child.geometry.dispose();child.material.dispose();}
  world.traverse(o=>{if(o.material?.isMeshPhysicalMaterial){o.material.emissive.copy(o.material.color);o.material.emissiveIntensity=.24;}});
  const stageMotion=prepareStageMotion(world,texture);
  let floor;
  for(const child of [...world.children]){
    if(child.isMesh&&child.geometry.parameters?.width===160){child.name='environment-floor';floor=child;child.material.dispose();child.material=new THREE.ShadowMaterial({color:'#030911',opacity:0,depthWrite:false});child.visible=false;continue;}
    if(child.isPoints)continue;
    if(!child.isLight)stageRoot.add(child);
  }
  world.add(stageRoot);batchKeepingMotion(stageRoot);
  const stageSamples=sampleSurface(stageRoot,COUNT),entities=[],balls=[],targets={stars:starField(),stage:stageSamples};
  const addEntity=root=>{
    const entity={root,reveal:{value:0},from:0,to:0};entity.update=installReveal(root,entity.reveal);root.visible=false;entities.push(entity);return entity;
  };
  const stageEntity=addEntity(stageRoot);
  const liveBalls=[];
  for(let i=0;i<5;i++){
    const live=createGlowBall(i,texture),root=live.root;root.position.set(0,3.3,2.25);world.add(root);
    targets['ball-'+i]=sampleSurface(root,COUNT,5525+i);balls.push(addEntity(root));liveBalls.push(live);
  }
  const atmosphere=createAtmosphere(world),confetti=createConfetti(world);
  const stars=targets.stars,attributes={
    aStart:new Float32Array(stars.positions),aVelocity:new Float32Array(COUNT*3),aTarget:new Float32Array(stars.positions),aArc:new Float32Array(COUNT*3),
    aFromColor:new Float32Array(stars.colors),aToColor:new Float32Array(stars.colors),aDelay:new Float32Array(COUNT),aSeed:stars.seeds
  };
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(stars.positions),3));
  for(const [name,array] of Object.entries(attributes))geometry.setAttribute(name,new THREE.BufferAttribute(array,name==='aDelay'||name==='aSeed'?1:3).setUsage(THREE.DynamicDrawUsage));
  const material=particleMaterial(),particles=new THREE.Points(geometry,material);particles.frustumCulled=false;particles.name='transition-stars';world.add(particles);
  const camera=new THREE.PerspectiveCamera(35,4/3,.1,100),lookAt=V(0,3.3,2.25);
  camera.position.set(0,5.5,14.5);camera.lookAt(lookAt);
  let revision=0,mode='stars',index=-1,started=0,duration=1,lastNow=0,elapsedMotion=0,motionPaused=reduced,disposed=false,contextLost=false,lastShadow=-100,fromAlpha=1,toAlpha=1,alpha=1,celebrationAt=null,celebrationStart=null,pauseOffset=0,animationNow=0;
  const handMotion=createHandMotion();
  let explicitPause=false;
  const palm={x:0,y:3.3,strength:0,vx:0,vy:0,vs:0},gaze={x:0,y:0,strength:0};
  const flowBase=new Float64Array(3),flowSample=new Float64Array(6),ray=V(),direction=V();
  const sample=new Float64Array(6),stats={calls:0,triangles:0,transition:1,mode,frameGaps:[],paintTimes:[]};
  function updateEntities(now){
    const t=started?clamp((now-started)/1000/duration):1;
    for(const e of entities){const phase=e.to>e.from?smooth((t-.43)/.57):smooth(t/.72);e.reveal.value=mix(e.from,e.to,phase);e.root.visible=e.reveal.value>.0001;e.update();}
    floor.material.opacity=stageEntity.reveal.value*.18;floor.visible=stageEntity.reveal.value>.001;
  }
  function updateHands(dt,now){
    if(motionPaused||dt<=0)return;
    const {left,right}=handMotion.update(now,dt),oldX=palm.x,oldY=palm.y,oldStrength=palm.strength;
    ray.set(left.x,left.y,.5).unproject(camera);direction.copy(ray).sub(camera.position).normalize();
    const distance=(2.25-camera.position.z)/direction.z;
    ray.copy(camera.position).addScaledVector(direction,distance);
    palm.x=Math.max(-12,Math.min(12,ray.x));palm.y=Math.max(-6,Math.min(12,ray.y));
    palm.strength=left.strength;
    palm.vx=(palm.x-oldX)/dt;palm.vy=(palm.y-oldY)/dt;palm.vs=(palm.strength-oldStrength)/dt;
    Object.assign(gaze,right);
  }
  function sampleParticle(i,now,out){
    const t=started?clamp(((now-started)/1000-attributes.aDelay[i])/duration):1,k=i*3;
    MaydayMotion.sample(attributes.aStart,attributes.aVelocity,attributes.aTarget,attributes.aArc,t,duration,k,out);
    if(mode==='stars'){
      flowBase.set(attributes.aTarget.subarray(k,k+3));sampleFlow(flowBase,attributes.aSeed[i],elapsedMotion+(!motionPaused?(now-animationNow)/1000:0),palm,flowSample);
      const weight=t*t*t*(t*(t*6-15)+10),derivative=30*t*t*(t-1)*(t-1)/duration;
      for(let axis=0;axis<3;axis++){out[axis]+=flowSample[axis]*weight;out[axis+3]+=(motionPaused?0:flowSample[axis+3])*weight+flowSample[axis]*derivative;}
    }
    return out;
  }
  function setState(state,now){
    if(state.revision===revision)return;
    updateEntities(now);
    const age=started?(now-started)/1000:100,oldDuration=duration,nextKey=state.mode==='ball'?'ball-'+state.index:state.mode,target=targets[nextKey];
    if(!target)throw new Error('未知的三维目标形态');
    for(let i=0;i<COUNT;i++){
      const k=i*3,t=clamp((age-attributes.aDelay[i])/oldDuration);
      sampleParticle(i,now,sample);
      const oldColorT=smooth(t);
      for(let axis=0;axis<3;axis++){
        attributes.aStart[k+axis]=sample[axis];attributes.aVelocity[k+axis]=sample[axis+3];
        attributes.aFromColor[k+axis]=mix(attributes.aFromColor[k+axis],attributes.aToColor[k+axis],oldColorT);
      }
      const distance=Math.hypot(target.positions[k]-sample[0],target.positions[k+1]-sample[1],target.positions[k+2]-sample[2]);
      const phase=attributes.aSeed[i]*Math.PI*2,arc=Math.min(2.5,distance*.18);
      attributes.aArc.set([Math.cos(phase)*arc,Math.sin(phase*1.7)*arc*.6,Math.sin(phase)*arc],k);
      attributes.aDelay[i]=reduced||Math.hypot(sample[3],sample[4],sample[5])>.01?0:target.delays[i];
    }
    attributes.aTarget.set(target.positions);attributes.aToColor.set(target.colors);
    for(const [name] of Object.entries(attributes))if(name!=='aSeed')geometry.attributes[name].needsUpdate=true;
    for(const entity of entities){entity.from=entity.reveal.value;entity.to=0;}
    if(state.mode==='stage')stageEntity.to=1;else if(state.mode==='ball')balls[state.index].to=1;
    mode=state.mode;index=state.index;revision=state.revision;started=now;duration=reduced?.5:mode==='stage'?2.8:mode==='ball'?1.8:1.4;
    confetti.reset();celebrationStart=null;celebrationAt=mode==='stage'?elapsedMotion+4:null;
    fromAlpha=alpha;toAlpha=mode==='stars'?1:0;stats.mode=mode;
    material.uniforms.uDuration.value=duration;
  }
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();contextLost=true;window.dispatchEvent(new Event('mayday-renderer-lost'));});
  const debugExtension=renderer.getContext().getExtension('WEBGL_debug_renderer_info');
  stats.renderer=debugExtension?renderer.getContext().getParameter(debugExtension.UNMASKED_RENDERER_WEBGL):'WebGL';
  for(const entity of entities)entity.root.visible=true;
  await renderer.compileAsync(world,camera);
  // 预先上传几何并生成阴影程序，避免首次舞台显现时同步编译。
  renderer.setSize(1200,900,false);
  for(const entity of entities){entity.reveal.value=1;entity.update();}
  for(const ball of balls)ball.root.visible=false;
  floor.visible=true;floor.material.opacity=.18;
  stageMotion.update(0);confetti.trigger(0);confetti.update(2.5);
  // 按实际完整构图上传两侧观众与舞台资源，避免近景预热遗漏视锥外几何。
  for(const yaw of [0,-.085,.085]){
    camera.position.set(Math.sin(yaw)*26.8,10.7,2.25+Math.cos(yaw)*26.8);camera.lookAt(lookAt);
    renderer.shadowMap.needsUpdate=true;renderer.render(world,camera);
  }
  confetti.reset();
  stageRoot.visible=false;floor.visible=false;
  for(const ball of balls)ball.root.visible=false;
  // 单球与舞台的可见灯光数量不同，分别预热对应的程序变体。
  camera.position.set(0,3.85,11.15);camera.lookAt(lookAt);
  for(const ball of balls){ball.root.visible=true;renderer.shadowMap.needsUpdate=true;renderer.render(world,camera);ball.root.visible=false;}
  renderer.getContext().finish();
  stats.warmPrograms=renderer.info.programs.length;stats.warmGeometries=renderer.info.memory.geometries;
  camera.position.set(0,5.5,14.5);camera.lookAt(lookAt);
  for(const entity of entities){entity.reveal.value=0;entity.root.visible=false;entity.update();}
  floor.visible=false;floor.material.opacity=0;
  if(contextLost||renderer.getContext().isContextLost())throw new Error('加载期间三维连接已中断，请重新加载');
  const api={
    stats,
    setHandInput(input,now=performance.now()){handMotion.push(input,now);},
    setMotionPaused(paused){
      const next=Boolean(paused);
      if(next!==motionPaused||explicitPause!==next)renderer.shadowMap.needsUpdate=true;
      motionPaused=next;explicitPause=next;
    },
    get motionPaused(){return motionPaused;},
    celebrate(){if(mode!=='stage')return false;celebrationAt=null;celebrationStart=elapsedMotion;confetti.trigger(elapsedMotion);return true;},
    render(ctx,width,height,state,now){
      if(disposed||contextLost)return;
      const begin=performance.now(),dt=lastNow?Math.max(0,Math.min(.1,(now-lastNow)/1000)):1/30;
      if(lastNow&&now-lastNow<1000){stats.frameGaps.push(now-lastNow);if(stats.frameGaps.length>1800)stats.frameGaps.shift();}
      // 系统默认减少动态仍允许短转场，用户主动暂停则冻结所有进度。
      const frozen=motionPaused&&(!reduced||explicitPause);
      if(lastNow&&frozen)pauseOffset+=now-lastNow;
      lastNow=now;animationNow=now-pauseOffset;if(!motionPaused)elapsedMotion+=dt;
      updateHands(dt,now);
      setState(state,animationNow);updateEntities(animationNow);
      const t=started?clamp((animationNow-started)/1000/duration):1;
      const alphaT=toAlpha<fromAlpha?smooth((t-.55)/.45):smooth(t/.25);alpha=mix(fromAlpha,toAlpha,alphaT);
      material.uniforms.uAge.value=started?(animationNow-started)/1000:100;material.uniforms.uTime.value=elapsedMotion;material.uniforms.uAlpha.value=alpha;material.uniforms.uSize.value=Math.min(width,height)/650;
      material.uniforms.uFlow.value=mode==='stars'?1:0;material.uniforms.uPalm.value.set(palm.x,palm.y,palm.strength);
      if(canvas.width!==width||canvas.height!==height)renderer.setSize(width,height,false);
      camera.aspect=width/height;
      const stageAmount=stageEntity.reveal.value;
      const radius=mix(8.9*Math.max(1,1.0/camera.aspect),26.8*Math.max(1,(4/3)/camera.aspect),stageAmount),yaw=Math.sin(elapsedMotion*.10)*mix(.035,.085,stageAmount);
      const desired=V(Math.sin(yaw)*radius,mix(3.85,10.7,stageAmount),2.25+Math.cos(yaw)*radius);
      if(!frozen){if(reduced)camera.position.copy(desired);else camera.position.lerp(desired,1-Math.exp(-dt*3.6));}camera.lookAt(lookAt);camera.updateProjectionMatrix();
      for(let i=0;i<liveBalls.length;i++)if(balls[i].root.visible)liveBalls[i].update(elapsedMotion,balls[i].reveal.value,gaze);
      if(celebrationAt!==null&&elapsedMotion>=celebrationAt&&stageEntity.reveal.value>.999){confetti.trigger(elapsedMotion);celebrationStart=elapsedMotion;celebrationAt=null;}
      if(stageRoot.visible)stageMotion.update(elapsedMotion,celebrationStart===null?-1:elapsedMotion-celebrationStart,stageAmount,gaze);
      atmosphere.update(elapsedMotion,mode==='stage'?.95:1.12,mode==='ball'?palette[index]:null,Math.min(width,height)/650);
      confetti.update(elapsedMotion);stats.confettiActive=confetti.active;
      if(!frozen&&((stageRoot.visible&&now-lastShadow>160)||entities.some(e=>e.root.visible&&e.reveal.value<.999))) {renderer.shadowMap.needsUpdate=true;lastShadow=now;}
      renderer.render(world,camera);ctx.drawImage(canvas,0,0,width,height);
      stats.calls=renderer.info.render.calls;stats.triangles=renderer.info.render.triangles;stats.transition=t;
      stats.programs=renderer.info.programs.length;stats.geometries=renderer.info.memory.geometries;
      stats.paintTimes.push(performance.now()-begin);if(stats.paintTimes.length>1800)stats.paintTimes.shift();
    },
    particleState(i,now){
      const time=motionPaused&&(!reduced||explicitPause)?animationNow:now-pauseOffset;
      return Array.from(sampleParticle(i,time,new Float64Array(6)));
    },
    inspect(){return {mode,index,motionTime:elapsedMotion,confetti:confetti.active,palm:{...palm},gaze:{...gaze},ballEyes:liveBalls.map(b=>b.eyes[0].scale.y),ballResponses:liveBalls.map(b=>b.inspect()),...stageMotion.inspect()};},
    dispose(){
      if(disposed)return;disposed=true;
      releaseResources(world,renderer);
    }
  };
  return api;
  }catch(error){releaseResources(world,renderer);throw error;}
}
