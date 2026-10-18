#!/usr/bin/env python3
"""Pi gearbox segment-5 guarded installer. sudo python3 pi_install.py seam.json --apply"""
import sys, pathlib, hashlib, json, urllib.request, tempfile, os
from fractions import Fraction
P=pathlib.Path('/opt/a8-pulse-box/ab-carrier-discipline.json')
SHA='4592eb6408e111f4a7e57e16f3182bbde894673224546dcee437c7275628ac90'
Q=Fraction(877018067214063868,877155239030163555)
OLD=441369; LAST=18399059

def loadurl(url):
    with urllib.request.urlopen(url,timeout=4) as r:return json.load(r)
def atomic(p,b):
    fd,tmp=tempfile.mkstemp(prefix='.a8-s5-',dir=str(p.parent))
    try:
        with os.fdopen(fd,'wb') as f:
            os.fchmod(f.fileno(),0o600);f.write(b);f.flush();os.fsync(f.fileno())
        os.replace(tmp,p)
        d=os.open(str(p.parent),os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(d)
        finally:os.close(d)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

def main():
    if len(sys.argv) not in (2,3):sys.exit('USAGE: sudo python3 pi_install.py seam.json [--apply]')
    apply=len(sys.argv)==3 and sys.argv[2]=='--apply'
    if len(sys.argv)==3 and not apply:sys.exit('INVALID ARG')
    seam=json.loads(pathlib.Path(sys.argv[1]).read_text())
    if seam.get('schema')!='A8-AB-PHYSICAL-SEGMENT5-SEAL-V1' or seam.get('segment')!=5 or seam.get('sourceEpoch')!=9 or seam.get('oldPhysicalRaw')!=LAST:
        sys.exit('STOP · INVALID SHARED SEAM')
    b=P.read_bytes(); sha=hashlib.sha256(b).hexdigest()
    if sha!=SHA:sys.exit('STOP · PI DISCIPLINE HASH CHANGED')
    s=json.loads(b)
    if s['segmentNumber']!=4 or s['physicalAnchorRaw']!=str(OLD) or s['physicalSourceEpoch']!='9' or s['disciplinedAnchor']!={'numerator':'0','denominator':'1'}:
        sys.exit('STOP · OLD SEGMENT CONTRACT MISMATCH')
    if Fraction(int(s['ratio']['numerator']),int(s['ratio']['denominator']))!=Q:sys.exit('STOP · RATIO CHANGED')
    source=loadurl('http://127.0.0.1:8788/snapshot')
    p=int(source['RAW_COUNT']);seq=int(source['REPORT_SEQUENCE']); a=int(seam['physicalAnchorRaw'])
    if source.get('SOURCE_EPOCH')!=9 or source.get('STATUS')!='ACTIVE' or p<a or seq<int(seam['anchorSequence']):
        sys.exit('STOP · PI PHYSICAL SOURCE NOT AT OR BEYOND SEAM')
    d=(LAST-OLD)*Q
    n=dict(s);n['segmentNumber']=5;n['physicalAnchorRaw']=str(a)
    n['disciplinedAnchor']={'numerator':str(d.numerator),'denominator':str(d.denominator)}
    n['provenance']='EPOCH9_COUNTER_RESET_SEGMENT5_PRESERVED_LAST_ACCEPTED_CHECKPOINT_NO_OUTAGE_INFERENCE'
    n['automaticReanchor']=False
    print('PI VERIFIED: physical',p,'seq',seq,'new anchor',a,'old checkpoint',LAST)
    print('DISCIPLINED ANCHOR',d,'PREDICTED LIVE', d+(p-a)*Q)
    if not apply:print('DRY RUN ONLY · NO WRITES');return
    backup=P.with_name(P.name+'.before-segment5-'+SHA[:12])
    if backup.exists():sys.exit('STOP · BACKUP ALREADY EXISTS')
    atomic(backup,b)
    atomic(P,(json.dumps(n,indent=2)+'\n').encode())
    health=loadurl('http://127.0.0.1:8789/health')
    carrier=health['source']['carrierDiscipline']
    if health['status']!='READY' or carrier['segmentNumber']!=5:
        print('STOP · POST-INSTALL HEALTH NOT VERIFIED; BACKUP',backup);sys.exit(3)
    print('PASS · PI SEGMENT5 LIVE · NO SERVICE RESTART · BACKUP',backup)
if __name__=='__main__':main()
