#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');

const [, , input, output]=process.argv;
if(!input||!output){
  console.error('Usage: node tools/a8obs-normalize.js INPUT.csv OUTPUT.a8obs');
  console.error('Required headers: rawPulse,moon,x   Optional: visible,uncertaintyX');
  process.exit(2);
}
const lines=fs.readFileSync(input,'utf8').split(/\r?\n/).filter(x=>x.trim()&&!x.trim().startsWith('#'));
if(lines.length<2)throw new Error('no data rows');
const delim=lines[0].includes('\t')?'\t':',';
const hdr=lines[0].split(delim).map(x=>x.trim());
const at=Object.fromEntries(hdr.map((x,i)=>[x,i]));
for(const k of ['rawPulse','moon','x'])if(at[k]==null)throw new Error(`missing header ${k}`);
let prev=null;const out=[];
for(let i=1;i<lines.length;i++){
  const c=lines[i].split(delim).map(x=>x.trim());
  const raw=BigInt(c[at.rawPulse]);
  if(prev!==null&&raw<prev)throw new Error(`row ${i+1}: rawPulse went backward`);
  prev=raw;
  const x=Number(c[at.x]);if(!Number.isFinite(x))throw new Error(`row ${i+1}: invalid x`);
  const r={schema:'a8obs-v1',rawPulse:raw.toString(),moon:c[at.moon],x,
    visible:at.visible==null?true:!['0','false','FALSE','no','NO'].includes(c[at.visible]),
    sourceOrdinal:i};
  if(at.uncertaintyX!=null&&c[at.uncertaintyX]!==''){
    const u=Number(c[at.uncertaintyX]);if(!Number.isFinite(u))throw new Error(`row ${i+1}: invalid uncertaintyX`);
    r.uncertaintyX=u;
  }
  out.push(JSON.stringify(r));
}
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
fs.writeFileSync(output,out.join('\n')+'\n');
console.log(`WROTE ${out.length} engine-ready records -> ${output}`);
console.log('Defining ingress: rawPulse + moon + signed Jupiter-relative displacement x');
