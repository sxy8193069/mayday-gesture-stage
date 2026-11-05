import * as THREE from '../vendor/three.module.js';
import {facePatch,faceLine} from './models.mjs';

const colors=['#ff514b','#f9ce32','#ef82bb','#37bfe5','#49ce7e'];
const pupils=['#18b556','#d84332','#00a8df','#20212b','#dca541'];
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function lightTexture(){
  const c=document.createElement('canvas');c.width=c.height=128;
  const d=c.getContext('2d'),g=d.createRadialGradient(64,64,0,64,64,64);
  for(const [stop,color]of [[0,'#ffffff'],[.35,'#ffffffa8'],[.7,'#ffffff25'],[1,'#ffffff00']])g.addColorStop(stop,color);
  d.fillStyle=g;d.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
}
export function createGlowBall(index,texture){
  if(!Number.isInteger(index)||index<0||index>4)throw new RangeError('未知的星球');
  const root=new THREE.Group(),eyes=[],pupilNodes=[];root.name='interactive-ball-'+index;
  const base=new THREE.Color(colors[index]);
  const shell=new THREE.ShaderMaterial({toneMapped:false,
    uniforms:{breath:{value:1},base:{value:base},uEntityReveal:{value:1}},
    vertexShader:`varying vec3 n;varying vec3 v;varying vec3 world;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);
      world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*p;}`,
    fragmentShader:`varying vec3 n;varying vec3 v;varying vec3 world;uniform vec3 base;uniform float breath,uEntityReveal;
      void main(){float threshold=fract(sin(dot(floor(world*31.),vec3(12.9898,78.233,43.121)))*43758.5453);
      if(uEntityReveal<=threshold)discard;
      vec3 normal=normalize(n);float facing=max(0.,dot(normal,normalize(v)));
      float inner=pow(facing,.62),lift=clamp(.5+normal.y*.35-normal.x*.2,0.,1.);
      vec3 edge=base*.46,core=mix(base*.88,mix(base,vec3(1.),.16),lift);
      gl_FragColor=vec4(mix(edge,core,inner)*breath,1.);
      #include <colorspace_fragment>
    }`
  });
  shell.userData.spatialReveal=true;
  const sphere=new THREE.Mesh(new THREE.SphereGeometry(1.6,48,32),shell);sphere.userData.particleSurface=true;sphere.userData.particleColor=base;root.add(sphere);
  const halos=[];
  for(const [size,opacity,z]of [[6.4,.56,-1.65],[9,.16,-1.7]]){
    const material=new THREE.SpriteMaterial({map:texture,color:colors[index],transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    const halo=new THREE.Sprite(material);halo.position.z=z;halo.scale.set(size,size,1);root.add(halo);halos.push({halo,opacity});
  }
  const white=new THREE.MeshBasicMaterial({color:'#fff5d8',toneMapped:false});
  const ink=new THREE.MeshBasicMaterial({color:'#191e28',toneMapped:false});
  const pupilMat=new THREE.MeshBasicMaterial({color:pupils[index],toneMapped:false});
  for(const sign of [-1,1]){
    const x=sign*(index===4?.205:.41),y=-.025,z=Math.sqrt(1.6**2-x*x-y*y),group=new THREE.Group();group.position.set(x,y,z);root.add(group);
    const patch=(cx,cy,rx,ry,mat,lift)=>{const o=facePatch(group,1.6,cx,cy,rx,ry,mat,lift);o.geometry.translate(-x,-y,-z);return o;};
    const rx=index===3?.17:index===4?.18:.22,ry=index===1?.15:index===2?.28:.255;
    patch(x,y,rx,ry,white,.018);
    const pupil=patch(x+(index===4?-.05:index===3?.035:-.014),y,.12,index===1?.105:ry*.68,pupilMat,.037);
    const glint=patch(x-.055,y+ry*.4,.027,.035,white,.049);eyes.push(group);
    pupilNodes.push({pupil,glint,cx:x+(index===4?-.05:index===3?.035:-.014),cy:y,gx:x-.055,gy:y+ry*.4,rangeX:Math.max(.025,rx-.135),rangeY:Math.max(.018,ry-(index===1?.105:ry*.68)-.015)});
  }
  const mouths=[
    [[-.25,-.43],[-.31,-.49],[.24,-.49]],
    [[-.22,-.41],[-.12,-.51],[.06,-.54],[.24,-.43]],
    [[-.28,-.43],[-.19,-.49],[-.1,-.49],[0,-.42],[.1,-.49],[.19,-.49],[.28,-.43]],
    [[-.16,-.41],[0,-.54],[.16,-.41]],
    [[-.45,-.43],[-.12,-.34],[.06,-.39],[.23,-.28],[.46,-.24]]
  ];
  const mouth=faceLine(root,1.6,mouths[index],.031,ink);
  if(index===3){
    const gold=new THREE.MeshBasicMaterial({color:'#ffe260',toneMapped:false});
    for(const x of [-.41,.41])faceLine(root,1.6,[[x-.25,.28],[x+.25,.28],[x+.25,-.30],[x-.25,-.30],[x-.25,.28]],.035,gold,.055);
    faceLine(root,1.6,[[-.16,.05],[.16,.05]],.032,gold,.055);
  }
  let settledSince=null,reactionAt=-Infinity,reactionCount=0,armed=true,lastReactionEnd=-Infinity,lastMovementId;
  const responseNames=['点头','笑眯眼','眨眼','双点头','歪头'];
  const place=(mesh,x,y,dx,dy)=>{mesh.position.set(dx,dy,Math.sqrt(Math.max(.01,2.56-(x+dx)**2-(y+dy)**2))-Math.sqrt(2.56-x*x-y*y));};
  return {root,shell,eyes,pupils:pupilNodes,
    inspect(){return {response:responseNames[index],reactionAt,reactionCount};},
    update(time,reveal=1,gaze={}){
      const strength=Math.max(0,Math.min(1,gaze.strength||0)),gx=Math.max(-1,Math.min(1,gaze.x||0))*strength,gy=Math.max(-1,Math.min(1,gaze.y||0))*strength;
      const bx=Math.max(-1,Math.min(1,gaze.bodyX??gaze.x??0))*strength,by=Math.max(-1,Math.min(1,gaze.bodyY??gaze.y??0))*strength;
      const moving=Math.hypot(gaze.vx||0,gaze.vy||0)>.20;
      const handMoved=lastMovementId!==gaze.movementId;lastMovementId=gaze.movementId;
      if(reveal<.98){settledSince=null;armed=true;reactionAt=-Infinity;}
      else if(strength<.65||!gaze.tracked){settledSince=null;reactionAt=-Infinity;}
      else if(handMoved){settledSince=null;armed=true;}
      else if(moving){settledSince=null;}
      else{
        if(settledSince===null)settledSince=time;
        if(armed&&time-settledSince>.65&&time-lastReactionEnd>1.4){reactionAt=time;lastReactionEnd=time+1.15;reactionCount++;armed=false;}
      }
      const age=(time-reactionAt)/1.15,envelope=age>=0&&age<1?Math.sin(Math.PI*age)**2:0;
      const idle=1-strength*.9;
      root.position.y=3.3+Math.sin(time*.85+index*.5)*.06;root.rotation.set(Math.sin(time*.55)*.018*idle,Math.sin(time*.43+index*.3)*.10*idle,Math.sin(time*.6)*.018*idle);
      root.rotation.x-=by*.14;root.rotation.y+=bx*.23;root.rotation.z-=bx*.055;
      if(index===0)root.rotation.x+=envelope*.10;
      if(index===1){root.rotation.z-=envelope*.055;mouth.scale.x=1+envelope*.07;}
      if(index===3&&envelope>0)root.rotation.x+=envelope*Math.sin(age*Math.PI*4)*.09;
      if(index===4)root.rotation.z+=envelope*.11;
      shell.uniforms.breath.value=1+Math.sin(time*.9+index)*.025;
      const cycle=(time+index*.73)%6.2,pulse=(c,w)=>Math.max(0,1-Math.abs(cycle-c)/w);
      const blink=Math.max(pulse(2.15,.16),pulse(4.9,.15),pulse(5.25,.12));
      eyes.forEach((eye,i)=>{const response=index===2&&i===0?envelope*.90:index===1?envelope*.30:0;eye.scale.y=(index===1?.80:1)*(1-Math.max(.93*smooth(blink*(i?1.06:1)),response));});
      for(const p of pupilNodes){
        const dx=Math.sin(time*.65+index)*.025*(1-strength*.94)+gx*p.rangeX,dy=Math.sin(time*.47)*.01*(1-strength*.94)+gy*p.rangeY;
        place(p.pupil,p.cx,p.cy,dx,dy);place(p.glint,p.gx,p.gy,dx,dy);
      }
      mouth.rotation.z=Math.sin(time*.65+index)*.014;
      for(const {halo,opacity}of halos)halo.material.opacity=opacity*reveal*(1+Math.sin(time*.9+index)*.08);
    }
  };
}
