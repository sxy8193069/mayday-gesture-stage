const test = require('node:test');
const assert = require('node:assert/strict');
const { createController, createGestureGate, classifyHand } = require('../src/core.js');
const { numberHand } = require('./fixtures/hand-fixtures.cjs');
const hold = (gate, left, right, start) => [start, start + 110, start + 220].map(now => gate.update(left, right, now));

function stage() {
  const controller = createController(), gate = createGestureGate(controller);
  assert.equal(hold(gate, 'open', 'ok', 0).at(-1), 'stage');
  return { controller, gate };
}

test('舞台中重复OK不触发彩带或重建舞台', () => {
  const { controller, gate } = stage(), before = { ...controller.state };
  gate.update('open', 'other', 250);
  assert.deepEqual(hold(gate, 'open', 'ok', 300), [null, null, null]);
  assert.deepEqual(controller.state, before);
});

test('松开OK时持续张开的左手不会散开舞台', () => {
  const { controller, gate } = stage(), before = { ...controller.state };
  assert.deepEqual(hold(gate, 'open', 'other', 250), [null, null, null]);
  assert.deepEqual(controller.state, before);
});

test('右手比2稳定220毫秒后仅触发一次彩带，不改变舞台或球序号', () => {
  const { controller, gate } = stage(), before = { ...controller.state };
  assert.deepEqual(hold(gate, 'open', 'two', 250), [null, null, 'celebrate']);
  assert.deepEqual(hold(gate, 'open', 'two', 550), [null, null, null]);
  assert.deepEqual(controller.state, before);
});

test('比2不足220毫秒或三个样本不触发彩带', () => {
  const { gate } = stage();
  assert.equal(gate.update('open', 'two', 250), null);
  assert.equal(gate.update('open', 'two', 470), null);
  assert.equal(gate.update('open', 'two', 471), 'celebrate');
});

test('丢手不解锁彩带，明确松开右手后可再比2重播', () => {
  const { controller, gate } = stage();
  assert.equal(hold(gate, 'open', 'two', 250).at(-1), 'celebrate');
  gate.update(null, null, 500);
  assert.deepEqual(hold(gate, 'open', 'two', 550), [null, null, null]);
  gate.update('open', 'other', 800);
  assert.equal(hold(gate, 'open', 'two', 850).at(-1), 'celebrate');
  assert.equal(controller.state.mode, 'stage');
});

test('舞台外比2不生成舞台或彩带，持有比2进入舞台也不补发', () => {
  const controller = createController(), gate = createGestureGate(controller);
  assert.deepEqual(hold(gate, 'other', 'two', 0), [null, null, null]);
  assert.equal(controller.state.revision, 0);
  controller.dispatch('stage');
  assert.deepEqual(hold(gate, 'open', 'two', 300), [null, null, null]);
  gate.update('open', 'other', 550);
  assert.equal(hold(gate, 'open', 'two', 600).at(-1), 'celebrate');
});

test('舞台退出需要完整左拳确认，短暂收拢不能把普通张手当作退出', () => {
  const { controller, gate } = stage();
  gate.update('fist', 'other', 250);
  gate.update('fist', 'other', 330);
  assert.deepEqual(hold(gate, 'open', 'other', 350), [null, null, null]);
  assert.equal(controller.state.mode, 'stage');
  hold(gate, 'fist', 'other', 600);
  assert.equal(hold(gate, 'open', 'other', 850).at(-1), 'scatter');
  assert.equal(controller.state.mode, 'stars');
});

test('重新进入舞台或重置手势识别后不会沿用上一次退出准备状态', () => {
  const { controller, gate } = stage();
  hold(gate, 'fist', 'other', 250);
  controller.dispatch('reset'); controller.dispatch('stage');
  assert.deepEqual(hold(gate, 'open', 'other', 550), [null, null, null]);
  hold(gate, 'fist', 'other', 850); gate.reset();
  assert.deepEqual(hold(gate, 'open', 'other', 0), [null, null, null]);
  assert.equal(controller.state.mode, 'stage');
});

test('真实关键点把食指中指伸展且无名指小指收拢识别为2，旋转缩放后仍可区分', () => {
  for (const angle of [0, 45, 90, 180, 275]) for (const scale of [.35, 1, 1.8]) {
    assert.equal(classifyHand(numberHand(2, .5, { angle, scale }).points).right, 'two');
  }
  for (const pose of [0, 1, 3, 4, 'open', 'uncertain']) {
    assert.equal(classifyHand(numberHand(pose).points).right, 'other');
  }
});
