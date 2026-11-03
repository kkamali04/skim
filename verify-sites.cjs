// Opt-in live-web acceptance. No login, provider calls, form submission or fixture routing.
const {chromium}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sites=[
 {id:'example',url:'https://example.com/',need:['This domain is for use in documentation examples']},
 {id:'mdn',url:'https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText',need:['writeText()', 'Syntax','Examples','Specifications']},
 {id:'wikipedia',url:'https://en.wikipedia.org/wiki/Clipboard_(computing)',need:['Clipboard','References']},
 {id:'hackernews',url:'https://news.ycombinator.com/news',need:['Hacker News','More'],records:'.titleline > a'},
 {id:'books',url:'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',need:['A Light in the Attic','Product Information','Availability']},
 {id:'httpbin',url:'https://httpbin.org/forms/post',need:['Customer name','Pizza Size','Delivery instructions'],form:true},
 {id:'github',url:'https://github.com/microsoft/playwright',need:['Playwright','README','Installation']},
 {id:'mui',url:'https://mui.com/material-ui/react-select/',need:['Select','Basic select','Multiple select']},
 {id:'shoelace',url:'https://shoelace.style/components/select',need:['Select','Multiple','Clearable'],shadowForm:true},
 {id:'youtube',url:'https://www.youtube.com/watch?v=UF8uR6Z6KLc',need:['Steve Jobs'],transcript:true},
];
const selected=process.argv.slice(2).filter(a=>!a.startsWith('--'));
for(const id of selected)assert.ok(sites.some(s=>s.id===id),'Unknown site '+id);
const out=path.join(__dirname,'test-results','live-sites');fs.mkdirSync(out,{recursive:true});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'skim-sites-')),extension=path.join(temporary,'extension');fs.mkdirSync(extension);
for(const name of ['manifest.json','background.js','api.js','privacy.js','page.js','youtube.js','popup.js','popup.html','popup.css','exports.js','icon16.png','icon48.png','icon128.png'])fs.copyFileSync(path.join(__dirname,name),path.join(extension,name));
fs.cpSync(path.join(__dirname,'assets'),path.join(extension,'assets'),{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json')));
// Native openPopup does not grant activeTab. Only this disposable profile gets these test grants.
manifest.host_permissions=['<all_urls>'];manifest.permissions.push('clipboardRead');
fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
const report={at:new Date().toISOString(),scope:'Public live websites, unsigned-in disposable Chromium; native popup, production extraction defaults, test-only all-site access and clipboardRead. Does not prove installed physical activeTab gesture.',sites:[]};
report.sourceSha256=Object.fromEntries(['page.js','privacy.js','api.js','popup.js'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(extension,name))).digest('hex')]));
let context,cdp,sequence=0;
function save(){fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));}
async function popup(worker){
 await worker.evaluate(()=>chrome.action.openPopup());
 let target;
 for(let i=0;i<30&&!target;i++){target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url.endsWith('/popup.html'));if(!target)await new Promise(r=>setTimeout(r,100));}
 assert.ok(target,'Native popup opened');
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
 async function command(method,params={}){
  const id=++sequence;
  const answer=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{cdp.off('Target.receivedMessageFromTarget',handler);reject(Error('Popup command timed out: '+method));},200000);
   function handler(e){if(e.sessionId!==sessionId)return;const m=JSON.parse(e.message);if(m.id!==id)return;clearTimeout(timer);cdp.off('Target.receivedMessageFromTarget',handler);m.error?reject(Error(m.error.message)):resolve(m.result);}
   cdp.on('Target.receivedMessageFromTarget',handler);
  });
  await cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})});return answer;
 }
 return async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
}
async function ready(evaluate,panels){
 return evaluate(`new Promise((resolve,reject)=>{const start=Date.now();const poll=()=>{const p=getCurrentPanel();if(${JSON.stringify(panels)}.includes(p))return resolve(p);if(p==='error-panel')return reject(Error(document.querySelector('#error-msg').textContent));if(Date.now()-start>180000)return reject(Error('Capture timed out'));setTimeout(poll,100);};poll();})`);
}
async function state(page){return page.evaluate(()=>{const values=[];function walk(root){root.querySelectorAll('*').forEach(e=>{if(e.matches('input,select,textarea,[role="combobox"],sl-select'))values.push({value:e.value,checked:e.checked,expanded:e.getAttribute('aria-expanded')});if(e.shadowRoot)walk(e.shadowRoot);});}walk(document);return {x:scrollX,y:scrollY,values,scrollBehavior:getComputedStyle(document.documentElement).scrollBehavior};});}
(async()=>{
 context=await chromium.launchPersistentContext(path.join(temporary,'profile'),{channel:'chromium',headless:!process.argv.includes('--headed'),viewport:{width:1280,height:800},deviceScaleFactor:1,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 report.browser=context.browser().version();cdp=await context.browser().newBrowserCDPSession();
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),page=context.pages()[0];
 let downloads=0;page.on('download',()=>downloads++);
 for(const site of sites.filter(s=>!selected.length||selected.includes(s.id))){
  const r={id:site.id,url:site.url};report.sites.push(r);let evaluate;
  console.log('START '+site.id);save();
  try{
   const response=await page.goto(site.url,{waitUntil:'domcontentloaded',timeout:45000});r.http=response?.status();
   await page.waitForTimeout(2500);r.finalUrl=page.url();r.title=await page.title();
   if(!response?.ok())throw Error('Live page unavailable: HTTP '+r.http);
   const body=await page.locator('body').innerText();
   for(const need of site.need)assert.ok(body.replace(/\s+/g,' ').toLowerCase().includes(need.toLowerCase()),'Live page preflight missing '+need+'; body: '+body.slice(0,200));
   if(site.form){
    await page.locator('[name="custname"]').fill('Skim QA Example');
    await page.locator('[name="custemail"]').fill('skim-qa@example.com');
    await page.locator('[name="comments"]').fill('Skim QA delivery instructions. Do not submit.');
    await page.locator('[name="size"][value="medium"]').check();
    await page.locator('[name="topping"][value="onion"]').check();
   }
   if(site.shadowForm)await page.locator('sl-select').first().evaluate(async el=>{await el.updateComplete;el.value='option-2';await el.updateComplete;});
   const records=site.records?await page.locator(site.records).evaluateAll(nodes=>nodes.map(n=>({title:n.textContent.trim(),url:n.href}))):[];
   // Select static body lines across the whole live DOM, rather than only checking a page title.
   const lines=body.split('\n').map(s=>s.trim()).filter(s=>s.length>35&&s.length<180&&!/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(s));
   const samples=site.transcript?[]:Array.from(new Set([0,.2,.4,.6,.8,1].map(f=>lines[Math.floor((lines.length-1)*f)]).filter(Boolean)));
   await page.evaluate(()=>scrollTo({top:Math.min(300,document.documentElement.scrollHeight-innerHeight),behavior:'instant'}));
   const before=await state(page);
   evaluate=await popup(worker);await ready(evaluate,['result']);
   const text=await evaluate('capturedText'),clip=await evaluate('navigator.clipboard.readText()');
   assert.equal(clip.replace(/\r\n/g,'\n'),text,'Actual text clipboard equals complete capture');
   for(const need of site.need)assert.ok(text.toLowerCase().includes(need.toLowerCase()),'Capture missing '+need);
   r.samples=samples.map(line=>({line,present:text.replace(/\s+/g,' ').includes(line.replace(/\s+/g,' '))}));
   r.missingRecords=records.filter(item=>!text.includes(item.title)||!text.includes(item.url));
   assert.equal(r.missingRecords.length,0,'All current live list titles and URLs retained');
   if(site.form){assert.ok(text.includes('Skim QA Example'));assert.ok(text.includes('Skim QA delivery instructions. Do not submit.'));assert.ok(!text.includes('skim-qa@example.com'),'Dummy email redacted');assert.equal(text.split('\n').filter(l=>l.startsWith('[INPUT radio ')).length,3);assert.equal(text.split('\n').filter(l=>l.startsWith('[INPUT checkbox ')).length,4);assert.ok(text.includes('[INPUT radio [✓]] "Medium"'));assert.ok(text.includes('[INPUT checkbox [✓]] "Onion"'));}
   if(site.shadowForm)assert.ok(text.split('\n').some(l=>l.startsWith('[SHADOW input]')&&l.includes('value="Option 2"')),'Selected live shadow-combobox display value must reach the clipboard');
   if(site.transcript){
    const stamps=Array.from(text.matchAll(/^\[([\d:]+)\]/gm),m=>m[1]);
    assert.ok(stamps.length>=100,'Live transcript contains timestamped segments');
    assert.ok(text.includes('Reached stable end of transcript panel'));
    assert.ok(text.includes('UNPARSED SEGMENT OBSERVATIONS: 0'));
    r.transcript={segments:stamps.length,first:stamps[0],last:stamps.at(-1),actualClipboard:true};
   }
   r.text={status:'passed',characters:text.length,warnings:text.split('\n').filter(l=>l.startsWith('CAPTURE WARNING:')),sampleHits:r.samples.filter(s=>s.present).length,sampleCount:r.samples.length,records:records.length};
   fs.writeFileSync(path.join(out,site.id+'.txt'),text);
   const afterText=await state(page);if(!site.transcript){r.stateChanges={before:before.values.filter((v,i)=>JSON.stringify(v)!==JSON.stringify(afterText.values[i])),after:afterText.values.filter((v,i)=>JSON.stringify(v)!==JSON.stringify(before.values[i]))};assert.deepEqual(afterText,before,'Text capture preserves scroll, fields and scroll CSS');}
   r.restoration={text:site.transcript?'Native transcript UI opened; page-field restoration not asserted':true};
   console.log('TEXT '+site.id+' '+text.length+' chars; samples '+r.text.sampleHits+'/'+r.text.sampleCount);
   if(site.transcript){r.status='passed';r.scope='Native popup transcript and actual text clipboard; video screenshot not part of this case';continue;}
   // Independent browser full-page reference, not Skim's scroll/stitch implementation.
   // Start the independent reference at the top: otherwise Chrome paints sticky headers at the old scroll offset.
   await page.evaluate(()=>scrollTo({top:0,left:0,behavior:'instant'}));
   const scrollbarStyle=await page.evaluate(()=>{const el=document.createElement('style');el.id='skim-qa-reference-scrollbars';el.textContent='*{scrollbar-width:none!important}';document.head.append(el);return el.id;});
   const differences=await page.evaluate(()=>{
    const masks=[],overlays=[];
    function walk(root){root.querySelectorAll('*').forEach(el=>{
     const s=getComputedStyle(el),r=el.getBoundingClientRect();
     if(s.visibility==='visible'&&s.display!=='none'&&r.width&&r.height){
      const box={x:r.x+scrollX-4,y:r.y+scrollY-4,width:r.width+8,height:r.height+8};
      if(el.matches('input,textarea,select,[contenteditable="true"],iframe'))masks.push(box);
      if(s.position==='fixed'||s.position==='sticky')overlays.push(box);
     }
     if(el.shadowRoot)walk(el.shadowRoot);
    });}walk(document);return {masks,overlays};
   });
   r.expectedDifferenceRegions=differences;
   const reference=await page.screenshot({fullPage:true,animations:'disabled',timeout:30000});fs.writeFileSync(path.join(out,site.id+'-reference.png'),reference);
   await page.evaluate(id=>document.getElementById(id).remove(),scrollbarStyle);
   await page.evaluate(pos=>scrollTo({top:pos.y,left:pos.x,behavior:'instant'}),before);
   const beforeImage=await state(page);
   await evaluate('document.querySelector("#btn-action2").click()');await ready(evaluate,['review']);
   const image=await evaluate(`(async()=>{for(let i=0;i<100;i++){const status=document.querySelector('#review-status').textContent;if(status.includes('failed'))throw Error(status);if(status.startsWith('Copied full screenshot')){const items=await navigator.clipboard.read();if(items[0]?.types.includes('image/png')){const blob=await items[0].getType('image/png');return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});}}await new Promise(r=>setTimeout(r,100));}throw Error('Automatic PNG absent from clipboard: '+document.querySelector('#review-status').textContent);})()`);
   const png=Buffer.from(image.split(',')[1],'base64');fs.writeFileSync(path.join(out,site.id+'.png'),png);
   r.image={status:'passed',width:png.readUInt32BE(16),height:png.readUInt32BE(20),bytes:png.length,statusText:await evaluate('document.querySelector("#review-status").textContent')};
   r.reference={width:reference.readUInt32BE(16),height:reference.readUInt32BE(20)};
   // Inspect non-white pixels too: a blank white image must not pass as a mostly-white webpage.
   r.pixelComparison=await evaluate(`(async()=>{const decode=async url=>createImageBitmap(await(await fetch(url)).blob());const a=await decode(${JSON.stringify(image)}),b=await decode(${JSON.stringify('data:image/png;base64,'+reference.toString('base64'))});if(a.width!==b.width||a.height!==b.height)return {sameDimensions:false};const ca=document.createElement('canvas'),cb=document.createElement('canvas');ca.width=cb.width=a.width;ca.height=cb.height=a.height;ca.getContext('2d').drawImage(a,0,0);cb.getContext('2d').drawImage(b,0,0);const aa=ca.getContext('2d').getImageData(0,0,a.width,a.height).data,bb=cb.getContext('2d').getImageData(0,0,b.width,b.height).data,regions=${JSON.stringify(differences.masks.concat(differences.overlays))};let samples=0,matched=0,ink=0,inkMatched=0,excluded=0;for(let i=0;i<aa.length;i+=28){const p=i/4,x=p%a.width,y=Math.floor(p/a.width);if(regions.some(r=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height)){excluded++;continue;}samples++;const near=Math.max(Math.abs(aa[i]-bb[i]),Math.abs(aa[i+1]-bb[i+1]),Math.abs(aa[i+2]-bb[i+2]))<=20;if(near)matched++;if(Math.min(bb[i],bb[i+1],bb[i+2])<180){ink++;if(near)inkMatched++;}}const redactionCenters=${site.form?'true':'false'}?${JSON.stringify(differences.masks)}.map(r=>{const x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2),i=(y*a.width+x)*4;return {x,y,black:aa[i]===0&&aa[i+1]===0&&aa[i+2]===0&&aa[i+3]===255};}):[];a.close();b.close();return {sameDimensions:true,match:matched/samples,inkMatch:ink?inkMatched/ink:null,inkSamples:ink,excludedFraction:excluded/(samples+excluded),redactionCenters};})()`);
   assert.ok(r.pixelComparison.redactionCenters?.every(p=>p.black),'Live form fields must be opaque in the actual clipboard image');
   assert.deepEqual(await state(page),beforeImage,'Screenshot preserves scroll, fields and scroll CSS');r.restoration.image=true;
   r.noAutomaticDownloads=downloads===0;assert.equal(downloads,0);
   assert.ok(!(await worker.evaluate(()=>chrome.storage.local.get('skim_history'))).skim_history?.length,'No default persistent capture history');
   r.status=r.samples.every(s=>s.present)&&r.pixelComparison.sameDimensions&&r.pixelComparison.inkMatch>.9?'passed':'review';
  }catch(e){r.status=r.text?'failed':'unavailable-or-failed';r.error=e.message;await page.screenshot({path:path.join(out,site.id+'-failure.png')}).catch(()=>{});console.log('ISSUE '+site.id+' '+e.message);}
  finally{if(evaluate)try{await evaluate('window.close()');}catch{}save();console.log('RESULT '+site.id+' '+r.status);}
 }
 report.finished=new Date().toISOString();save();console.log(JSON.stringify(report.sites.map(({id,status,text,image,error,transcript})=>({id,status,characters:text?.characters,image:image?{width:image.width,height:image.height}:undefined,error,transcript})),null,2));
 if(report.sites.some(r=>r.status!=='passed'))process.exitCode=2;
})().catch(e=>{report.error=e.message;save();console.error(e);process.exitCode=1;}).finally(async()=>{if(context)await context.close();});
