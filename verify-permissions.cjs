// Native permission-denial checks with the exact production manifest and no host grants.
const {chromium}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'skim-permissions-'));
const extension=path.join(temporary,'extension');fs.mkdirSync(extension);
for(const name of ['manifest.json','background.js','api.js','privacy.js','popup.html','popup.css','popup.js','exports.js','youtube.js','page.js','icon16.png','icon48.png','icon128.png'])fs.copyFileSync(path.join(__dirname,name),path.join(extension,name));
fs.cpSync(path.join(__dirname,'assets'),path.join(extension,'assets'),{recursive:true});
fs.writeFileSync(path.join(extension,'permission-check.html'),'<script src="privacy.js"></script><script src="api.js"></script>');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<title>Skim permission fixture</title><p>Public synthetic fixture</p>');});
let context;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 context=await chromium.launchPersistentContext(path.join(temporary,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const pageEvent=context.waitForEvent('page');
 const tab=await worker.evaluate(async url=>{const t=await chrome.tabs.create({url,active:true});return {id:t.id,windowId:t.windowId};},'http://127.0.0.1:'+server.address().port);
 const page=await pageEvent;await page.waitForLoadState();
 const denied=await worker.evaluate(async tab=>{
   const all=await chrome.permissions.getAll();
   let injection='',capture='';
   try{await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>document.title});}catch(e){injection=e.message;}
   try{await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});}catch(e){capture=e.message;}
   return {all,injection,capture,popup:await chrome.action.getPopup({}),expectedPopup:chrome.runtime.getURL('popup.html'),manifest:chrome.runtime.getManifest()};
 },tab);
 assert.equal(denied.popup,denied.expectedPopup);
 assert.ok(!denied.manifest.host_permissions?.length,'Exact production manifest has no permanent host grants');
 assert.ok(!denied.all.permissions.includes('clipboardRead'));
 assert.equal((denied.all.origins||[]).length,0,'Optional host declarations must not become installed grants');
 assert.match(denied.injection,/permission|cannot access/i,'Injection must fail without a real activeTab gesture');
 assert.match(denied.capture,/activeTab|all_urls|permission/i,'Screenshot must fail without a real activeTab gesture');
 const checkPage=await context.newPage();
 await checkPage.goto(new URL('permission-check.html',worker.url()).href);
 const provider=await checkPage.evaluate(async()=>{
   let requests=0;globalThis.fetch=async()=>{requests++;throw Error('Unexpected request without host permission');};
   const response=await new Promise(resolve=>CaptureAPI.summarizeViaLLM('Synthetic public text',{key:'dummy-key',baseUrl:'https://example.com/v1',model:'fixture'},(text,error)=>resolve({text,error})));
   return {requests,error:response.error,granted:await chrome.permissions.contains({origins:['https://example.com/*']})};
 });
 assert.equal(provider.granted,false);assert.equal(provider.requests,0);assert.match(provider.error,/Enable provider access/);
 const alarm=await worker.evaluate(()=>chrome.alarms.get('skim-history-expiry'));
 assert.equal(alarm?.periodInMinutes,60,'Register local hourly cleanup for optional text history');
 const history=await worker.evaluate(async()=>{
   await chrome.storage.local.set({skim_settings:{historyEnabled:true,historyConsentVersion:1},skim_history:[{ts:Date.now()-15*86400000,text:'Expired synthetic capture'},{ts:Date.now()-1000,text:'Recent synthetic capture'}]});
   await chrome.alarms.create('skim-history-expiry',{when:Date.now()+1000});
   for(let i=0;i<100;i++){const {skim_history:h}=await chrome.storage.local.get('skim_history');if(h?.length===1)return h;await new Promise(r=>setTimeout(r,100));}
   throw Error('Native cleanup alarm did not delete the expired capture');
 });
 assert.equal(history[0].text,'Recent synthetic capture');
 console.log('PASS native local alarm removes 14-day-expired history and preserves recent opt-in captures');
 console.log('PASS exact production manifest: native popup registration, no installed host/clipboard-read grants, injection/capture denied before gesture, provider denied before network');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(context)await context.close();server.close();});
