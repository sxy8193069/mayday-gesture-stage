var MaydayCore = (() => {
  'use strict';

  const members = [
    { name: '怪兽', role: '吉他手', color: '#f25555', face: 'red' },
    { name: '玛莎', role: '贝斯手', color: '#ffd35c', face: 'yellow' },
    { name: '阿信', role: '主唱', color: '#f89ac2', face: 'pink' },
    { name: '冠佑', role: '鼓手', color: '#69b9f4', face: 'blue' },
    { name: '石头', role: '吉他手', color: '#77d49b', face: 'green' }
  ];

  function createController() {
    const state = { mode: 'stars', index: -1, nextIndex: 0, revision: 0 };
    function dispatch(action) {
      if (action === 'reset') {
        Object.assign(state, { mode: 'stars', index: -1, nextIndex: 0 });
      } else if (action === 'stage' && state.mode !== 'stage') {
        state.mode = 'stage';
      } else if (action === 'gather' && state.mode === 'stars') {
        state.mode = 'ball';
        state.index = state.nextIndex;
        state.nextIndex = (state.nextIndex + 1) % members.length;
      } else if (action === 'scatter' && (state.mode === 'ball' || state.mode === 'stage')) {
        state.mode = 'stars';
        state.index = -1;
      } else {
        return false;
      }
      state.revision++;
      return true;
    }
    return { state, dispatch };
  }

  function createGestureGate(controller) {
    let lastNow, leftHold, rightHold, fistAllowed, okLatched, twoLatched;
    let stageExitArmed, stageRevision;
    function reset() {
      lastNow = -Infinity;
      leftHold = null;
      rightHold = null;
      fistAllowed = true;
      okLatched = false;
      twoLatched = false;
      stageExitArmed = false;
      stageRevision = -1;
    }
    function sample(previous, pose, now) {
      if (!pose) return null;
      return previous && previous.pose === pose
        ? { pose, since: previous.since, count: previous.count + 1 }
        : { pose, since: now, count: 1 };
    }
    function ready(hold, duration, now) {
      return hold && hold.count >= 3 && now - hold.since >= duration;
    }
    function update(leftPose, rightPose, now) {
      if (!Number.isFinite(now) || now < lastNow) return null;
      if (now - lastNow > 240) {
        leftHold = null;
        rightHold = null;
      }
      lastNow = now;
      if (controller.state.mode === 'stage' && stageRevision !== controller.state.revision) {
        stageRevision = controller.state.revision;
        stageExitArmed = false;
        leftHold = null;
      } else if (controller.state.mode !== 'stage') {
        stageExitArmed = false;
      }
      rightHold = sample(rightHold, rightPose === 'ok' || rightPose === 'two' ? rightPose : null, now);
      // 丢手只中断确认；看见明确的其他手型才解除相应指令锁存。
      if (rightPose === 'other' || rightPose === 'two') okLatched = false;
      if (rightPose === 'other' || rightPose === 'ok') twoLatched = false;
      if (rightPose === 'ok') {
        if (!okLatched && ready(rightHold, 220, now)) {
          okLatched = true;
          if (controller.dispatch('stage')) {
            stageRevision = controller.state.revision;
            stageExitArmed = false;
            leftHold = null;
            return 'stage';
          }
        }
        if (controller.state.mode !== 'stage') {
          leftHold = null;
          return null;
        }
      }
      let celebrate = false;
      if (rightPose === 'two' && !twoLatched && ready(rightHold, 220, now)) {
        twoLatched = true;
        celebrate = controller.state.mode === 'stage';
      }
      leftHold = sample(leftHold, leftPose === 'fist' || leftPose === 'open' ? leftPose : null, now);
      if (leftPose === 'fist' && ready(leftHold, 180, now)) {
        if (controller.state.mode === 'stage') {
          stageExitArmed = true;
          fistAllowed = false;
        } else if (fistAllowed) {
          fistAllowed = false;
          if (controller.dispatch('gather')) return 'gather';
        }
      }
      if (leftPose === 'open' && ready(leftHold, 140, now)) {
        fistAllowed = true;
        // 舞台中的持续张手不视为退出；需先完成一次稳定握拳。
        if (controller.state.mode !== 'stage' || stageExitArmed) {
          if (controller.dispatch('scatter')) {
            stageExitArmed = false;
            return 'scatter';
          }
        }
      }
      return celebrate ? 'celebrate' : null;
    }
    reset();
    return { update, reset };
  }

  function validPoints(points) {
    return Array.isArray(points) && points.length === 21 && points.every(p =>
      p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
      (p.z === undefined || Number.isFinite(p.z)));
  }

  function classifyHand(points, aspect = 4 / 3) {
    if (!validPoints(points) || !Number.isFinite(aspect) || aspect <= 0) return null;
    const p = points.map(point => ({ x: point.x * aspect, y: point.y }));
    const distance = (a, b) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);
    const width = distance(5, 17);
    if (width <= 1e-8) return null;
    const bases = [5, 9, 13, 17];
    const extended = bases.map(base => distance(base + 3, base) > width * .55 &&
      distance(base + 3, 0) > distance(base + 1, 0) * 1.12);
    const folded = bases.map(base => distance(base + 3, base) < width * .55 &&
      distance(base + 3, 0) < distance(base + 1, 0) * 1.1);
    const ok = distance(4, 8) < width * .28 && extended.slice(1).every(Boolean);
    const two = extended[0] && extended[1] && folded[2] && folded[3];
    const center = { x: 0, y: 0 };
    for (const index of [0, 5, 9, 13, 17]) {
      center.x += points[index].x / 5;
      center.y += points[index].y / 5;
    }
    return {
      left: folded.every(Boolean) ? 'fist' : extended.every(Boolean) ? 'open' : 'other',
      right: ok ? 'ok' : two ? 'two' : 'other',
      center
    };
  }

  function assignRoles(detected, previousRoles) {
    const records = Array.isArray(detected) ? detected : [];
    const counts = new Map();
    for (const record of records) {
      if (record) counts.set(record.label, (counts.get(record.label) || 0) + 1);
    }
    const valid = records.filter(record => record &&
      (record.label === 'Left' || record.label === 'Right') && counts.get(record.label) === 1 &&
      Number.isFinite(record.confidence) && record.confidence >= .65 &&
      classifyHand(record.points));
    let roles = previousRoles && previousRoles.left !== previousRoles.right &&
      ['Left', 'Right'].includes(previousRoles.left) && ['Left', 'Right'].includes(previousRoles.right)
      ? { left: previousRoles.left, right: previousRoles.right } : null;
    if (!roles && valid.length === 2) {
      const centers = valid.map(record => classifyHand(record.points).center.x);
      if (Math.abs(centers[0] - centers[1]) > .16) {
        const leftIndex = centers[0] > centers[1] ? 0 : 1;
        roles = { left: valid[leftIndex].label, right: valid[1 - leftIndex].label };
      }
    }
    return {
      roles,
      left: roles ? valid.find(record => record.label === roles.left) || null : null,
      right: roles ? valid.find(record => record.label === roles.right) || null : null
    };
  }

  // 连续位置可使用身份和空间均连续的较低置信度样本，离散手势仍走严格确认。
  function createPointerTracker(){
    let previous=null,lastNow=-Infinity;
    const stats={strict:0,continuous:0,missing:0,rejected:0};
    const center=record=>classifyHand(record.points)?.center;
    return {
      stats,
      reset(){previous=null;lastNow=-Infinity;for(const key of Object.keys(stats))stats[key]=0;},
      update(detected,matched,now){
        if(!Number.isFinite(now)||now<lastNow)return null;lastNow=now;
        let candidate=matched.right;
        const age=previous?(now-previous.time)/1000:Infinity;
        if(!candidate&&previous&&age<.35){
          const options=detected.filter(r=>r.label===previous.label&&Number.isFinite(r.confidence)&&r.confidence>=.4&&center(r));
          if(options.length===1){
            const point=center(options[0]),distance=Math.hypot(point.x-previous.x,point.y-previous.y);
            const other=matched.left&&center(matched.left);
            if(distance<Math.min(.22,.10+age*.6)&&(!other||Math.hypot(point.x-other.x,point.y-other.y)>.10))candidate=options[0];
          }
        }
        if(!candidate){stats.missing++;return null;}
        const point=center(candidate);
        if(!point){stats.rejected++;return null;}
        const other=matched.left&&center(matched.left);
        if(previous&&age<.35&&other&&Math.hypot(point.x-previous.x,point.y-previous.y)>.28&&Math.hypot(other.x-previous.x,other.y-previous.y)<.12){stats.rejected++;return null;}
        stats[candidate===matched.right?'strict':'continuous']++;
        previous={...point,label:candidate.label,time:now};return candidate;
      }
    };
  }

  return { members, createController, createGestureGate, classifyHand, assignRoles, createPointerTracker };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MaydayCore;
