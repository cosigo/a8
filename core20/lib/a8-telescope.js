'use strict';

const MOONS={io:'io',IO:'io',Io:'io','1':'io',eu:'eu',EU:'eu',Europa:'eu',europa:'eu','2':'eu',ga:'ga',GA:'ga',Ganymede:'ga',ganymede:'ga','3':'ga'};

function canonicalMoon(v){return MOONS[String(v)]||null}
function parseBool(v,def=true){if(v===undefined||v===null||v==='')return def;const s=String(v).trim().toLowerCase();if(['0','false','no','n','hidden','missing'].includes(s))return false;if(['1','true','yes','y','visible'].includes(s))return true;return def}
function deriveRelativeX(jupiterX,moonX){const j=Number(jupiterX),m=Number(moonX);if(!Number.isFinite(j)||!Number.isFinite(m))throw new Error('jupiterX and moonX must be finite');return m-j}

function rowToA8Obs(row,ordinal=null){
  const moon=canonicalMoon(row.moon);if(!moon)throw new Error(`unsupported moon ${row.moon}`);
  let raw;try{raw=BigInt(row.rawPulse)}catch{throw new Error('rawPulse must be integer-compatible')}
  const visible=parseBool(row.visible,true);
  const out={schema:'a8obs-v1',rawPulse:raw.toString(),moon,x:visible?deriveRelativeX(row.jupiterX,row.moonX):0,visible,sourceOrdinal:ordinal};
  if(row.uncertaintyX!==undefined&&row.uncertaintyX!==null&&row.uncertaintyX!==''){
    const u=Number(row.uncertaintyX);if(!Number.isFinite(u)||u<0)throw new Error('uncertaintyX must be nonnegative finite');out.uncertaintyX=u;
  }
  return out;
}

function parseDelimited(text){
  const lines=String(text).split(/\r?\n/).filter(x=>x.trim()&&!x.trim().startsWith('#'));if(!lines.length)throw new Error('no telescope rows found');
  const delim=lines[0].includes('\t')?'\t':',';const headers=lines[0].split(delim).map(x=>x.trim());
  for(const h of ['frameId','rawPulse','moon','jupiterX','moonX'])if(!headers.includes(h))throw new Error(`missing required header ${h}`);
  return lines.slice(1).map(line=>{const c=line.split(delim).map(x=>x.trim()),r={};headers.forEach((h,i)=>r[h]=c[i]??'');return r});
}

function csvToA8Obs(text){
  const rows=parseDelimited(text),out=[];let prev=null;
  rows.forEach((r,i)=>{let raw;try{raw=BigInt(r.rawPulse)}catch{throw new Error(`row ${i+2}: invalid rawPulse`)};if(prev!==null&&raw<prev)throw new Error(`row ${i+2}: rawPulse went backward`);prev=raw;out.push(rowToA8Obs(r,i+1))});
  return out;
}

function prng(seed=8){let s=(seed>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s>>>=0;s^=s<<5;s>>>=0;return s/4294967296}}
function intBetween(rand,lo,hi){lo=Math.trunc(Number(lo));hi=Math.trunc(Number(hi));if(hi<lo)[lo,hi]=[hi,lo];return lo+Math.floor(rand()*(hi-lo+1))}
function makeIrregularVisibility(steps,opts={}){
  const weather=prng(Number(opts.weatherSeed??808));
  const observeMin=Math.max(1,Math.trunc(Number(opts.observeMin??20))),observeMax=Math.max(observeMin,Math.trunc(Number(opts.observeMax??80)));
  const gapMin=Math.max(1,Math.trunc(Number(opts.gapMin??15))),gapMax=Math.max(gapMin,Math.trunc(Number(opts.gapMax??120)));
  const longGapMin=Math.max(gapMin,Math.trunc(Number(opts.longGapMin??150))),longGapMax=Math.max(longGapMin,Math.trunc(Number(opts.longGapMax??400)));
  const longGapChance=Math.min(1,Math.max(0,Number(opts.longGapChance??0.125)));
  const visible=new Array(steps).fill(false),blocks=[];let i=0,state='OBSERVE';
  while(i<steps){
    let len,long=false;
    if(state==='OBSERVE') len=intBetween(weather,observeMin,observeMax);
    else {long=weather()<longGapChance;len=long?intBetween(weather,longGapMin,longGapMax):intBetween(weather,gapMin,gapMax)}
    const end=Math.min(steps,i+len);
    if(state==='OBSERVE') for(let j=i;j<end;j++) visible[j]=true;
    blocks.push({kind:state,startFrame:i+1,endFrame:end,frames:end-i,longGap:long});
    i=end;state=state==='OBSERVE'?'GAP':'OBSERVE';
  }
  return {visible,blocks};
}
function generateRowsWithVisibility(opts,visibility){
  const steps=Math.max(20,Math.trunc(Number(opts.steps??220))),noisePx=Math.max(0,Number(opts.noisePx??0.7));
  const start=BigInt(opts.startRaw??481920000),step=BigInt(opts.rawStep??25),j0=Number(opts.jupiterCenter??1024),drift=Number(opts.driftPerStep??0.17),rand=prng(Number(opts.seed??8));
  const noise=()=>((rand()*2-1)*noisePx);const cfg=[['io',400,310,100],['eu',800,470,175],['ga',1600,690,325]];const rows=[];
  for(let i=0;i<steps;i++){
    const raw=start+BigInt(i)*step,rel=Number(raw-start),jx=j0+i*drift+noise()*0.25,visible=!!visibility(i);
    for(const [moon,span,amp,phase] of cfg){const physical=-amp*Math.cos(2*Math.PI*(rel-phase)/span),mx=jx+physical+noise();rows.push({frameId:`F${String(i+1).padStart(5,'0')}`,rawPulse:raw.toString(),moon,jupiterX:jx,moonX:mx,visible,uncertaintyX:noisePx})}
  }
  return rows;
}
function generateRows(opts={}){
  const steps=Math.max(20,Math.trunc(Number(opts.steps??220))),gapEvery=Math.max(0,Math.trunc(Number(opts.gapEvery??0)));
  return generateRowsWithVisibility({...opts,steps},i=>!(gapEvery>0&&i>0&&i%gapEvery===0));
}
function generateIrregularRows(opts={}){
  const steps=Math.max(20,Math.trunc(Number(opts.steps??4000))),schedule=makeIrregularVisibility(steps,opts);
  const rows=generateRowsWithVisibility({...opts,steps},i=>schedule.visible[i]);
  return {rows,blocks:schedule.blocks,visibleFrameGroups:schedule.visible.filter(Boolean).length,blockedFrameGroups:schedule.visible.filter(v=>!v).length};
}
function rowsToCsv(rows){const h=['frameId','rawPulse','moon','jupiterX','moonX','visible','uncertaintyX'];return h.join(',')+'\n'+rows.map(r=>h.map(k=>String(r[k]??'')).join(',')).join('\n')+'\n'}
function rowsToA8Obs(rows){let prev=null;return rows.map((r,i)=>{const raw=BigInt(r.rawPulse);if(prev!==null&&raw<prev)throw new Error(`row ${i+1}: rawPulse went backward`);prev=raw;return rowToA8Obs(r,i+1)})}

module.exports={canonicalMoon,parseBool,deriveRelativeX,rowToA8Obs,parseDelimited,csvToA8Obs,generateRows,generateIrregularRows,makeIrregularVisibility,rowsToCsv,rowsToA8Obs};
