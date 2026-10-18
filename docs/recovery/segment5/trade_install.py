#!/usr/bin/env python3
"""Trade guarded segment-5 coordinated install. Requires Pi segment-5 already healthy.
Usage: sudo python3 trade_install.py seam.json [--apply]
"""
import hashlib,json,os,sys,shutil,subprocess,time
from pathlib import Path
from urllib.request import urlopen
HERE=Path(__file__).resolve().parent
CACHE=Path('/usr/local/sbin/a8-primary-stream-cache.py')
JOVIAN=Path('/opt/a8-jovian-live/live-jovian.js')
INTAKE=Path('/opt/a8-core22/ab_intake.py')
CPT=Path('/var/lib/a8-core22/intake-checkpoint-v1.json')
BASE=Path('/var/lib/a8-jovian-live/baseline.json')
WHEEL=Path('/etc/a8-core22/natural-wheel-v2.json')
EXPECTED={CACHE:'3aaf9bf8ab80882428268fb8255df4749c587ef10065dd8d5f6d527e3251d849',
 JOVIAN:'681118494f736c266a65fd765ed6d1c5d6eaa6031df0ee2d8f00b59f8587b46e',
 INTAKE:'0a45ca6979799533a0924aa0f102ec6ced8be080a866820cd6bfbf7b943569fa',
 CPT:'a0a53e60e2b806cfc132c5dffd36afa3fb4b0700940213b2c8cbcea31d58c592',
 WHEEL:'2b74546110057aff1034ec3d80dec73acb694d983ae5fc9eb26cfb7f70b4bd9a'}
NEW={CACHE:HERE/'cache_v2.py',JOVIAN:HERE/'live-jovian-segment5.js',INTAKE:HERE/'ab_intake_segment5.py'}
SERVICE=['a8-core20-external-physical.service','a8-primary-stream-cache.service','a8-jovian-live-period.service','a8-core22-intake.service']
def cmd(*a):
    subprocess.run(a,check=True)
def get(url):
    with urlopen(url,timeout=4) as r:
        if r.status!=200:raise RuntimeError('HTTP_'+str(r.status))
        return json.load(r)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def assertok(test,why):
    if not test:raise RuntimeError('STOP · '+why)
def main():
    assertok(len(sys.argv) in (2,3),'USAGE: sudo python3 trade_install.py /home/greg/a8-segment5-seal.json [--apply]')
    apply=len(sys.argv)==3 and sys.argv[2]=='--apply'
    assertok(len(sys.argv)==2 or apply,'BAD FLAG')
    assertok(os.geteuid()==0 or not apply,'ROOT REQUIRED FOR APPLY')
    seam_path=Path(sys.argv[1]);s=json.loads(seam_path.read_text())
    assertok(s.get('schema')=='A8-AB-PHYSICAL-SEGMENT5-SEAL-V1' and s.get('segment')==5 and s.get('sourceEpoch')==9,'SEAM CONTRACT')
    assertok(s['oldPhysicalRaw']==18399059 and s['core22RawAtSeam']==436773,'HISTORIC RAW CONTRACT')
    assertok(s['oldSequence']==11264085 and s['core22CheckpointSha256']==EXPECTED[CPT],'OLD CHECKPOINT CONTRACT')
    for p,h in EXPECTED.items():assertok(p.is_file() and not p.is_symlink() and sha(p)==h,'HASH MISMATCH '+str(p))
    assertok(HERE.joinpath('cache_v2.py').is_file() and HERE.joinpath('live-jovian-segment5.js').is_file() and HERE.joinpath('ab_intake_segment5.py').is_file(),'MISSING PAYLOAD')
    b=json.loads(BASE.read_text());assertok(int(b['sourceEpoch'])==9 and int(b['baselineRaw'])==30466,'JOVIAN BASELINE DIFFERENT; DO NOT REARM')
    c=json.loads(CPT.read_text());assertok(c['status']=='HOLD_PHYSICAL_RAW_REVERSAL' and c['core22Raw']==436773,'CORE22 HOLD CHANGED')
    a=get('http://127.0.0.1:28788/snapshot')
    assertok(a['SOURCE_EPOCH']==9 and a['STATUS']=='ACTIVE' and a['RAW_COUNT']>=s['physicalAnchorRaw'] and a['REPORT_SEQUENCE']>=s['anchorSequence'],'PHYSICAL BEFORE CAPTURED SEAM')
    pi=get('http://127.0.0.1:28789/health')
    assertok(pi['status']=='READY' and pi['source']['carrierDiscipline']['segmentNumber']==5,'PI SEGMENT5 NOT LIVE')
    assertok(int(pi['source']['carrierDiscipline']['physicalAnchorRaw'])==s['physicalAnchorRaw'],'PI TRADE ANCHOR DISAGREES')
    print('PASS · SAME SEAM ON PI AND TRADE:',s['physicalAnchorRaw'])
    print('PASS · Historical checkpoints and original program hashes')
    print('DRY RUN' if not apply else 'APPLY AUTHORIZED')
    if not apply:return
    # The feeder is the only Core20 process stopped. Core20 service itself is not touched.
    cmd('systemctl','stop',SERVICE[0]);print('FEEDER HELD; CORE20 NOT STOPPED',flush=True)
    bundle=Path('/var/lib/a8-primary-stream-cache');bundle.mkdir(mode=0o755,parents=True,exist_ok=True)
    # Cache process runs as greg according to the inspected service.
    import pwd
    pw=pwd.getpwnam('greg');os.chown(bundle,pw.pw_uid,pw.pw_gid)
    receipt=bundle/'segment5-install-receipt.json'
    assertok(not receipt.exists() and not (bundle/'segment5-seal.json').exists(),'SEGMENT5 PREVIOUSLY ATTEMPTED')
    for p in NEW:
        back=p.with_name(p.name+'.before-a8-segment5-'+EXPECTED[p][:12])
        assertok(not back.exists(),'BACKUP EXISTS '+str(back))
        shutil.copy2(p,back)
        print('BACKUP:',back)
    # Preserve the latched Core22 evidence before changing status.
    cb=CPT.with_name(CPT.name+'.before-a8-segment5-'+EXPECTED[CPT][:12]);assertok(not cb.exists(),'CORE22 BACKUP EXISTS')
    shutil.copy2(CPT,cb)
    for dest,src in NEW.items():
        tmp=dest.with_name(dest.name+'.a8-segment5-new')
        assertok(not tmp.exists(),'TEMPORARY OUTPUT EXISTS '+str(tmp))
        shutil.copy2(src,tmp);os.chmod(tmp,dest.stat().st_mode & 0o777);os.chown(tmp,dest.stat().st_uid,dest.stat().st_gid)
        os.replace(tmp,dest);assertok(sha(dest)==sha(src),'POSTCOPY HASH ERROR')
    # Identical immutable segment seal readable by both services.
    shutil.copy2(seam_path,bundle/'segment5-seal.json')
    shutil.copy2(seam_path,Path('/var/lib/a8-core22/segment5-seal.json'))
    os.chmod(bundle/'segment5-seal.json',0o644)
    os.chmod('/var/lib/a8-core22/segment5-seal.json',0o644)
    cc=dict(c);cc['status']='WAITING_FOR_SOURCE';cc['carrierSegment']=5
    cc['lastActualPhysicalRaw']=s['physicalAnchorRaw']
    # Preserve last logical checkpoint at the old accepted physical RAW.
    cc['manualRecoveryPreviousCheckpointSha256']=EXPECTED[CPT]
    tmp=CPT.with_name(CPT.name+'.a8-segment5-new')
    with open(tmp,'w') as f:json.dump(cc,f,indent=2,sort_keys=True);f.write('\n');f.flush();os.fsync(f.fileno())
    os.chmod(tmp,0o600);os.chown(tmp,CPT.stat().st_uid,CPT.stat().st_gid);os.replace(tmp,CPT)
    receipt.write_text(json.dumps({'schema':'A8-SEGMENT5-INSTALL-RECEIPT-V1','seamSha256':sha(seam_path),
       'oldCacheSha256':EXPECTED[CACHE],'oldJovianSha256':EXPECTED[JOVIAN],
       'oldCore22IntakeSha256':EXPECTED[INTAKE], 'oldCore22CheckpointSha256':EXPECTED[CPT]},indent=2)+'\n')
    cmd('systemctl','restart','a8-primary-stream-cache.service')
    time.sleep(1)
    cache=get('http://127.0.0.1:28790/state')
    assertok(cache['streamConnected'] and cache['snapshot']['RAW_COUNT']>=18399059,'CACHE NOT QUALIFIED; FEEDER REMAINS STOPPED')
    cmd('systemctl','restart','a8-jovian-live-period.service')
    time.sleep(1)
    j=get('http://127.0.0.1:18028/state')
    assertok(j.get('ok') is True and j['physical']['baselineRaw']=='30466','JOVIAN NOT QUALIFIED; FEEDER REMAINS STOPPED')
    cmd('systemctl','reset-failed','a8-core22-intake.service')
    cmd('systemctl','start','a8-core22-intake.service')
    time.sleep(1)
    core22=get('http://127.0.0.1:18034/api/core22/status')
    assertok(core22['intakeStatus']=='OBSERVING' and int(core22['core22Raw'])>=436773,'CORE22 NOT OBSERVING; FEEDER REMAINS STOPPED')
    cmd('systemctl','start',SERVICE[0]);time.sleep(1)
    print('PASS · CACHE, JOVIAN, CORE22; FEEDER START REQUESTED; CHECK CORE20 ACTUAL ADVANCE')
    print('A8 CORE21 UNTOUCHED, NO CLOCK ADJUSTMENT, NO MODEL RETUNE')
if __name__=='__main__':
    try:main()
    except Exception as e:
        print('FAIL CLOSED:',e,flush=True)
        print('If apply was attempted, do not repeatedly rerun; inspect backups and FEEDER status.')
        sys.exit(2)
