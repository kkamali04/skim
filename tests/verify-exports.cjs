const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={Blob,TextEncoder,Uint8Array,DataView};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..','extension','exports.js'),'utf8'),ctx);
(async()=>{
 const files=[{name:'part-1.png',blob:new Blob(['123456789'])},{name:'part-2.png',blob:new Blob([new Uint8Array([0,1,255,0])])}];
 const zip=Buffer.from(await (await ctx.SkimExports.zip(files)).arrayBuffer());
 let offset=0;
 for(const file of files){
  assert.equal(zip.readUInt32LE(offset),0x04034b50);
  const n=zip.readUInt16LE(offset+26),size=zip.readUInt32LE(offset+18);
  assert.equal(zip.subarray(offset+30,offset+30+n).toString(),file.name);
  assert.deepEqual(zip.subarray(offset+30+n,offset+30+n+size),Buffer.from(await file.blob.arrayBuffer()));
  if(offset===0)assert.equal(zip.readUInt32LE(offset+14),0xcbf43926,'Known CRC32 vector');
  offset+=30+n+size;
 }
 const end=zip.length-22;assert.equal(zip.readUInt32LE(end),0x06054b50);
 assert.equal(zip.readUInt16LE(end+10),files.length);
 assert.equal(zip.readUInt32LE(end+16),offset);
 for(const file of files){assert.equal(zip.readUInt32LE(offset),0x02014b50);const n=zip.readUInt16LE(offset+28);assert.equal(zip.subarray(offset+46,offset+46+n).toString(),file.name);offset+=46+n;}
 assert.equal(offset,end,'Complete central directory');
 const empty=Buffer.from(await(await ctx.SkimExports.zip([])).arrayBuffer());assert.equal(empty.length,22);
 await assert.rejects(ctx.SkimExports.zip([{name:'x'.repeat(65536),blob:new Blob([])}]),/size limit/);
 console.log('PASS ZIP: every file, byte content, CRC32, central directory, empty archive and name limit');
})().catch(e=>{console.error(e);process.exitCode=1;});
