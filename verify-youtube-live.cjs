const {chromium}=require('playwright');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  const transcriptStatuses=[];
  page.on('response',r=>{if(r.url().includes('get_transcript')){transcriptStatuses.push(r.status());console.log('Transcript HTTP status:',r.status());}});
  page.on('requestfailed',r=>{if(r.url().includes('get_transcript'))console.log('Transcript request failure:',r.failure().errorText);});
  await page.goto('https://www.youtube.com/watch?v=VMj-3S1tku0',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(4000);
  const result=await page.evaluate('(async()=>{'+fs.readFileSync(path.join(__dirname,'youtube.js'),'utf8')+'\nreturn await skimYouTubeTranscript();})()');
  const report={at:new Date().toISOString(),url:page.url(),title:await page.title(),success:!!result.text,error:result.error||null,characters:result.text?result.text.length:0,transcriptStatuses};
  fs.mkdirSync(path.join(__dirname,'test-results'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'test-results','youtube-live.json'),JSON.stringify(report,null,2));
  await page.screenshot({path:path.join(__dirname,'test-results','youtube-live.png')});
  console.log(JSON.stringify(report));
  if(!result.text)console.log(await page.evaluate(()=>Array.from(new Set(Array.from(document.querySelectorAll('*')).map(e=>e.tagName).filter(t=>t.includes('TRANSCRIPT'))))));
  if(!result.text)process.exitCode=2;
 } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
