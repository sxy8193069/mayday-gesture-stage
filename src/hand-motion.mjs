const limit=(n,range=1)=>Math.max(-range,Math.min(range,n));

// 识别结果按摄像头时间送入，渲染帧连续推进位置、速度和显现强度。
function createTrack(returnToCenter,omega=22,grace=180,expiry=.35){
  const state={x:0,y:0,vx:0,vy:0,strength:0,vs:0};
  let sampleX=0,sampleY=0,speedX=0,speedY=0,lastSeen=-Infinity,lastActive=-Infinity,inactiveSince=null,observed=false,active=false;
  function push(point,enabled,now){
    observed=Boolean(point&&Number.isFinite(point.x)&&Number.isFinite(point.y));active=observed&&enabled;
    if(active)inactiveSince=null;else if(inactiveSince===null)inactiveSince=now;
    if(!observed)return;
    const x=limit(point.x),y=limit(point.y),gap=(now-lastSeen)/1000;
    if(gap>0&&gap<=.35){
      const blend=1-Math.exp(-gap/.08);
      speedX+=(limit((x-sampleX)/gap,2)-speedX)*blend;
      speedY+=(limit((y-sampleY)/gap,2)-speedY)*blend;
    }else speedX=speedY=0;
    sampleX=x;sampleY=y;lastSeen=now;if(active)lastActive=now;
  }
  function spring(position,velocity,target,dt){
    const offset=state[position]-target,term=state[velocity]+omega*offset,decay=Math.exp(-omega*dt);
    state[position]=target+(offset+term*dt)*decay;
    state[velocity]=(state[velocity]-omega*term*dt)*decay;
  }
  return {
    state,push,
    clear(){observed=active=false;lastSeen=lastActive=-Infinity;inactiveSince=null;speedX=speedY=0;},
    update(now,dt){
      const age=Math.max(0,(now-lastSeen)/1000),fresh=age<=expiry;
      const enabled=fresh&&(active||Number.isFinite(lastActive)&&inactiveSince!==null&&now-inactiveSince<=grace);
      const prediction=observed&&fresh?Math.min(age,.07):0;
      const center=returnToCenter&&!enabled;
      spring('x','vx',center?0:limit(sampleX+speedX*prediction),dt);
      spring('y','vy',center?0:limit(sampleY+speedY*prediction),dt);
      spring('strength','vs',enabled?1:0,dt);
      state.tracked=enabled;
      return state;
    }
  };
}

export function createHandMotion(){
  const left=createTrack(false),right=createTrack(true,42,280,.45);
  let lastInput=-Infinity,lastRight=-Infinity,anchor=null,movementPoint=null,bodyVX=0,bodyVY=0;
  right.state.bodyX=right.state.bodyY=0;
  right.state.movementId=0;
  function updateBody(axis,velocity,target,dt){
    const offset=right.state[axis]-target,term=velocity+14*offset,decay=Math.exp(-14*dt);
    right.state[axis]=target+(offset+term*dt)*decay;
    return (velocity-14*term*dt)*decay;
  }
  return {
    push(input,now){
      if(!Number.isFinite(now)||now<lastInput)return;
      lastInput=now;
      if(!input){left.clear();right.clear();anchor=movementPoint=null;lastRight=-Infinity;return;}
      left.push(input.left,Boolean(input.left?.open),now);
      const point=input.right;
      if(point&&Number.isFinite(point.x)&&Number.isFinite(point.y)){
        if(!anchor||now-lastRight>700)anchor={x:point.x,y:point.y};
        // 只用连续采集的真实位移重新允许回应，排除丢手后的回正动画。
        if(!movementPoint||now-lastRight>350)movementPoint={x:point.x,y:point.y};
        else if(Math.hypot(point.x-movementPoint.x,point.y-movementPoint.y)>.018){
          right.state.movementId++;movementPoint={x:point.x,y:point.y};
        }
        right.push({x:limit((point.x-anchor.x)*3.8),y:limit((point.y-anchor.y)*3.4)},true,now);lastRight=now;
      }else right.push(null,false,now);
    },
    update(now,dt){
      const l=left.update(now,dt),r=right.update(now,dt);
      bodyVX=updateBody('bodyX',bodyVX,r.x,dt);bodyVY=updateBody('bodyY',bodyVY,r.y,dt);
      return {left:l,right:r};
    }
  };
}
