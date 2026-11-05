const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.js');
const { numberHand } = require('./fixtures/hand-fixtures.cjs');

function okHand() {
  const h = numberHand('open');
  h.points[6] = { x: .65, y: .43, z: 0 };
  h.points[7] = { x: .61, y: .46, z: 0 };
  h.points[8] = { ...h.points[4] };
  return h;
}
function hold(g, left, right, times) {
  return times.map(t => g.update(left, right, t));
}

test('初始状态与稳定引用，复位也推进版本', () => {
  const c = core.createController(); const state = c.state;
  assert.deepEqual(state, { mode: 'stars', index: -1, nextIndex: 0, revision: 0 });
  assert.equal(c.dispatch('scatter'), false);
  assert.equal(c.dispatch('unknown'), false);
  assert.equal(c.dispatch('reset'), true);
  assert.equal(c.state, state); assert.equal(state.revision, 1);
});
test('握拳松手按五位成员循环且持续聚合不推进', () => {
  const c = core.createController(); const names = [];
  for (let i = 0; i < 7; i++) {
    assert.equal(c.dispatch('gather'), true);
    names.push(core.members[c.state.index].name);
    assert.equal(c.dispatch('gather'), false);
    assert.equal(c.dispatch('scatter'), true);
  }
  assert.deepEqual(names, ['怪兽', '玛莎', '阿信', '冠佑', '石头', '怪兽', '玛莎']);
  assert.deepEqual(core.members.map(m => m.face), ['red', 'yellow', 'pink', 'blue', 'green']);
  assert.ok(core.members.every(m => /^#[\da-f]{6}$/i.test(m.color)));
});
test('星空和小球均可进入舞台，重复舞台指令不推进版本', () => {
  for (const startWithBall of [false, true]) {
    const c = core.createController();
    if (startWithBall) c.dispatch('gather');
    assert.equal(c.dispatch('stage'), true);
    const revision = c.state.revision;
    assert.equal(c.dispatch('stage'), false);
    assert.equal(c.dispatch('gather'), false);
    assert.equal(c.state.mode, 'stage');
    assert.equal(c.state.revision, revision);
  }
});
test('舞台散回星空后按原顺序聚合下一位成员', () => {
  const c = core.createController();
  c.dispatch('gather'); c.dispatch('stage');
  assert.equal(c.dispatch('scatter'), true);
  assert.deepEqual(c.state, { mode: 'stars', index: -1, nextIndex: 1, revision: 3 });
  assert.equal(c.dispatch('gather'), true);
  assert.deepEqual(c.state, { mode: 'ball', index: 1, nextIndex: 2, revision: 4 });
});
test('转场中可立即接受反向指令，无动画锁定', () => {
  const c = core.createController();
  assert.equal(c.dispatch('stage'), true);
  assert.equal(c.dispatch('scatter'), true);
  assert.equal(c.dispatch('gather'), true);
  assert.equal(c.dispatch('stage'), true);
  assert.equal(c.dispatch('scatter'), true);
  assert.deepEqual(c.state, { mode: 'stars', index: -1, nextIndex: 1, revision: 5 });
});
test('首次握拳需180毫秒与三个样本', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  assert.deepEqual(hold(g, 'fist', null, [0, 180]), [null, null]);
  assert.equal(g.update('fist', null, 181), 'gather');
  assert.equal(c.state.mode, 'ball');
});
test('持续握拳只触发一次', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  hold(g, 'fist', null, [0, 90, 180]);
  assert.deepEqual(hold(g, 'fist', null, [240, 400, 600]), [null, null, null]);
  assert.equal(c.state.revision, 1);
});
test('确认张手后可再次握拳', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  hold(g, 'fist', null, [0, 90, 180]);
  assert.deepEqual(hold(g, 'open', null, [200, 270, 340]), [null, null, 'scatter']);
  assert.deepEqual(hold(g, 'fist', null, [360, 450, 540]), [null, null, 'gather']);
  assert.equal(c.state.index, 1);
});
test('张手不足140毫秒或三个样本不会散开或重新允许握拳', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  hold(g, 'fist', null, [0, 90, 180]);
  assert.deepEqual(hold(g, 'open', null, [200, 339]), [null, null]);
  c.dispatch('scatter');
  assert.deepEqual(hold(g, 'fist', null, [350, 440, 530]), [null, null, null]);
  assert.equal(c.state.mode, 'stars');
});
for (const pose of [null, 'other']) test(`${pose}中断确认但不会重新允许拳`, () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  hold(g, 'fist', null, [0, 90, 180]);
  g.update(pose, null, 200); c.dispatch('scatter');
  assert.deepEqual(hold(g, 'fist', null, [220, 310, 400]), [null, null, null]);
  assert.equal(c.state.mode, 'stars');
});
test('未知手型中断未完成保持', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  hold(g, 'fist', null, [0, 90]); g.update('other', null, 100);
  assert.deepEqual(hold(g, 'fist', null, [180, 270, 360]), [null, null, 'gather']);
});
test('超过240毫秒的间隔重新确认', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  assert.deepEqual(hold(g, 'fist', null, [0, 90, 400, 490, 580]), [null, null, null, null, 'gather']);
});
test('无效及倒序时刻不会累积样本', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  g.update('fist', null, 100);
  for (const t of [NaN, Infinity, 99]) assert.equal(g.update('fist', null, t), null);
  assert.equal(g.update('fist', null, 280), null);
  assert.equal(g.update('fist', null, 281), 'gather');
});
test('右OK确认时优先，持续OK不重复也不被左张手取消', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  g.update('other', 'ok', 0); g.update('fist', 'ok', 40); g.update('fist', 'ok', 100);
  assert.equal(g.update('fist', 'ok', 220), 'stage');
  assert.equal(c.state.mode, 'stage'); assert.equal(c.state.revision, 1);
  assert.deepEqual(hold(g, 'open', 'ok', [300, 400, 500]), [null, null, null]);
  assert.equal(c.state.mode, 'stage'); assert.equal(c.state.revision, 1);
});
test('同时开始确认时右OK优先于左拳，不先生成小球', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  assert.deepEqual(hold(g, 'fist', 'ok', [0, 90, 180, 220]), [null, null, null, 'stage']);
  assert.deepEqual(c.state, { mode: 'stage', index: -1, nextIndex: 0, revision: 1 });
});

test('舞台退出需先确认左拳，再确认张手140毫秒与三个样本', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  hold(g, 'open', 'ok', [0, 110, 220, 300, 400]);
  assert.deepEqual(hold(g, 'fist', 'other', [420, 510, 600]), [null, null, null]);
  assert.deepEqual(hold(g, 'open', 'other', [620, 690, 759]), [null, null, null]);
  assert.equal(g.update('open', 'other', 760), 'scatter');
  assert.deepEqual(c.state, { mode: 'stars', index: -1, nextIndex: 0, revision: 2 });
});


test('舞台退出后稳定握拳聚合下一位，持续握拳不重复', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  hold(g, 'fist', null, [0, 90, 180]);
  hold(g, 'other', 'ok', [200, 310, 420]);
  hold(g, 'fist', 'other', [440, 530, 620]);
  assert.deepEqual(hold(g, 'open', 'other', [640, 710, 780]), [null, null, 'scatter']);
  assert.deepEqual(hold(g, 'fist', 'other', [800, 890, 980, 1100]), [null, null, 'gather', null]);
  assert.deepEqual(c.state, { mode: 'ball', index: 1, nextIndex: 2, revision: 4 });
});

test('舞台外部散开后持续OK不会再次进入舞台', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  hold(g, null, 'ok', [0, 110, 220]);
  c.dispatch('reset');
  assert.deepEqual(hold(g, 'open', 'ok', [300, 410, 520, 900, 1010, 1120]), [null, null, null, null, null, null]);
  assert.equal(c.state.mode, 'stars');
  assert.equal(c.state.revision, 2);
});

test('右手离开画面时持续张开的左手不会退出舞台', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  hold(g, 'open', 'ok', [0, 110, 220]);
  assert.deepEqual(hold(g, 'open', null, [300, 370, 440, 650]), [null, null, null, null]);
  assert.equal(c.state.mode, 'stage');
  assert.deepEqual(hold(g, 'open', 'ok', [700, 810, 920]), [null, null, null]);
  assert.equal(c.state.mode, 'stage'); assert.equal(c.state.revision, 1);
});

test('丢失右手不解除OK锁存，单纯丢手不退出舞台', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  hold(g, null, 'ok', [0, 110, 220]);
  assert.deepEqual(hold(g, null, null, [300, 600, 900]), [null, null, null]);
  assert.equal(c.state.mode, 'stage'); assert.equal(c.state.revision, 1);
  c.dispatch('scatter');
  assert.deepEqual(hold(g, null, 'ok', [1000, 1110, 1220]), [null, null, null]);
  assert.equal(c.state.mode, 'stars'); assert.equal(c.state.revision, 2);
});

test('主动退出舞台并明确松开右手后可重新确认OK', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  hold(g, 'open', 'ok', [0, 110, 220]);
  hold(g, 'fist', 'other', [240, 330, 420]);
  assert.equal(hold(g, 'open', 'other', [440, 510, 580]).at(-1), 'scatter');
  assert.deepEqual(hold(g, null, 'ok', [600, 710, 820]), [null, null, 'stage']);
  assert.equal(c.state.mode, 'stage'); assert.equal(c.state.revision, 3);
});

test('丢手中断未完成的OK确认，恢复后需重新稳定', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  hold(g, null, 'ok', [0, 110]); g.update(null, null, 200);
  assert.deepEqual(hold(g, null, 'ok', [220, 330, 439]), [null, null, null]);
  assert.equal(g.update(null, 'ok', 440), 'stage');
});
test('左右手丢失保留小球与舞台状态且不重新允许握拳', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  hold(g, 'fist', null, [0, 90, 180]);
  assert.deepEqual(hold(g, null, null, [300, 600, 900]), [null, null, null]);
  assert.deepEqual(c.state, { mode: 'ball', index: 0, nextIndex: 1, revision: 1 });
  c.dispatch('stage');
  assert.deepEqual(hold(g, null, null, [1000, 1100, 1200]), [null, null, null]);
  assert.equal(c.state.mode, 'stage');
  c.dispatch('scatter');
  assert.deepEqual(hold(g, 'fist', null, [1220, 1310, 1400]), [null, null, null]);
  assert.equal(c.state.mode, 'stars');
});

test('按钮进入舞台后也需要左手先收拢再张开才能退出', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  c.dispatch('stage');
  assert.deepEqual(hold(g, 'open', null, [0, 70, 140]), [null, null, null]);
  hold(g, 'fist', null, [160, 250, 340]);
  assert.deepEqual(hold(g, 'open', null, [360, 430, 500]), [null, null, 'scatter']);
  assert.equal(c.state.mode, 'stars');
});

test('右OK需220毫秒且三样本，重置恢复首次握拳', () => {
  const c = core.createController(); const g = core.createGestureGate(c);
  assert.deepEqual(hold(g, null, 'ok', [0, 220, 221]), [null, null, 'stage']);
  c.dispatch('reset'); g.reset();
  assert.deepEqual(hold(g, 'fist', null, [0, 90, 180]), [null, null, 'gather']);
});
test('真实关键点区分拳、张手和普通伸指', () => {
  assert.equal(core.classifyHand(numberHand(0).points).left, 'fist');
  assert.equal(core.classifyHand(numberHand('open').points).left, 'open');
  assert.equal(core.classifyHand(numberHand(1).points).left, 'other');
  assert.equal(core.classifyHand(numberHand(0).points).right, 'other');
});
test('旋转缩放后保持拳与张手分类', () => {
  for (const angle of [45, 90, 180, 275]) for (const scale of [.35, 1.8]) {
    assert.equal(core.classifyHand(numberHand(0, .5, { angle, scale }).points).left, 'fist');
    assert.equal(core.classifyHand(numberHand('open', .5, { angle, scale }).points).left, 'open');
  }
});
test('OK必须捏合且后三指展开，普通捏合不能进入舞台', () => {
  const ok = okHand(); assert.equal(core.classifyHand(ok.points).right, 'ok');
  const pinch = numberHand(0); pinch.points[8] = { ...pinch.points[4] };
  assert.equal(core.classifyHand(pinch.points).right, 'other');
  ok.points[12] = { ...ok.points[9] };
  assert.equal(core.classifyHand(ok.points).right, 'other');
});
test('拒绝缺失、非有限关键点、零掌宽和无效比例', () => {
  for (const points of [null, [], Array(21).fill({x: 0,y: 0}), numberHand(0).points.map((p,i) => i === 7 ? {...p,x:NaN} : p)]) {
    assert.equal(core.classifyHand(points), null);
  }
  for (const aspect of [0, -1, NaN, Infinity]) {
    assert.equal(core.classifyHand(numberHand(0).points, aspect), null);
  }
});
test('镜像位置建立身份绑定且不受检测数组顺序影响', () => {
  const a = numberHand('open', .75, { label:'Right' });
  const b = numberHand('open', .25, { label:'Left' });
  for (const detected of [[a,b],[b,a]]) {
    const result = core.assignRoles(detected, null);
    assert.deepEqual(result.roles, {left:'Right',right:'Left'});
    assert.equal(result.left, a); assert.equal(result.right, b);
  }
});
test('交叉和单手时按既有身份保持职责', () => {
  const a = numberHand(0, .2, {label:'Right'}); const b = numberHand('open', .8, {label:'Left'});
  const roles = {left:'Right',right:'Left'};
  const crossed = core.assignRoles([a,b], roles);
  assert.equal(crossed.left, a); assert.equal(crossed.right, b);
  const single = core.assignRoles([a], roles);
  assert.equal(single.left,a); assert.equal(single.right,null);
});
test('未满足双手置信度与间距时不分工', () => {
  const a = numberHand(0,.7); const b = numberHand(0,.3,{label:'Right',confidence:.64});
  for (const list of [[a],[a,b],[a,numberHand(0,.6,{label:'Right'})]]) {
    const r = core.assignRoles(list,null); assert.equal(r.roles,null); assert.equal(r.left,null); assert.equal(r.right,null);
  }
});
test('重复身份和无效关键点不能参与控制', () => {
  const a = numberHand(0,.8); const b = numberHand(0,.2);
  const r = core.assignRoles([a,b],{left:'Left',right:'Right'});
  assert.equal(r.left,null); assert.equal(r.right,null);
  a.points[4].x = Infinity;
  const invalid = core.assignRoles([a],{left:'Left',right:'Right'});
  assert.equal(invalid.left,null);
});
test('已绑定身份每帧拒绝低置信度及缺失置信度记录', () => {
  const roles = { left: 'Left', right: 'Right' };
  for (const confidence of [.64, NaN, Infinity, undefined]) {
    const record = numberHand(0, .8);
    record.confidence = confidence;
    const result = core.assignRoles([record], roles);
    assert.deepEqual(result.roles, roles);
    assert.equal(result.left, null);
    assert.equal(result.right, null);
  }
  const accepted = numberHand(0, .8, { confidence: .65 });
  assert.equal(core.assignRoles([accepted], roles).left, accepted);
});
