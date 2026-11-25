'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/graph-model.js');
const history = require('../js/telemetry-model.js');
const config = M.sensors.motor_current;
test('window sorts delayed samples, rejects invalid data, deduplicates only same source identities', () => {
  const p = M.windowPoints([{time: 9,value: 2}, {time: 2,value: -3}, {time: 9,value: 4},
    {time: 11,value: 100}, {time: 3,value: NaN}, {time: 9,value: 8,source:'other'}], 2, 10);
  assert.deepEqual(p.map(x=>x.value), [-3,4,8]);
  assert.equal(M.extrema(p).min.value,-3); assert.equal(M.extrema(p).max.value,8);
});
test('empty, single and constant extrema and scale remain usable', () => {
  assert.equal(M.extrema([]),null);
  assert.deepEqual(M.scale([],config),{min:0,max:40,stable:0});
  for (const value of [-5,0,10]) {
    const p = [{time:1,value}]; const d=M.scale(p,config);
    assert.ok(d.min < value && d.max > value);
    assert.equal(M.extrema(p).min,M.extrema(p).max);
  }
  for (const value of [0,100]) {
    const d=M.scale([{time:1,value}],M.sensors.throttle);
    assert.ok(d.min>=0 && d.max<=100 && d.max>d.min);
  }
});
test('timestamp positioning preserves irregular spacing', () => {
  const plot={left:10,top:10,width:100,height:100}, domain={min:0,max:10};
  assert.equal(M.project({time:25,value:5},0,100,domain,plot).x,35);
  assert.equal(M.project({time:90,value:5},0,100,domain,plot).x,100);
  assert.equal(M.project({time:25,value:5},0,100,domain,plot).y,60);
});
test('nearest selection returns actual measurement and respects hit radius', () => {
  const points=[{x:10,y:20,point:{value:4}},{x:40,y:60,point:{value:9}}];
  assert.equal(M.nearest(points,12,21,10),points[0]);
  assert.equal(M.nearest(points,100,100,10),null);
});
test('scale expands immediately, holds for small changes and contracts after sustained narrower data', () => {
  let old=M.scale([{value:0},{value:40}],config);
  const expanded=M.scale([{value:-20},{value:80}],config,old);
  assert.ok(expanded.min<=-20 && expanded.max>=80);
  for(let i=0;i<7;i++) old=M.scale([{value:10},{value:11}],config,old);
  assert.ok(old.max>=40);
  old=M.scale([{value:10},{value:11}],config,old);
  assert.ok(old.max<40);
});
test('time window changes recalculate extrema and domain from only visible readings', () => {
  const points=[{time:1,value:100},{time:50,value:5},{time:90,value:10}];
  const visible=M.windowPoints(points,40,100);
  assert.equal(M.extrema(visible).max.value,10);
  assert.ok(M.scale(visible,config).max<100);
});
test('graph selection caps at four, pins force visibility, corrupt preferences are sanitized', () => {
  const keys=Object.keys(M.sensors); let p=M.preferences(null,keys);
  assert.equal(p.selected.length,3);
  p=M.toggle(p,keys[4],'pin',keys); assert.equal(p.selected.length,4);
  assert.ok(p.pinned.includes(keys[4]));
  p=M.toggle(p,keys[4],'select',keys); assert.ok(p.selected.includes(keys[4]));
  p=M.toggle(p,keys[5],'select',keys); assert.ok(!p.selected.includes(keys[5]));
  p=M.toggle(p,keys[4],'pin',keys); p=M.toggle(p,keys[4],'select',keys);
  assert.ok(!p.selected.includes(keys[4]));
  assert.deepEqual(M.preferences({selected:['invented'],pinned:'invalid'},keys),{selected:[],pinned:[]});
});
test('live history deduplication retains different producers and supports delayed backfill', () => {
  const h={sensor:[]};
  const samples=[{timestamp_ms:1000,source:'a',sensor:1},{timestamp_ms:1000,source:'b',sensor:2}];
  history.mergeHistory(h,samples,['sensor'],0); history.mergeHistory(h,samples,['sensor'],0);
  history.mergeHistory(h,[{timestamp_ms:500,source:'a',sensor:3}],['sensor'],0);
  assert.equal(h.sensor.length,3); assert.equal(h.sensor[0].time,500);
  assert.equal(M.extrema(M.windowPoints(h.sensor,0,2000)).max.value,3);
});
