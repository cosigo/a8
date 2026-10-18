#!/usr/bin/env python3
"""A8 physical stream cache with explicit sealed reset-generation mapping.
Physical input is never rewritten. Output RAW_COUNT is a logical carry-forward coordinate.
"""
import hashlib, json, os, tempfile, threading, time
from pathlib import Path
from urllib.request import urlopen
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SOURCE='http://127.0.0.1:28788/snapshot'
SEAL=Path('/var/lib/a8-primary-stream-cache/segment5-seal.json')
CHECK=Path('/var/lib/a8-primary-stream-cache/segment5-checkpoint.json')
HOST='127.0.0.1'; PORT=28790
lock=threading.Lock()
state={'snapshot':None,'streamConnected':False,'lastError':None,'physicalSnapshot':None}

def atomic(p,obj):
    b=(json.dumps(obj,sort_keys=True,indent=2)+'\n').encode()
    fd,tmp=tempfile.mkstemp(prefix='.a8-',dir=str(p.parent))
    try:
        with os.fdopen(fd,'wb') as f:
            os.fchmod(f.fileno(),0o600);f.write(b);f.flush();os.fsync(f.fileno())
        os.replace(tmp,p)
        d=os.open(str(p.parent),os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(d)
        finally:os.close(d)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

seal=json.loads(SEAL.read_text())
assert seal['schema']=='A8-AB-PHYSICAL-SEGMENT5-SEAL-V1'
assert seal['sourceEpoch']==9 and seal['segment']==5
assert seal['oldPhysicalRaw']==18399059 and seal['oldSequence']==11264085
assert seal['physicalAnchorRaw']>0
assert seal['oldCacheSha256']=='3aaf9bf8ab80882428268fb8255df4749c587ef10065dd8d5f6d527e3251d849'
seal_hash=hashlib.sha256(SEAL.read_bytes()).hexdigest()
last=None
if CHECK.exists():
    c=json.loads(CHECK.read_text())
    if c.get('sealSha256')!=seal_hash or c.get('schema')!='A8-AB-SEGMENT5-CACHE-CHECKPOINT-V1':
        raise RuntimeError('CACHE_CHECKPOINT_SEAL_MISMATCH')
    last=c

# No live observations are accepted until a validated source is seen.
def poll():
    global last
    while True:
        try:
            with urlopen(SOURCE,timeout=3) as r:
                assert r.status==200
                raw=r.read(65537)
            if len(raw)>65536:raise ValueError('OVERSIZE_PHYSICAL_SNAPSHOT')
            p=json.loads(raw)
            if p.get('STATUS')!='ACTIVE' or type(p.get('SOURCE_EPOCH')) is not int or p['SOURCE_EPOCH']!=9:
                raise ValueError('PHYSICAL_EPOCH_OR_STATUS_INVALID')
            raw=int(p['RAW_COUNT']); seq=int(p['REPORT_SEQUENCE'])
            if raw<seal['physicalAnchorRaw'] or seq<seal['anchorSequence']:
                raise ValueError('PHYSICAL_BEFORE_SEGMENT5_SEAM')
            virtual=seal['oldPhysicalRaw']+(raw-seal['physicalAnchorRaw'])
            # Across daemon restarts, persisted checkpoint prevents silent reversal.
            with lock:
                if last and (raw<last['physicalRaw'] or seq<last['physicalSequence'] or virtual<last['logicalRaw']):
                    raise ValueError('SEGMENT5_PHYSICAL_REVERSAL_HOLD')
                if not last or (raw,seq)!=(last['physicalRaw'],last['physicalSequence']):
                    nextc={'schema':'A8-AB-SEGMENT5-CACHE-CHECKPOINT-V1','sealSha256':seal_hash,'physicalRaw':raw,
                           'physicalSequence':seq,'logicalRaw':virtual}
                    atomic(CHECK,nextc);last=nextc
                state['snapshot']={'SOURCE_EPOCH':9,'RAW_COUNT':virtual,'REPORT_SEQUENCE':seq,'STATUS':'ACTIVE'}
                state['physicalSnapshot']={'SOURCE_EPOCH':9,'RAW_COUNT':raw,'REPORT_SEQUENCE':seq,'STATUS':'ACTIVE'}
                state['streamConnected']=True;state['lastError']=None
        except Exception as e:
            with lock:
                state['streamConnected']=False;state['lastError']=str(e)
                # Snapshot retained only for evidence; /snapshot returns 503 while unhealthy.
        time.sleep(.25)

class H(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        with lock:s=dict(state)
        if self.path=='/state':code=200;body={'schema':'A8-PRIMARY-STREAM-CACHE-SEGMENT5-V1',**s,'sealSha256':seal_hash}
        elif self.path=='/snapshot':
            code=200 if s['streamConnected'] and s['snapshot'] else 503
            body=s['snapshot'] if code==200 else {'STATUS':'HOLD','error':s['lastError']}
        else:code=404;body={'error':'NOT_FOUND'}
        data=(json.dumps(body,separators=(',',':'))+'\n').encode()
        self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)

threading.Thread(target=poll,daemon=True,name='a8-segment5-physical-observer').start()
ThreadingHTTPServer((HOST,PORT),H).serve_forever()
