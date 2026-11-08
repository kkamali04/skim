// Real Chrome action popup in a disposable profile; no separate-window/tab-query shim.
const {chromium}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'skim-action-')),extension=path.join(temporary,'extension'),out=path.join(__dirname,'..','test-results');
fs.mkdirSync(extension);fs.mkdirSync(out,{recursive:true});
for(const name of ['manifest.json','background.js','api.js','privacy.js','page.js','youtube.js','products.js','popup.js','popup.html','popup.css','exports.js','icon16.png','icon48.png','icon128.png'])fs.copyFileSync(path.join(__dirname,'..','extension',name),path.join(extension,name));
fs.cpSync(path.join(__dirname,'..','extension','assets'),path.join(extension,'assets'),{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json')));
// openPopup() does not grant activeTab. Only this test copy gets screenshot permission and reads back its own clipboard writes.
manifest.host_permissions=['<all_urls>'];manifest.permissions.push('clipboardRead');
fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
fs.writeFileSync(path.join(extension,'clipboard-check.html'),'<script src="privacy.js"></script><script src="api.js"></script>');
const server=http.createServer((req,res)=>{
 res.setHeader('Content-Type','text/html');res.setHeader('Permissions-Policy','clipboard-write=()');
 res.setHeader('Content-Security-Policy',"style-src 'nonce-skim-test'");
 res.end('<style nonce="skim-test">html{scroll-behavior:smooth}p{height:300px}</style><h1>Native action fixture</h1><input id="original" aria-label="Original field">'+Array.from({length:12},(_,i)=>'<p>Paragraph '+i+'</p>').join('')+'<input role="combobox" aria-haspopup="listbox" aria-label="Offscreen choice"><script>window.positions=[];addEventListener("scroll",()=>positions.push(scrollY));</script>');
});
let context;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 context=await chromium.launchPersistentContext(path.join(temporary,'profile'),{channel:'chromium',headless:!process.argv.includes('--headed'),viewport:null,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),page=context.pages()[0];
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(()=>{document.querySelector('#original').focus({preventScroll:true});scrollTo({top:600,behavior:'instant'});});
 const cdp=await context.browser().newBrowserCDPSession();
 await worker.evaluate(()=>chrome.action.openPopup());
 const target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url.endsWith('/popup.html'));
 assert.ok(target,'Chrome must open a native action popup');
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});let sequence=0;
 async function command(method,params={}){
  const id=++sequence;
  const answer=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{cdp.off('Target.receivedMessageFromTarget',handler);reject(Error('Popup command timed out: '+method));},30000);
   function handler(e){if(e.sessionId!==sessionId)return;const m=JSON.parse(e.message);if(m.id!==id)return;clearTimeout(timer);cdp.off('Target.receivedMessageFromTarget',handler);m.error?reject(Error(m.error.message)):resolve(m.result);}
   cdp.on('Target.receivedMessageFromTarget',handler);
  });
  await cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})});return answer;
 }
 async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value;}
 await evaluate('new Promise((resolve,reject)=>{const start=Date.now();const poll=()=>{if(getCurrentPanel()==="result"||getCurrentPanel()==="error-panel")return resolve();if(Date.now()-start>25000)return reject(Error("Capture timed out"));setTimeout(poll,100);};poll();})');
 const frames=await evaluate('(()=>{const previous=getCurrentPanel(),frames=[];for(const id of ALL_PANELS){showPanel(id);frames.push({id,width:innerWidth,height:innerHeight,bodyWidth:document.body.getBoundingClientRect().width,bodyHeight:document.body.getBoundingClientRect().height,overflow:document.body.scrollWidth>innerWidth});}showPanel(previous);return frames;})()');
 for(const frame of frames)assert.deepEqual(frame,{id:frame.id,width:460,height:400,bodyWidth:460,bodyHeight:400,overflow:false},'Native popup size for '+frame.id);
 console.log('PASS native action popup: fixed 460x400 viewport and body across panels');
 assert.equal(await evaluate('getCurrentPanel()'),'result',await evaluate('document.querySelector("#error-msg").textContent'));
 const captured=await evaluate('capturedText'),clipboard=await evaluate('navigator.clipboard.readText()');
 assert.equal(clipboard.replace(/\r\n/g,'\n'),captured);assert.ok(captured.includes('Paragraph 11'));
 const screenshot=await command('Page.captureScreenshot');fs.writeFileSync(path.join(out,'native-action.png'),Buffer.from(screenshot.data,'base64'));
 const state=await page.evaluate(()=>({y:scrollY,positions,active:document.activeElement.id,style:getComputedStyle(document.documentElement).scrollBehavior}));
 assert.equal(state.y,600,'Original page scroll restored before copy completes');
 assert.ok(state.positions.length<35,'Smooth-scroll animation must not fight the capture sweep: '+state.positions.length+' scroll events');
 assert.equal(state.active,'original','Dropdown probing restores the original focused control');assert.equal(state.style,'smooth','Restore the site scroll behavior');
 console.log('PASS default text capture: bounded scroll sweep, position/focus/style restoration and actual clipboard readback');
 const sourceSize=await page.evaluate(()=>({width:Math.max(innerWidth,document.documentElement.scrollWidth),height:document.documentElement.scrollHeight,viewportWidth:innerWidth}));
 const sourcePNG=await worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});return chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});});
 const bitmapScale=Buffer.from(sourcePNG.split(',')[1],'base64').readUInt32BE(16)/sourceSize.viewportWidth;
 const expectedImage={width:Math.ceil(sourceSize.width*bitmapScale),height:Math.ceil(sourceSize.height*bitmapScale)};
 await evaluate(`(()=>{window.captureCalls=[];const capture=chrome.tabs.captureVisibleTab.bind(chrome.tabs);chrome.tabs.captureVisibleTab=(windowId,options,callback)=>{const call={at:performance.now()};captureCalls.push(call);return capture(windowId,options,png=>{call.error=chrome.runtime.lastError?.message||null;callback(png);});};})()`);
 const screenshotStarted=Date.now();
 await evaluate('document.querySelector("#btn-action2").click()');
 await evaluate('new Promise((resolve,reject)=>{const start=Date.now();const poll=()=>{if(getCurrentPanel()==="review")return resolve();if(getCurrentPanel()==="error-panel")return reject(Error(document.querySelector("#error-msg").textContent));if(Date.now()-start>60000)return reject(Error("Screenshot capture timed out"));setTimeout(poll,100);};poll();})');
 const controlsAbove=await evaluate(`(()=>{const image=document.querySelector('.review-viewport');return [...document.querySelectorAll('#review button')].every(button=>!!(button.compareDocumentPosition(image)&Node.DOCUMENT_POSITION_FOLLOWING));})()`);
 assert.ok(controlsAbove,'Every screenshot action must appear before the preview in reading and keyboard order');
 await command('Page.captureScreenshot').then(s=>fs.writeFileSync(path.join(out,'native-review.png'),Buffer.from(s.data,'base64')));
 const automaticImage=await evaluate('(async()=>{for(let i=0;i<50;i++){const items=await navigator.clipboard.read();if(items[0]?.types.includes("image/png")){const image=await createImageBitmap(await items[0].getType("image/png"));const size={width:image.width,height:image.height};image.close();return size;}await new Promise(r=>setTimeout(r,100));}return null;})()');
 assert.deepEqual(automaticImage,expectedImage,'Take screenshot must automatically copy the complete PNG from the native action popup: '+JSON.stringify({actual:automaticImage,expected:expectedImage,viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,clientWidth:document.documentElement.clientWidth}))}));
 const screenshotTiming={milliseconds:Date.now()-screenshotStarted,calls:await evaluate('captureCalls')};
 console.log('SCREENSHOT TIMING '+JSON.stringify(screenshotTiming));
 console.log('PASS native action screenshot: automatic complete PNG clipboard readback without another Copy click');
 await evaluate('window.close()');
 // Keep the extension document alive but unfocused, with clipboard writes forbidden by the captured site.
 const check=await context.newPage();await check.goto(new URL('clipboard-check.html',worker.url()).href);
 await check.evaluate(()=>navigator.clipboard.writeText('Skim regression seed'));
 // Playwright forces focus on every controlled page. Disable that emulation so this is a real background document.
 await (await context.newCDPSession(check)).send('Emulation.setFocusEmulationEnabled',{enabled:false});
 await (await context.newCDPSession(page)).send('Emulation.setFocusEmulationEnabled',{enabled:false});
 await page.bringToFront();
 assert.equal(await check.evaluate(()=>document.hasFocus()),false,'Clipboard regression must actually lose document focus');
 const tab=await worker.evaluate(async()=> (await chrome.tabs.query({active:true})).find(t=>t.url.startsWith('http://127.0.0.1')));
 const copied=await check.evaluate(target=>new Promise((resolve,reject)=>CaptureAPI.capturePageCode(target,resolve,error=>reject(Error(error)),true)),tab);
 await check.bringToFront();
 assert.equal((await check.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n'),copied,'Unfocused extension must write the actual system clipboard');
 assert.ok(copied.includes('Native action fixture'));
 console.log('PASS actual unfocused-extension code capture/clipboard readback on a clipboard-restricted site');
 await page.bringToFront();
 const text=await check.evaluate(target=>new Promise((resolve,reject)=>CaptureAPI.capturePageText(target,resolve,error=>reject(Error(error)),true)),tab);
 await check.bringToFront();
 assert.equal((await check.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n'),text);
 assert.ok(text.includes('Paragraph 11'));
 console.log('PASS actual unfocused-extension text capture/clipboard readback with production extraction defaults');
 fs.writeFileSync(path.join(out,'action-result.json'),JSON.stringify({passed:true,at:new Date().toISOString(),browser:context.browser().version(),headed:process.argv.includes('--headed'),nativePopup:true,productionDefaults:true,frames,scrollEvents:state.positions.length,automaticImage,screenshotTiming,scope:'Disposable Chromium, all-site capture grant and clipboardRead are test-only; no physical toolbar gesture.'},null,2));
})().catch(e=>{fs.writeFileSync(path.join(out,'action-result.json'),JSON.stringify({passed:false,at:new Date().toISOString(),error:e.message},null,2));console.error(e);process.exitCode=1;}).finally(async()=>{if(context)await context.close();server.close();});
