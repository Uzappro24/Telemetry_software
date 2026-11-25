/* Run against an isolated external-mode Flask instance, not a vehicle session.
 * ECO_TEST_URL=http://127.0.0.1:5057 node web/tests/browser-graphs.cjs */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require(process.env.ECO_PLAYWRIGHT_PATH || 'playwright');
const url = process.env.ECO_TEST_URL || 'http://127.0.0.1:5057';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error('Page error:', error.message); });
  page.on('console', message => { if (message.type() === 'error') console.error('Browser:', message.text()); });
  try {
    await page.request.delete(url+'/api/session');
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('.graph-box:not([hidden]) .graph-summary')?.textContent === 'Unavailable', null, {timeout:10000});
    const now = Date.now();
    const values = {battery_voltage:48,motor_current:12,motor_temp:56,battery_temp:35,wheel_speed:400,throttle:40};
    const units = {battery_voltage:'V',motor_current:'A',motor_temp:'°C',battery_temp:'°C',wheel_speed:'RPM',throttle:'%'};
    const samples = Array.from({length:30}, (_,i) => ({timestamp_ms:now - 45000 + i*1500,
      readings:Object.fromEntries(Object.keys(values).map(key=>[key,{value:values[key]+Math.sin(i/3),unit:units[key]}]))}));
    samples.reverse(); // historical hydration must accept delayed/out-of-order ingestion.
    const ingest = await page.request.post(url+'/api/telemetry',{data:{source:'browser-test',samples}});
    assert.equal(ingest.status(),202);
    await page.waitForFunction(() => !document.querySelector('.graph-box:not([hidden]) .graph-summary').textContent.includes('Unavailable'));
    assert.equal(await page.locator('.graph-box:visible').count(),3);
    assert.ok(await page.locator('.extreme-min').first().textContent());
    // Instrument only in this test to inspect the actual plotted coordinates.
    await page.evaluate(() => {
      window.testViews=[];
      const render=window.TelemetryGraphView.prototype.render;
      window.TelemetryGraphView.prototype.render=function(...args){
        if(!window.testViews.includes(this)) window.testViews.push(this);
        return render.apply(this,args);
      };
    });
    await page.locator('#status-refresh').click();
    await page.waitForFunction(() => window.testViews.length>0);
    const point=await page.evaluate(() => {
      const v=window.testViews[0], p=v.projected[Math.floor(v.projected.length/2)], r=v.surface.getBoundingClientRect();
      return {x:r.left+p.x,y:r.top+p.y,value:p.point.value.toFixed(v.config.digits)+' '+v.config.unit};
    });
    await page.mouse.move(point.x,point.y);
    const tooltip=page.locator('.graph-box:visible .graph-tooltip').first();
    await tooltip.waitFor({state:'visible'}); assert.ok((await tooltip.textContent()).includes(point.value));
    assert.match(await tooltip.textContent(),/\d{2}:\d{2}:\d{2}/);
    // Same physical pointer stays valid while polling replaces history objects.
    await page.waitForTimeout(1100); assert.ok(await tooltip.isVisible());
    await page.locator('.graph-box:visible canvas').nth(1).focus();
    await page.keyboard.press('ArrowRight'); assert.ok(await tooltip.isVisible());
    const bounds=await tooltip.boundingBox(), surface=await page.locator('.graph-box:visible .graph-surface').first().boundingBox();
    assert.ok(bounds.x>=surface.x && bounds.x+bounds.width<=surface.x+surface.width+1);
    await page.locator('[data-pin="wheel_speed"]').click();
    assert.equal(await page.locator('.graph-box:visible').first().getAttribute('data-graph'),'wheel_speed');
    assert.equal(await page.locator('.graph-box:visible').count(),4);
    await page.reload();
    assert.equal(await page.locator('.graph-box:visible').first().getAttribute('data-graph'),'wheel_speed');
    await page.locator('#time-range').selectOption('30');
    await page.waitForTimeout(600);
    for (const width of [1440,1024,768,390,320]) {
      await page.setViewportSize({width,height:1000}); await page.waitForTimeout(150);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), 'horizontal overflow at '+width);
      const graph=await page.locator('.graph-box:visible').first().boundingBox(); assert.ok(graph.width>200);
    }
    await page.screenshot({path: require('node:path').join(require('node:os').tmpdir(),'eco-graphs-mobile.png'),fullPage:true});
    // Emulate touch with the actual rendered surface coordinates.
    const touch = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const tp=await touch.newPage(); await tp.goto(url); await tp.waitForTimeout(700);
    await tp.evaluate(() => {
      window.testViews=[]; const render=TelemetryGraphView.prototype.render;
      TelemetryGraphView.prototype.render=function(...args){
        if(!window.testViews.includes(this)) window.testViews.push(this);
        return render.apply(this,args);
      };
    });
    await tp.locator('#status-refresh').click();
    await tp.waitForFunction(()=>window.testViews.length>0);
    await tp.locator('.graph-box:visible').first().scrollIntoViewIfNeeded();
    const touchPoint=await tp.evaluate(()=>{
      const v=testViews[0], p=v.projected[Math.floor(v.projected.length/2)], r=v.surface.getBoundingClientRect();
      return {x:r.left+p.x,y:r.top+p.y};
    });
    await tp.touchscreen.tap(touchPoint.x,touchPoint.y);
    assert.ok(await tp.locator('.graph-tooltip:visible').count());
    const canvas=tp.locator('.graph-box:visible canvas').nth(1);
    await canvas.dispatchEvent('pointermove',{pointerType:'touch',clientX:touchPoint.x+10,clientY:touchPoint.y,buttons:1});
    await tp.waitForTimeout(50);
    assert.ok(await tp.locator('.graph-tooltip:visible').count());
    await touch.close();
    // All six graphs can be chosen without exceeding the four-graph layout limit.
    await page.locator('[data-pin="wheel_speed"]').click();
    for(const key of ['battery_voltage','motor_current','motor_temp','wheel_speed']) {
      await page.locator('[data-select="'+key+'"]').uncheck();
    }
    assert.ok(await page.locator('#graphs-empty').isVisible());
    for(const key of ['battery_temp','throttle']) await page.locator('[data-select="'+key+'"]').check();
    assert.equal(await page.locator('.graph-box:visible').count(),2);
    assert.ok(await page.locator('[data-graph="battery_temp"] .extreme-min').textContent());
    assert.ok(await page.locator('[data-graph="throttle"] .extreme-max').textContent());
    assert.deepEqual(errors,[]);
    console.log('Browser graph checks passed: hydration, extrema, tooltip, keyboard, live updates, selection/pins, persistence, time range, responsive widths.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
