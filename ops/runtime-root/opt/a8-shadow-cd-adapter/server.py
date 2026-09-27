#!/usr/bin/env python3

import json
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LISTEN_HOST = '127.0.0.1'
LISTEN_PORT = 18029

CD_URL = 'http://127.0.0.1:18027/api/shadow/ghost'

# ------------------------------------------------------------
# SEALED BOOTSTRAP COINCIDENCE
#
# Refined-watch start:
#
# A/B SOURCE_EPOCH 8
# A/B RAW 18,916,931
#
# C/D RUN
# 8c3e3467-6e6c-4046-9150-f6196892b804
# C/D RAW 13,490,694
#
# ------------------------------------------------------------

EXPECTED_CD_RUN = (
    '8c3e3467-6e6c-4046-9150-f6196892b804'
)

AB_ANCHOR_RAW = 18_916_931
CD_ANCHOR_RAW = 13_490_694

# Refined carrier bootstrap:
#
# A/B delta / C/D delta = 28,448 / 28,560
#                         = 254 / 255
#
# Therefore:
#
# AB-equivalent =
#   AB_ANCHOR +
#   (CD - CD_ANCHOR) * 254 / 255
#
SCALE_NUM = 254
SCALE_DEN = 255


def read_cd():
    with urllib.request.urlopen(
        CD_URL,
        timeout=2.0
    ) as r:
        x = json.load(r)

    if not x.get('ok'):
        raise RuntimeError(
            'CD_GHOST_NOT_OK'
        )

    g = x.get('ghost') or {}

    run_id = g.get('runId')

    if run_id != EXPECTED_CD_RUN:
        raise RuntimeError(
            'CD_RUN_ID_CHANGED'
        )

    if g.get('linkStatus') != 'RECEIVING':
        raise RuntimeError(
            'CD_LINK_NOT_RECEIVING'
        )

    raw = int(g['rawCount'])

    if raw < CD_ANCHOR_RAW:
        raise RuntimeError(
            'CD_RAW_BEFORE_BOOTSTRAP_ANCHOR'
        )

    return g, raw


def map_cd_to_ab(cd_raw):
    delta = cd_raw - CD_ANCHOR_RAW

    # Exact numerator of the complete mapped coordinate:
    #
    # AB_ANCHOR +
    # delta * 254/255
    #
    numerator = (
        AB_ANCHOR_RAW * SCALE_DEN
        +
        delta * SCALE_NUM
    )

    mapped_raw, remainder = divmod(
        numerator,
        SCALE_DEN
    )

    return (
        mapped_raw,
        numerator,
        remainder
    )


class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        return

    def send_json(self, code, obj):
        body = (
            json.dumps(
                obj,
                indent=2,
                sort_keys=True
            )
            + '\n'
        ).encode('utf-8')

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

        if self.path == '/status':
            self.send_json(
                200,
                {
                    'ok': True,
                    'schema':
                        'A8-SHADOW-CD-CARRIER-ADAPTER-V1',
                    'status':
                        'BOOTSTRAP_ACTIVE',
                    'mode':
                        'CD_TO_AB_EQUIVALENT',
                    'writesMain':
                        False,
                    'writesShadowCore':
                        False,
                    'scale': {
                        'numerator':
                            str(SCALE_NUM),
                        'denominator':
                            str(SCALE_DEN),
                    },
                    'bootstrap': {
                        'abAnchorRaw':
                            str(AB_ANCHOR_RAW),
                        'cdAnchorRaw':
                            str(CD_ANCHOR_RAW),
                        'cdRunId':
                            EXPECTED_CD_RUN,
                    },
                }
            )
            return

        if self.path != '/snapshot':
            self.send_json(
                404,
                {
                    'ok': False,
                    'error': 'NOT_FOUND'
                }
            )
            return

        try:
            ghost, cd_raw = read_cd()

            (
                mapped_raw,
                exact_num,
                remainder
            ) = map_cd_to_ab(cd_raw)

            self.send_json(
                200,
                {
                    'ok': True,

                    'schema':
                        'A8-SHADOW-CD-AB-EQUIVALENT-SNAPSHOT-V1',

                    'status':
                        'ACTIVE',

                    # Adapter-local epoch.
                    # This is NOT Main SOURCE_EPOCH 8.
                    'SOURCE_EPOCH':
                        1,

                    # Main-compatible equivalent RAW coordinate.
                    'RAW_COUNT':
                        str(mapped_raw),

                    'REPORT_SEQUENCE':
                        ghost.get('sequence'),

                    'carrier': {
                        'name':
                            'ARDUINO_C_D',
                        'runId':
                            ghost.get('runId'),
                        'rawCount':
                            str(cd_raw),
                        'linkStatus':
                            ghost.get('linkStatus'),
                        'powerQualification':
                            ghost.get(
                                'powerQualification'
                            ),
                    },

                    'mapping': {
                        'status':
                            'BOOTSTRAP_FROM_MAIN_REFERENCE',

                        'abAnchorRaw':
                            str(AB_ANCHOR_RAW),

                        'cdAnchorRaw':
                            str(CD_ANCHOR_RAW),

                        'numerator':
                            str(SCALE_NUM),

                        'denominator':
                            str(SCALE_DEN),

                        'exactMappedNumerator':
                            str(exact_num),

                        'exactMappedDenominator':
                            str(SCALE_DEN),

                        'floorMappedRaw':
                            str(mapped_raw),

                        'fractionalRemainder':
                            str(remainder),
                    },

                    'authority': {
                        'naturalBody':
                            'EUROPA',

                        'qualification':
                            'BOOTSTRAP_TEST_NOT_YET_SEALED',
                    },

                    'safety': {
                        'writesMain':
                            False,
                        'writesCore20':
                            False,
                        'writesArduino':
                            False,
                        'usesUTC':
                            False,
                        'usesHostTimeForProgression':
                            False,
                        'crossRunContinuity':
                            False,
                    },
                }
            )

        except Exception as e:
            self.send_json(
                503,
                {
                    'ok': False,
                    'status':
                        'FAIL_CLOSED',
                    'error':
                        str(e),
                }
            )


if __name__ == '__main__':
    server = ThreadingHTTPServer(
        (LISTEN_HOST, LISTEN_PORT),
        Handler
    )

    print(
        'A8 SHADOW C/D CARRIER ADAPTER · '
        f'{LISTEN_HOST}:{LISTEN_PORT}',
        flush=True
    )

    server.serve_forever()
