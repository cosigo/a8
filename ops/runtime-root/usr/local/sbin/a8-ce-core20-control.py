#!/usr/bin/env python3

import json
import subprocess
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

HOST = "127.0.0.1"
PORT = 18023

CORE = "a8-core20.service"
AUTO = "a8-core20-autorecover.service"

operation_lock = Lock()


def run(*args, timeout=30):
    return subprocess.run(
        list(args),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
    )


def active(unit):
    p = run(
        "systemctl",
        "is-active",
        unit,
        timeout=5,
    )
    return p.stdout.strip()


def prop(unit, name):
    p = run(
        "systemctl",
        "show",
        unit,
        f"--property={name}",
        "--value",
        timeout=5,
    )
    return p.stdout.strip()


def get_json(path, timeout=2):
    try:
        with urllib.request.urlopen(
            "http://127.0.0.1:18020" + path,
            timeout=timeout,
        ) as r:
            return json.loads(r.read())
    except Exception:
        return None



AUTHORITY_STATE_FILE = "/etc/a8-core20/jovian-authority.json"

AUTHORITY_PERIODS = {
    "IO": 4650745,
    "EUROPA": 9344598,
    "GANYMEDE": 18866420,
}

ALL_JOVIAN_BODIES = (
    "IO",
    "EUROPA",
    "GANYMEDE",
    "CALLISTO",
)


def authority_default(body="EUROPA"):
    body = str(body).upper()

    if body not in AUTHORITY_PERIODS:
        body = "EUROPA"

    return {
        "schema": "A8-JOVIAN-AUTHORITY-SELECTION-V1",
        "selectedAuthority": body,
        "selectedPeriodRaw": AUTHORITY_PERIODS[body],
        "selectableAuthorities": [
            "IO",
            "EUROPA",
            "GANYMEDE",
        ],
        "witnesses": [
            x for x in ALL_JOVIAN_BODIES
            if x != body
        ],
        "callistoRole": "WITNESS_ONLY",
        "disciplineState": "TRANSITION_FROM_AVERAGE",
        "liveDevelopmentRulerRaw": 18719532,
        "liveDevelopmentRulerRole":
            "AVERAGED_DEVELOPMENT_RIG",
        "actuatesFeeder": False,
        "writesCore20": False,
        "writesArduino": False,
    }


def authority_state():
    try:
        with open(
            AUTHORITY_STATE_FILE,
            "r",
            encoding="utf-8",
        ) as f:
            state = json.load(f)

    except FileNotFoundError:
        return authority_default()

    except Exception as exc:
        state = authority_default()
        state["stateError"] = str(exc)
        return state

    body = str(
        state.get(
            "selectedAuthority",
            "EUROPA",
        )
    ).upper()

    result = authority_default(body)

    return result


def write_authority_state(body):
    state = authority_default(body)

    tmp = AUTHORITY_STATE_FILE + ".tmp"

    with open(
        tmp,
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            state,
            f,
            indent=2,
            sort_keys=True,
        )
        f.write("\n")

    subprocess.run(
        [
            "/usr/bin/mv",
            "-f",
            tmp,
            AUTHORITY_STATE_FILE,
        ],
        check=True,
    )

    return state

def snapshot():
    core_state = active(CORE)
    auto_state = active(AUTO)

    result = {
        "schema": "A8-CE-CORE20-SERVICE-CONTROL-V1",
        "state": "UNKNOWN",
        "online": False,

        "core20Service": core_state,
        "core20SubState": prop(CORE, "SubState"),
        "core20MainPID": prop(CORE, "MainPID"),
        "core20Result": prop(CORE, "Result"),

        "autorecoveryService": auto_state,
        "autorecoveryResult": prop(AUTO, "Result"),

        "clock": None,
        "calendar": None,
        "yearAngle": None,
    }

    if core_state == "inactive":
        result["state"] = "OFFLINE"
        return result

    if core_state == "failed":
        result["state"] = "FAILED"
        return result

    clock_payload = get_json("/api/core20/clock")
    cal_payload = get_json("/api/core20/calendar")
    year_payload = get_json("/api/core20/year-angle")

    if clock_payload:
        result["clock"] = clock_payload.get("clock")

    if cal_payload:
        result["calendar"] = cal_payload.get("calendar")

    if year_payload:
        result["yearAngle"] = year_payload.get("yearAngle")

    clock = result["clock"] or {}
    cal = result["calendar"] or {}
    year = result["yearAngle"] or {}

    alignment = clock.get("alignment") or {}
    runtime = clock.get("runtime") or {}
    paths = runtime.get("pathStatus") or {}

    physical_primary = (
        alignment.get("role") ==
            "QUALIFIED_EXTERNAL_PHYSICAL_PRIMARY"
        and alignment.get("temporaryEmergency") is False
        and alignment.get("jovianQualified") is True
        and runtime.get("externalPhysicalPrimary") is True
        and paths.get("primary") == "ACTIVE"
        and paths.get("legacyEmergency") ==
            "STANDBY_DISCONNECTED"
    )

    year_running = (
        year.get("status") ==
            "YEAR_ANGLE_RUNNING_FROM_RECOVERED_SOL"
        and year.get("aligned") is True
    )

    year_orientation_standby = (
        physical_primary
        and year.get("status") ==
            "YEAR_ANGLE_AWAITING_ONE_SHOT_JPL_ALIGN"
        and year.get("aligned") is False
        and year.get("ongoingAuthority") ==
            "RECOVERED_SOL_ORBITAL_ADVANCE_ONLY"
        and year.get("usesJplAfterAlignment") is False
        and year.get("usesUtcAfterAlignment") is False
    )

    result["primaryPath"] = (
        "QUALIFIED_EXTERNAL_PHYSICAL_PRIMARY"
        if physical_primary
        else "NOT_QUALIFIED_EXTERNAL_PHYSICAL_PRIMARY"
    )

    result["yearOrientation"] = (
        "RUNNING_FROM_RECOVERED_SOL"
        if year_running
        else
        "STANDBY_ONE_SHOT_JPL"
        if year_orientation_standby
        else
        "UNQUALIFIED"
    )

    qualified = (
        core_state == "active"
        and auto_state == "active"
        and clock.get("status") ==
            "CORE20_CLOCK_RUNNING"
        and cal.get("status") ==
            "CALENDAR_RUNNING_FROM_CORE20_COUNT"
        and cal.get("anchored") is True
        and (
            year_running
            or year_orientation_standby
        )
    )

    if qualified:
        result["state"] = "ONLINE"
        result["online"] = True
    elif core_state == "active":
        result["state"] = "STARTING_OR_UNQUALIFIED"

    return result


def wait_online(seconds=240):
    deadline = time.time() + seconds

    while time.time() < deadline:
        s = snapshot()

        if s["online"]:
            return s

        if (
            active(CORE) == "failed"
            or active(AUTO) == "failed"
        ):
            s["state"] = "FAILED"
            return s

        time.sleep(1)

    s = snapshot()
    s["state"] = "START_TIMEOUT"
    return s


def wait_offline(seconds=30):
    deadline = time.time() + seconds

    while time.time() < deadline:
        if active(CORE) == "inactive":
            return snapshot()

        time.sleep(0.25)

    s = snapshot()
    s["state"] = "STOP_TIMEOUT"
    return s


class Handler(BaseHTTPRequestHandler):
    server_version = "A8CECore20Control/1"

    def log_message(self, *_):
        return

    def respond(self, code, payload):
        data = json.dumps(
            payload,
            separators=(",", ":"),
        ).encode()

        self.send_response(code)
        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8",
        )
        self.send_header(
            "Cache-Control",
            "no-store",
        )
        self.send_header(
            "Content-Length",
            str(len(data)),
        )
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        return (
            self.headers.get("X-A8-CE-Control")
            == "1"
        )

    def do_GET(self):
        if self.path == "/api/ce/jovian-authority/status":
            if not self.authorized():
                return self.respond(
                    403,
                    {
                        "ok": False,
                        "error": "forbidden",
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,
                    "authority": authority_state(),
                },
            )

        if not self.authorized():
            return self.respond(
                403,
                {
                    "ok": False,
                    "error": "forbidden",
                },
            )

        if (
            self.path
            != "/api/ce/core20-service/status"
        ):
            return self.respond(
                404,
                {"ok": False},
            )

        return self.respond(
            200,
            {
                "ok": True,
                "control": snapshot(),
            },
        )

    def do_POST(self):
        if self.path == "/api/ce/jovian-authority/select":
            if not self.authorized():
                return self.respond(
                    403,
                    {
                        "ok": False,
                        "error": "forbidden",
                    },
                )

            try:
                length = int(
                    self.headers.get(
                        "Content-Length",
                        "0",
                    ) or "0"
                )

                raw = (
                    self.rfile.read(length)
                    if length > 0
                    else b"{}"
                )

                payload = json.loads(
                    raw.decode("utf-8")
                )

                body = str(
                    payload.get(
                        "body",
                        "",
                    )
                ).strip().upper()

            except Exception as exc:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "error": str(exc),
                    },
                )

            if body not in AUTHORITY_PERIODS:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "error":
                            "AUTHORITY MUST BE "
                            "IO / EUROPA / GANYMEDE",
                    },
                )

            with operation_lock:
                state = write_authority_state(
                    body
                )

            return self.respond(
                200,
                {
                    "ok": True,
                    "operation":
                        "SELECT_JOVIAN_AUTHORITY",
                    "authority": state,
                },
            )

        if not self.authorized():
            return self.respond(
                403,
                {
                    "ok": False,
                    "error": "forbidden",
                },
            )

        allowed = (
            "/api/ce/core20-service/start",
            "/api/ce/core20-service/stop",
        )

        if self.path not in allowed:
            return self.respond(
                404,
                {"ok": False},
            )

        with operation_lock:

            if self.path.endswith("/start"):

                before = snapshot()

                if before["online"]:
                    return self.respond(
                        200,
                        {
                            "ok": True,
                            "operation": "START",
                            "alreadyOnline": True,
                            "control": before,
                        },
                    )

                p = run(
                    "systemctl",
                    "start",
                    CORE,
                    timeout=260,
                )

                after = wait_online(240)

                if not after["online"]:
                    failed = after

                    stop_p = run(
                        "systemctl",
                        "stop",
                        CORE,
                        timeout=30,
                    )

                    closed = wait_offline(30)

                    return self.respond(
                        500,
                        {
                            "ok": False,
                            "operation": "START",
                            "error":
                                "CORE20 RECOVERY FAILED CLOSED",

                            "systemctlExit":
                                p.returncode,

                            "systemctlError":
                                p.stderr.strip(),

                            "stopExit":
                                stop_p.returncode,

                            "stopError":
                                stop_p.stderr.strip(),

                            "failedControl":
                                failed,

                            "control":
                                closed,
                        },
                    )

                return self.respond(
                    200 if after["online"] else 500,
                    {
                        "ok": after["online"],
                        "operation": "START",
                        "systemctlExit":
                            p.returncode,
                        "systemctlError":
                            p.stderr.strip(),
                        "control": after,
                    },
                )

            before = snapshot()

            if before["state"] == "OFFLINE":
                return self.respond(
                    200,
                    {
                        "ok": True,
                        "operation": "STOP",
                        "alreadyOffline": True,
                        "control": before,
                    },
                )

            p = run(
                "systemctl",
                "stop",
                CORE,
                timeout=30,
            )

            after = wait_offline(30)

            ok = (
                after.get("state")
                == "OFFLINE"
            )

            return self.respond(
                200 if ok else 500,
                {
                    "ok": ok,
                    "operation": "STOP",
                    "systemctlExit":
                        p.returncode,
                    "systemctlError":
                        p.stderr.strip(),
                    "control": after,
                },
            )


server = ThreadingHTTPServer(
    (HOST, PORT),
    Handler,
)

server.serve_forever()
