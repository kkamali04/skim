const {chromium}=require('playwright');
const path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const kind of ['legacy','yt-view-model','current-view-model']){
   const page=await browser.newPage();
   const tag=kind==='legacy'?'ytd-transcript-segment-renderer':kind==='yt-view-model'?'yt-transcript-segment-view-model':'transcript-segment-view-model';
   const stampClass=kind==='legacy'?'segment-timestamp':kind==='yt-view-model'?'yt-transcript-segment-view-model__timestamp':'ytwTranscriptSegmentViewModelTimestamp';
   const textClass=kind==='legacy'?'segment-text':kind==='yt-view-model'?'yt-transcript-segment-view-model__text':'ytAttributedStringHost';
   await page.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:`<h1 class="ytd-watch-metadata">Synthetic transcript</h1><div id="pane" style="height:200px;overflow:auto">${Array.from({length:25},(_,i)=>`<${tag} style="display:block;height:40px"><div class="${stampClass}">0:${String(i).padStart(2,'0')}</div><div class="ytwTranscriptSegmentViewModelTimestampA11yLabel">${i} seconds</div><span class="${textClass}">Sentence ${i}</span></${tag}>`).join('')}</div>`}));
   await page.goto('https://www.youtube.com/watch?v=fixture&list=playlist&t=5s');
   await page.addScriptTag({path:path.join(__dirname,'..','extension','youtube.js')});
   await page.locator('#pane').evaluate(el=>el.scrollTop=125);
   const result=await page.evaluate(()=>skimYouTubeTranscript());
   assert.ok(result.text,kind+': '+result.error);
   assert.ok(result.text.includes('[0:24](https://www.youtube.com/watch?v=fixture&t=24s) Sentence 24'));
   assert.equal((result.text.match(/^\[/gm)||[]).length,25,'Every synthetic segment exported for '+kind);
   assert.equal(await page.locator('#pane').evaluate(el=>el.scrollTop),125,'Restore transcript scroll for '+kind);
   await page.close();
  }
  console.log('PASS YouTube legacy and both view-model layouts: all timestamps, text, canonical links and scroll restoration');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
