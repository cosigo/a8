'use strict';

const fs=require('fs');
const path=require('path');

const A8OBS_SCHEMA='a8obs-v1';

function safePath(root, rel) {
  const base=path.resolve(root);
  const full=path.resolve(base,String(rel||''));
  if(full!==base && !full.startsWith(base+path.sep)) throw new Error('path escapes A8 data root');
  return full;
}

function canonicalMoon(v) {
  const s=String(v);
  const map={io:'io',IO:'io',Io:'io','1':'io',
             eu:'eu',EU:'eu',Europa:'eu',europa:'eu','2':'eu',
             ga:'ga',GA:'ga',Ganymede:'ga',ganymede:'ga','3':'ga'};
  return map[s]||null;
}

function parseA8ObsText(text) {
  const records=[];
  let previous=null;
  const lines=String(text).split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();
    if(!line || line.startsWith('#')) continue;
    let r;
    try{r=JSON.parse(line)}catch{throw new Error(`line ${i+1}: invalid JSON`)}
    if(r.schema && r.schema!==A8OBS_SCHEMA) throw new Error(`line ${i+1}: unsupported schema ${r.schema}`);

    let raw;
    try{raw=BigInt(r.rawPulse)}catch{throw new Error(`line ${i+1}: rawPulse must be integer-compatible`)}
    if(previous!==null && raw<previous) throw new Error(`line ${i+1}: rawPulse went backward`);
    previous=raw;

    const moon=canonicalMoon(r.moon);
    if(!moon) throw new Error(`line ${i+1}: unsupported moon`);

    const x=Number(r.x);
    if(!Number.isFinite(x)) throw new Error(`line ${i+1}: x must be finite`);

    records.push({
      schema:A8OBS_SCHEMA,
      rawPulse:raw.toString(),
      moon,
      x,
      visible:r.visible===undefined?true:!!r.visible,
      uncertaintyX:r.uncertaintyX==null?null:Number(r.uncertaintyX),
      sourceOrdinal:r.sourceOrdinal==null?records.length+1:Number(r.sourceOrdinal),
    });
  }
  if(!records.length) throw new Error('no .a8obs records found');
  return records;
}

function loadA8ObsFile(root, rel) {
  const full=safePath(root,rel);
  if(!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new Error('replay file not found');
  if(path.extname(full).toLowerCase()!=='.a8obs') throw new Error('replay file must use .a8obs extension');
  return {full,records:parseA8ObsText(fs.readFileSync(full,'utf8'))};
}

class ReplaySession {
  constructor(core,dataRoot){this.core=core;this.dataRoot=dataRoot;this.clear()}
  clear(){this.path=null;this.records=[];this.cursor=0;this.loaded=false;this.started=false}
  load(rel){
    const x=loadA8ObsFile(this.dataRoot,rel);
    this.path=rel;this.records=x.records;this.cursor=0;this.loaded=true;this.started=false;
    return this.status();
  }
  start(){
    if(!this.loaded) throw new Error('no .a8obs file loaded');
    this.core.beginObservationReplay();this.cursor=0;this.started=true;return this.status();
  }
  step(count=1){
    if(!this.started)this.start();
    const n=Math.max(1,Math.min(100000,Math.floor(Number(count)||1)));
    let applied=0;
    while(applied<n && this.cursor<this.records.length){
      this.core.ingestObservationRecord(this.records[this.cursor++]);applied++;
    }
    return {applied,done:this.cursor>=this.records.length,replay:this.status()};
  }
  runAll(){
    if(!this.started)this.start();
    if(this.cursor>=this.records.length) return {applied:0,done:true,replay:this.status()};
    return this.step(this.records.length-this.cursor);
  }
  restart(){
    if(!this.loaded) throw new Error('no .a8obs file loaded');
    this.core.beginObservationReplay();this.cursor=0;this.started=true;return this.status();
  }
  status(){
    return {
      schema:'a8-replay-session-v1',
      loaded:this.loaded,started:this.started,path:this.path,
      recordCount:this.records.length,cursor:this.cursor,
      remaining:Math.max(0,this.records.length-this.cursor),
      done:this.loaded&&this.cursor>=this.records.length,
      sourceMode:this.core.sourceMode,
    };
  }
}

module.exports={A8OBS_SCHEMA,canonicalMoon,parseA8ObsText,loadA8ObsFile,ReplaySession};
