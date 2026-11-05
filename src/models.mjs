import * as THREE from '../vendor/three.module.js';
import {buildStageArtwork} from './stage-art.mjs';
const palette = ['#f83f2a','#ffce28','#ed6cac','#13b6e2','#19bc55'];
const V = (x,y,z) => new THREE.Vector3(x,y,z);
const material = (color, roughness=.5, metalness=0) => new THREE.MeshStandardMaterial({color,roughness,metalness});
const ink = material('#15202c',.65);
const skin = material('#ffd7b8',.65);
const hair = material('#30262a',.85);
const cloth = material('#172136',.8);
const black = material('#111a29',.72);
const white = material('#fff6df',.65);
const metal = material('#9aa9ba',.3,.72);
const emissive = (color,intensity=1) => new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:intensity,roughness:.4});
const tmp = V(0,0,0);
let renderer,artwork;
const params=new URLSearchParams();
function artworkMaterial(source){
  const texture=new THREE.CanvasTexture(source);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
  return new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
}

function mesh(geo,mat,parent,x=0,y=0,z=0){
  const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function ellipsoid(parent,x,y,z,rx,ry,rz,mat){
  const m=mesh(new THREE.SphereGeometry(1,24,16),mat,parent,x,y,z);m.scale.set(rx,ry,rz);return m;
}
function roundedBoxGeometry(w,h,d,r=.06){
  const s=new THREE.Shape(), l=-w/2,b=-h/2;
  s.moveTo(l+r,b);s.lineTo(l+w-r,b);s.quadraticCurveTo(l+w,b,l+w,b+r);
  s.lineTo(l+w,b+h-r);s.quadraticCurveTo(l+w,b+h,l+w-r,b+h);
  s.lineTo(l+r,b+h);s.quadraticCurveTo(l,b+h,l,b+h-r);s.lineTo(l,b+r);s.quadraticCurveTo(l,b,l+r,b);
  const g=new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSize:Math.min(r*.35,d*.18),bevelThickness:Math.min(r*.35,d*.18),bevelSegments:2,steps:1,curveSegments:4});
  g.translate(0,0,-d/2);return g;
}
function box(parent,x,y,z,w,h,d,mat,r=.06){
  return mesh(roundedBoxGeometry(w,h,d,r),mat,parent,x,y,z);
}
function rod(parent,a,b,r,mat){
  const start=V(...a),end=V(...b),delta=end.clone().sub(start);
  const m=mesh(new THREE.CylinderGeometry(r,r,delta.length(),14),mat,parent);
  m.position.copy(start.add(end).multiplyScalar(.5));m.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());return m;
}
function curve(parent,points,r,mat){
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>V(...p))),24,r,6,false),mat,parent);
}
function flatShape(parent,points,depth,mat,z=0){
  const s=new THREE.Shape();points.forEach((p,i)=>i?s.lineTo(...p):s.moveTo(...p));s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:.025,bevelThickness:.02,bevelSegments:2});g.translate(0,0,-depth/2);
  return mesh(g,mat,parent,0,0,z);
}
function glow(parent,x,y,z,color,size,opacity=.65){
  const c=document.createElement('canvas');c.width=c.height=128;const d=c.getContext('2d');
  const g=d.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,color);g.addColorStop(.16,color+'bd');g.addColorStop(1,color+'00');d.fillStyle=g;d.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,color:'#ffffff',transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending}));sprite.position.set(x,y,z);sprite.scale.set(size,size,1);parent.add(sprite);return sprite;
}
function lighting(scene,stage=false){
  scene.add(new THREE.HemisphereLight(stage?'#dceaff':'#dce8fa',stage?'#455f7c':'#657186',stage?1.7:1.30));
  const key=new THREE.DirectionalLight('#fff4e7',stage?2.55:2.9);key.position.set(stage?-4:-5,stage?13:9,stage?6:8);key.castShadow=true;
  key.shadow.mapSize.set(stage?2048:1024,stage?2048:1024);key.shadow.radius=4;key.shadow.camera.left=key.shadow.camera.bottom=stage?-12:-5;key.shadow.camera.right=key.shadow.camera.top=stage?12:5;key.shadow.normalBias=.025;key.shadow.bias=-.0002;scene.add(key);
  if(stage)key.shadow.intensity=.56;
  const fill=new THREE.DirectionalLight(stage?'#c5ddff':'#b2cbff',stage?1.20:.8);fill.position.set(6,4,stage?7:4);scene.add(fill);
  if(stage){const faceLight=new THREE.DirectionalLight('#fff5ec',.6);faceLight.position.set(0,3,9);scene.add(faceLight);}
  const rim=new THREE.DirectionalLight('#70def0',1.2);rim.position.set(3,6,-5);scene.add(rim);
}
function baseScene(stage=false,floorY=-.04){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#081322');scene.fog=new THREE.Fog('#081322',28,65);lighting(scene,stage);
  const floor=mesh(new THREE.PlaneGeometry(160,160),stage?material('#081322',.94):new THREE.ShadowMaterial({opacity:.15}),scene,0,floorY,0);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
  return scene;
}
function stars(parent,seed=9){
  const positions=[];let s=seed;const rnd=()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);
  for(let i=0;i<210;i++)positions.push((rnd()-.5)*32,1+rnd()*16,-7-rnd()*14);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  parent.add(new THREE.Points(g,new THREE.PointsMaterial({color:'#9bbfe9',size:.035,transparent:true,opacity:.5,sizeAttenuation:true,depthWrite:false})));
}

// 五官沿球面铺设，保留原有配色与表情比例。
function facePatch(parent,r,cx,cy,rx,ry,mat,lift=.008){
  const vertices=[],indices=[],segments=32,rings=5;
  const put=(x,y)=>vertices.push(x,y,Math.sqrt(Math.max(.001,r*r-x*x-y*y))+lift);
  put(cx,cy);
  for(let ring=1;ring<=rings;ring++)for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2;put(cx+Math.cos(a)*rx*ring/rings,cy+Math.sin(a)*ry*ring/rings);}
  for(let i=0;i<segments;i++)indices.push(0,1+i,1+(i+1)%segments);
  for(let ring=1;ring<rings;ring++)for(let i=0;i<segments;i++){
    const a=1+(ring-1)*segments+i,b=1+(ring-1)*segments+(i+1)%segments,c=1+ring*segments+i,d=1+ring*segments+(i+1)%segments;
    indices.push(a,c,b,b,c,d);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return mesh(g,mat,parent);
}
function faceLine(parent,r,points,width,mat,lift=.018){
  const samples=[];
  for(let i=1;i<points.length;i++)for(let t=0;t<1;t+=.12){const x=THREE.MathUtils.lerp(points[i-1][0],points[i][0],t),y=THREE.MathUtils.lerp(points[i-1][1],points[i][1],t);samples.push([x,y,Math.sqrt(r*r-x*x-y*y)+lift]);}
  const last=points.at(-1);samples.push([last[0],last[1],Math.sqrt(r*r-last[0]*last[0]-last[1]*last[1])+lift]);return curve(parent,samples,width,mat);
}
function ball(index,r=1.6){
  const g=new THREE.Group();
  const shell=new THREE.MeshPhysicalMaterial({color:palette[index],roughness:.48,metalness:0,clearcoat:.12,clearcoatRoughness:.55});
  mesh(new THREE.SphereGeometry(r,48,32),shell,g);
  const unit=r/1.6, feature=new THREE.Group();g.add(feature);
  const patch=(x,y,rx,ry,mat,lift=.012)=>facePatch(feature,r,x*unit,y*unit,rx*unit,ry*unit,mat,lift*unit);
  const line=(pts,w=.03,mat=ink)=>faceLine(feature,r,pts.map(([x,y])=>[x*unit,y*unit]),w*unit,mat);
  const eyeWhite=material('#fffaf0',.65),green=material('#1baa55',.65),blue=material('#04a5de',.6);
  if(index===0){
    for(const x of [-.36,.36]){patch(x,-.025,.19,.225,eyeWhite);patch(x-.018,-.032,.125,.155,green,.020);}
    line([[-.22,-.43],[-.30,-.49],[.22,-.49]],.029);
  }else if(index===1){
    for(const x of [-.36,.36]){patch(x,-.02,.19,.19,eyeWhite);patch(x,-.005,.125,.125,material('#e24734'),.022);patch(x,.1,.205,.10,shell,.034);}
    patch(.03,-.44,.26,.13,eyeWhite);patch(.17,-.42,.09,.04,ink,.03);
  }else if(index===2){
    for(const x of [-.36,.36]){patch(x,.015,.185,.255,eyeWhite);patch(x+.018,.002,.117,.175,blue,.022);}
    line([[-.27,-.43],[-.19,-.49],[-.10,-.49],[0,-.42],[.10,-.49],[.19,-.49],[.27,-.43]],.03);
  }else if(index===3){
    for(const x of [-.36,.36]){patch(x,.01,.15,.19,eyeWhite);patch(x+.045,.015,.075,.115,ink,.02);}
    const gold=material('#ffe04e',.42);
    for(const x of [-.36,.36])line([[x-.23,.24],[x+.23,.24],[x+.23,-.21],[x-.23,-.21],[x-.23,.24]],.032,gold);
    line([[-.13,.05],[.13,.05]],.028,gold);line([[-.13,-.4],[0,-.51],[.13,-.4]],.03);
  }else{
    for(const x of [-.18,.19]){patch(x,.01,.18,.16,eyeWhite);patch(x-.06,.02,.10,.11,material('#d9aa42'),.02);}
    line([[-.45,-.43],[-.12,-.34],[.06,-.39],[.23,-.28],[.46,-.24]],.031);
  }
  return g;
}

function guitar(parent,id){
  const acoustic=id==='stone',bass=id==='masa',g=new THREE.Group();g.name=id+'-instrument';parent.add(g);
  const color=acoustic?'#df741f':bass?'#f591c5':'#f32f39',body=material(color,.31,.04);
  const shape=new THREE.Shape();
  if(acoustic){
    shape.moveTo(0,-.52);shape.bezierCurveTo(-.45,-.55,-.55,-.18,-.34,.06);shape.bezierCurveTo(-.25,.18,-.40,.35,-.25,.48);shape.quadraticCurveTo(0,.60,.25,.48);shape.bezierCurveTo(.40,.35,.25,.18,.34,.06);shape.bezierCurveTo(.55,-.18,.45,-.55,0,-.52);
  }else if(bass){
    shape.moveTo(-.02,-.46);shape.bezierCurveTo(-.32,-.48,-.40,-.17,-.24,.05);shape.quadraticCurveTo(-.18,.17,-.23,.34);shape.quadraticCurveTo(-.25,.56,-.13,.59);shape.quadraticCurveTo(-.15,.30,-.055,.28);shape.lineTo(.06,.28);shape.quadraticCurveTo(.18,.30,.20,.76);shape.quadraticCurveTo(.37,.65,.27,.27);shape.bezierCurveTo(.16,.04,.37,-.08,.30,-.28);shape.quadraticCurveTo(.24,-.49,-.02,-.46);
  }else{
    shape.moveTo(-.08,-.43);shape.quadraticCurveTo(-.37,-.44,-.39,-.19);shape.quadraticCurveTo(-.39,-.03,-.24,.15);shape.lineTo(-.29,.49);shape.lineTo(-.15,.64);shape.quadraticCurveTo(-.15,.33,-.06,.28);shape.lineTo(.06,.28);shape.quadraticCurveTo(.16,.32,.18,.64);shape.lineTo(.32,.48);shape.lineTo(.23,.15);shape.quadraticCurveTo(.42,-.06,.36,-.25);shape.quadraticCurveTo(.31,-.46,-.08,-.43);
  }
  const geo=new THREE.ExtrudeGeometry(shape,{depth:acoustic?.20:.13,bevelEnabled:true,bevelSize:.025,bevelThickness:.018,bevelSegments:2,curveSegments:16});geo.translate(0,0,acoustic?-.10:-.065);
  mesh(geo,body,g);
  const front=acoustic?.124:.089,neckEnd=bass?1.62:1.40;
  const outline=shape.getPoints(65).map(p=>V(p.x,p.y,front+.004));
  const border=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outline),new THREE.LineBasicMaterial({color:acoustic?'#f7d59d':'#eacfc4'}));g.add(border);
  if(acoustic){
    mesh(new THREE.CircleGeometry(.125,36),material('#22130e'),g,0,.15,front+.004);
    mesh(new THREE.TorusGeometry(.139,.012,8,40),material('#f4cf86',.6),g,0,.15,front+.009);
    box(g,0,-.26,front+.015,.25,.073,.022,material('#382018'),.012);
    box(g,0,-.24,front+.033,.19,.015,.010,white,.004);
    flatShape(g,[[.13,.24],[.29,.17],[.27,-.02],[.13,-.10],[.10,.04]],.009,material('#5a2b1b'),front+.011);
  }else{
    flatShape(g,[[-.24,-.21],[-.22,.06],[-.12,.28],[.05,.23],[.20,.07],[.18,-.17],[-.02,-.29]],.012,material(bass?'#fbe0ee':'#ffeedb'),front+.015);
    for(const y of [0,.18])box(g,0,y,front+.032,.19,.045,.025,material(bass?'#36313d':'#e9e0d6'),.006);
    box(g,0,-.24,front+.021,.20,.060,.026,metal,.007);
    for(const [x,y] of [[.22,-.20],[.25,-.09]])ellipsoid(g,x,y,front+.029,.027,.027,.02,metal);
  }
  box(g,0,(neckEnd+.36)/2,.020,bass?.095:.12,neckEnd-.36,.075,material('#a67642'),.010);
  box(g,0,(neckEnd+.37)/2,.064,bass?.081:.106,neckEnd-.37,.013,material(acoustic?'#523427':'#5d3b2b'),.004);
  for(let i=1;i<=13;i++){
    const y=.40+(neckEnd-.43)*(1-Math.pow(.88,i))/(1-Math.pow(.88,13));
    rod(g,[-.049,y,.076],[.049,y,.076],.003,metal);
  }
  box(g,.014,neckEnd+.12,.019,bass?.13:.18,.27,.075,material(acoustic?'#8a4b26':bass?'#ee87bd':'#f04248'),.025);
  const stringCount=bass?4:6;
  for(let i=0;i<stringCount;i++){
    const x=(i-(stringCount-1)/2)*.013;
    rod(g,[x,-.27,front+.039],[x,neckEnd+.22,.075],.0025,material('#d7d4ca',.35,.7));
    const side=bass?1:i<3?-1:1,y=neckEnd+.025+(bass?i:(i%3))*.065;
    rod(g,[side*.06,y,.025],[side*.13,y,.025],.011,metal);ellipsoid(g,side*.14,y,.025,.021,.032,.018,metal);
  }
  g.rotation.z=acoustic?-1.02:-1.18;return g;
}
const wardrobe={
  monster:{base:'#f3eee5',sleeve:'#f3eee5'},masa:{base:'#1b2d4a',sleeve:'#1b2d4a'},
  ashin:{base:'#2583b5',sleeve:'#e4edf1'},guanyou:{base:'#afb6c2',sleeve:'#eeeae2'},stone:{base:'#62263e',sleeve:null}
};
function clothingTexture(id){
  const c=document.createElement('canvas');c.width=512;c.height=640;const d=c.getContext('2d');
  d.fillStyle=wardrobe[id].base;d.fillRect(0,0,512,640);
  if(id==='monster'){
    d.fillStyle='#b33751';d.font='italic 900 142px Georgia';d.textAlign='center';d.fillText('Rock',256,260);
    d.strokeStyle='#233041';d.lineWidth=10;d.beginPath();d.moveTo(152,0);d.quadraticCurveTo(256,218,360,0);d.stroke();
    d.fillStyle='#a9a9a0';d.fillRect(243,152,26,49);
  }else if(id==='masa'){
    d.fillStyle='#f4eee5';d.beginPath();d.moveTo(165,0);d.lineTo(347,0);d.lineTo(345,640);d.lineTo(158,640);d.closePath();d.fill();
    d.fillStyle='#34445e';d.beginPath();d.moveTo(84,0);d.lineTo(189,30);d.lineTo(163,178);d.lineTo(220,245);d.lineTo(111,602);d.closePath();d.fill();
    d.beginPath();d.moveTo(428,0);d.lineTo(323,30);d.lineTo(349,178);d.lineTo(292,245);d.lineTo(401,602);d.closePath();d.fill();
    d.strokeStyle='#71839b';d.lineWidth=4;d.strokeRect(44,330,97,96);d.strokeRect(371,330,97,96);
  }else if(id==='ashin'||id==='stone'){
    d.fillStyle=id==='ashin'?'#12314c':'#242333';
    for(let x=0;x<512;x+=104)d.fillRect(x,0,46,640);for(let y=0;y<640;y+=114)d.fillRect(0,y,512,43);
    d.strokeStyle=id==='ashin'?'#a9d7e7':'#bb7787';d.lineWidth=4;
    for(let x=18;x<512;x+=104){d.beginPath();d.moveTo(x,0);d.lineTo(x,640);d.stroke();}
    for(let y=18;y<640;y+=114){d.beginPath();d.moveTo(0,y);d.lineTo(512,y);d.stroke();}
    d.fillStyle=id==='ashin'?'#badde7':'#522134';d.fillRect(249,0,14,640);
    for(let y=125;y<640;y+=112){d.fillStyle='#d7d6c9';d.beginPath();d.arc(256,y,5,0,Math.PI*2);d.fill();}
  }else{
    d.fillStyle='#eeeae2';d.beginPath();d.moveTo(132,0);d.lineTo(380,0);d.lineTo(256,290);d.closePath();d.fill();
    d.fillStyle='#4c5261';d.beginPath();d.moveTo(240,0);d.lineTo(272,0);d.lineTo(283,225);d.lineTo(256,277);d.lineTo(230,225);d.closePath();d.fill();
    d.strokeStyle='#666d7e';d.lineWidth=5;d.beginPath();d.moveTo(256,285);d.lineTo(256,640);d.stroke();
    for(let y=350;y<640;y+=94){d.fillStyle='#e7e4dd';d.beginPath();d.arc(278,y,6,0,Math.PI*2);d.fill();}
  }
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();return texture;
}
const members={
  monster:{name:'怪兽',role:'guitar',hair:'#322527',width:.51,height:.60,eye:.065,eyeY:3.08,brow:.08},
  masa:{name:'玛莎',role:'bass',hair:'#201f26',width:.55,height:.61,eye:.077,eyeY:3.06,brow:.03},
  ashin:{name:'阿信',role:'vocal',hair:'#25232a',width:.59,height:.59,eye:.060,eyeY:3.02,brow:.02},
  guanyou:{name:'冠佑',role:'drums',hair:'#35282a',width:.50,height:.59,eye:.057,eyeY:3.08,brow:.02},
  stone:{name:'石头',role:'guitar',hair:'#606775',width:.52,height:.60,eye:.045,eyeY:3.09,brow:.10}
};
function hairLock(parent,hair,outline,z=.38,depth=.15){
  const shape=new THREE.Shape();shape.moveTo(outline[0],outline[1]);
  for(let i=2;i<outline.length;i+=4)shape.quadraticCurveTo(outline[i],outline[i+1],outline[i+2],outline[i+3]);
  shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.032,bevelThickness:.028,bevelSegments:2,curveSegments:12});
  return mesh(geo,hair,parent,0,0,z);
}
function memberHead(parent,id){
  const profile=members[id],g=new THREE.Group();g.name=id+'-head';parent.add(g);
  const hairMat=material(profile.hair,.83),brow=material(id==='stone'?'#484044':profile.hair,.86);
  const faceMat=material(id==='stone'?'#ebbd9e':id==='masa'?'#f5c9aa':'#ffdbc1',.72);
  const {width:w,height:h}=profile;
  ellipsoid(g,0,3.06,0,w,h,.445,faceMat);
  for(const sign of [-1,1]){
    ellipsoid(g,sign*w,3.02,.015,.08,.13,.075,faceMat);
    ellipsoid(g,sign*(w+.014),3.02,.075,.032,.068,.016,material('#d89a87',.9));
  }
  const cap=mesh(new THREE.SphereGeometry(1,28,18,0,Math.PI*2,0,id==='stone'?1.25:1.50),hairMat,g,0,3.23,-.09);
  cap.scale.set(w+.045,id==='stone'?.43:.53,.46);
  if(id==='masa'){
    for(const sign of [-1,1]){
      ellipsoid(g,sign*.50,2.96,-.16,.18,.65,.26,hairMat);
      hairLock(g,hairMat,[sign*.04,3.60,sign*.36,3.62,sign*.56,3.35,sign*.62,2.91,sign*.43,2.65,sign*.42,3.24,sign*.04,3.60],.21,.15);
      for(let j=0;j<3;j++)curve(g,[[sign*(.45+j*.035),3.32,.36],[sign*(.49+j*.035),2.94,.21],[sign*(.43+j*.035),2.49,.10]],.007,material('#4c4145',.9));
    }
    curve(g,[[0,3.63,.10],[-.025,3.54,.31],[-.025,3.41,.4]],.009,material('#b48c76',.9));
  }else if(id==='stone'){
    // 短发保留高额头，发束朝上，不沿用其他成员的刘海。
    for(let i=0;i<6;i++){
      const x=-.39+i*.145,tuft=ellipsoid(g,x,3.57+Math.sin(i*.6)*.065,.15,.145,.22,.19,hairMat);tuft.rotation.z=-.42;
    }
    for(const sign of [-1,1])ellipsoid(g,sign*.48,3.32,-.06,.066,.21,.17,hairMat);
  }else if(id==='ashin'){
    ellipsoid(g,0,3.50,-.12,.59,.37,.43,hairMat);
    for(const [x,y,rx,ry,angle] of [[-.36,3.40,.24,.31,-.3],[-.05,3.43,.27,.33,-.18],[.28,3.40,.25,.31,-.14]]){
      const lock=ellipsoid(g,x,y,.28,rx,ry,.25,hairMat);lock.rotation.z=angle;
    }
    for(const sign of [-1,1])ellipsoid(g,sign*.53,3.17,-.01,.10,.30,.18,hairMat);
  }else if(id==='monster'){
    ellipsoid(g,-.13,3.48,-.09,.52,.37,.39,hairMat);
    hairLock(g,hairMat,[-.56,3.52,-.22,3.86,.30,3.65,.28,3.46,-.13,3.16,-.09,3.46,-.56,3.52],.32,.17);
    hairLock(g,hairMat,[-.06,3.66,.40,3.78,.54,3.45,.57,3.22,.38,3.11,.38,3.42,-.06,3.66],.26,.17);
    ellipsoid(g,-.48,3.15,-.04,.10,.34,.16,hairMat);
    ellipsoid(g,.48,3.14,-.04,.075,.32,.14,hairMat);
  }else{
    for(let i=0;i<5;i++)ellipsoid(g,-.38+i*.19,3.51+Math.sin(i*1.7)*.035,.29,.17,.18,.20,hairMat);
    for(const sign of [-1,1])ellipsoid(g,sign*.47,3.26,-.10,.085,.22,.17,hairMat);
  }
  const eyeX=id==='ashin'?.205:id==='masa'?.211:.19;
  for(const sign of [-1,1]){
    const x=eyeX*sign,y=profile.eyeY;
    ellipsoid(g,x,y,.422,id==='stone'?.075:.068,profile.eye,.028,ink);
    ellipsoid(g,x-.016,y+.023,.449,.018,.020,.009,white);
    curve(g,[[x-.085,y+.137-sign*profile.brow*.17,.412],[x,y+.158,.431],[x+.085,y+.137+sign*profile.brow*.17,.412]],id==='stone'?.023:.018,brow);
    if(id!=='stone')curve(g,[[x-.072,y+.042,.44],[x,y+profile.eye+.016,.447],[x+.07,y+.038,.437]],.010,brow);
  }
  ellipsoid(g,0,2.96,.446,id==='stone'?.057:.043,.05,.045,faceMat);
  const mouth=material('#9e5e54',.8);
  if(id==='ashin'){
    ellipsoid(g,0,2.815,.429,.083,.056,.017,mouth);
    curve(g,[[-.07,2.833,.447],[0,2.851,.451],[.071,2.833,.447]],.010,material('#ffdfca'));
  }else if(id==='stone')curve(g,[[-.11,2.825,.394],[0,2.805,.415],[.11,2.84,.385]],.014,mouth);
  else if(id==='masa'){
    curve(g,[[-.13,2.832,.389],[0,2.775,.411],[.13,2.832,.389]],.017,mouth);
    ellipsoid(g,0,2.813,.415,.075,.018,.007,white);
  }else curve(g,[[-.11,2.829,.39],[0,2.80,.418],[.11,2.841,.39]],.013,mouth);
  if(id==='guanyou'){
    const frames=material('#4a302b',.47);
    for(const sign of [-1,1]){
      const x=sign*.205;
      curve(g,[[x-.16,3.19,.458],[x+.15,3.19,.458],[x+.16,3.01,.463],[x-.15,3.01,.463],[x-.16,3.19,.458]],.022,frames);
      rod(g,[sign*.36,3.16,.45],[sign*.49,3.12,.10],.018,frames);
    }
    curve(g,[[-.05,3.13,.48],[0,3.15,.49],[.05,3.13,.48]],.017,frames);
  }
  return g;
}
function character(id='ashin',withInstrument=true){
  const profile=members[id],role=profile.role,g=new THREE.Group();g.name=id;
  memberHead(g,id);
  const outfit=wardrobe[id],shirt=material(outfit.base,.82),sleeve=outfit.sleeve?material(outfit.sleeve,.82):skin;
  mesh(new THREE.CylinderGeometry(.13,.16,.24,20),skin,g,0,2.49,0);
  box(g,0,1.95,-.03,.86,1.04,.44,shirt,.11);
  const front=mesh(new THREE.PlaneGeometry(.80,1.015),new THREE.MeshStandardMaterial({map:clothingTexture(id),roughness:.83}),g,0,1.95,.276);front.castShadow=false;
  if(id==='monster'){
    curve(g,[[-.17,2.45,.20],[0,2.39,.26],[.17,2.45,.20]],.012,material('#a3a0a0'));
  }else if(id==='stone'){
    flatShape(g,[[-.14,2.48],[.14,2.48],[0,2.27]],.014,skin,.29);
  }else{
    const collar=material(id==='masa'?'#31415d':id==='ashin'?'#aacbdd':'#eeeae2',.8);
    flatShape(g,[[-.12,2.46],[-.28,2.38],[-.17,2.21],[0,2.36]],.023,collar,.291);
    flatShape(g,[[.12,2.46],[.28,2.38],[.17,2.21],[0,2.36]],.023,collar,.291);
  }
  if(!withInstrument){
    for(const sign of [-1,1])ellipsoid(g,sign*.43,2.03,-.02,.16,.36,.21,sleeve);
    return g;
  }
  g.userData.arms=[];
  const armEnds=role==='vocal'?[[-.84,2.42,.35],[.48,2.64,.48]]:role==='drums'?[[-.65,2.04,.45],[.67,2.16,.40]]:[[-.12,1.70,.70],[.85,1.97,.61]];
  for(const [i,sign] of [-1,1].entries()){
    const group=new THREE.Group();group.name=id+'-arm-'+i;group.userData.dynamic=true;g.add(group);
    const shoulder=[sign*.43,2.28,0],elbow=[sign*.57,2.06,.14],end=armEnds[i];
    const upper=rod(group,shoulder,elbow,.147,sleeve),lower=rod(group,elbow,end,.10,skin),hand=ellipsoid(group,...end,.12,.14,.105,skin);
    g.userData.arms.push({group,shoulder,elbow,end,upper,lower,hand,
      upperLength:V(...shoulder).distanceTo(V(...elbow)),lowerLength:V(...elbow).distanceTo(V(...end))});
  }
  if(withInstrument){
    if(role==='vocal'){
      const mic=new THREE.Group();g.userData.arms[1].group.add(mic);g.userData.arms[1].mic=mic;rod(mic,[.48,2.64,.48],[.14,2.84,.61],.046,metal);ellipsoid(mic,.12,2.86,.63,.077,.098,.077,ink);
    }else if(role==='drums'){
      for(const [i,sign]of [-1,1].entries()){const arm=g.userData.arms[i];arm.stick=rod(arm.group,arm.end,[sign*.43,2.56,.86],.016,material('#dfbd86'));arm.stickTip=[sign*.43,2.56,.86];arm.stickLength=V(...arm.end).distanceTo(V(...arm.stickTip));}
    }else{
      const instrument=guitar(g,id);instrument.position.set(-.08,1.65,.48);instrument.userData.dynamic=true;g.userData.instrument=instrument;
      curve(g,[[-.33,2.40,.05],[-.43,2.10,.32],[-.29,1.52,.40]],.038,material('#34343c'));
    }
  }
  const sole=material('#788493',.8);
  for(const sign of [-1,1]){
    const leg=new THREE.Group();leg.position.set(sign*.23,1.40,sign<0?.07:-.04);leg.rotation.z=sign*.025;g.add(leg);
    box(leg,0,-.53,0,.32,1.13,.36,cloth,.065);
    box(leg,0,-1.18,.13,.40,.24,.66,black,.065);box(leg,0,-1.29,.15,.4,.06,.65,sole,.025);
  }
  return g;
}

function ledScreen(parent){
  const g=new THREE.Group();g.name='anniversary-main-screen';parent.add(g);
  box(g,0,3.86,-2.55,10.90,3.60,.24,material('#172d43'),.04);
  const m=mesh(new THREE.PlaneGeometry(10.76,3.46),artworkMaterial(artwork.main),g,0,3.86,-2.414);m.castShadow=false;
  for(const x of [-5.45,5.45])rod(g,[x,2.06,-2.39],[x,5.66,-2.39],.018,emissive('#54bde2',.65));
}
function drumKit(parent,x,y,z){
  const g=new THREE.Group();g.name='drum-kit';g.position.set(x,y,z);parent.add(g);
  const shell=material('#101519',.40,.20),head=material('#f4eddc',.65),rim=material('#8d9294',.30,.68);
  const kick=mesh(new THREE.CylinderGeometry(.65,.65,.50,56),shell,g,0,.67,.32);kick.rotation.x=Math.PI/2;
  const front=mesh(new THREE.CircleGeometry(.61,56),artworkMaterial(artwork.kick),g,0,.67,.574);front.castShadow=false;front.name='kick-drum-head';
  mesh(new THREE.TorusGeometry(.633,.022,8,56),rim,g,0,.67,.58);
  for(let i=0;i<8;i++){
    const angle=(i+.5)*Math.PI/4;
    box(g,Math.cos(angle)*.635,.67+Math.sin(angle)*.635,.576,.035,.065,.06,rim,.009).rotation.z=angle-Math.PI/2;
  }
  for(const sign of [-1,1])rod(g,[sign*.52,.26,.39],[sign*.64,.035,.65],.025,rim);
  for(const sign of [-1,1]){
    const tom=mesh(new THREE.CylinderGeometry(.28,.28,.32,32),shell,g,sign*.39,1.13,.05);tom.rotation.x=.2;
    mesh(new THREE.CylinderGeometry(.28,.28,.018,32),head,g,sign*.39,1.30,.08);
    rod(g,[sign*.94,.04,-.01],[sign*.94,1.68,-.01],.022,metal);
    const cymbal=mesh(new THREE.CylinderGeometry(.43,.43,.025,40),material('#d8af57',.3,.62),g,sign*.94,1.69,-.01);cymbal.rotation.z=sign*.12;cymbal.name='animated-cymbal';cymbal.userData.dynamic=true;cymbal.userData.restAngle=cymbal.rotation.z;
  }
  return g;
}
function beam(parent,x,y,z,color,dx){
  const c=document.createElement('canvas');c.width=8;c.height=256;const d=c.getContext('2d'),fade=d.createLinearGradient(0,0,0,256);
  fade.addColorStop(0,'#ffffffff');fade.addColorStop(.25,'#ffffff8a');fade.addColorStop(1,'#ffffff00');d.fillStyle=fade;d.fillRect(0,0,8,256);
  const texture=new THREE.CanvasTexture(c);
  const mat=new THREE.MeshBasicMaterial({color,map:texture,transparent:true,opacity:.045,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
  const a=V(x,y,z),b=V(x+dx,.28,z+4.5),delta=b.clone().sub(a),len=delta.length();
  const cone=mesh(new THREE.ConeGeometry(.83,len,40,1,true),mat,parent);cone.position.copy(a.clone().add(b).multiplyScalar(.5));cone.quaternion.setFromUnitVectors(V(0,1,0),a.clone().sub(b).normalize());cone.castShadow=false;cone.receiveShadow=false;
  glow(parent,x,y,z,color,.55,.9);
}
function truss(parent){
  const steel=material('#7d8e9e',.43,.52);
  for(const x of [-7,7]){
    for(const z of [-2.4,-2.85])rod(parent,[x,.2,z],[x,7.9,z],.055,steel);
    for(let y=.2;y<7.5;y+=.6){rod(parent,[x,y,-2.4],[x,y+.6,-2.85],.026,steel);rod(parent,[x,y,-2.85],[x,y+.6,-2.4],.026,steel);}
  }
  for(const y of [7.55,7.95])rod(parent,[-7,y,-2.6],[7,y,-2.6],.055,steel);
  for(let x=-7;x<7;x+=.7){rod(parent,[x,7.55,-2.6],[x+.7,7.95,-2.6],.027,steel);rod(parent,[x,7.95,-2.6],[x+.7,7.55,-2.6],.027,steel);}
  for(let i=0;i<11;i++){
    const x=-6.3+i*1.26;box(parent,x,7.37,-2.4,.35,.34,.38,black,.05);
    ellipsoid(parent,x,7.31,-2.17,.12,.12,.035,emissive(i%2?'#fff0b7':'#a5ddff',1.6));

  }
}
function frontTrussPanels(parent){
  const frame=material('#aebcc8',.48,.35),back=material('#10151d',.82);
  for(const [side,left,right] of [['left',-7.0,-.9],['right',.9,7.0]]){
    const width=1.58,gap=.55,margin=(right-left-3*width-2*gap)/2;
    for(let i=0;i<3;i++){
      const g=new THREE.Group(),x=left+margin+i*(width+gap);
      g.name='front-truss-'+side+'-'+i;g.userData={type:'front-truss-panel',side};parent.add(g);
      box(g,x+width/2,.105,2.941,width+.07,.34,.028,back,.008);
      for(const y of [-.035,.245])rod(g,[x,y,2.968],[x+width,y,2.968],.022,frame);
      for(const edge of [x,x+width])rod(g,[edge,-.035,2.968],[edge,.245,2.968],.022,frame);
      for(let cell=0;cell<3;cell++){
        const a=x+cell*width/3,b=x+(cell+1)*width/3;
        rod(g,[a,-.02,2.971],[b,.23,2.971],.014,frame);rod(g,[a,.23,2.971],[b,-.02,2.971],.014,frame);
      }
    }
  }
}
function crowdLightHalos(parent,segments){
  const quad=new THREE.PlaneGeometry(1,1),geometry=new THREE.InstancedBufferGeometry();
  geometry.index=quad.index;geometry.attributes.position=quad.attributes.position;geometry.attributes.uv=quad.attributes.uv;
  geometry.setAttribute('stickStart',new THREE.InstancedBufferAttribute(new Float32Array(segments.flatMap(s=>s.start)),3));
  geometry.setAttribute('stickEnd',new THREE.InstancedBufferAttribute(new Float32Array(segments.flatMap(s=>s.end)),3));
  geometry.setAttribute('strength',new THREE.InstancedBufferAttribute(new Float32Array(segments.map(s=>s.strength)),1));
  geometry.instanceCount=segments.length;
  geometry.boundingBox=new THREE.Box3().setFromPoints(segments.flatMap(s=>[V(...s.start),V(...s.end)])).expandByScalar(.20);
  geometry.boundingSphere=geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  const mat=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
    vertexShader:`attribute vec3 stickStart;attribute vec3 stickEnd;attribute float strength;
      varying vec2 glowUv;varying float glowStrength;
      void main(){
        vec4 a=modelViewMatrix*vec4(stickStart,1.0),b=modelViewMatrix*vec4(stickEnd,1.0);
        vec2 delta=b.xy-a.xy,across=vec2(-delta.y,delta.x)/max(length(delta),0.0001);
        vec4 p=mix(a,b,uv.y*1.30-0.15);p.xy+=across*(uv.x-0.5)*0.32;
        gl_Position=projectionMatrix*p;glowUv=uv;glowStrength=strength;
      }`,
    fragmentShader:`varying vec2 glowUv;varying float glowStrength;
      void main(){
        float crossGlow=exp(-pow((glowUv.x-0.5)*5.0,2.0));
        float endFade=smoothstep(0.0,0.20,glowUv.y)*(1.0-smoothstep(0.80,1.0,glowUv.y));
        gl_FragColor=vec4(0.025,0.34,1.0,crossGlow*endFade*glowStrength);
        #include <colorspace_fragment>
      }`
  });
  const halo=new THREE.Mesh(geometry,mat);halo.name='crowd-blue-light-halos';halo.frustumCulled=false;parent.add(halo);
}
function audienceBlocks(scene){
  const g=new THREE.Group();g.name='audience-blocks';scene.add(g);
  const total=60,standard=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.72});
  const fabric=document.createElement('canvas');fabric.width=fabric.height=256;const ctx=fabric.getContext('2d');
  ctx.fillStyle='#71c9e8';ctx.fillRect(0,0,256,256);
  for(let i=0;i<6;i++){
    ctx.fillStyle='#275c83';ctx.fillRect(i*48,0,14,256);ctx.fillRect(0,i*48,256,14);
    ctx.fillStyle='#d5edf0';ctx.fillRect(i*48+20,0,3,256);ctx.fillRect(0,i*48+20,256,3);
  }
  const fabricMap=new THREE.CanvasTexture(fabric);fabricMap.colorSpace=THREE.SRGBColorSpace;
  const contact=document.createElement('canvas');contact.width=contact.height=64;const shadow=contact.getContext('2d'),falloff=shadow.createRadialGradient(32,32,1,32,32,32);
  falloff.addColorStop(0,'#020811a8');falloff.addColorStop(.45,'#02081150');falloff.addColorStop(1,'#02081100');shadow.fillStyle=falloff;shadow.fillRect(0,0,64,64);
  const batches={
    head:new THREE.InstancedMesh(new THREE.SphereGeometry(1,22,16),standard,total),
    hair:new THREE.InstancedMesh(new THREE.SphereGeometry(1,22,14,0,Math.PI*2,0,Math.PI*.68),standard,total),
    locks:new THREE.InstancedMesh(new THREE.SphereGeometry(1,12,8),standard,total*4),
    ears:new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,8),standard,total*2),
    neck:new THREE.InstancedMesh(new THREE.CylinderGeometry(.072,.072,.13,10),standard,total),
    torso:new THREE.InstancedMesh(roundedBoxGeometry(.39,.47,.27,.055),standard,total),
    collar:new THREE.InstancedMesh(roundedBoxGeometry(.18,.045,.032,.012),standard,total),
    plaid:new THREE.InstancedMesh(new THREE.PlaneGeometry(.35,.39),new THREE.MeshStandardMaterial({map:fabricMap,roughness:.83}),total),
    hoods:new THREE.InstancedMesh(new THREE.SphereGeometry(1,16,10),standard,total),
    yokes:new THREE.InstancedMesh(roundedBoxGeometry(.32,.09,.025,.015),standard,total),
    hems:new THREE.InstancedMesh(roundedBoxGeometry(.35,.035,.285,.012),standard,total),
    arms:new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,10),standard,total*4),
    forearms:new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,10),standard,total*2),
    hands:new THREE.InstancedMesh(new THREE.SphereGeometry(1,12,8),standard,total*2),
    legs:new THREE.InstancedMesh(roundedBoxGeometry(.145,.55,.18,.035),standard,total*2),
    shoes:new THREE.InstancedMesh(roundedBoxGeometry(.18,.13,.30,.035),standard,total*2),
    sticks:new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,10),new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false}),total),
    grips:new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,10),standard,total),
    carrots:new THREE.InstancedMesh(new THREE.SphereGeometry(1,12,10),standard,6),
    leaves:new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),standard,12),
    contact:new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(contact),transparent:true,depthWrite:false,toneMapped:false}),total)
  };
  for(const [name,batch] of Object.entries(batches)){batch.name='crowd-'+name;batch.castShadow=!['sticks','plaid','collar','contact'].includes(name);batch.receiveShadow=!['sticks','contact'].includes(name);g.add(batch);}
  const skins=['#e7bfa3','#f0cfb1','#d9b096','#f2d3b9'],shirts=['#334358','#42617a','#3a535c','#55636e','#65535f','#48566f','#728087','#898b8c'],hairs=['#252734','#604232','#463331','#292d38','#544b48'];
  const counter={arms:0,forearms:0,hands:0,legs:0,shoes:0,ears:0,locks:0,plaid:0,hoods:0,yokes:0,hems:0,carrots:0,leaves:0},centers=[],segments=[];
  let personIndex=0;
  const person=new THREE.Matrix4(),local=new THREE.Matrix4(),combined=new THREE.Matrix4(),identity=new THREE.Quaternion(),axis=V(0,1,0);
  function place(batch,index,position,scale,color,rotation=identity){
    batch.userData.personIds??=[];batch.userData.personIds[index]=personIndex;local.compose(V(...position),rotation,V(...scale));combined.multiplyMatrices(person,local);batch.setMatrixAt(index,combined);batch.setColorAt(index,new THREE.Color(color));
  }
  function segment(batch,index,a,b,r,color){
    const start=V(...a),end=V(...b),delta=end.clone().sub(start),mid=start.clone().add(end).multiplyScalar(.5);
    place(batch,index,[mid.x,mid.y,mid.z],[r,delta.length(),r],color,new THREE.Quaternion().setFromUnitVectors(axis,delta.normalize()));
  }
  let seed=5525;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let i=0;i<total;i++){personIndex=i;
    const side=i<30?-1:1,cell=i%30,row=Math.floor(cell/5),col=cell%5;
    const z=4.05+row*.74+(rnd()-.5)*.10,inner=Math.sqrt(Math.max(0,2.75**2-(z-5.8)**2));
    const x=side*(inner+.04+col*.71+(row%2)*.05+rnd()*.05),scale=.76+rnd()*.07;
    const angle=Math.PI+Math.atan2(x,z+.5)*.42+(rnd()-.5)*.13;
    person.compose(V(x,.095,z),new THREE.Quaternion().setFromAxisAngle(axis,angle),V(scale,scale*(.97+rnd()*.06),scale));
    const skinColor=skins[i%skins.length],shirtColor=shirts[(i*3+row)%shirts.length],hairColor=hairs[(i*7)%hairs.length];
    const outfit=(i*7+row*3)%10,plaid=outfit===0,hoodie=outfit===2||outfit===5,jacket=[1,4,8].includes(outfit);
    place(batches.head,i,[0,1.30,0],[.205,.235,.19],skinColor);
    place(batches.hair,i,[0,1.365,-.055],[.219,.235+(i%3)*.012,.197],hairColor);
    for(let k=0;k<4;k++)place(batches.locks,counter.locks++,[-.14+k*.092,1.35,-.177],[.066,.13+(i%3)*.022,.065],hairColor,new THREE.Quaternion().setFromAxisAngle(V(0,0,1),-.14));
    for(const sign of [-1,1])place(batches.ears,counter.ears++,[sign*.20,1.28,0],[.037,.061,.04],skinColor);
    place(batches.neck,i,[0,1.16,0],[1,1,1],skinColor);
    place(batches.torso,i,[0,.91,0],[1,1,1],plaid?'#ece6db':shirtColor);
    place(batches.collar,i,[0,1.135,-.15],[1,1,1],plaid?'#d3d6d2':'#8495a4');
    if(plaid)place(batches.plaid,counter.plaid++,[0,.91,-.163],[1,1,1],'#ffffff',new THREE.Quaternion().setFromAxisAngle(axis,Math.PI));
    if(hoodie)place(batches.hoods,counter.hoods++,[0,1.08,-.16],[.145,.10,.068],shirtColor);
    if(jacket)place(batches.yokes,counter.yokes++,[0,1.04,-.163],[1,1,1],new THREE.Color(shirtColor).multiplyScalar(.72));
    if(hoodie||jacket)place(batches.hems,counter.hems++,[0,.695,0],[1,1,1],new THREE.Color(shirtColor).multiplyScalar(.55));
    place(batches.contact,i,[0,.006,0],[.88,.60,1],'#ffffff',new THREE.Quaternion().setFromAxisAngle(V(1,0,0),-Math.PI/2));
    for(const sign of [-1,1]){
      const holding=sign===(i%2?-1:1),raised=holding||i%4===0;
      const elbow=[sign*.32,raised?1.21:.97,.04],hand=[sign*(.35+(i%3)*.025),raised?1.57+(i%4)*.045:1.12,.13];
      const sleeveColor=plaid?'#d6d3cb':jacket?new THREE.Color(shirtColor).multiplyScalar(.78):shirtColor;
      segment(batches.arms,counter.arms++, [sign*.215,1.09,0],elbow,.071,sleeveColor);
      const wrist=V(...elbow).lerp(V(...hand),hoodie||jacket?.78:.15).toArray();
      segment(batches.arms,counter.arms++,elbow,wrist,.057,sleeveColor);
      segment(batches.forearms,counter.forearms++,wrist,hand,.051,skinColor);
      place(batches.hands,counter.hands++,hand,[.064,.073,.057],skinColor);
      place(batches.legs,counter.legs++,[sign*.11,.38,0],[1,1,1],'#243346');
      place(batches.shoes,counter.shoes++,[sign*.11,.075,.055],[1,1,1],'#182332');
      if(holding){
        const start=[hand[0]+sign*.006,hand[1]+.045,hand[2]],end=[hand[0]+sign*(.045+(i%3)*.035),hand[1]+.48,hand[2]+.015];
        segment(batches.grips,i,hand,start,.035,'#254b70');
        segment(batches.sticks,i,start,end,.028,i%3?'#70dcff':'#a1edff');
        segments.push({personId:i,start:V(...start).applyMatrix4(person).toArray(),end:V(...end).applyMatrix4(person).toArray(),strength:.64+(i%5)*.06});
      }else if(i%10===0){
        place(batches.carrots,counter.carrots++,[hand[0],hand[1]+.15,hand[2]],[.058,.17,.058],'#ed943d');
        for(const branch of [-1,1])place(batches.leaves,counter.leaves++,[hand[0]+branch*.043,hand[1]+.34,hand[2]],[.035,.10,.025],'#4fb064',new THREE.Quaternion().setFromAxisAngle(V(0,0,1),-branch*.5));
      }
    }
    centers.push({x,z});
  }
  for(const name of ['plaid','hoods','yokes','hems'])batches[name].count=counter[name];
  for(const batch of Object.values(batches)){batch.instanceMatrix.needsUpdate=true;batch.instanceColor.needsUpdate=true;batch.computeBoundingBox();batch.computeBoundingSphere();}
  crowdLightHalos(g,segments);g.userData.lightSegments=segments;
  const ground=material('#14263a',.86),edge=material('#29485f',.78);
  for(const side of [-1,1]){
    const points=[[side*6.42,3.56],[side*6.42,8.20]];
    for(let z=8.20;z>=3.55;z-=.155)points.push([side*Math.max(1.5,Math.sqrt(Math.max(0,2.4**2-(z-5.8)**2))),z]);
    const shape=new THREE.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();
    const plinth=mesh(new THREE.ExtrudeGeometry(shape,{depth:.08,bevelEnabled:false,steps:1}),ground,g,0,.083,0);plinth.rotation.x=Math.PI/2;plinth.name=side<0?'left-audience-plinth':'right-audience-plinth';
    rod(g,[side*6.41,.095,3.56],[side*6.41,.095,8.20],.014,edge);
    const spill=new THREE.PointLight('#249dff',4.5,4,2);spill.position.set(side*4.0,1.45,6.1);g.add(spill);
  }
  g.userData.centers=centers;scene.userData.crowdCount=total;
  scene.userData.crowdCircleClearance=Math.min(...centers.map(p=>Math.hypot(p.x,p.z-5.8)-2.05-.35));
  return g;
}
function stageScene(){
  const s=baseScene(true);stars(s,25);const g=new THREE.Group();g.name='stage-structure';g.position.y=.55;s.add(g);
  const floor=material('#070709',.38,.07),fascia=material('#030304',.82,0);
  const mainBody=box(g,0,-.15,0,14.2,.80,5.8,fascia,.035);mainBody.name='main-stage-body';
  box(g,0,.27,0,14.24,.045,5.84,floor,.025);
  const bridge=box(g,0,-.15,3.35,1.52,.80,1.02,fascia,.025);bridge.name='stage-runway';
  box(g,0,.27,3.35,1.55,.045,1.05,floor,.02);
  const front=new THREE.Group();front.name='five-color-front-apron';front.position.set(0,0,5.80);g.add(front);
  const roundBody=mesh(new THREE.CylinderGeometry(2.03,2.03,.80,96),fascia,front,0,-.15,0);roundBody.name='round-stage-body';
  mesh(new THREE.CylinderGeometry(2.05,2.05,.045,96),floor,front,0,.27,0);
  const frontArt=mesh(new THREE.CircleGeometry(2.025,96),artworkMaterial(artwork.apron),front,0,.296,0);frontArt.rotation.x=-Math.PI/2;frontArt.castShadow=false;
  const roundRim=mesh(new THREE.TorusGeometry(2.047,.012,8,100),material('#c8d4dd',.4,.5),front,0,.301,0);roundRim.rotation.x=-Math.PI/2;
  for(let i=0;i<3;i++){const height=.63-i*.21;box(s,0,height/2,7.93+i*.30,1.35,height,.36,fascia,.018);}
  for(const x of [-7.06,7.06])rod(g,[x,.31,-2.85],[x,.31,2.85],.018,emissive('#67a3d7',.7));
  rod(g,[-7.05,.31,2.87],[-.83,.31,2.87],.018,emissive('#6eb4e4',.9));rod(g,[.83,.31,2.87],[7.05,.31,2.87],.018,emissive('#6eb4e4',.9));
  ledScreen(g);truss(g);
  for(let i=0;i<5;i++){const b=ball(i,.73);b.position.set((i-2)*2.48,6.50,-2.1);b.rotation.y=(i-2)*-.035;g.add(b);}
  const people=[['monster',-3.85,.29,.65,.74],['masa',-1.95,.29,.32,.74],['guanyou',0,.73,-1.1,.71],['ashin',1.25,.29,1.18,.79],['stone',3.85,.29,.65,.74]];
  people.forEach(([id,x,y,z,scale])=>{const p=character(id);p.position.set(x,y,z);p.scale.setScalar(scale);p.rotation.y=x<0?.07:-.07;g.add(p);});
  box(g,0,.48,-1.22,2.25,.38,1.62,material('#08090c',.72),.035).name='drum-riser';
  drumKit(g,0,.29,-.68);
  for(const x of [-5.8,5.8]){
    box(g,x,1.18,-1.12,1.0,1.85,.8,black,.06);
    for(const y of [.75,1.55]){const speaker=mesh(new THREE.TorusGeometry(.26,.025,12,36),material('#32455d',.4),g,x,y,-.704);ellipsoid(g,x,y,-.71,.24,.24,.016,material('#172135'));}
  }
  for(const x of [-3.75,-1.6,1.8,3.85]){const monitor=box(g,x,.47,2.25,.75,.33,.55,material('#2d3c52'),.045);monitor.rotation.x=-.25;}
  for(const x of [-6.15,6.15]){
    const tower=new THREE.Group();tower.name=x<0?'left-mayday-tower':'right-mayday-tower';g.add(tower);
    box(tower,x,1.38,.65,1.85,2.20,.48,material('#050507',.76),.035);
    const sign=mesh(new THREE.PlaneGeometry(1.75,1.75),artworkMaterial(artwork.brand),tower,x,1.42,.914);sign.castShadow=false;
    for(const y of [3.13,3.64]){
      box(tower,x,y,.43,.35,.38,.40,black,.035);
      const ring=mesh(new THREE.TorusGeometry(.125,.025,10,24),material('#cba75b',.35,.55),tower,x,y,.65);
      ellipsoid(tower,x,y,.66,.099,.099,.025,emissive('#ffe0a1',1.2));glow(tower,x,y,.7,'#ffd591',.38,.15);
    }
  }
  frontTrussPanels(g);
  for(const side of [-1,1])for(let i=0;i<5;i++){
    const x=side*(1.65+i*1.1);box(g,x,.34,2.62,.22,.12,.19,black,.018);
    ellipsoid(g,x,.41,2.62,.08,.025,.065,emissive(i%2?'#70c3fd':'#b9aaff',1.4));
  }
  audienceBlocks(s);
  const spot=new THREE.PointLight('#bf97ff',35,12,2);spot.position.set(-4,4.3,1);s.add(spot);
  const rim=new THREE.PointLight('#39c0ed',35,13,2);rim.position.set(4,4.5,-1);s.add(rim);
  return {scene:s,target:V(0,3.30,2.25),position:params.get('angle')==='side'?V(15.2,10.7,23.8):V(0,10.7,25.2),fov:35};
}
function ballScene(){
  const s=baseScene();stars(s,12);const b=ball(0);b.position.set(0,2.5,0);b.rotation.y=-.13;s.add(b);
  const ring=mesh(new THREE.TorusGeometry(1.08,.015,12,100),emissive('#4a759d',.32),s,0,.015,0);ring.rotation.x=-Math.PI/2;
  const rim=new THREE.PointLight('#ff7253',6,9,2);rim.position.set(-2.2,3,-2);s.add(rim);
  return {scene:s,target:V(0,2.25,0),position:V(0,3.2,9.5),fov:38};
}
function memberScene(){
  const s=baseScene(false,-3.0),portraits=[];
  const ids=['monster','masa','ashin','guanyou','stone'];
  ids.forEach((id,i)=>{
    const group=new THREE.Group();group.position.x=(i-2)*2.28;s.add(group);portraits.push(group);
    const p=character(id);p.position.set(0,-.08,0);p.rotation.y=(i-2)*-.025;group.add(p);
    box(group,0,-.13,.01,1.72,.26,1.05,material('#1b334c',.65),.035);
    const c=document.createElement('canvas');c.width=512;c.height=160;const d=c.getContext('2d');d.fillStyle='#d7eaf6';d.textAlign='center';d.textBaseline='middle';d.font='500 60px "Microsoft YaHei"';d.fillText(members[id].name,256,65);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
    const label=mesh(new THREE.PlaneGeometry(1.5,.40),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}),group,0,-.13,.59);label.castShadow=false;
  });
  return {scene:s,portraits,target:V(.15,1.80,0),position:V(.15,3.2,16.5),fov:27};
}

export async function createModels(runtimeRenderer){renderer=runtimeRenderer;artwork=await buildStageArtwork();return {stage:stageScene(),ball:index=>ball(index)};}

export {facePatch,faceLine};
