var MaydayMotion = (() => {
  'use strict';
  function sample(start, velocity, target, arc, t, duration, offset = 0, out = new Float64Array(6)) {
    t = Math.max(0, Math.min(1, t));
    const t2 = t*t, t3 = t2*t;
    const h0 = 2*t3-3*t2+1, hv = t3-2*t2+t, h1 = -2*t3+3*t2;
    const arcAmount = 16*t2*(1-t)*(1-t);
    const d0 = (6*t2-6*t)/duration, dv = 3*t2-4*t+1, d1 = (-6*t2+6*t)/duration;
    const da = 32*t*(1-t)*(1-2*t)/duration;
    for(let axis=0;axis<3;axis++) {
      const k=offset+axis;
      out[axis]=h0*start[k]+hv*duration*velocity[k]+h1*target[k]+arcAmount*arc[k];
      out[axis+3]=d0*start[k]+dv*velocity[k]+d1*target[k]+da*arc[k];
    }
    return out;
  }
  return {sample};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=MaydayMotion;
