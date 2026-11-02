// Isolated unpacked-extension tests. Only the temporary test copy receives fixture host access.
const {chromium}=require('playwright');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const ROOT=__dirname;
const OUT=path.join(ROOT,'test-results');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'skim-e2e-'));
const extension=path.join(temporary,'extension');fs.mkdirSync(extension);
for(const name of ['manifest.json','privacy.js','api.js','page.js','youtube.js','popup.js','popup.html','popup.css','exports.js','background.js','icon16.png','icon48.png','icon128.png']) fs.copyFileSync(path.join(ROOT,name),path.join(extension,name));
fs.cpSync(path.join(ROOT,'assets'),path.join(extension,'assets'),{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json')));
assert.ok(!manifest.host_permissions?.length,'Production must retain gesture-scoped activeTab access');
assert.ok(!manifest.permissions.includes('clipboardRead'),'Clipboard read is test-only');
// captureVisibleTab requires activeTab or <all_urls>. The test opens a popup without
// a physical toolbar click, so only this disposable copy receives <all_urls>.
manifest.host_permissions=['<all_urls>'];
manifest.permissions.push('clipboardRead');
fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
fs.mkdirSync(OUT,{recursive:true});
fs.writeFileSync(path.join(OUT,'e2e-result.json'),JSON.stringify({passed:false,running:true,at:new Date().toISOString()},null,2));
const fixture=`<html><head><title>Skim fixture</title></head><body><main><h1>Jobs fixture</h1>
<article><h2><a href="/jobs/123456789012345?jobId=9876543210">Shopify Developer</a></h2><p>Budget $40/hour. Remote and asynchronous.</p></article>
<p>alice@example.com</p><input aria-label="API key" value="fixture-private-secret"><iframe src="/frame"></iframe><div id="shadow"></div></main><script>document.querySelector('#shadow').attachShadow({mode:'open'}).innerHTML='<p>Shadow content</p><a href="/shadow-job">Shadow job</a>';</script></body></html>`;
const screenshotFixture=`<style>body{margin:0;overflow:hidden}header{height:60px;background:red}main{position:absolute;top:80px;left:100px;width:650px;height:500px;overflow:auto}.row{height:200px;box-sizing:border-box;background:rgb(20,120,60)}.row:nth-child(even){background:rgb(30,70,180)}</style><header>Stationary header</header><main>${Array.from({length:8},(_,i)=>`<div class="row">Row ${i}<input value="private-field-${i}"></div>`).join('')}</main><script>document.querySelector('main').addEventListener('scroll',()=>{if(!document.querySelector('#lazy')&&document.querySelector('main').scrollTop>300){const p=document.createElement('span');p.id='lazy';p.textContent='lazy@example.com';document.querySelectorAll('.row')[5].append(p);}});</script>`;
const youtubeFixture=`<h1 class="ytd-watch-metadata">Transcript fixture</h1><div id="owner"><ytd-channel-name><a>Fixture channel</a></ytd-channel-name></div><ytd-video-description-transcript-section-renderer><button onclick="document.querySelector('#segments').hidden=false">Show transcript</button></ytd-video-description-transcript-section-renderer><ytd-transcript-renderer><div id="footer"><button>English (auto-generated)</button></div><div id="segments" hidden style="height:200px;overflow:auto">${Array.from({length:25},(_,i)=>`<ytd-transcript-segment-renderer style="display:block;height:40px"><span class="segment-timestamp">0:${String(i).padStart(2,'0')}</span><span class="segment-text">Transcript sentence ${i}</span></ytd-transcript-segment-renderer>`).join('')}</div></ytd-transcript-renderer>`;
const fullPageFixture=`<style>body{margin:0;width:1200px}.stripe{height:200px;background:rgb(20,120,60)}.stripe:nth-child(even){background:rgb(30,70,180)}#floating{position:fixed;inset:0;height:50px;background:red}</style><div>${Array.from({length:45},(_,i)=>`<div class="stripe">${i===40?'<input value="boundary-private-field">':''}</div>`).join('')}</div><div id="floating">Floating overlay</div>`;
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(req.url==='/frame'?'<p>frame@example.com</p><input aria-label="secret token" value="frame-secret-value"><label for="credential">API key</label><input id="credential" value="synthetic-labelled-secret">':req.url==='/shot'?screenshotFixture:req.url==='/full'?fullPageFixture:fixture);});
let context;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const dpr=Number(process.env.SKIM_TEST_DPR||1);
 context=await chromium.launchPersistentContext(path.join(temporary,'profile'),{channel:'chromium',headless:true,deviceScaleFactor:dpr,viewport:{width:800,height:600},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const id=new URL(worker.url()).host;
 const page=context.pages()[0]||await context.newPage();page.on('pageerror',e=>console.log('FIXTURE PAGE ERROR',e.message));page.on('console',m=>{if(m.type()==='error')console.log('FIXTURE ERROR',m.text());});await page.goto(origin);
 const tab=await worker.evaluate(async()=> (await chrome.tabs.query({active:true})).find(t=>t.url.startsWith('http://127.0.0.1')));
 assert.ok(tab,'Fixture tab exists');
 // Keep the actual fixture tab active while the popup is rendered in a separate window.
 // Only currentWindow lookup is redirected; scripting, messaging, capture and storage are real Chrome APIs.
 await context.addInitScript(({target})=>{
  if(location.protocol!=='chrome-extension:')return;
  const query=chrome.tabs.query.bind(chrome.tabs);
  chrome.tabs.query=(opts,cb)=>{
    if(opts.currentWindow&&opts.active){if(cb){chrome.tabs.get(target.id,t=>cb([t]));return;}return chrome.tabs.get(target.id).then(t=>[t]);}
    return query(opts,cb);
  };
 },{target:tab});
 const errors=[];context.on('page',p=>{p.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE ERROR',m.text());});});
 async function popup(settings={}) {
  await worker.evaluate(async s=>{await chrome.storage.local.set({skim_settings:{historyEnabled:false,cacheTTL:0,probeDropdowns:false,...s}});},settings);
  const event=context.waitForEvent('page');
  await worker.evaluate(async url=>await chrome.windows.create({url,type:'popup',focused:true,width:500,height:780}),`chrome-extension://${id}/popup.html`);
  const p=await event;await p.waitForLoadState();return p;
 }
 let p=await popup();
 await p.locator('#result').waitFor({state:'visible',timeout:30000});
 const text=await p.evaluate(async()=>{const v=await chrome.storage.local.get('skim_settings');return document.querySelector('#result-label').textContent;});
 assert.equal(text,'Text copied');
 const panelFrames=await p.evaluate(()=>{
   const previous=getCurrentPanel(),frames=[];
   for(const id of ALL_PANELS){showPanel(id);const body=document.body.getBoundingClientRect(),header=document.querySelector('.app-header').getBoundingClientRect(),footer=document.querySelector('.local-footer').getBoundingClientRect();frames.push({id,width:body.width,height:body.height,header:header.top,footer:footer.top,overflow:document.body.scrollWidth>400});}
   showPanel(previous);return frames;
 });
 for(const frame of panelFrames)assert.deepEqual(frame,{id:frame.id,width:400,height:600,header:0,footer:556,overflow:false},'Stable popup frame for '+frame.id);
 assert.equal(await p.locator('svg:not([aria-hidden="true"])').count(),0,'Decorative icons must be hidden from screen readers');
 assert.equal(await p.locator('#btn-nav-settings').evaluate(el=>el.getBoundingClientRect().width),44);
 assert.equal(await p.locator('#set-cache-ttl').count(),0,'No setting for unused screenshot cache');
 assert.equal(await p.locator('#text-preview').inputValue(),await p.evaluate(()=>capturedText));
 const longExport='Complete export\n'+'x'.repeat(150000)+'\nEND OF CAPTURE\nprivate@example.com';
 await p.evaluate(t=>{settings.autoRedact=false;showTextResult(t);settings.autoRedact=true;},longExport);
 const textDownloadEvent=p.waitForEvent('download');await p.locator('#btn-download-text').click();
 const textDownload=await textDownloadEvent,downloadedText=fs.readFileSync(await textDownload.path(),'utf8');
 assert.ok(downloadedText.includes('END OF CAPTURE'),'Text download must not use the 100k history preview');
 assert.ok(!downloadedText.includes('private@example.com'),'Export reapplies current redaction policy');
 await p.locator('#btn-recopy').focus();await p.keyboard.press('Enter');
 await p.getByText('Copied full captured text',{exact:true}).waitFor();
 assert.equal((await p.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n'),downloadedText);
 await p.evaluate(()=>{settings.historyEnabled=true;onTextSuccess('Keyboard history capture');});
 await p.locator('#btn-nav-history').click();
 const historyButton=p.getByRole('button',{name:/Copy saved capture from/}).first();
 await historyButton.focus();await p.keyboard.press('Enter');
 await p.getByText('Copied',{exact:true}).waitFor();
 assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),'Keyboard history capture');
 await p.locator('#btn-history-back').click();
 await p.evaluate(()=>{settings.historyEnabled=false;startTextCopy();});await p.getByText('Text copied',{exact:true}).waitFor();
 await p.locator('body').screenshot({path:path.join(OUT,'popup-dark.png')});
 await p.evaluate(()=>applyTheme('light'));await p.waitForTimeout(200);await p.locator('body').screenshot({path:path.join(OUT,'popup-light.png')});
 await p.evaluate(()=>applyTheme('dark'));
 console.log('PASS full text preview/download, current redaction, keyboard recopy/history and SVG accessibility');
 // Native capture callback returns the same string sent to the clipboard.
 const exported=await p.evaluate(target=>new Promise((resolve,reject)=>CaptureAPI.capturePageText(target,resolve,reject,true,{probeDropdowns:false})),tab);
 assert.ok(exported.includes('LINKED RECORDS JSON'));
 const recordSection=exported.split('== LINKED RECORDS JSON ==\n')[1];
 const records=JSON.parse(recordSection.slice(0,recordSection.indexOf('\n]')+2));
 assert.equal(records[0].url,origin+'/jobs/123456789012345?jobId=9876543210');assert.equal(records[0].title,'Shopify Developer');
 for(const secret of ['alice@example.com','frame@example.com','fixture-private-secret','frame-secret-value','synthetic-labelled-secret'])assert.ok(!exported.includes(secret),'No leaked '+secret);
 assert.ok(exported.includes('CROSS-FRAME'));
 assert.ok(exported.includes('COVERAGE:'));
 assert.ok(exported.includes('Shadow content'));
 assert.ok(exported.includes('/shadow-job'));
 const code=await p.evaluate(target=>new Promise((resolve,reject)=>CaptureAPI.capturePageCode(target,resolve,reject,true)),tab);
 assert.ok(!code.includes('alice@example.com')&&!code.includes('fixture-private-secret'));
 const partial=await p.evaluate(target=>new Promise((resolve,reject)=>CaptureAPI.capturePageText(target,resolve,reject,true,{probeDropdowns:false,extractIframes:false})),tab);
 assert.ok(partial.includes('iframe extraction disabled'));
 const timeoutFallback=await p.evaluate(async target=>{
   const nativeTimeout=window.setTimeout,nativeFetch=window.fetch,nativeContains=chrome.permissions.contains;
   let summaryError='',mockCalls=0;
   try {
     chrome.permissions.contains=async()=>true;
     window.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,ms===60000?30:ms,...args);
     window.fetch=async(_url,{signal})=>{mockCalls++;return new Response(new ReadableStream({start(controller){signal.addEventListener('abort',()=>controller.error(new DOMException('Synthetic stalled body','AbortError')),{once:true});}}),{status:200,headers:{'Content-Type':'application/json'}});};
     return await new Promise((resolve,reject)=>{
       const watchdog=nativeTimeout(()=>reject(new Error('Summary response body stalled capture')),5000);
       CaptureAPI.capturePageText(target,text=>{clearTimeout(watchdog);resolve({text,error:summaryError,mockCalls});},error=>{clearTimeout(watchdog);reject(new Error(error));},true,{probeDropdowns:false,summary:{enabled:true,key:'dummy-key',baseUrl:'https://fixture.invalid/v1'},onSummaryError:error=>{summaryError=error;}});
     });
   } finally {window.setTimeout=nativeTimeout;window.fetch=nativeFetch;chrome.permissions.contains=nativeContains;}
 },tab);
 assert.equal(timeoutFallback.mockCalls,1,'Provider transport stub must be exercised');
 assert.match(timeoutFallback.error,/Timed out after 60s/);
 assert.ok(timeoutFallback.text.includes('== LINKED RECORDS JSON =='));
 assert.ok(!timeoutFallback.text.includes('synthetic-labelled-secret'));
 assert.equal((await p.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n'),timeoutFallback.text,'Stalled provider body falls back to raw redacted clipboard output');
 console.log('PASS native capture/clipboard fallback after stalled provider response body (provider transport mocked)');
 const summaryUI=await p.evaluate(async()=>{
   const nativeFetch=window.fetch,nativeContains=chrome.permissions.contains,previousSettings={...settings},success=onTextSuccess;
   try {
     chrome.permissions.contains=async()=>true;
     window.fetch=async()=>{throw new Error('Synthetic provider unavailable');};
     settings.summaryEnabled=true;settings.summaryKey='dummy-key';settings.summaryBaseUrl='https://fixture.invalid/v1';
     await new Promise((resolve,reject)=>{
       const watchdog=setTimeout(()=>reject(new Error('Raw summary fallback did not finish')),5000);
       onTextSuccess=text=>{success(text);clearTimeout(watchdog);resolve();};
       startTextCopy();
     });
     return {badge:document.querySelector('#state-badge').textContent,label:document.querySelector('#result-label').textContent};
   } finally {window.fetch=nativeFetch;chrome.permissions.contains=nativeContains;settings=previousSettings;onTextSuccess=success;}
 });
 assert.equal(summaryUI.label,'Text copied');
 assert.equal(summaryUI.badge,'Summary failed — raw','Raw fallback must retain its visible summary-failure warning');
 await p.screenshot({path:path.join(OUT,'summary-fallback.png')});
 await p.evaluate(()=>startTextCopy());await p.locator('#result').waitFor({state:'visible'});
 assert.equal(await p.locator('#state-badge').textContent(),'Done','A subsequent successful capture clears the old warning');
 console.log('PASS popup retains summary failure warning after successful raw clipboard fallback');
 await p.locator('#btn-nav-settings').click();
 await p.evaluate(()=>{settings.summaryEnabled=true;settings.summaryKey='synthetic-owner-key';settings.openrouterKey='synthetic-legacy-key';saveSettings();syncSettingsUI();});
 await p.getByText('Capture profile · JSON',{exact:true}).click();
 await p.locator('#set-profile-json').fill(JSON.stringify({summaryBaseUrl:'https://other.example/v1',summaryEnabled:true}));
 await p.locator('#btn-apply-profile').click();
 await p.locator('#set-profile-json').fill(JSON.stringify({summaryEnabled:'false',autoRedact:0}));await p.locator('#btn-apply-profile').click();
 assert.equal(await p.evaluate(()=>settings.summaryEnabled),false);assert.equal(await p.evaluate(()=>settings.autoRedact),true);
 const providerState=await p.evaluate(async()=>{const {skim_settings:s}=await chrome.storage.local.get('skim_settings');return {key:s.summaryKey,legacy:s.openrouterKey,enabled:s.summaryEnabled};});
 assert.deepEqual(providerState,{key:'',legacy:'',enabled:false});
 await p.locator('body').screenshot({path:path.join(OUT,'settings.png')});
 await p.locator('#btn-settings-back').click();
 await p.screenshot({path:path.join(OUT,'text-result.png')});await p.close();
 console.log('PASS native extension text capture: frames, redaction, records, completeness, clipboard callback');
 console.log('PASS profile Apply UI clears prior provider credentials and disables summaries');

 await page.evaluate(()=>{
   const key='-----BEGIN PRIVATE KEY-----\nSYNTHETIC_PRIVATE_MATERIAL\n-----END PRIVATE KEY-----';
   document.querySelector('main').textContent='x'.repeat(150*1024-70)+key+'x'.repeat(200);
   const style=document.createElement('style');style.textContent='main::before { content: "'+'x'.repeat(80*1024-90)+key.replace(/\n/g,' ')+'x'.repeat(200)+'"; }';document.head.append(style);
 });
 p=await popup({copyMode:'code'});
 await p.getByText('Page code copied',{exact:true}).waitFor();
 const boundaryCode=await p.evaluate(()=>navigator.clipboard.readText());
 assert.ok(!boundaryCode.includes('SYNTHETIC_PRIVATE'),'Native code clipboard must not contain clipped private-key material');
 assert.ok(boundaryCode.includes('TRUNCATED'));
 await p.close();
 console.log('PASS native code clipboard redacts secrets before HTML/CSS size caps');

 await page.evaluate(()=>{
   const key='sk-proj-'+'a'.repeat(80);
   document.head.innerHTML='<meta name="description" content="'+'x'.repeat(189)+' '+key+'">';
   document.body.innerHTML='<main><h1>'+'x'.repeat(89)+' '+key+'</h1><input aria-label="'+'x'.repeat(69)+' '+key+'"><button aria-label="'+'x'.repeat(69)+' '+key+'"></button><iframe src="/frame"></iframe></main>';
 });
 p=await popup();await p.getByText('Text copied',{exact:true}).waitFor();
 const controlText=await p.evaluate(()=>navigator.clipboard.readText());
 assert.ok(!controlText.includes('sk-proj-'),'Native text clipboard must not leak shortened metadata or labels');
 assert.ok(!controlText.includes('synthetic-labelled-secret'));
 await p.close();console.log('PASS native text clipboard redacts metadata/control labels and iframe labelled fields');

 await page.goto(origin+'/shot');
 p=await popup({defaultAction:'screenshot'});
 await p.locator('#review').waitFor({state:'visible',timeout:60000});
 await p.waitForTimeout(600);
 const nativePNG=await worker.evaluate(w=>chrome.tabs.captureVisibleTab(w,{format:'png'}),tab.windowId);
 const scale=Buffer.from(nativePNG.split(',')[1],'base64').readUInt32BE(16)/800;
 const pixels=await p.evaluate(scale=>{const c=document.querySelector('#review-canvas'),ctx=c.getContext('2d');return {width:c.width,height:c.height,rows:Array.from({length:8},(_,i)=>Array.from(ctx.getImageData(Math.floor(500*scale),Math.floor((i*200+100)*scale),1,1).data)),input:Array.from(ctx.getImageData(Math.floor(80*scale),Math.floor(10*scale),1,1).data)};},scale);
 assert.equal(pixels.width,Math.ceil(650*scale));assert.equal(pixels.height,Math.ceil(1600*scale));
 pixels.rows.forEach((rgb,i)=>assert.deepEqual(rgb,i%2?[30,70,180,255]:[20,120,60,255]));
 assert.deepEqual(pixels.input,[0,0,0,255]);
 assert.equal(await page.locator('main').evaluate(el=>el.scrollTop),0);
 const canvas=p.locator('#review-canvas'),box=await canvas.boundingBox();
 await p.mouse.move(box.x+30,box.y+30);await p.mouse.down();await p.mouse.move(box.x+110,box.y+65);await p.mouse.up();
 assert.equal(await p.evaluate(()=>reviewParts[0].masks.length),1);
 await p.locator('#review-undo').click();assert.equal(await p.evaluate(()=>reviewParts[0].masks.length),0);
 await p.getByText('Add a mask by coordinates',{exact:true}).click();
 for(const [field,value]of Object.entries({x:20,y:20,width:120,height:60}))await p.locator('#mask-'+field).fill(String(value));
 await p.getByRole('button',{name:'Add opaque mask'}).focus();await p.keyboard.press('Enter');
 assert.deepEqual(await p.evaluate(()=>reviewParts[0].masks[0]),{x:20,y:20,w:120,h:60});
 await p.locator('#review-undo').click();
 await p.getByText('Add a mask by coordinates',{exact:true}).click();
 await p.locator('.review-viewport').evaluate(el=>{el.scrollTop=0;el.scrollIntoView({block:'start'});});
 const freshBox=await canvas.boundingBox();
 await p.mouse.move(freshBox.x+30,freshBox.y+30);await p.mouse.down();await p.mouse.move(freshBox.x+110,freshBox.y+65);await p.mouse.up();
 assert.equal(await p.evaluate(()=>reviewParts[0].masks.length),1,'Drag after keyboard controls still masks visible canvas');
 await p.locator('#review-copy').click();await p.getByText('Copied part 1 of 1',{exact:true}).waitFor();
 const clipboardSize=await p.evaluate(async()=>{const items=await navigator.clipboard.read();const blob=await items[0].getType('image/png');const image=await createImageBitmap(blob);return {width:image.width,height:image.height};});
 assert.deepEqual(clipboardSize,{width:pixels.width,height:pixels.height});
 const maskedPixel=await p.evaluate(async()=>{const [item]=await navigator.clipboard.read();const image=await createImageBitmap(await item.getType('image/png'));const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const m=reviewParts[0].masks[0];return Array.from(ctx.getImageData(Math.floor(m.x+m.w/2),Math.floor(m.y+m.h/2),1,1).data);});
 assert.deepEqual(maskedPixel,[0,0,0,255],'Manual masks survive PNG clipboard export');
 const downloaded=p.waitForEvent('download');await p.locator('#review-download').click();
 const download=await downloaded;const downloadedPNG=fs.readFileSync(await download.path());
 assert.equal(downloadedPNG.readUInt32BE(16),pixels.width);assert.equal(downloadedPNG.readUInt32BE(20),pixels.height);
 await p.evaluate(async()=>{
   const c=document.createElement('canvas');c.width=40;c.height=40;
   const ctx=c.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,40,40);
   const one=await new Promise(r=>c.toBlob(r));ctx.fillStyle='blue';ctx.fillRect(0,0,40,40);
   const two=await new Promise(r=>c.toBlob(r));await openReview([one,two]);
 });
 await p.locator('#review-part').selectOption('1');
 assert.deepEqual(await p.evaluate(()=>Array.from(document.querySelector('#review-canvas').getContext('2d').getImageData(10,10,1,1).data)),[0,0,255,255]);
 await p.locator('#review-copy').click();await p.getByText('Copied part 2 of 2',{exact:true}).waitFor();
 await p.evaluate(()=>{reviewParts[0].masks.push({x:0,y:0,w:20,h:20});reviewParts[1].masks.push({x:0,y:0,w:20,h:20});renderReview();});
 const zipEvent=p.waitForEvent('download');await p.locator('#review-download-all').click();
 const zipDownload=await zipEvent,zipBytes=fs.readFileSync(await zipDownload.path());
 let zipOffset=0,zipCount=0;const zipPNGs=[];
 while(zipBytes.readUInt32LE(zipOffset)===0x04034b50){
   const size=zipBytes.readUInt32LE(zipOffset+18),n=zipBytes.readUInt16LE(zipOffset+26),start=zipOffset+30+n;
   const name=zipBytes.subarray(zipOffset+30,start).toString();assert.equal(name,`skim-part-${zipCount+1}-of-2.png`);
   const bytes=zipBytes.subarray(start,start+size);assert.equal(bytes.readUInt32BE(16),40);assert.equal(bytes.readUInt32BE(20),40);
   zipPNGs.push(bytes.toString('base64'));zipOffset=start+size;zipCount++;
 }
 assert.equal(zipCount,2,'ZIP contains every part');
 const zipMasks=await p.evaluate(async pngs=>{
   const values=[];for(const png of pngs){const b=await(await fetch('data:image/png;base64,'+png)).blob(),image=await createImageBitmap(b),c=document.createElement('canvas');c.width=40;c.height=40;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);values.push(Array.from(ctx.getImageData(10,10,1,1).data));image.close();}return values;
 },zipPNGs);
 assert.deepEqual(zipMasks,[[0,0,0,255],[0,0,0,255]],'All exported PNGs retain their individual review masks');
 assert.equal(await p.locator('#review-part').inputValue(),'1','Export does not change selected part');
 await p.screenshot({path:path.join(OUT,'screenshot-review.png')});await p.close();
 console.log('PASS native screenshot capture: nested stitching pixel rows, input masks, manual mask/undo, explicit copy');
 console.log('PASS keyboard coordinate masks and ZIP export of every reviewed/masked screenshot part');

 await page.goto(origin+'/full');
 await page.evaluate(()=>window.scrollTo(170,230));
 p=await popup({defaultAction:'screenshot'});
 await p.locator('#review').waitFor({state:'visible',timeout:120000});
 const fullPage=await p.evaluate(scale=>{
   let top=0;return reviewParts.map(part=>{
     const c=document.createElement('canvas');c.width=part.image.width;c.height=part.image.height;const ctx=c.getContext('2d');ctx.drawImage(part.image,0,0);
     const rows=[0,c.height-1,...Array.from({length:Math.floor(c.height/(200*scale))},(_,i)=>Math.floor((i*200+100)*scale))].filter(y=>y<c.height).map(y=>({y:top+y,rgb:Array.from(ctx.getImageData(Math.floor(1100*scale),y,1,1).data)}));
     const result={width:c.width,height:c.height,rows};top+=c.height;return result;
   });
 },scale);
 assert.ok(fullPage.length>1,'Actual large capture must split into canvas parts');
 assert.equal(fullPage.reduce((n,p)=>n+p.height,0),Math.ceil(9000*scale));
 fullPage.forEach(part=>{assert.equal(part.width,Math.ceil(1200*scale));part.rows.forEach(({y,rgb})=>assert.deepEqual(rgb,Math.floor(y/scale/200)%2?[30,70,180,255]:[20,120,60,255],`Full-page row ${y}`));});
 assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY,style:document.querySelector('#floating').style.cssText})),{x:170,y:230,style:''});
 fs.writeFileSync(path.join(OUT,'full-page-parts.json'),JSON.stringify(fullPage,null,2));
 await p.evaluate(()=>renderReview());
 fs.writeFileSync(path.join(OUT,'full-page-part-1.png'),Buffer.from((await p.locator('#review-canvas').evaluate(c=>c.toDataURL())).split(',')[1],'base64'));
 await p.locator('#review-part').selectOption(String(fullPage.length-1));
 await p.locator('#review-copy').click();await p.getByText(`Copied part ${fullPage.length} of ${fullPage.length}`,{exact:true}).waitFor();
 await p.close();
 console.log('PASS native ordinary full-page capture: horizontal overflow, actual canvas splits, seam pixels, overlay and scroll restoration');

 await context.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:route.request().url().includes('v=missing')?'<h1>No transcript fixture</h1>':youtubeFixture}));
 await page.goto('https://www.youtube.com/watch?v=fixture');
 // Refresh the test's target URL for the popup router without changing the target tab id.
 p=await popup();
 await p.getByText('Transcript copied',{exact:true}).waitFor({timeout:30000});
 assert.equal(await p.locator('#btn-youtube-alternate').innerText(),'Skim page normally');
 await p.locator('#btn-nav-settings').click();await p.locator('#set-youtube-transcript').uncheck();
 assert.equal(await p.locator('#btn-youtube-alternate').innerText(),'Capture transcript');
 await p.locator('#btn-youtube-alternate').click();await p.getByText('Transcript copied',{exact:true}).waitFor();
 // Isolated-world functions are intentionally not exposed to the page world; read through native scripting.
 const result=await p.evaluate(target=>new Promise(resolve=>chrome.scripting.executeScript({target:{tabId:target.id},func:async()=>await skimYouTubeTranscript()},resolve)),tab);
 assert.ok(result[0].result.text.includes('Transcript sentence 24'));
 assert.ok(result[0].result.text.includes('CAPTION TYPE: automatic'));
 await p.screenshot({path:path.join(OUT,'youtube-result.png')});await p.close();
 console.log('PASS native YouTube DOM fixture: opening transcript, scrolling, timestamp records, toggle and alternate action');
 await page.goto('https://www.youtube.com/watch?v=missing');
 p=await popup();await p.locator('#error-panel').waitFor({state:'visible'});
 assert.match(await p.locator('#error-msg').innerText(),/Transcript control not available/);
 const preserved=await p.evaluate(()=>navigator.clipboard.readText());
 assert.ok(preserved.includes('Transcript sentence 24'),'Unavailable transcript must not replace the clipboard');
 await p.locator('#btn-youtube-alternate').click();await p.getByText('Text copied',{exact:true}).waitFor();
 await p.close();console.log('PASS unavailable transcript: explicit error, unchanged clipboard, manual normal-page fallback');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(OUT,'e2e-result.json'),JSON.stringify({passed:true,at:new Date().toISOString(),scope:'Isolated unpacked Chromium extension; YouTube DOM fixture, not live YouTube; native Chrome capture/scripting/clipboard APIs',pixels},null,2));
})().catch(async e=>{fs.writeFileSync(path.join(OUT,'e2e-result.json'),JSON.stringify({passed:false,at:new Date().toISOString(),error:e.message},null,2));console.error(e);if(context)for(const p of context.pages()){if(p.url().startsWith('chrome-extension:')){console.log(await p.locator('body').innerText());await p.screenshot({path:path.join(OUT,'failure.png')});}}process.exitCode=1;}).finally(async()=>{if(context)await context.close();server.close();console.log('Temporary test profile retained at '+temporary);});
