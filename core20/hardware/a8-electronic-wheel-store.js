'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SCHEMA = 'A8-CORE20-ELECTRONIC-WHEEL-V1';
const BASE = '1658270fc3b472dc9287ea759ab06979aecd34bd944c0f6d42cace92c5b7c68c';
function seal(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}
function record(offset, sequence) {
  const body={schema:SCHEMA,sourceEpoch:'3',physicalEpoch:'9',baselineSha256:BASE,sequence:String(sequence),offsetStates:String(offset)};
  return {...body,sha256:seal(body)};
}
function load(file) {
  if (!fs.existsSync(file)) return record(0n,0n);
  const s=fs.lstatSync(file);
  if (!s.isFile() || s.isSymbolicLink() || (s.mode & 0o077) !== 0) throw Error('WHEEL_FILE_PERMISSION_GUARD');
  const obj=JSON.parse(fs.readFileSync(file,'utf8'));
  const wanted=record(BigInt(obj.offsetStates),BigInt(obj.sequence));
  if (JSON.stringify(obj)!==JSON.stringify(wanted)) throw Error('WHEEL_RECORD_INTEGRITY');
  return wanted;
}
function save(file, item) {
  const dir=path.dirname(file);
  const tmp=file+'.tmp-'+process.pid;
  let fd;
  try {
    fd=fs.openSync(tmp,'wx',0o600);
    fs.writeFileSync(fd,JSON.stringify(item)+'\n');
    fs.fsyncSync(fd); fs.closeSync(fd);fd=null;
    fs.renameSync(tmp,file);
    const d=fs.openSync(dir,'r');
    try {fs.fsyncSync(d);} finally {fs.closeSync(d);}
  } finally {
    if (fd!==null&&fd!==undefined) fs.closeSync(fd);
    try {fs.unlinkSync(tmp);}catch(e){if(e.code!=='ENOENT')throw e;}
  }
}
module.exports={load,save,record};
