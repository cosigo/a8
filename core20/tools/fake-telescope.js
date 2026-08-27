#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {generateRows,generateIrregularRows,rowsToCsv,csvToA8Obs}=require('../lib/a8-telescope');
function usage(){console.log(`A8 Fake Telescope / Real CCD Adapter\n\nGenerate continuous or legacy periodic-gap data:\n  node tools/fake-telescope.js generate OUTPUT.csv [frames] [noisePx] [gapEvery]\n\nGenerate deterministic irregular observing blocks (Experiment 4):\n  node tools/fake-telescope.js generate-irregular OUTPUT.csv [frames] [noisePx] [weatherSeed]\n\nConvert real or simulated telescope CSV:\n  node tools/fake-telescope.js convert INPUT.csv OUTPUT.a8obs\n\nRequired headers:\n  frameId,rawPulse,moon,jupiterX,moonX\nOptional:\n  visible,uncertaintyX\n\nDefining reduction: x = moonX - jupiterX`)}
const [,,mode,a,b,c,d]=process.argv;if(!mode){usage();process.exit(2)}
function writeCsv(file,rows){fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});fs.writeFileSync(file,rowsToCsv(rows));console.log(`WROTE ${rows.length} telescope rows -> ${file}`);console.log('Same CSV schema can later be replaced with real CCD/counter measurements.')}
if(mode==='generate'){
  if(!a){usage();process.exit(2)}const rows=generateRows({steps:b==null?220:Number(b),noisePx:c==null?.7:Number(c),gapEvery:d==null?0:Number(d)});writeCsv(a,rows);process.exit(0)
}
if(mode==='generate-irregular'){
  if(!a){usage();process.exit(2)}
  const r=generateIrregularRows({steps:b==null?4000:Number(b),noisePx:c==null?.7:Number(c),weatherSeed:d==null?808:Number(d)});writeCsv(a,r.rows);
  const gaps=r.blocks.filter(x=>x.kind==='GAP'),longGaps=gaps.filter(x=>x.longGap);
  console.log(`IRREGULAR VISIBILITY · observable frame groups ${r.visibleFrameGroups} · blocked ${r.blockedFrameGroups} · gap blocks ${gaps.length} · long gaps ${longGaps.length}`);
  console.log('No fixed gap cadence. Raw counter continues through blocked observing intervals.');process.exit(0)
}
if(mode==='convert'){
  if(!a||!b){usage();process.exit(2)}const obs=csvToA8Obs(fs.readFileSync(a,'utf8'));fs.mkdirSync(path.dirname(path.resolve(b)),{recursive:true});fs.writeFileSync(b,obs.map(JSON.stringify).join('\n')+'\n');console.log(`WROTE ${obs.length} engine-ready observations -> ${b}`);console.log('Reduction used only x = moonX - jupiterX.');process.exit(0)
}
usage();process.exit(2)
