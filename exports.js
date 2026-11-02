/* Small, dependency-free ZIP writer. PNG is already compressed: ZIP method 0. */
var SkimExports = (function() {
  function download(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 30000);
  }
  function crc32(bytes) {
    var crc = 0xffffffff;
    for (var b of bytes) {
      crc ^= b;
      for (var i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  async function zip(files) {
    var chunks = [], directory = [], offset = 0, directorySize = 0;
    if (files.length > 65535) throw new Error('Too many ZIP entries');
    for (var file of files) {
      var name = new TextEncoder().encode(file.name), bytes = new Uint8Array(await file.blob.arrayBuffer());
      if (name.length > 65535 || bytes.length > 0xffffffff || offset + 30 + name.length + bytes.length > 0xffffffff)
        throw new Error('Export exceeds ZIP size limit');
      var crc = crc32(bytes), local = new Uint8Array(30), l = new DataView(local.buffer);
      l.setUint32(0,0x04034b50,true); l.setUint16(4,20,true); l.setUint16(6,0x800,true);
      l.setUint16(12,33,true); // 1980-01-01, the minimum DOS date.
      l.setUint32(14,crc,true); l.setUint32(18,bytes.length,true); l.setUint32(22,bytes.length,true); l.setUint16(26,name.length,true);
      var central = new Uint8Array(46), c = new DataView(central.buffer);
      c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x800,true); c.setUint16(14,33,true);
      c.setUint32(16,crc,true); c.setUint32(20,bytes.length,true); c.setUint32(24,bytes.length,true); c.setUint16(28,name.length,true); c.setUint32(42,offset,true);
      chunks.push(local,name,bytes); directory.push(central,name);
      offset += local.length + name.length + bytes.length;
      directorySize += central.length + name.length;
    }
    if (offset + directorySize > 0xffffffff) throw new Error('Export exceeds ZIP size limit');
    var end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0,0x06054b50,true); e.setUint16(8,files.length,true); e.setUint16(10,files.length,true);
    e.setUint32(12,directorySize,true); e.setUint32(16,offset,true);
    return new Blob(chunks.concat(directory,[end]),{type:'application/zip'});
  }
  return {download:download, zip:zip};
})();
