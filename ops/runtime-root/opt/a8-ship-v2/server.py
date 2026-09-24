#!/usr/bin/env python3

import json
import os
from fractions import Fraction
from http.server import (
    BaseHTTPRequestHandler,
    ThreadingHTTPServer,
)
from urllib.request import (
    Request,
    urlopen,
)

PORT=int(
    os.environ.get(
        'A8_SHIP_V2_PORT',
        '18031'
    )
)

BIRTH_PATH=os.environ.get(
    'A8_SHIP_V2_BIRTH',
    '/opt/a8-ship-v2/terra-ship-slip-v2-birth.json'
)

CORE_URL='http://127.0.0.1:18020/api/core20/clock'
REL_URL='http://127.0.0.1:18020/api/terra-ship-slip'
ANNUAL_URL='http://127.0.0.1:18030/state'

BIRTH_RATE=Fraction(
    2653529,
    1563456986718750
)

FULL=Fraction(512,1)
HALF=Fraction(256,1)


def fetch(url):
    req=Request(
        url,
        headers={
            'Accept':'application/json'
        }
    )

    with urlopen(
        req,
        timeout=2
    ) as r:
        return json.load(r)


def rat(x):
    return {
        'numerator':
            str(x.numerator),

        'denominator':
            str(x.denominator),

        'text':
            (
                str(x.numerator)
                if x.denominator == 1
                else
                f'{x.numerator}/{x.denominator}'
            )
    }


def fixed(x,digits=9):
    return (
        f'{float(x):.{digits}f}'
    )


def state():
    with open(BIRTH_PATH) as f:
        birth=json.load(f)

    core=fetch(CORE_URL)
    rel=fetch(REL_URL)
    annual=fetch(ANNUAL_URL)

    c=core.get('clock') or {}
    align=c.get('alignment') or {}

    if c.get('status') != 'CORE20_CLOCK_RUNNING':
        raise RuntimeError(
            'CORE_CLOCK_NOT_RUNNING'
        )

    current_raw=int(
        c['currentSelectedRawPulse']
    )

    birth_raw=int(
        birth[
          'coreBirthCoordinate'
        ]['raw']
    )

    if current_raw < birth_raw:
        raise RuntimeError(
            'CORE_RAW_BEFORE_V2_BIRTH'
        )

    relationship=(
        rel.get('terraShipSlip')
        or {}
    )

    rr=(
        relationship.get(
            'solAdvancePerRawPulse512'
        )
        or {}
    )

    current_rate=Fraction(
        int(rr['numerator']),
        int(rr['denominator'])
    )

    if current_rate != BIRTH_RATE:
        raise RuntimeError(
            'V2_RATE_HANDOFF_REQUIRED'
        )

    delta=current_raw-birth_raw

    total=Fraction(delta,1)*BIRTH_RATE

    turns=total // FULL

    phase=total-(turns*FULL)

    folded=(
        phase
        if phase <= HALF
        else FULL-phase
    )

    folded_phase17=folded*256

    unwrapped_rotations=total/FULL

    cycle_percent=(phase/FULL)*100
    folded_percent=(folded/HALF)*100

    annual_out=(
        annual.get(
            'annualV1Output'
        )
        or {}
    )

    sol_angle=annual_out.get(
        'natureAnnualAngle512Continuous'
    )

    external_epoch=align.get(
        'externalPhysicalSourceEpoch'
    )

    if str(external_epoch) == '':
        external_epoch=None

    relative_annual=(
        Fraction(384,1)+phase
    ) % FULL

    leg=(
        'OUTBOUND_FROM_ALIGNMENT'
        if phase <= HALF
        else 'RETURN_TO_ALIGNMENT'
    )

    return {
      'ok': True,

      'v2': {
        'schema':
          'A8-TERRA-SHIP-SLIP-V2',

        'status':
          'V2_LIVE_FROM_SEP22_EQUINOX',

        'generation':
          2,

        'birthStatus':
          birth['status'],

        'birthCoreRaw':
          str(birth_raw),

        'birthAnnualAngle512':
          '384',

        'birthAnnualAngleOctal':
          '600₈',

        'oppositionAnnualAngleOctal':
          '200₈',

        'currentCoreRaw':
          str(current_raw),

        'coreRawSinceBirth':
          str(delta),

        'liveExternalPhysicalSourceEpoch':
          str(external_epoch),

        'lifetimeTerraShipSlip512':
          rat(total),

        'phaseWithin512':
          rat(phase),

        'relativeTurnsCarry':
          str(turns),

        'unwrappedRotations':
          rat(unwrapped_rotations),

        'foldedAngle512':
          rat(folded),

        'foldedPhase17':
          rat(folded_phase17),

        'cycleProgressPercent':
          fixed(cycle_percent,6),

        'foldedProgressPercent':
          fixed(folded_percent,6),

        'currentLeader':
          'MINTAKA_LEADS',

        'geometricLeg':
          leg,

        'relativeAnnualPosition512':
          rat(relative_annual),

        'absoluteAnnualPosition': {
          'rule':
            'SHIP_ALIGNED_TO_SOL_ANNUAL_FRAME_V1',

          'natureAnnualAngle512Continuous':
            sol_angle,

          'natureAnnualAngleOctal':
            annual_out.get(
                'natureAnnualAngleOctal'
            )
        },

        'rate': {
          'terraShipSlipPerCoreRaw512':
            rat(BIRTH_RATE),

          'status':
            'LOCKED_FROM_PRE_EQUINOX_QUALIFIED_RELATIONSHIP'
        },

        'authorityBoundary': {
          'writesCore20': False,
          'writesV1Ledger': False,
          'writesAnnualFrame': False,
          'usesUTC': False,
          'usesHostTime': False,
          'usesBrowserTime': False,
          'networkCadenceAuthority': False,
          'sameRawMeansNoAdvance': True
        }
      },

      'birthCertificate':
        birth
    }


class Handler(BaseHTTPRequestHandler):

    protocol_version='HTTP/1.1'

    def log_message(self,*_):
        return

    def send_json(
        self,
        code,
        payload
    ):
        body=(
            json.dumps(
                payload,
                indent=2
            ) + '\n'
        ).encode()

        self.send_response(code)

        self.send_header(
            'Content-Type',
            'application/json; charset=utf-8'
        )

        self.send_header(
            'Cache-Control',
            'no-store'
        )

        self.send_header(
            'Content-Length',
            str(len(body))
        )

        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path not in (
            '/',
            '/state',
        ):
            self.send_json(
                404,
                {
                    'ok':False,
                    'error':'NOT_FOUND'
                }
            )
            return

        try:
            self.send_json(
                200,
                state()
            )

        except Exception as e:
            self.send_json(
                503,
                {
                    'ok':False,
                    'status':
                      'SHIP_V2_FAIL_CLOSED',

                    'error':
                      str(e)
                }
            )


if __name__ == '__main__':
    server=ThreadingHTTPServer(
        ('127.0.0.1',PORT),
        Handler
    )

    print(
        f'A8 SHIP V2 · 127.0.0.1:{PORT}',
        flush=True
    )

    server.serve_forever()
