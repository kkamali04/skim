const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.setContent('<main><h1>Fixture</h1><p>test@example.com</p><input value="secret-value-123" type="password"><input value="alice@example.com"><canvas width="80" height="30"></canvas></main>');
    await page.evaluate(() => { window.chrome = {runtime: {onMessage: {addListener() {}}}}; });
    if (fs.existsSync(path.join(__dirname, 'privacy.js'))) await page.addScriptTag({path: path.join(__dirname, 'privacy.js')});
    await page.addScriptTag({path: path.join(__dirname, 'page.js')});
    const code = await page.evaluate(() => new Promise(resolve => { window._skimAutoRedact = true; extractPageCode(resolve); }));
    assert.ok(!code.includes('test@example.com'), 'Code export must redact email');
    assert.ok(!code.includes('secret-value-123'), 'Code export must remove password values');
    const leaks=[];
    for (const section of ['html','css']) {
      const clipped = await page.evaluate(section => {
        const key='-----BEGIN PRIVATE KEY-----\nSYNTHETIC_PRIVATE_MATERIAL\n-----END PRIVATE KEY-----';
        const main=document.querySelector('main');
        main.textContent='Fixture';
        if(section==='html') main.textContent='x'.repeat(CODE_HTML_CAP-70)+key+'x'.repeat(200);
        else {const style=document.createElement('style');style.textContent='main::before { content: "'+ 'x'.repeat(CODE_CSS_CAP-90)+key.replace(/\n/g,' ')+'x'.repeat(200)+'"; }';document.head.append(style);}
        return new Promise(resolve=>extractPageCode(resolve));
      }, section);
      if(clipped.includes('SYNTHETIC_PRIVATE'))leaks.push(section);
      assert.ok(clipped.includes('TRUNCATED'),'Oversize code still reports truncation');
    }
    assert.deepEqual(leaks,[],'Code sections must redact complete secrets before clipping');
    await page.evaluate(()=>{document.body.innerHTML='<main><p>test@example.com</p><input type="password" value="secret-value-123"><input value="alice@example.com"></main>';});
    const result = await page.evaluate(() => ({
      text: redactText('sk-proj-' + 'a'.repeat(80) + ' https://example.com/?token=super-secret-token-123'),
      zones: collectRedactZones(null)
    }));
    assert.ok(!result.text.includes('a'.repeat(80)), 'Project API keys must be redacted');
    assert.ok(!result.text.includes('super-secret-token-123'), 'URL tokens must be redacted');
    assert.ok(result.zones.length >= 3, 'Screenshot masks must cover inputs and text');
    const count=await page.evaluate(()=>{
      document.body.innerHTML='<div style="font-size:1px;line-height:2px">'+Array.from({length:600},()=>'<span>person@example.com </span>').join('')+'</div>';
      return collectRedactZones().length;
    });
    assert.ok(count>=600,'No silent 500-mask cutoff');
    await page.setContent('<iframe srcdoc="<label for=credential>API key</label><input id=credential value=synthetic-labelled-secret>"></iframe>');
    const frame=page.frames()[1];
    await frame.addScriptTag({path:path.join(__dirname,'privacy.js')});
    const api=fs.readFileSync(path.join(__dirname,'api.js'),'utf8');
    const frameStart=api.indexOf('    function _extractFrame('),frameEnd=api.indexOf('    // Default system prompt');
    assert.ok(frameStart>=0&&frameEnd>frameStart,'Frame extractor must exist');
    await frame.addScriptTag({content:api.slice(frameStart,frameEnd)});
    const frameText=await frame.evaluate(()=>_formatFrame(_extractFrame(),0,true));
    assert.ok(!frameText.includes('synthetic-labelled-secret'),'Iframe fields must honor associated sensitive labels');
    assert.ok((await frame.evaluate(()=>_formatFrame(_extractFrame(false),0,false))).includes('synthetic-labelled-secret'),'Explicit redaction OFF preserves ordinary labelled field values');
    await frame.evaluate(()=>{
      const key='sk-proj-'+'a'.repeat(80);
      document.body.innerHTML='<input aria-label="'+ 'x'.repeat(49)+' '+key+'"><button aria-label="'+'x'.repeat(48)+' '+key+'"></button>';
    });
    const clippedFrame=await frame.evaluate(()=>_formatFrame(_extractFrame(),0,true));
    await page.evaluate(()=>{
      const key='sk-proj-'+'a'.repeat(80);
      document.head.innerHTML='<meta name="description" content="'+'x'.repeat(189)+' '+key+'">';
      document.body.innerHTML='<main><h1>'+'x'.repeat(89)+' '+key+'</h1><input aria-label="'+'x'.repeat(69)+' '+key+'"><input placeholder="'+'x'.repeat(29)+' '+key+'"><button aria-label="'+'x'.repeat(69)+' '+key+'"></button><select><option>'+'x'.repeat(288)+' '+key+'</option></select><input role="combobox" value="'+'x'.repeat(89)+' '+key+'"></main>';
      window._skimAutoRedact=true;window._skimProbeDropdowns=false;
    });
    const clippedText=await page.evaluate(()=>new Promise(resolve=>extractPageContextAsync(resolve)));
    assert.deepEqual({frameLeak:clippedFrame.includes('sk-proj-'),topLeak:clippedText.includes('sk-proj-')},{frameLeak:false,topLeak:false},'Metadata and control text must not expose clipped secrets');
    const urls=await page.evaluate(()=>({
      listing:redactText('https://example.com/jobs/123456789012345?jobId=9876543210'),
      private:redactText('https://example.com/?card_number=4242424242424242&phone=2025550123&ssn=123-45-6789&token=synthetic-query-secret'),
      plain:redactText('4242424242424242 202-555-0123 123-45-6789 card=4242424242424242 phone=2025550123')
    }));
    assert.equal(urls.listing,'https://example.com/jobs/123456789012345?jobId=9876543210','Numeric destination IDs must remain useful');
    for(const secret of ['4242424242424242','2025550123','123-45-6789','synthetic-query-secret'])assert.ok(!urls.private.includes(secret),'Sensitive named URL parameters stay redacted');
    for(const secret of ['4242424242424242','202-555-0123','2025550123','123-45-6789'])assert.ok(!urls.plain.includes(secret),'Plain PII stays redacted');
    console.log('PASS: code output, password values, modern keys, URL tokens and screenshot input masks');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
