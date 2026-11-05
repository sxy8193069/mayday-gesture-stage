// CPU 在转场切换时采样与顶点着色器相同的流场，保留当前位置及速度。
export const flowGLSL=`
vec3 starFlow(vec3 base,float seed,float time,vec3 palm){
  float phase=seed*6.2831853;
  vec3 drift=vec3(.48*sin(phase+time*.22)+.16*sin(base.y*.22+time*.16),
    .32*cos(phase*.81+time*.19)+.12*sin(base.x*.19-time*.12),.32*sin(phase*.67+time*.16));
  vec2 delta=base.xy-palm.xy;float distance=sqrt(dot(delta,delta)+.25);
  float influence=exp(-dot(delta,delta)*.14-pow(base.z-2.25,2.)*.012)*palm.z;
  float wave=distance*2.2-time*2.1+phase*.12;
  drift.xy+=(delta/distance*sin(wave)*.48+vec2(-delta.y,delta.x)/distance*.38)*influence;
  drift.z+=cos(wave)*.24*influence;
  return drift;
}`;

function displacement(base,seed,time,x,y,strength,out,offset=0){
 const phase=seed*6.2831853,dx=base[0]-x,dy=base[1]-y,distance=Math.sqrt(dx*dx+dy*dy+.25);
 const influence=Math.exp(-(dx*dx+dy*dy)*.14-(base[2]-2.25)**2*.012)*strength;
 const wave=distance*2.2-time*2.1+phase*.12;
 out[offset]=.48*Math.sin(phase+time*.22)+.16*Math.sin(base[1]*.22+time*.16)+(dx/distance*Math.sin(wave)*.48-dy/distance*.38)*influence;
 out[offset+1]=.32*Math.cos(phase*.81+time*.19)+.12*Math.sin(base[0]*.19-time*.12)+(dy/distance*Math.sin(wave)*.48+dx/distance*.38)*influence;
 out[offset+2]=.32*Math.sin(phase*.67+time*.16)+Math.cos(wave)*.24*influence;
}
const before=new Float64Array(3),after=new Float64Array(3);
export function sampleFlow(base,seed,time,palm,out=new Float64Array(6)){
 const {x=0,y=3.3,strength=0,vx=0,vy=0,vs=0}=palm,h=.001;
 displacement(base,seed,time,x,y,strength,out);
 displacement(base,seed,time-h,x-vx*h,y-vy*h,strength-vs*h,before);
 displacement(base,seed,time+h,x+vx*h,y+vy*h,strength+vs*h,after);
 for(let i=0;i<3;i++)out[i+3]=(after[i]-before[i])/(2*h);
 return out;
}
