import * as THREE from '../vendor/three.module.js';
import {batchStatic} from './geometry.mjs';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),up=V(0,1,0),down=V(0,-1,0);

export function batchKeepingMotion(root){
  const detached=[];
  root.traverse(object=>{if(object!==root&&object.userData.dynamic)detached.push({object,parent:object.parent});});
  for(const {object}of detached)object.removeFromParent();
  try{batchStatic(root);}
  finally{for(const {object,parent}of detached)parent.add(object);}
}

function makeBeams(stage,texture){
  const beams=[],structure=stage.getObjectByName('stage-structure');
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
    uniforms:{color:{value:new THREE.Color('#739bff')},strength:{value:.19}},
    vertexShader:'varying vec2 tex;varying vec3 n;varying vec3 eye;void main(){tex=uv;vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);eye=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
    fragmentShader:'varying vec2 tex;varying vec3 n;varying vec3 eye;uniform vec3 color;uniform float strength;void main(){float soft=pow(abs(dot(normalize(n),normalize(eye))),1.2);float fade=smoothstep(0.,.12,tex.y)*(.35+.65*tex.y);gl_FragColor=vec4(color,strength*soft*fade);\n#include <colorspace_fragment>\n}'
  });
  const geometry=new THREE.ConeGeometry(1,1,36,1,true);geometry.translate(0,-.5,0);
  for(let i=0;i<6;i++){
    const start=V(-6.3+i*2.52,7.26,-2.12),mat=material.clone();mat.uniforms.color.value.set(i%2?'#b094ff':'#70c9ff');
    const cone=new THREE.Mesh(geometry,mat);cone.position.copy(start);cone.renderOrder=3;cone.frustumCulled=false;cone.userData.dynamic=true;structure.add(cone);
    const pool=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.2),new THREE.MeshBasicMaterial({map:texture,color:i%2?'#9e75ff':'#5baeff',transparent:true,opacity:.18,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
    pool.rotation.x=-Math.PI/2;pool.position.y=.31;pool.scale.y=1.6;pool.userData.dynamic=true;structure.add(pool);
    let light=null;
    if(i===1||i===4){
      light=new THREE.SpotLight(i===1?'#9e88ff':'#71baff',7,18,.16,.7,1.3);light.position.copy(start);light.castShadow=false;
      light.userData.dynamic=true;light.target.userData.dynamic=true;structure.add(light);structure.add(light.target);
    }
    beams.push({start,cone,pool,light});
  }
  material.dispose();return beams;
}

function rodPose(mesh,start,end,length){
  const a=V(...start),b=V(...end),direction=b.clone().sub(a);
  mesh.position.copy(a.add(b).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(up,direction.clone().normalize());mesh.scale.y=direction.length()/length;
}

function prepareCrowd(stage){
  const crowd=stage.getObjectByName('audience-blocks'),batches=[];
  crowd.traverse(object=>{
    if(object.isInstancedMesh&&object.name!=='crowd-contact'){
      object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      batches.push({object,base:new Float32Array(object.instanceMatrix.array),ids:object.userData.personIds});
    }
  });
  const halos=crowd.getObjectByName('crowd-blue-light-halos');
  halos.material.fragmentShader=halos.material.fragmentShader.replace('vec4(0.025,0.34,1.0','vec4(0.07,0.70,1.0').replace('crossGlow*endFade*glowStrength','crossGlow*endFade*glowStrength*1.45');
  halos.material.uniforms.uCelebration={value:0};halos.material.uniforms.uCelebrationAge={value:-1};
  halos.material.uniforms.uHandX={value:0};halos.material.uniforms.uHandStrength={value:0};halos.material.uniforms.uHandTime={value:0};
  halos.material.vertexShader='uniform float uCelebration,uCelebrationAge,uHandX,uHandStrength,uHandTime;\n'+halos.material.vertexShader.replace('glowStrength=strength;',`float age=uCelebrationAge-(stickStart.z-3.7)*.32-abs(stickStart.x)*.08;
    float wave=smoothstep(0.,.3,age)*(1.-smoothstep(.6,1.6,age));
    float handWave=exp(-pow((stickStart.x-uHandX)/1.8,2.))*(.78+.22*sin(uHandTime*2.8-stickStart.z*1.4));
    glowStrength=strength*(1.+uCelebration*wave*2.2+uHandStrength*handWave*2.8);`);
  halos.geometry.attributes.stickStart.setUsage(THREE.DynamicDrawUsage);halos.geometry.attributes.stickEnd.setUsage(THREE.DynamicDrawUsage);
  const delta=crowd.userData.centers.map(()=>new THREE.Matrix4());
  return {crowd,batches,halos,delta,segments:crowd.userData.lightSegments};
}

export function prepareStageMotion(stage,texture){
  const performers=[],cymbals=[];
  stage.traverse(object=>{
    if(object.userData.arms)performers.push({root:object,rest:object.position.clone(),head:object.getObjectByName(object.name+'-head')});
    if(object.name==='animated-cymbal')cymbals.push(object);
  });
  const beams=makeBeams(stage,texture),crowd=prepareCrowd(stage);
  const globes=[];
  for(const root of stage.getObjectByName('stage-structure').children){
    const shell=root.children.find(child=>child.geometry?.parameters?.radius===.73);
    if(!shell)continue;
    root.userData.dynamic=true;
    const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,color:shell.material.color,transparent:true,opacity:.15,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
    halo.position.z=-.78;halo.scale.set(2.8,2.8,1);root.add(halo);globes.push({shell,halo});
  }
  const matrix=new THREE.Matrix4(),turn=new THREE.Matrix4(),translation=new THREE.Matrix4(),point=V(),target=V(),direction=V();
  return {
    update(seconds,celebrationAge=-1,reveal=1,gaze={}){
      const smooth=(a,b,x)=>{x=Math.max(0,Math.min(1,(x-a)/(b-a)));return x*x*(3-2*x);};
      const celebration=celebrationAge<0?0:smooth(0,.35,celebrationAge)*(1-smooth(3.1,4.8,celebrationAge));
      crowd.halos.material.uniforms.uCelebration.value=celebration;crowd.halos.material.uniforms.uCelebrationAge.value=celebrationAge;
      const handStrength=Math.max(0,Math.min(1,gaze.strength||0)),handX=Math.max(-1,Math.min(1,gaze.bodyX??gaze.x??0));
      crowd.halos.material.uniforms.uHandX.value=handX*7;crowd.halos.material.uniforms.uHandStrength.value=handStrength;crowd.halos.material.uniforms.uHandTime.value=seconds;
      for(const {shell,halo}of globes){shell.material.emissive.copy(shell.material.color);shell.material.emissiveIntensity=.24+celebration*.65;halo.material.opacity=(.15+celebration*.32)*reveal;}
      const beat=seconds*Math.PI*2*1.55;
      for(let i=0;i<performers.length;i++){
        const performer=performers[i],vocal=performer.root.name==='ashin',drums=performer.root.name==='guanyou';
        performer.root.rotation.z=Math.sin(beat*.5+i*.8)*(drums?.012:.025);performer.root.position.y=performer.rest.y+Math.sin(beat*.5+i*.7)*.012;
        performer.head.rotation.x=Math.sin(beat*.5+i)*.025;performer.head.rotation.z=Math.sin(beat*.25+i)*.025;
        performer.root.userData.arms.forEach((arm,j)=>{
          const end=[...arm.end],elbow=[...arm.elbow],osc=Math.sin(beat+j*Math.PI);
          if(drums){end[1]+=.14*osc;end[2]+=.08*osc;elbow[1]+=.04*osc;}
          else if(vocal){end[0]+=(j===0?.08:.025)*Math.sin(seconds*1.7);end[1]+=(j===0?.10:.025)*Math.sin(seconds*1.7);}
          else if(j===0){end[1]+=.07*osc;end[2]+=.018*osc;}
          else end[0]+=.018*Math.sin(seconds*2);
          rodPose(arm.upper,arm.shoulder,elbow,arm.upperLength);rodPose(arm.lower,elbow,end,arm.lowerLength);arm.hand.position.set(...end);
          if(arm.mic)arm.mic.position.set(end[0]-arm.end[0],end[1]-arm.end[1],end[2]-arm.end[2]);
          if(arm.stick){const tip=[...arm.stickTip];tip[1]+=.27*osc;tip[2]+=.11*osc;rodPose(arm.stick,end,tip,arm.stickLength);}
        });
      }
      cymbals.forEach((cymbal,i)=>cymbal.rotation.z=cymbal.userData.restAngle+Math.sin(beat*2+i)*.035);
      beams.forEach((beam,i)=>{
        target.set(Math.sin(seconds*.43+i*1.25)*4.6*(1+celebration*.18)*(1-handStrength*.65)+beam.start.x*.15*celebration+handX*handStrength*4.8,.31,.3+Math.sin(seconds*.31+i)*1.7);direction.subVectors(target,beam.start);
        beam.cone.scale.set(.82,direction.length(),.82);beam.cone.quaternion.setFromUnitVectors(down,direction.normalize());
        beam.cone.material.uniforms.strength.value=.20+Math.sin(seconds*.7+i)*.025+celebration*.14;beam.pool.position.set(target.x,.315,target.z);beam.pool.material.opacity=.18+celebration*.13;
        if(beam.light){beam.light.target.position.copy(target);beam.light.intensity=6.4+Math.sin(seconds*.8+i)*.7+celebration*3.0;}
      });
      for(let i=0;i<crowd.delta.length;i++){
        const center=crowd.crowd.userData.centers[i],angle=Math.sin(seconds*1.9+i*.63)*.055,bob=(Math.sin(seconds*2.1+i*.71)+1)*.012;
        crowd.delta[i].makeTranslation(center.x,bob,center.z);turn.makeRotationZ(angle);translation.makeTranslation(-center.x,0,-center.z);crowd.delta[i].multiply(turn).multiply(translation);
      }
      for(const {object,base,ids}of crowd.batches){
        for(let i=0;i<object.count;i++){matrix.fromArray(base,i*16);matrix.premultiply(crowd.delta[ids[i]]);object.setMatrixAt(i,matrix);}
        object.instanceMatrix.needsUpdate=true;
      }
      const attrs=crowd.halos.geometry.attributes;
      crowd.segments.forEach((segment,i)=>{
        point.fromArray(segment.start).applyMatrix4(crowd.delta[segment.personId]).toArray(attrs.stickStart.array,i*3);
        point.fromArray(segment.end).applyMatrix4(crowd.delta[segment.personId]).toArray(attrs.stickEnd.array,i*3);
      });
      attrs.stickStart.needsUpdate=true;attrs.stickEnd.needsUpdate=true;
    },
    inspect(){
      return {armY:performers[0].root.userData.arms[0].hand.position.y,beamX:beams[0].pool.position.x,crowdX:crowd.halos.geometry.attributes.stickStart.array[0],beamStrength:beams[0].cone.material.uniforms.strength.value,crowdGlow:crowd.halos.material.uniforms.uCelebration.value,globeGlow:globes[0]?.shell.material.emissiveIntensity,handWaveX:crowd.halos.material.uniforms.uHandX.value,handWaveStrength:crowd.halos.material.uniforms.uHandStrength.value};
    }
  };
}
