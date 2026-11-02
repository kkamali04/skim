const {chromium}=require('playwright');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  const transcriptStatuses=[],transcriptErrors=[];
  // This disposable browser is unsigned in. Record no request headers/cookies.
  page.on('response',async r=>{if(r.url().includes('get_transcript')){
   transcriptStatuses.push(r.status());
   if(!r.ok())try{const body=await r.json();transcriptErrors.push({status:body.error?.status,message:String(body.error?.message||'').slice(0,300)});}catch{}
   console.log('Transcript HTTP status:',r.status());
  }});
  page.on('requestfailed',r=>{if(r.url().includes('get_transcript'))console.log('Transcript request failure:',r.failure().errorText);});
  const target=process.argv[2]||'https://www.youtube.com/watch?v=VMj-3S1tku0';
  const targetURL=new URL(target);
  if(targetURL.protocol!=='https:'||targetURL.hostname!=='www.youtube.com'||targetURL.pathname!=='/watch'||!targetURL.searchParams.has('v'))throw Error('Use a public https://www.youtube.com/watch?v= video URL');
  await page.goto(target,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(4000);
  const result=await page.evaluate('(async()=>{'+fs.readFileSync(path.join(__dirname,'youtube.js'),'utf8')+'\nreturn await skimYouTubeTranscript();})()');
  const stamps=result.text?Array.from(result.text.matchAll(/^\[([\d:]+)\]/gm),m=>m[1]):[];
  const report={at:new Date().toISOString(),browser:browser.version(),url:page.url(),title:await page.title(),success:!!result.text,error:result.error||null,characters:result.text?result.text.length:0,segments:stamps.length,firstTimestamp:stamps[0]||null,lastTimestamp:stamps.at(-1)||null,coverage:result.text?.split('\n').find(l=>l.startsWith('COVERAGE:'))||null,transcriptStatuses,transcriptErrors};
  fs.mkdirSync(path.join(__dirname,'test-results'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'test-results','youtube-live.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(__dirname,'test-results','youtube-live-'+targetURL.searchParams.get('v').replace(/[^\w-]/g,'')+'.json'),JSON.stringify(report,null,2));
  await page.screenshot({path:path.join(__dirname,'test-results','youtube-live.png')});
  console.log(JSON.stringify(report));
  if(!result.text)console.log(await page.evaluate(()=>Array.from(new Set(Array.from(document.querySelectorAll('*')).map(e=>e.tagName).filter(t=>t.includes('TRANSCRIPT'))))));
  if(!result.text)console.log('Segment layout:',JSON.stringify(await page.evaluate(()=>{
   const el=document.querySelector('transcript-segment-view-model');
   return el?Array.from(el.querySelectorAll('*')).map(n=>({tag:n.tagName,classes:n.className,timestamp:/^\d+(?::\d{2}){1,2}$/.test(n.textContent.trim())?n.textContent.trim():undefined,textLength:n.textContent.trim().length})):[];
  })));
  if(!result.text)process.exitCode=2;
 } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
