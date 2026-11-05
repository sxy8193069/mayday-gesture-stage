const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../src/core.js');
const {numberHand}=require('./fixtures/hand-fixtures.cjs');
const record=(x,label,confidence=.99)=>{const h=numberHand('open',x,{label});return {points:h.points,label,confidence};};
const left=record(.72,'Left');
function acquire(){const tracker=core.createPointerTracker(),right=record(.28,'Right'),matched=core.assignRoles([left,right]);assert.equal(tracker.update([left,right],matched,0),right);return {tracker,roles:matched.roles};}

test('已锁定右手的连续低置信度位置可以跟随，但不能充当OK指令',()=>{
 const {tracker,roles}=acquire(),right=record(.30,'Right',.55),matched=core.assignRoles([left,right],roles);
 assert.equal(matched.right,null);assert.equal(tracker.update([left,right],matched,100),right);assert.equal(tracker.stats.continuous,1);
 const controller=core.createController(),gate=core.createGestureGate(controller);
 for(const now of [100,210,320,430])gate.update('other',null,now);
 assert.equal(controller.state.mode,'stars');
});
test('低置信度不能建立首次身份',()=>{
 const tracker=core.createPointerTracker(),right=record(.28,'Right',.55),matched=core.assignRoles([left,right]);
 assert.equal(tracker.update([left,right],matched,0),null);
});
test('低置信度跳到左手附近不应被接续',()=>{
 const {tracker,roles}=acquire(),right=record(.69,'Right',.55),matched=core.assignRoles([left,right],roles);
 assert.equal(tracker.update([left,right],matched,100),null);
});
test('重复身份不应参与连续位置控制',()=>{
 const {tracker,roles}=acquire(),a=record(.3,'Right',.55),b=record(.35,'Right',.55),matched=core.assignRoles([left,a,b],roles);
 assert.equal(tracker.update([left,a,b],matched,100),null);
});
test('持续丢失后低置信度样本不能重新接管，清除后需要重新确认',()=>{
 const {tracker,roles}=acquire(),right=record(.3,'Right',.55),matched=core.assignRoles([left,right],roles);
 assert.equal(tracker.update([left,right],matched,500),null);tracker.reset();
 assert.equal(tracker.update([left,right],matched,600),null);
});
