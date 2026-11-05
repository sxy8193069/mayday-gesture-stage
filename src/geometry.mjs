import * as THREE from '../vendor/three.module.js';

const memberNames=new Set(['monster','masa','ashin','guanyou','stone']);
function anchorFor(object,root){
  for(let p=object.parent;p&&p!==root;p=p.parent)if(p.name.endsWith('-head'))return p;
  for(let p=object.parent;p&&p!==root;p=p.parent)if(memberNames.has(p.name))return p;
  return root;
}
function materialKey(mat){
  return [mat.type,mat.color?.getHex(),mat.emissive?.getHex(),mat.emissiveIntensity,mat.roughness,mat.metalness,mat.clearcoat,mat.clearcoatRoughness,mat.map?.uuid,mat.side,mat.toneMapped,mat.depthWrite].join(':');
}
export function batchStatic(root){
  root.updateMatrixWorld(true);
  const groups=new Map(),oldGeometries=new Set();
  root.traverse(object=>{
    if(!object.isMesh||object.isInstancedMesh||object.name==='environment-floor'||Array.isArray(object.material)||object.material.transparent||object.material.isShaderMaterial)return;
    const anchor=anchorFor(object,root),key=[anchor.uuid,materialKey(object.material),object.castShadow,object.receiveShadow].join('/');
    if(!groups.has(key))groups.set(key,{anchor,objects:[],material:object.material});
    groups.get(key).objects.push(object);
  });
  for(const {anchor,objects,material} of groups.values()){
    if(objects.length<2)continue;
    const vertexCount=objects.reduce((n,m)=>n+m.geometry.attributes.position.count,0);
    const indexCount=objects.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count),0);
    const positions=new Float32Array(vertexCount*3),normals=new Float32Array(vertexCount*3),uvs=new Float32Array(vertexCount*2),indices=new Uint32Array(indexCount);
    const inverse=anchor.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3(),p=new THREE.Vector3();
    let vertexOffset=0,indexOffset=0;
    for(const object of objects){
      const geo=object.geometry,{position,normal,uv}=geo.attributes;matrix.multiplyMatrices(inverse,object.matrixWorld);normalMatrix.getNormalMatrix(matrix);
      for(let i=0;i<position.count;i++){
        p.fromBufferAttribute(position,i).applyMatrix4(matrix).toArray(positions,(vertexOffset+i)*3);
        if(normal)p.fromBufferAttribute(normal,i).applyNormalMatrix(normalMatrix).toArray(normals,(vertexOffset+i)*3);
        if(uv){uvs[(vertexOffset+i)*2]=uv.getX(i);uvs[(vertexOffset+i)*2+1]=uv.getY(i);}
      }
      const count=geo.index?.count??position.count;
      for(let i=0;i<count;i++)indices[indexOffset+i]=vertexOffset+(geo.index?geo.index.getX(i):i);
      indexOffset+=count;vertexOffset+=position.count;
      oldGeometries.add(geo);object.removeFromParent();
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.BufferAttribute(normals,3));geo.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geo.setIndex(new THREE.BufferAttribute(indices,1));geo.computeBoundingSphere();
    const merged=new THREE.Mesh(geo,material);merged.castShadow=objects[0].castShadow;merged.receiveShadow=objects[0].receiveShadow;merged.name='batched-'+anchor.name;anchor.add(merged);
  }
  const retained=new Set();root.traverse(o=>{if(o.geometry)retained.add(o.geometry);});
  for(const geo of oldGeometries)if(!retained.has(geo))geo.dispose();
}

const triangleCache=new WeakMap(),textureCache=new WeakMap();
function triangleTable(geo){
  if(triangleCache.has(geo))return triangleCache.get(geo);
  const p=geo.attributes.position,idx=geo.index,count=Math.floor((idx?.count??p.count)/3),prefix=new Float64Array(count);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();let total=0;
  for(let i=0;i<count;i++){
    a.fromBufferAttribute(p,idx?idx.getX(i*3):i*3);b.fromBufferAttribute(p,idx?idx.getX(i*3+1):i*3+1);c.fromBufferAttribute(p,idx?idx.getX(i*3+2):i*3+2);
    total+=b.sub(a).cross(c.sub(a)).length()*.5;prefix[i]=total;
  }
  const table={prefix,total};triangleCache.set(geo,table);return table;
}
function lowerBound(values,value){let lo=0,hi=values.length-1;while(lo<hi){const m=(lo+hi)>>1;if(values[m]<value)lo=m+1;else hi=m;}return lo;}
function texturePixels(map){
  if(!map?.image)return null;
  if(!textureCache.has(map)){
    const canvas=document.createElement('canvas'),img=map.image;canvas.width=img.width;canvas.height=img.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
    textureCache.set(map,{data:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height});
  }
  return textureCache.get(map);
}
export function sampleSurface(root,count,seed=5525){
  root.updateMatrixWorld(true);
  const surfaces=[],weights=[];let total=0;
  const instance=new THREE.Matrix4(),matrix=new THREE.Matrix4(),scale=new THREE.Vector3(),position=new THREE.Vector3(),quaternion=new THREE.Quaternion();
  root.traverse(object=>{
    if(!object.isMesh||object.name==='environment-floor'||Array.isArray(object.material)||object.material.transparent||(object.material.isShaderMaterial&&!object.userData.particleSurface))return;
    const table=triangleTable(object.geometry);if(table.total<=0)return;
    const copies=object.isInstancedMesh?object.count:1;
    for(let i=0;i<copies;i++){
      if(object.isInstancedMesh){object.getMatrixAt(i,instance);matrix.multiplyMatrices(object.matrixWorld,instance);}else matrix.copy(object.matrixWorld);
      matrix.decompose(position,quaternion,scale);
      const area=table.total*(Math.abs(scale.x*scale.y)+Math.abs(scale.y*scale.z)+Math.abs(scale.x*scale.z))/3;
      if(area<1e-9)continue;
      const color=(object.userData.particleColor??object.material.color)?.clone()??new THREE.Color('#8bbdff');
      if(object.isInstancedMesh&&object.instanceColor){const tint=new THREE.Color();object.getColorAt(i,tint);color.multiply(tint);}
      total+=area;weights.push(total);surfaces.push({object,table,matrix:matrix.clone(),color});
    }
  });
  if(!surfaces.length)throw new Error('三维模型中没有可采样的表面');
  const positions=new Float32Array(count*3),colors=new Float32Array(count*3),delays=new Float32Array(count);
  const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),uv=new THREE.Vector2(),tint=new THREE.Color();
  for(let i=0;i<count;i++){
    const surface=surfaces[lowerBound(weights,rnd()*total)],{geometry,material}=surface.object,idx=geometry.index,p=geometry.attributes.position;
    const tri=lowerBound(surface.table.prefix,rnd()*surface.table.total),ids=[0,1,2].map(k=>idx?idx.getX(tri*3+k):tri*3+k);
    const r=Math.sqrt(rnd()),s=rnd(),bary=[1-r,r*(1-s),r*s];
    a.fromBufferAttribute(p,ids[0]).multiplyScalar(bary[0]);b.fromBufferAttribute(p,ids[1]).multiplyScalar(bary[1]);c.fromBufferAttribute(p,ids[2]).multiplyScalar(bary[2]);
    a.add(b).add(c).applyMatrix4(surface.matrix).toArray(positions,i*3);tint.copy(surface.color);
    const image=texturePixels(material.map),uvs=geometry.attributes.uv;
    if(image&&uvs){
      uv.set(0,0);for(let k=0;k<3;k++){uv.x+=uvs.getX(ids[k])*bary[k];uv.y+=uvs.getY(ids[k])*bary[k];}
      const x=Math.min(image.width-1,Math.max(0,Math.floor(uv.x*image.width))),y=Math.min(image.height-1,Math.max(0,Math.floor((1-uv.y)*image.height))),pixel=(y*image.width+x)*4;
      tint.multiply(new THREE.Color(image.data[pixel]/255,image.data[pixel+1]/255,image.data[pixel+2]/255).convertSRGBToLinear());
    }
    if(Math.max(tint.r,tint.g,tint.b)<.055)tint.lerp(new THREE.Color('#77a7d2'),.52);
    tint.toArray(colors,i*3);delays[i]=Math.max(0,Math.min(1,(a.y-.4)/8))*.4+rnd()*.12;
  }
  return {positions,colors,delays};
}

export function installReveal(root,reveal){
  const clones=new Map(),sprites=[];
  const decorate=(material)=>{
    material.onBeforeCompile=shader=>{
      shader.uniforms.uEntityReveal=reveal;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRevealWorld;').replace('#include <project_vertex>',`#include <project_vertex>
        vec4 revealPosition=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          revealPosition=instanceMatrix*revealPosition;
        #endif
        vRevealWorld=(modelMatrix*revealPosition).xyz;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uEntityReveal;varying vec3 vRevealWorld;').replace('void main() {',`void main() {
        float revealDelay=clamp((vRevealWorld.y-1.0)/7.0,0.0,1.0)*0.18;
        float revealAmount=clamp((uEntityReveal-revealDelay)/0.82,0.0,1.0);
        vec3 cell=floor(vRevealWorld*31.0);
        float threshold=fract(sin(dot(cell,vec3(12.9898,78.233,43.121)))*43758.5453);
        if(revealAmount<=threshold)discard;`);
    };
    material.customProgramCacheKey=()=> 'spatial-reveal-1';return material;
  };
  root.traverse(object=>{
    if(object.isSprite){sprites.push({object,opacity:object.material.opacity});return;}
    if((!object.isMesh&&!object.isLine)||object.name==='environment-floor')return;
    if(object.material.isShaderMaterial){
      const mat=object.material;mat.uniforms.uEntityReveal=reveal;
      if(mat.userData.spatialReveal)return;
      mat.fragmentShader='uniform float uEntityReveal;\n'+mat.fragmentShader.replace('#include <colorspace_fragment>','gl_FragColor.a*=uEntityReveal;\n#include <colorspace_fragment>');return;
    }
    const source=object.material;
    if(!clones.has(source))clones.set(source,decorate(source.clone()));object.material=clones.get(source);
    if(object.isMesh)object.customDepthMaterial=decorate(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}));
  });
  return ()=>{for(const {object,opacity} of sprites)object.material.opacity=opacity*reveal.value;};
}
