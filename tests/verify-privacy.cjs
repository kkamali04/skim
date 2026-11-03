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
    if (fs.existsSync(path.join(__dirname,'..','extension','privacy.js'))) await page.addScriptTag({path: path.join(__dirname,'..','extension','privacy.js')});
    await page.addScriptTag({path: path.join(__dirname,'..','extension','page.js')});
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
    await frame.addScriptTag({path:path.join(__dirname,'..','extension','privacy.js')});
    const api=fs.readFileSync(path.join(__dirname,'..','extension','api.js'),'utf8');
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
    assert.equal(await page.evaluate(()=>redactText('Telephone:\nE-mail address:\nPhone:\nDelivery instructions:')),'Telephone:\nE-mail address:\nPhone:\nDelivery instructions:','Empty contact labels must not redact the next field label');
    assert.ok(!(await page.evaluate(()=>redactText('password:\nsynthetic-multiline-secret'))).includes('synthetic-multiline-secret'),'A credential value on the next line must remain redacted');
    assert.ok(!(await page.evaluate(()=>redactText('password=synthetic-with-colon:'))).includes('synthetic-with-colon'),'Inline credentials ending with a colon remain redacted');
    assert.ok(!(await page.evaluate(()=>redactText('user_password=synthetic-prefixed-secret clientSecret=synthetic-client-secret'))).includes('synthetic-'),'Existing prefixed credential names must remain redacted');
    for(const secret of ['4242424242424242','2025550123','123-45-6789','synthetic-query-secret'])assert.ok(!urls.private.includes(secret),'Sensitive named URL parameters stay redacted');
    for(const secret of ['4242424242424242','202-555-0123','2025550123','123-45-6789'])assert.ok(!urls.plain.includes(secret),'Plain PII stays redacted');
    await page.setContent('<main>'+Array.from({length:30},(_,i)=>'<section data-ev-sublocation="job_feed_tile"><h3><a href="https://example.com/jobs/capture-'+i+'">Capture job '+i+'</a></h3><p>Proposals: 20 to 50</p><p>Hourly: $30-$65</p><p>Payment verified</p><p>United States</p><p>Description '+i+' contact fixture@example.com</p><a href="https://example.com/skills/common">Common skill</a></section>').join('')+'</main>');
    const listing=await page.evaluate(()=>new Promise(resolve=>extractPageContextAsync(resolve)));
    const section=listing.split('== LINKED RECORDS JSON ==\n')[1];
    assert.ok(section,'Current Upwork section cards must produce structured records');
    const records=JSON.parse(section.slice(0,section.indexOf('\n]')+2));
    assert.equal(records.length,30,'One record per job, without turning shared skill links into jobs');
    records.forEach((record,i)=>{
      assert.equal(record.title,'Capture job '+i);assert.equal(record.url,'https://example.com/jobs/capture-'+i);
      for(const detail of ['Proposals: 20 to 50','Hourly: $30-$65','Payment verified','United States','Description '+i])assert.ok(record.text.includes(detail),'Repeated metadata stays attached to job '+i+': '+detail);
      assert.ok(!record.text.includes('fixture@example.com'));assert.equal(record.truncated,false);
    });
    console.log('PASS: all 30 current Upwork-shaped cards preserve repeated per-job metadata, primary URLs and redaction');
    await page.setContent('<label id="frequency-label">How often do you want a rate increase?</label><div role="combobox" tabindex="0" aria-expanded="false" aria-controls="dropdown-menu" aria-labelledby="frequency-label">Select a frequency</div><label id="percent-label">How much of an increase do you want?</label><div role="combobox" tabindex="0" aria-expanded="false" aria-controls="dropdown-menu" aria-labelledby="percent-label">Select a percent</div><label id="cover-label">Cover Letter</label><textarea aria-labelledby="cover-label"></textarea><label id="secret-label">Secret token</label><textarea aria-labelledby="secret-label"></textarea><div role="combobox" tabindex="0" aria-label="Unavailable choices">Select an option</div>');
    const cover='Cover letter fixture\n'+'x'.repeat(1800)+'\nEND OF COVER LETTER';
    await page.evaluate(cover=>{
      const label=document.createElement('label');label.htmlFor='rate';label.textContent='Hourly rate';const rate=document.createElement('input');rate.id='rate';rate.placeholder='$0.00';rate.value='$40.00';document.body.append(label,rate);
      document.querySelector('[aria-labelledby="cover-label"]').value=cover;
      document.querySelector('[aria-labelledby="secret-label"]').value='synthetic-labelled-textarea-value';
      document.querySelectorAll('[aria-controls]').forEach((cb,i)=>cb.addEventListener('keydown',e=>{
        if(e.keyCode===40){const menu=document.createElement('ul');menu.id='dropdown-menu';menu.setAttribute('role','listbox');menu.innerHTML=(i?['5%','10%','15%','Custom']:['Never','Every 3 months','Every 6 months','Every 12 months']).map(t=>'<li role="option">'+t+'</li>').join('');document.body.append(menu);cb.setAttribute('aria-expanded','true');}
        if(e.keyCode===27){document.getElementById('dropdown-menu')?.remove();cb.setAttribute('aria-expanded','false');}
      }));window._skimProbeDropdowns=true;
    },cover);
    const proposal=await page.evaluate(()=>new Promise(resolve=>extractPageContextAsync(resolve)));
    for(const choice of ['Never','Every 3 months','Every 6 months','Every 12 months','5%','10%','15%','Custom'])assert.ok(proposal.includes(choice),'Capture current ARIA dropdown choice: '+choice);
    assert.ok(proposal.includes(cover),'Capture the full aria-labelledby textarea, beyond 120 characters');
    assert.ok(proposal.includes('[INPUT text] "Hourly rate" value="$40.00"'),'Use the real associated field label instead of its placeholder');
    assert.ok(!proposal.includes('synthetic-labelled-textarea-value'),'Sensitive aria-labelledby values remain redacted');
    assert.ok(proposal.includes('CAPTURE WARNING: dropdown options unavailable'),'Unreadable dropdown choices must be reported');
    assert.deepEqual(await page.locator('[aria-controls]').evaluateAll(nodes=>nodes.map(n=>({value:n.innerText,expanded:n.getAttribute('aria-expanded')}))),[{value:'Select a frequency',expanded:'false'},{value:'Select a percent',expanded:'false'}]);
    console.log('PASS: current ARIA dropdown options, unchanged selections, full labelled textarea and explicit missing-option coverage');
    await page.setContent('<form><fieldset><legend>Pizza size</legend><label><input type="radio" name="size" value="small">Small</label><label><input type="radio" name="size" value="medium" checked>Medium</label><label><input type="radio" name="size" value="large">Large</label></fieldset><label><input type="checkbox" name="topping" value="bacon">Bacon</label><label><input type="checkbox" name="topping" value="onion" checked>Onion</label><label>First note<input name="note" value="First value"></label></form><form><label>Second note<input name="note" value="Second value"></label></form>');
    const grouped=await page.evaluate(()=>new Promise(resolve=>extractPageContextAsync(resolve)));
    const groupLines=grouped.split('\n').filter(line=>line.startsWith('[INPUT '));
    assert.equal(groupLines.length,7,'Shared field names must not discard distinct controls');
    for(const detail of ['[INPUT radio [✓]] "Medium" value="medium"','[INPUT checkbox [✓]] "Onion" value="onion"','"First note" value="First value"','"Second note" value="Second value"'])assert.ok(grouped.includes(detail),'Keep distinct field state: '+detail);
    console.log('PASS: shared-name radio/checkbox groups and separate forms retain every control and selection');
    await page.setContent('<main><div role="alert">Warning! Demo prices are randomly assigned.</div><label>Email<input name="email" aria-describedby="validation"></label><p id="validation" role="alert">Email is required before continuing.</p></main>');
    const alerts=await page.evaluate(()=>new Promise(resolve=>extractPageContextAsync(resolve)));
    for(const message of ['Warning! Demo prices are randomly assigned.','Email is required before continuing.'])assert.ok(alerts.includes(message),'Keep live alert and validation context: '+message);
    await page.setContent('<h1>Public content beneath a hidden overlay</h1><aside style="visibility:hidden;position:fixed;inset:0"><p>hidden@example.com</p><input value="hidden@example.com"></aside>');
    assert.equal(await page.evaluate(()=>collectRedactZones().length),0,'Invisible overlay content must not black out unrelated screenshot pixels');
    await page.locator('aside').evaluate(el=>el.style.visibility='visible');
    assert.ok(await page.evaluate(()=>collectRedactZones().length)>=2,'The same visible content must remain masked');
    await page.setContent('<div id="shadow-form"></div>');
    await page.evaluate(()=>{const sr=document.querySelector('#shadow-form').attachShadow({mode:'open'});sr.innerHTML='<label>Shadow note<input value="Shadow selected value"></label><label>Shadow delivery<textarea name="delivery">Shadow textarea details</textarea></label><label>Shadow choice<select><option>First choice</option><option selected>Second choice</option></select></label><label id="shadow-secret">Secret token</label><textarea aria-labelledby="shadow-secret">synthetic-shadow-secret</textarea><input type="hidden" value="synthetic-hidden-field">';});
    const shadowForm=await page.evaluate(()=>new Promise(resolve=>extractPageContextAsync(resolve)));
    for(const detail of ['value="Shadow selected value"','value="Shadow textarea details"','value="Second choice"'])assert.ok(shadowForm.includes(detail),'Retain current open-shadow field state: '+detail);
    assert.ok(!shadowForm.includes('synthetic-shadow-secret'),'Shadow-local sensitive labels must redact field values');
    assert.ok(!shadowForm.includes('synthetic-hidden-field'),'Hidden shadow fields must remain excluded');
    await page.setContent('<button role="combobox" aria-label="Portal menu" aria-expanded="false" aria-controls="portal-menu">Select a choice</button>');
    await page.evaluate(()=>{const cb=document.querySelector('[role="combobox"]');cb.addEventListener('keydown',e=>{if(e.key==='ArrowDown'&&!document.getElementById('portal-menu')){const lb=document.createElement('ul');lb.id='portal-menu';lb.setAttribute('role','listbox');lb.innerHTML='<li role="option" tabindex="0">Portal option</li>';lb.addEventListener('keydown',e=>{if(e.key==='Escape'){lb.remove();cb.setAttribute('aria-expanded','false');cb.focus({preventScroll:true});}});document.body.append(lb);cb.setAttribute('aria-expanded','true');lb.firstElementChild.focus({preventScroll:true});}});});
    const portal=await page.evaluate(()=>new Promise(resolve=>extractPageContextAsync(resolve)));
    assert.ok(portal.includes('Portal option'),'Read a menu that moves focus into its portal');
    assert.equal(await page.locator('[role="combobox"]').getAttribute('aria-expanded'),'false','Close a menu through its focused portal without selecting a value');
    assert.equal(await page.locator('#portal-menu').count(),0,'Leave no probe-created portal open');
    await page.setContent('<h1>Public header</h1><aside style="position:absolute;top:200px;left:0;width:300px;height:80px;overflow:hidden"><div id="clipped-field"></div></aside>');
    await page.evaluate(()=>document.querySelector('#clipped-field').attachShadow({mode:'open'}).innerHTML='<input style="position:absolute;top:-100px" value="clipped@example.com">');
    assert.equal(await page.evaluate(()=>collectRedactZones().length),0,'A shadow field clipped outside its scroll pane must not mask the public header');
    await page.locator('#clipped-field input').evaluate(el=>el.style.top='10px');
    assert.ok(await page.evaluate(()=>collectRedactZones().length)>0,'The same field remains masked when inside the visible pane');
    await page.setContent('<span style="overflow:hidden">visible-inline@example.com</span>');
    assert.ok(await page.evaluate(()=>collectRedactZones().length)>0,'Overflow does not clip ordinary inline boxes; their visible private text stays masked');
    console.log('PASS: alert context, shadow field state/privacy, portal-menu restoration and visibility/clipping-aware masks');
    console.log('PASS: code output, password values, modern keys, URL tokens and screenshot input masks');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
