import {createScene} from './scene.mjs';

const loading=document.querySelector('#scene-loading'),message=document.querySelector('#loading-message');
let scene;
try{
  scene=await createScene({reduced:matchMedia('(prefers-reduced-motion: reduce)').matches});
  window.MaydayScene=function(){return scene;};
  const script=document.createElement('script');script.src=new URL('./runtime.js',import.meta.url).href;
  await new Promise((resolve,reject)=>{script.onload=()=>document.body.dataset.ready==='true'?resolve():reject(new Error('互动初始化未完成'));script.onerror=()=>reject(new Error('互动脚本未能加载'));document.body.appendChild(script);});
  loading.hidden=true;
}catch(error){
  scene?.dispose();
  document.body.dataset.ready='error';message.textContent='三维画面未能加载。请确认本地预览服务已开启，并使用新版 Edge 或 Chrome。'+(error.message?' '+error.message:'');
  const retry=document.createElement('button');retry.type='button';retry.textContent='重新加载';retry.addEventListener('click',()=>location.reload());message.after(retry);
  console.error(error);
}
