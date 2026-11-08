const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const extension=path.join(root,'extension');
const runtime=['manifest.json','background.js','api.js','page.js','privacy.js','youtube.js','products.js','exports.js','popup.js','popup.html','popup.css','icon16.png','icon48.png','icon128.png','LICENSE'];
const assets=fs.readdirSync(path.join(extension,'assets')).map(name=>'assets/'+name);
(async()=>{
 const ctx={Blob,TextEncoder,Uint8Array,DataView};vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(extension,'exports.js'),'utf8'),ctx);
 const files=runtime.concat(assets).sort().map(name=>({name,blob:new Blob([fs.readFileSync(path.join(name==='LICENSE'?root:extension,name))])}));
 const archive=await ctx.SkimExports.zip(files);
 const version=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'))).version;
 fs.mkdirSync(path.join(root,'dist'),{recursive:true});
 const target=path.join(root,'dist',`skim-${version}.zip`);
 fs.writeFileSync(target,Buffer.from(await archive.arrayBuffer()));
 console.log(`Packaged ${files.length} reviewed runtime files: dist/skim-${version}.zip`);
})().catch(e=>{console.error(e);process.exitCode=1;});
