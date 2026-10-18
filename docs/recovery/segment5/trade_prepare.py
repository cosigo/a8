#!/usr/bin/env python3
"""Trade seam capture; creates seal after comparing live and historical checkpoints. Does not modify services."""
from pathlib import Path
from urllib.request import urlopen
import json,hashlib,sys,os
FILE=Path('/home/greg/a8-segment5-seal.json')
def get(url):
    with urlopen(url,timeout=4) as r:return json.load(r)
a=get('http://127.0.0.1:28788/snapshot');b=get('http://127.0.0.1:28788/snapshot')
if a['SOURCE_EPOCH']!=9 or b['SOURCE_EPOCH']!=9 or a['STATUS']!='ACTIVE' or b['STATUS']!='ACTIVE' or b['RAW_COUNT']<a['RAW_COUNT'] or b['REPORT_SEQUENCE']<a['REPORT_SEQUENCE']:
    sys.exit('STOP · PHYSICAL SOURCE NOT QUALIFIED')
cp=Path('/var/lib/a8-core22/intake-checkpoint-v1.json').read_bytes()
if hashlib.sha256(cp).hexdigest()!='a0a53e60e2b806cfc132c5dffd36afa3fb4b0700940213b2c8cbcea31d58c592':
    sys.exit('STOP · CORE22 CHECKPOINT CHANGED')
s={'schema':'A8-AB-PHYSICAL-SEGMENT5-SEAL-V1','sourceEpoch':9,'segment':5,
   'physicalAnchorRaw':b['RAW_COUNT'],'anchorSequence':b['REPORT_SEQUENCE'],
   'oldPhysicalRaw':18399059,'oldSequence':11264085,'core22RawAtSeam':436773,
   'oldCacheSha256':'3aaf9bf8ab80882428268fb8255df4749c587ef10065dd8d5f6d527e3251d849',
   'core22CheckpointSha256':hashlib.sha256(cp).hexdigest(),
   'mode':'OBSERVED_RESET_GENERATION_NO_OUTAGE_ELAPSED_INFERENCE',
   'physicalSourceIsReplaceable':True,'changesNaturalCoordinates':False,'changesCore21':False}
if FILE.exists():
    old=json.loads(FILE.read_text())
    if old!=s:sys.exit('STOP · SEAL EXISTS ALREADY; DO NOT REANCHOR')
else:
    if len(sys.argv)!=2 or sys.argv[1]!='--capture':sys.exit('DRY RUN · seal would be: '+json.dumps(s))
    fd=os.open(FILE,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:json.dump(s,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
print('SEAL',FILE,'SHA256',hashlib.sha256(FILE.read_bytes()).hexdigest())
print(json.dumps(s,indent=2))
