const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let granted=false, calls=0;
const sandbox={URL,AbortController,setTimeout,clearTimeout,window:{},chrome:{permissions:{contains:async()=>granted}},fetch:async()=>{calls++;return {ok:true,json:async()=>({choices:[{message:{content:'Safe summary'}}]})};}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'privacy.js'),'utf8'),sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'api.js'),'utf8'),sandbox);
const summarize=baseUrl=>new Promise(resolve=>sandbox.window.CaptureAPI.summarizeViaLLM('Fixture',{key:'dummy-key',baseUrl,model:'fixture'},(text,error)=>resolve({text,error})));
(async()=>{
 assert.match((await summarize('https://example.com/v1')).error,/Enable provider access/);
 assert.equal(calls,0,'Denied permission must not send a request');
 granted=true;
 assert.match((await summarize('http://example.com/v1')).error,/HTTPS/);
 assert.equal(calls,0,'Insecure URL must not receive a key');
 assert.equal((await summarize('https://example.com/v1')).text,'Safe summary');
 assert.equal(calls,1);
 // Scale the production deadlines while preserving AbortController/body behavior.
 sandbox.setTimeout=(fn,ms)=>setTimeout(fn,Math.min(ms,20));
 sandbox.fetch=async(url,{signal})=>{
   const stalledBody=()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{const e=new Error('aborted');e.name='AbortError';reject(e);},{once:true}));
   return {ok:true,json:stalledBody};
 };
 const stalled=await Promise.race([summarize('https://example.com/v1'),new Promise(resolve=>setTimeout(()=>resolve({error:'TEST WATCHDOG: response body hung'}),200))]);
 assert.match(stalled.error,/Timed out after 60s/,'Summary deadline must include reading the response body');
 sandbox.fetch=async(url,{signal})=>({ok:false,status:503,text:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{const e=new Error('aborted');e.name='AbortError';reject(e);},{once:true}))});
 const failedPing=await Promise.race([new Promise(resolve=>sandbox.window.CaptureAPI.testSummaryProvider({key:'dummy-key',baseUrl:'https://example.com/v1'},(ok,detail)=>resolve({ok,detail}))),new Promise(resolve=>setTimeout(()=>resolve({detail:'TEST WATCHDOG: error body hung'}),200))]);
 assert.equal(failedPing.ok,false);assert.match(failedPing.detail,/Timed out after 15s/,'Provider test deadline must include reading an error body');
 const popup={document:{addEventListener(){}},console};
 vm.createContext(popup);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'popup.js'),'utf8'),popup);
 assert.equal(popup.DEFAULTS.historyEnabled,false,'Captures must be clipboard-only by default');
 popup.saveSettings=popup.syncSettingsUI=popup.updateProfileStatus=()=>{};
 const original={...popup.DEFAULTS,summaryEnabled:true,summaryKey:'synthetic-old-key',openrouterKey:'synthetic-legacy-key'};
 for(const change of [{summaryBaseUrl:'https://other.example/v1'}, {summaryProvider:'custom'},
   {summaryBaseUrl:'https://other.example/v1',summaryEnabled:true,summaryKey:'synthetic-new-key'}]) {
   popup.settings={...original};
   popup.applyProfileJson(JSON.stringify(change));
   assert.equal(popup.settings.summaryKey,'','Profile destination change must clear credentials');
   assert.equal(popup.settings.openrouterKey,'','Legacy credentials must not be migrated to the new destination');
   assert.equal(popup.settings.summaryEnabled,false,'Destination change requires explicit re-enable');
 }
 popup.settings={...original};
 popup.applyProfileJson(JSON.stringify({copyMode:'code',summaryBaseUrl:original.summaryBaseUrl+'/'}));
 assert.equal(popup.settings.summaryKey,original.summaryKey,'Equivalent endpoint and unrelated profile changes retain credentials');
 popup.settings={...original,summaryEnabled:false};
 popup.applyProfileJson(JSON.stringify({summaryEnabled:'false',autoRedact:0,historyLimit:-1,summaryBaseUrl:null}));
 assert.equal(popup.settings.summaryEnabled,false,'A string false must not enable sending captured text to a provider');
 assert.equal(popup.settings.autoRedact,true,'Invalid JSON field types must not disable redaction');
 assert.equal(popup.settings.historyLimit,20,'Invalid numeric limits must be ignored');
 assert.equal(popup.settings.summaryBaseUrl,original.summaryBaseUrl,'Null must not replace a provider URL');
 console.log('PASS: provider access denied before network, HTTP rejected, granted HTTPS request succeeds (stub provider)');
 console.log('PASS: profile destination changes clear credentials and disable summaries');
 console.log('PASS: provider deadlines include response bodies and handle aborted error bodies');
})().catch(e=>{console.error(e);process.exitCode=1;});
