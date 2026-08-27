#!/usr/bin/env node
'use strict';
const path=require('path');
const {resolveDataRoot,inventory}=require('../lib/a8-data-bridge');
(async()=>{
 const root=process.argv[2]?path.resolve(process.argv[2]):resolveDataRoot(path.join(__dirname,'..'));
 const inv=await inventory(root,{withHashes:true,maxFiles:5000});
 console.log('A8 OBSERVATION DATA AUDIT');
 console.log('root:',inv.root);console.log('exists:',inv.exists);console.log('access:',inv.access);
 console.log('defining path:',inv.definingPathStatus);console.log('files:',inv.summary.fileCount);console.log('bytes:',inv.summary.bytes);
 console.log('classes:',JSON.stringify(inv.summary.byKind));console.log('');
 for(const f of inv.files){
   console.log(`[${f.kind}] ${f.path}`);console.log(`  readiness: ${f.readiness}`);console.log(`  bytes: ${f.bytes}`);
   console.log(`  sha256: ${f.sha256}`);for(const n of f.notes||[])console.log(`  note: ${n}`);
 }
 if(!inv.exists){console.log('\nSet A8_DATA_DIR or place a sibling a8_data directory beside the time-lab folder.');process.exitCode=2}
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1});
