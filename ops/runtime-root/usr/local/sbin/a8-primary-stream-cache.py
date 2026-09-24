#!/usr/bin/env python3

import json
import threading
import time
import urllib.request
from http.server import (
    BaseHTTPRequestHandler,
    ThreadingHTTPServer,
)

STREAM="http://127.0.0.1:28789/stream"
HOST="127.0.0.1"
PORT=28790

lock=threading.Lock()

state={
    "snapshot":None,
    "streamConnected":False,
    "lastError":None,
}


def set_connection(connected,error=None):
    with lock:
        state["streamConnected"]=connected
        state["lastError"]=error


def accept_snapshot(d):
    required=(
        "SOURCE_EPOCH",
        "RAW_COUNT",
        "REPORT_SEQUENCE",
        "STATUS",
    )

    for key in required:
        if key not in d:
            raise RuntimeError(
                "STREAM_PAYLOAD_MISSING_"+key
            )

    if d["STATUS"] != "ACTIVE":
        raise RuntimeError(
            "STREAM_SOURCE_NOT_ACTIVE"
        )

    clean={
        "SOURCE_EPOCH":
            int(d["SOURCE_EPOCH"]),
        "RAW_COUNT":
            int(d["RAW_COUNT"]),
        "REPORT_SEQUENCE":
            int(d["REPORT_SEQUENCE"]),
        "STATUS":
            "ACTIVE",
    }

    with lock:
        previous=state["snapshot"]

        if previous is not None:
            pe=int(previous["SOURCE_EPOCH"])
            ce=int(clean["SOURCE_EPOCH"])

            if ce == pe:
                if (
                    clean["RAW_COUNT"]
                    < previous["RAW_COUNT"]
                ):
                    raise RuntimeError(
                        "SAME_EPOCH_RAW_REGRESSION"
                    )

                if (
                    clean["REPORT_SEQUENCE"]
                    < previous["REPORT_SEQUENCE"]
                ):
                    raise RuntimeError(
                        "SAME_EPOCH_SEQUENCE_REGRESSION"
                    )

        state["snapshot"]=clean


def stream_reader():

    while True:

        try:
            set_connection(False,None)

            event=None

            with urllib.request.urlopen(
                STREAM,
                timeout=30,
            ) as r:

                set_connection(True,None)

                for rawline in r:

                    line=rawline.decode(
                        "utf-8",
                        errors="replace",
                    ).strip()

                    if line.startswith("event:"):
                        event=(
                            line.split(":",1)[1]
                            .strip()
                        )
                        continue

                    if (
                        event=="physical-raw"
                        and
                        line.startswith("data:")
                    ):
                        d=json.loads(
                            line.split(":",1)[1]
                            .strip()
                        )

                        accept_snapshot(d)
                        event=None

        except Exception as exc:
            set_connection(
                False,
                str(exc),
            )

            print(
                "STREAM CACHE HOLD ·",
                repr(exc),
                flush=True,
            )

            # Transport retry only.
            # Never enters RAW/time/phase math.
            time.sleep(.25)


class Handler(BaseHTTPRequestHandler):

    def log_message(self,fmt,*args):
        pass

    def respond(self,code,payload):

        body=json.dumps(
            payload,
            separators=(",",":"),
        ).encode("ascii")

        self.send_response(code)
        self.send_header(
            "Content-Type",
            "application/json",
        )
        self.send_header(
            "Cache-Control",
            "no-store",
        )
        self.send_header(
            "Content-Length",
            str(len(body)),
        )
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):

        with lock:
            snap=(
                dict(state["snapshot"])
                if state["snapshot"] is not None
                else None
            )

            connected=state["streamConnected"]
            error=state["lastError"]

        if self.path == "/snapshot":

            if snap is None:
                return self.respond(
                    503,
                    {
                        "STATUS":
                            "WAITING_FOR_STREAM"
                    },
                )

            # Deliberately serve the last absolute
            # physical observation even during a
            # transport interruption.
            #
            # Same RAW => Core does not advance.
            # Reconnect => current absolute RAW
            # deterministically catches up.
            return self.respond(
                200,
                snap,
            )

        if self.path == "/state":

            return self.respond(
                200,
                {
                    "schema":
                        "A8-PRIMARY-STREAM-CACHE-V1",

                    "streamConnected":
                        connected,

                    "lastError":
                        error,

                    "snapshot":
                        snap,
                },
            )

        return self.respond(
            404,
            {"ok":False},
        )


threading.Thread(
    target=stream_reader,
    name="persistent-physical-stream",
    daemon=True,
).start()

server=ThreadingHTTPServer(
    (HOST,PORT),
    Handler,
)

server.serve_forever()
