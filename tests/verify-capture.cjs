const {chromium} = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true});
 try {
  const page = await browser.newPage({viewport:{width:800,height:600}});
  await page.setContent('<style>body{margin:0;overflow:hidden}main{position:absolute;top:80px;left:100px;width:650px;height:500px;overflow:auto}.row{height:200px}</style><header>Stationary header</header><main>' + '<div class="row">Row</div>'.repeat(8) + '</main>');
  await page.evaluate(() => {
    const host=document.createElement('div');document.body.append(host);
    const nested=document.createElement('div');host.attachShadow({mode:'open'}).append(nested);
    const overlay=document.createElement('aside');overlay.style.cssText='position:fixed;inset:0;height:50px;background:red';
    nested.attachShadow({mode:'open'}).append(overlay);window.testOverlay=overlay;window.originalOverlayStyle=overlay.style.cssText;
    window.framesSeen=[];window.chrome={runtime:{onMessage:{addListener(){}},sendMessage(data,cb){framesSeen.push({...data,shadowVisibility:getComputedStyle(testOverlay).visibility});cb(true);}}};
  });
  await page.addScriptTag({path:path.join(__dirname,'..','extension','privacy.js')});
  await page.addScriptTag({path:path.join(__dirname,'..','extension','page.js')});
  const result = await page.evaluate(() => new Promise(resolve=>{CAPTURE_DELAY=1;getPositions(resolve);}));
  const frames = await page.evaluate(()=>framesSeen);
  assert.ok(frames[0].crop, 'Nested pane must have an explicit source crop');
  assert.equal(frames[0].crop.left,100);
  assert.equal(frames[0].crop.top,80);
  assert.equal(frames[0].totalHeight,1600);
  assert.equal(result.ok,true);
  assert.ok(frames.every(f=>f.shadowVisibility==='hidden'),'Fixed overlays in nested open shadow roots must be hidden in every tile');
  assert.equal(await page.evaluate(()=>testOverlay.style.cssText),await page.evaluate(()=>originalOverlayStyle),'Restore shadow overlay styles after capture');
  assert.equal(await page.locator('main').evaluate(el=>el.scrollTop),0);
  const failed = await page.evaluate(() => new Promise(resolve=>{
    document.querySelector('main').scrollTop=123;
    chrome.runtime.sendMessage=(data,cb)=>cb({error:'Synthetic tile failure'});
    getPositions(resolve);
  }));
  assert.equal(failed.ok,false);
  assert.match(failed.error,/Synthetic tile failure/);
  assert.equal(await page.locator('main').evaluate(el=>el.scrollTop),123);
  assert.equal(await page.evaluate(()=>testOverlay.style.cssText),await page.evaluate(()=>originalOverlayStyle),'Restore shadow overlay styles after failed tile');
  await page.setContent('<style>html{scroll-behavior:smooth}body{margin:0;width:1200px;height:9000px}#floating{position:fixed;inset:0;height:50px}</style><div id="floating">Overlay</div>');
  await page.evaluate(()=>{window.scrollTo({left:170,top:230,behavior:'instant'});chrome.runtime.sendMessage=(data,cb)=>cb({ok:true});});
  const full=await page.evaluate(()=>new Promise(resolve=>getPositions(resolve)));
  assert.equal(full.ok,true);
  assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY,style:document.querySelector('#floating').style.cssText})),{x:170,y:230,style:''});
  await page.setContent('<style>body{margin:0;height:1200px}.spacer{height:100px}aside{position:sticky;top:50px;width:200px;height:100px}aside input{position:absolute;top:10px;left:12px}</style><div class="spacer"></div><aside><input value="private field"></aside>');
  await page.evaluate(()=>{scrollTo({top:0,behavior:'instant'});window.stickyFrames=[];window.stickyOriginal=document.querySelector('input').getBoundingClientRect().toJSON();chrome.runtime.sendMessage=(data,cb)=>{stickyFrames.push({...data,field:document.querySelector('input').getBoundingClientRect().toJSON()});cb({ok:true});};});
  assert.equal((await page.evaluate(()=>new Promise(resolve=>getPositions(resolve)))).ok,true);
  const sticky=await page.evaluate(()=>({original:stickyOriginal,first:stickyFrames[0],style:document.querySelector('aside').getAttribute('style')}));
  assert.equal(sticky.first.field.x,sticky.original.x,'Sticky elements remain containing blocks for positioned children');
  assert.equal(sticky.first.field.y,sticky.original.y,'Removing sticky behavior must not move a child field into the header');
  assert.equal(sticky.style||'','','Remove temporary sticky styles');
  assert.deepEqual(await page.locator('aside').evaluate(el=>({position:getComputedStyle(el).position,top:getComputedStyle(el).top})),{position:'sticky',top:'50px'},'Restore original sticky behavior and offsets');
  console.log('PASS: nested-pane crop, full height, completion and scroll restoration');
  console.log('PASS: failed tile reports failure and restores scroll position');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
