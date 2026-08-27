'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_DATA_BASENAMES = ['a8_data','A8-data','a8-data','A8_Data','A8 DATA','a8 data'];

function resolveDataRoot(baseDir = __dirname, explicit = process.env.A8_DATA_DIR) {
  if (explicit) return path.resolve(explicit);
  // Installed lab folders normally live beside A8-data under ~/programs.
  // Search the immediate parent first; retain the older grandparent fallback.
  const candidates = [path.resolve(baseDir, '..'), path.resolve(baseDir, '..', '..')];
  for (const parent of candidates) {
    for (const name of DEFAULT_DATA_BASENAMES) {
      const p = path.join(parent, name);
      try { if (fs.statSync(p).isDirectory()) return p; } catch {}
    }
  }
  return path.join(candidates[0], 'a8_data');
}

function safeRelative(root, rel) {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, String(rel || ''));
  if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) throw new Error('path escapes A8 data root');
  return abs;
}

function sha256File(file) {
  return new Promise((resolve,reject)=>{
    const h=crypto.createHash('sha256');
    const rs=fs.createReadStream(file);
    rs.on('error',reject);
    rs.on('data',c=>h.update(c));
    rs.on('end',()=>resolve(h.digest('hex')));
  });
}

function readHead(file,maxBytes=65536) {
  const fd=fs.openSync(file,'r');
  try {
    const st=fs.fstatSync(fd), n=Math.min(st.size,maxBytes), b=Buffer.alloc(n);
    fs.readSync(fd,b,0,n,0);
    return b.toString('utf8');
  } finally { fs.closeSync(fd); }
}

function numericRows(text) {
  const out=[];
  for (const raw of text.split(/\r?\n/)) {
    const line=raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const parts=line.split(/\s+/), nums=parts.map(Number);
    if (parts.length>=2 && nums.every(Number.isFinite)) out.push(nums);
  }
  return out;
}

function parsePhemuFilename(name) {
  const m=/^E(\d{12})_([^_]+)_([^_]+)_([^_]+)_O-C\.dat$/i.exec(name);
  if(!m) return null;
  const x=m[1];
  return {
    filenameTimestampToken:`${x.slice(0,4)}-${x.slice(4,6)}-${x.slice(6,8)}T${x.slice(8,10)}:${x.slice(10,12)}`,
    eventToken:m[2], reductionToken:m[3], observerToken:m[4]
  };
}

function classifyFile(file) {
  const name=path.basename(file), ext=path.extname(name).toLowerCase();
  const out={kind:'UNCLASSIFIED',readiness:'ARCHIVE_ONLY',notes:[],parsed:{}};

  if(ext==='.a8obs'){
    out.kind='A8_OBSERVATION_STREAM';
    out.readiness='ENGINE_REPLAY_READY';
    out.notes.push('Verified replay envelope candidate: rawPulse + moon + signed Jupiter-relative displacement.');
    out.notes.push('Loaded records drive the existing RecoveryChannel.detect() path.');
    return out;
  }

  if(ext==='.zip'){
    out.kind=/phemu/i.test(name)?'NSDB_PHEMU_ARCHIVE':'ARCHIVE_ZIP';
    out.notes.push('Compressed source archive; preserve as evidence. Not fed directly to recovery.');
    return out;
  }
  if(['.fits','.fit','.fts'].includes(ext)){
    out.kind='ASTRONOMICAL_FITS'; out.readiness='NEEDS_REDUCTION';
    out.notes.push('Astronomical image/table candidate; FITS-aware reduction required.');
    return out;
  }

  let text=''; try{text=readHead(file)}catch{return out}
  const phemu=parsePhemuFilename(name), rows=numericRows(text);

  if(phemu && rows.length && rows.slice(0,20).every(r=>r.length===3)){
    out.kind='NSDB_PHEMU_LIGHT_CURVE'; out.readiness='EVENT_PHOTOMETRY';
    out.parsed={...phemu,sampleNumericRows:rows.length,numericColumnCount:3,
      firstNumericRow:rows[0],lastSampleNumericRow:rows[rows.length-1]};
    out.notes.push('Three-column observational light-curve data.');
    out.notes.push('Do not treat as Jupiter-relative x-position without an explicit physical reduction.');
    return out;
  }

  if(ext==='.tsv' || /\t/.test(text)){
    const lines=text.split(/\r?\n/).filter(x=>x.trim());
    const comments=lines.filter(x=>x.startsWith('#'));
    const tabs=lines.filter(x=>!x.startsWith('#') && x.includes('\t'));
    out.kind=comments.some(x=>/VizieR|CDS/i.test(x))?'VIZIER_TSV':'TABULAR_TSV';
    out.readiness='POSITION_CANDIDATE';
    out.parsed={commentLinesInSample:comments.length,tabularLinesInSample:tabs.length,firstTabularLine:tabs[0]||null};
    out.notes.push('Machine-readable table candidate. Verify column semantics before replay mapping.');
    return out;
  }

  if(ext==='.csv'){
    out.kind='TABULAR_CSV'; out.readiness='POSITION_CANDIDATE';
    out.notes.push('Delimited table candidate. Verify column semantics before replay mapping.');
    return out;
  }

  if(ext==='.dat' || ext==='.txt'){
    out.kind=rows.length?'NUMERIC_TEXT':'TEXT_SOURCE';
    out.readiness=rows.length?'NEEDS_SCHEMA':'ARCHIVE_ONLY';
    out.parsed={sampleNumericRows:rows.length,numericColumnCounts:[...new Set(rows.slice(0,50).map(r=>r.length))]};
    out.notes.push('Source text preserved; schema not assumed.');
  }
  return out;
}

async function walk(root,{maxFiles=5000,withHashes=true}={}) {
  maxFiles=Math.max(1,Number(maxFiles));
  const files=[]; if(!fs.existsSync(root)) return files;
  const stack=[root];
  while(stack.length && files.length<maxFiles){
    const dir=stack.pop();
    let entries=[]; try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch{continue}
    entries.sort((a,b)=>a.name.localeCompare(b.name));
    for(const e of entries){
      const abs=path.join(dir,e.name);
      if(e.isDirectory()) stack.push(abs);
      else if(e.isFile()){
        const st=fs.statSync(abs), info=classifyFile(abs);
        const rec={path:path.relative(root,abs),bytes:st.size,modifiedMs:st.mtimeMs,...info};
        if(withHashes) rec.sha256=await sha256File(abs);
        files.push(rec);
        if(files.length>=maxFiles) break;
      }
    }
  }
  files.sort((a,b)=>a.path.localeCompare(b.path));
  return files;
}

function summarize(files){
  const byKind={}; let bytes=0;
  for(const f of files){bytes+=f.bytes||0;byKind[f.kind]=(byKind[f.kind]||0)+1}
  return {fileCount:files.length,bytes,byKind};
}

async function inventory(root,opts={}){
  root=path.resolve(root);
  const exists=fs.existsSync(root)&&fs.statSync(root).isDirectory();
  const files=exists?await walk(root,opts):[];
  return {
    schema:'a8-data-inventory-v1',root,exists,access:'READ_ONLY',
    definingPathStatus:'A8OBS_REPLAY_CONNECTED',
    warning:'Verified .a8obs streams can drive recovery. Raw observatory files remain gated until a physical reduction produces signed Jupiter-relative displacement.',
    summary:summarize(files),files
  };
}

function inspect(root,rel){
  const abs=safeRelative(root,rel);
  if(!fs.existsSync(abs)||!fs.statSync(abs).isFile()) throw new Error('file not found');
  const st=fs.statSync(abs), info=classifyFile(abs), head=readHead(abs,32768);
  return {schema:'a8-data-inspect-v1',path:path.relative(root,abs),bytes:st.size,...info,
    sampleText:head.split(/\r?\n/).slice(0,32).join('\n')};
}

const REPLAY_SCHEMA={
  schema:'a8-observation-replay-v1',status:'CONNECTED_FOR_A8OBS_STREAMS',
  rule:'Legacy/conventional timestamps may exist only in the replay envelope. The A8 recovery input receives observational state plus an arbitrary monotonic raw pulse count.',
  envelopeFields:{
    sequence:'integer ordering key',
    sourceTimeReference:'optional conventional source timestamp; replay harness only',
    sourceId:'archive provenance'
  },
  definingObservationFields:{
    moon:'io | eu | ga | ca',
    observedX:'Jupiter-relative apparent x coordinate after explicit reduction',
    visible:'boolean',
    uncertainty:'optional observational uncertainty',
    rawPulseCount:'arbitrary monotonic pulse counter generated/advanced by replay apparatus'
  },
  prohibitedShortcuts:[
    'Do not feed published orbital period directly as recovered span.',
    'Do not feed source UTC directly into recovery mathematics.',
    'Do not reinterpret photometric brightness as apparent x without a documented reduction.',
    'Do not overwrite original observatory files.'
  ]
};

module.exports={DEFAULT_DATA_BASENAMES,resolveDataRoot,safeRelative,sha256File,
  parsePhemuFilename,classifyFile,walk,summarize,inventory,inspect,REPLAY_SCHEMA};
