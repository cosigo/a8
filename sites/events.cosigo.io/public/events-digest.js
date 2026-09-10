(()=>{
'use strict';

const DATA='/data/astronomical-events.json';
const grid=document.getElementById('eventGrid');
const status=document.getElementById('eventStatus');

const text=(tag,value,cls)=>{
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  n.textContent=value ?? '';
  return n;
};

function findTimes(value,out=[]){
  if(typeof value==='string'){
    const m=value.match(/\b\d{2}:\d{2}:\d{2}\b/g);
    if(m) out.push(...m);
  }else if(Array.isArray(value)){
    value.forEach(v=>findTimes(v,out));
  }else if(value && typeof value==='object'){
    Object.values(value).forEach(v=>findTimes(v,out));
  }
  return [...new Set(out)];
}

function a8Time(e){
  const times=findTimes(e.a8?.time);
  if(times.length>=2)return `≈ ${times[0]}–${times[1]} A8`;
  if(times.length===1)return `≈ ${times[0]} A8`;
  return 'DAY';
}

function fact(dl,key,value){
  const row=document.createElement('div');
  row.append(text('dt',key));
  row.append(text('dd',value));
  dl.append(row);
}

function card(e){
  const a=e.a8||{};
  const pd=a.publicDate||{};
  const xy=e.sky?.generalXY||{};

  const article=document.createElement('article');
  article.className='event-card';
  article.id=e.detailAnchor || e.id;

  article.append(text('div',e.category,'cat'));
  article.append(text('h2',e.title));

  const dl=document.createElement('dl');
  dl.className='event-facts';

  fact(dl,'DATE',pd.display || a.quickDate || '—');
  fact(dl,'SYMBOL',pd.symbolic || '—');
  fact(dl,'TIME',a8Time(e));
  fact(dl,'SKY',xy.decimal || '—');

  article.append(dl);

  if(e.summary)
    article.append(text('p',e.summary,'summary'));

  const details=document.createElement('details');
  const summary=document.createElement('summary');
  summary.textContent='MORE';
  details.append(summary);

  const body=document.createElement('div');
  body.className='event-detail';

  const finer=xy.finerSourceCoordinate;
  const lines=[
    ['CATEGORY',e.category],
    ['PRECISION',e.precisionClass],
    ['YEAR DAY',a.yearDay],
    ['CYCLE',a.yearCycleLabel],
    ['SOURCE',e.sourceKey],
    ['STATUS',e.status]
  ];

  if(finer && Number.isFinite(finer.x) && Number.isFinite(finer.y))
    lines.push(['FINER A8 SKY',`X ${finer.x} · Y ${finer.y}`]);

  for(const [k,v] of lines){
    if(v===undefined || v===null || v==='')continue;
    const p=document.createElement('div');
    const strong=document.createElement('strong');
    strong.textContent=k+' · ';
    p.append(strong,document.createTextNode(String(v)));
    body.append(p);
  }

  details.append(body);
  article.append(details);

  return article;
}

async function run(){
  try{
    const r=await fetch(DATA,{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);

    const d=await r.json();
    const events=d.events||[];

    if(events.length!==43)
      throw new Error(`expected 43 events · received ${events.length}`);

    grid.replaceChildren(...events.map(card));
    status.textContent=`2026 PRIMARY SKY DIGEST · ${events.length} EVENTS · A8 DATE · A8 TIME · GENERAL SKY X/Y`;
  }catch(err){
    status.textContent='EVENT REGISTER UNAVAILABLE · '+err.message;
  }
}

run();
})();
