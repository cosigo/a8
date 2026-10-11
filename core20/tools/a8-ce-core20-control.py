#!/usr/bin/env python3

import json
import math
import os
import re
import signal
import subprocess
import time
from datetime import datetime, timezone
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

HOST = "127.0.0.1"
PORT = 18023

CORE = "a8-core20.service"
FEED = "a8-core20-external-physical.service"

# Historical/retired recovery unit remains observable only.
# It is not part of current Epoch-8 ONLINE qualification.
AUTO = "a8-core20-autorecover.service"

operation_lock = Lock()
carrier_operation_lock = Lock()
transport_operation_lock = Lock()

CARRIER_STAGE_FILE = (
    "/etc/a8-core20/carrier-compensation-stage.json"
)

CARRIER_REVIEW_FILE = (
    "/etc/a8-core20/carrier-compensation-review.json"
)

GHOST_SSH = "/usr/bin/ssh"
GHOST_SSH_PORT = "22070"
GHOST_SSH_USER = "a8ghost@127.0.0.1"

GHOST_SSH_KEY = (
    "/home/greg/.ssh/id_ed25519"
)

GHOST_KNOWN_HOSTS = (
    "/home/greg/.ssh/known_hosts"
)

SHADOW_CORE = "a8-shadow-core.service"
SHADOW_RECORDER = "a8-shadow-recorder.service"
SHADOW_GHOST = "a8-shadow-ghost.service"

SHADOW_CORE_SOURCE_FILE = (
    "/opt/a8-shadow-core/server.js"
)

MAIN_DIRECT_URL = (
    "http://127.0.0.1:28788/snapshot"
)

MAIN_CACHE_URL = (
    "http://127.0.0.1:28790/snapshot"
)

SHADOW_MAIN_URL = (
    "http://127.0.0.1:18024/api/shadow/jovian"
)

GHOST_SHADOW_URL = (
    "http://127.0.0.1:18027/api/shadow/ghost"
)

GHOST_TRANSPORT_HELPER = (
    "/usr/local/sbin/a8-ghost-transport-shutdown"
)

GHOST_TRANSPORT_CONFIRM = (
    "SEAL + SHUTDOWN C/D FOR TRANSPORT"
)

GHOST_DISCIPLINE_HELPER = (
    "/home/a8ghost/a8-ghost/"
    "a8-ghost-discipline-seal.py"
)


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


# ============================================================
# A8 CE CLOCK ADJUST V1
# Meridian 0 fixed. Rate separate. Electronic clock position only.
# ============================================================

CLOCK_ADJUST_HELPER = (
    "/usr/local/sbin/"
    "a8-core20-clock-adjust"
)


def clock_adjust_call(*args, timeout=430):
    p = run(
        CLOCK_ADJUST_HELPER,
        *args,
        timeout=timeout,
    )

    if p.returncode != 0:
        raise RuntimeError(
            "CLOCK ADJUST HELPER FAILED · "
            + (
                p.stderr.strip()
                or p.stdout.strip()
                or str(p.returncode)
            )
        )

    try:
        return json.loads(p.stdout)
    except Exception as exc:
        raise RuntimeError(
            "CLOCK ADJUST HELPER RETURNED INVALID JSON"
        ) from exc



# ============================================================
# A8 CE C/D · CORE21 CLOCK ADJUST V1
# ============================================================

CORE21_CLOCK_ADJUST_HELPER = (
    "/usr/local/sbin/"
    "a8-core21-clock-adjust"
)

def core21_clock_adjust_call(*args, timeout=180):
    p = run(
        CORE21_CLOCK_ADJUST_HELPER,
        *args,
        timeout=timeout,
    )

    if p.returncode != 0:
        raise RuntimeError(
            "CORE21 CLOCK ADJUST HELPER FAILED · "
            + (
                p.stderr.strip()
                or p.stdout.strip()
                or str(p.returncode)
            )
        )

    try:
        return json.loads(p.stdout)
    except Exception as exc:
        raise RuntimeError(
            "CORE21 CLOCK ADJUST HELPER RETURNED INVALID JSON"
        ) from exc

def get_json(path, timeout=2):
    try:
        with urllib.request.urlopen(
            "http://127.0.0.1:18020" + path,
            timeout=timeout,
        ) as r:
            return json.loads(r.read())
    except Exception:
        return None


def get_json_url(url, timeout=2):
    try:
        with urllib.request.urlopen(
            url,
            timeout=timeout,
        ) as r:
            return json.loads(r.read())
    except Exception:
        return None




SSH_SERVICE = "ssh.service"

AB_ROUTER_SSH = "/usr/bin/ssh"

AB_ROUTER_SSH_CONFIG = (
    "/etc/a8-ce/router-ab-control/ssh_config"
)

AB_ROUTER_SSH_HOST = (
    "a8-router-ab-control"
)

AB_ROUTER_REBOOT_CONFIRM = (
    "REBOOT A/B ROUTER"
)


WAN_TRANSPORT_BANKS = {
    "AB": {
        "label":
            "A/B · EUROPA",

        "ports": {
            22072: "MANAGEMENT",
            28788: "SNAPSHOT",
            28789: "STREAM",
        },

        "router": {
            "address":
                "192.168.1.254",

            "identity":
                "ZXHN F670L1FXS",

            "rebootQualified":
                True,

            "rebootStatus":
                "QUALIFIED · LOCAL A/B ROUTER AGENT",

            "rebootConfirm":
                AB_ROUTER_REBOOT_CONFIRM,
        },

        "confirm":
            "RESET A/B TRANSPORT",
    },

    "CD": {
        "label":
            "C/D · GANYMEDE",

        "ports": {
            22070: "MANAGEMENT",
        },

        "router": {
            "address":
                "192.168.1.254",

            "identity":
                "BOA ADMIN · MODEL UNQUALIFIED",

            "rebootQualified":
                False,

            "rebootStatus":
                "LOCKED · REBOOT ENDPOINT NOT QUALIFIED",
        },

        "confirm":
            "RESET C/D TRANSPORT",
    },
}



def _ab_router_remote_command(
    command,
    timeout=20,
):
    command = str(
        command
    ).strip()

    allowed = {
        "status",
        "check",
        "schedule-reboot",
    }

    if command not in allowed:
        raise ValueError(
            "A/B ROUTER COMMAND NOT ALLOWED"
        )

    proc = run(
        AB_ROUTER_SSH,
        "-F",
        AB_ROUTER_SSH_CONFIG,
        AB_ROUTER_SSH_HOST,
        "router-ab " + command,
        timeout=timeout,
    )

    if proc.returncode != 0:
        detail = (
            proc.stderr.strip()
            or
            proc.stdout.strip()
            or
            str(proc.returncode)
        )

        raise RuntimeError(
            "A/B ROUTER CONTROL FAILED · "
            + detail
        )

    return (
        proc.stdout
        or ""
    ).strip()


def ab_router_remote_status():
    output = (
        _ab_router_remote_command(
            "status",
            timeout=15,
        )
    )

    fields = {}
    state_lines = []
    in_state = False

    for line in output.splitlines():
        if line == "STATE_BEGIN":
            in_state = True
            continue

        if line == "STATE_END":
            in_state = False
            continue

        if in_state:
            state_lines.append(
                line
            )
            continue

        if "=" in line:
            key, value = (
                line.split(
                    "=",
                    1,
                )
            )

            fields[
                key.strip()
            ] = value.strip()

    if (
        fields.get("ROUTER")
        != "ZXHN F670L1FXS"
    ):
        raise RuntimeError(
            "A/B ROUTER IDENTITY MISMATCH"
        )

    if (
        fields.get("ROLE")
        != "A/B"
    ):
        raise RuntimeError(
            "A/B ROUTER ROLE MISMATCH"
        )

    state = None

    if state_lines:
        state = json.loads(
            "\n".join(
                state_lines
            )
        )

    return {
        "qualified":
            True,

        "router":
            fields.get(
                "ROUTER"
            ),

        "role":
            fields.get(
                "ROLE"
            ),

        "timer":
            fields.get(
                "TIMER"
            ),

        "service":
            fields.get(
                "SERVICE"
            ),

        "state":
            state,

        "controlPath":
            (
                "TRADE_ROOT_KEY"
                "_TO_FORCED_COMMAND"
                "_TO_LOCAL_AGENT"
            ),

        "routerPasswordOnTrade":
            False,
    }


def ab_router_remote_check():
    output = (
        _ab_router_remote_command(
            "check",
            timeout=25,
        )
    )

    required = (
        "PASS · ZXHN AUTHENTICATION",
        "PASS · LIVE RESTART CONTRACT",
        "PASS · SESSION SECURITY MATERIAL",
        "NO REBOOT REQUEST SENT",
    )

    missing = [
        item
        for item in required
        if item not in output
    ]

    if missing:
        raise RuntimeError(
            "A/B ROUTER CHECK INCOMPLETE · "
            + " | ".join(
                missing
            )
        )

    return {
        "qualified":
            True,

        "authentication":
            True,

        "restartContract":
            True,

        "securityMaterial":
            True,

        "rebootSent":
            False,

        "output":
            output.splitlines(),
    }


def schedule_ab_router_reboot(
    confirmation,
):
    if (
        confirmation
        != AB_ROUTER_REBOOT_CONFIRM
    ):
        raise ValueError(
            "EXACT A/B ROUTER REBOOT CONFIRMATION REQUIRED"
        )

    output = (
        _ab_router_remote_command(
            "schedule-reboot",
            timeout=35,
        )
    )

    if (
        "PASS · A/B ROUTER REBOOT SCHEDULED"
        not in output
    ):
        raise RuntimeError(
            "A/B ROUTER REBOOT TIMER WAS NOT CONFIRMED"
        )

    if (
        "DELAY=10_SECONDS"
        not in output
    ):
        raise RuntimeError(
            "A/B ROUTER REBOOT DELAY WITNESS MISSING"
        )

    return {
        "scheduled":
            True,

        "delaySeconds":
            10,

        "router":
            "ZXHN F670L1FXS",

        "action":
            "Restart",

        "factoryResetAction":
            "NONE",

        "transportResetAction":
            "NONE",

        "core20Action":
            "NONE",

        "arduinoAction":
            "NONE",

        "rateAction":
            "NONE",

        "phaseAction":
            "NONE",

        "output":
            output.splitlines(),
    }


def _proc_text(
    pid,
    name,
    binary=False,
):
    path = (
        f"/proc/{int(pid)}/{name}"
    )

    if binary:
        with open(
            path,
            "rb",
        ) as f:
            return (
                f.read()
                .replace(
                    b"\0",
                    b" ",
                )
                .decode(
                    "utf-8",
                    errors="replace",
                )
                .strip()
            )

    with open(
        path,
        "r",
        encoding="utf-8",
        errors="replace",
    ) as f:
        return f.read().strip()


def _proc_ppid(pid):
    status = _proc_text(
        pid,
        "status",
    )

    match = re.search(
        r"^PPid:\s+(\d+)",
        status,
        re.MULTILINE,
    )

    if not match:
        raise RuntimeError(
            f"PPID UNAVAILABLE FOR PID {pid}"
        )

    return int(
        match.group(1)
    )


def _ssh_master_pid():
    raw = prop(
        SSH_SERVICE,
        "MainPID",
    ).strip()

    if (
        not raw.isdigit()
        or int(raw) <= 0
    ):
        raise RuntimeError(
            "SSH MASTER PID UNAVAILABLE"
        )

    return int(raw)


def _trade_reverse_listeners():
    proc = run(
        "ss",
        "-ltnpH",
        timeout=5,
    )

    if proc.returncode != 0:
        raise RuntimeError(
            "SS LISTENER INSPECTION FAILED · "
            + (
                proc.stderr.strip()
                or
                str(proc.returncode)
            )
        )

    wanted = {
        22070,
        22072,
        28788,
        28789,
    }

    listeners = {}

    for line in (
        proc.stdout
        or ""
    ).splitlines():

        fields = line.split()

        if len(fields) < 4:
            continue

        local = fields[3]

        if not local.startswith(
            "127.0.0.1:"
        ):
            continue

        try:
            port = int(
                local.rsplit(
                    ":",
                    1,
                )[1]
            )

        except Exception:
            continue

        if port not in wanted:
            continue

        pids = [
            int(x)
            for x in re.findall(
                r"pid=(\d+)",
                line,
            )
        ]

        if len(set(pids)) != 1:
            listeners[port] = {
                "port":
                    port,

                "pid":
                    None,

                "line":
                    line,

                "parseStatus":
                    "OWNER_AMBIGUOUS",
            }

            continue

        listeners[port] = {
            "port":
                port,

            "pid":
                pids[0],

            "line":
                line,

            "parseStatus":
                "OK",
        }

    return listeners


def _validate_reverse_owner(
    pid,
    ssh_master,
):
    result = {
        "pid":
            int(pid),

        "safe":
            False,

        "reasons":
            [],
    }

    if int(pid) == int(
        ssh_master
    ):
        result["reasons"].append(
            "PID_IS_SSH_MASTER"
        )

    try:
        comm = _proc_text(
            pid,
            "comm",
        )

    except Exception as exc:
        result["reasons"].append(
            "COMM_UNAVAILABLE · "
            + str(exc)
        )

        return result

    result["comm"] = comm

    if comm != "sshd":
        result["reasons"].append(
            "OWNER_NOT_SSHD"
        )

    try:
        cmdline = _proc_text(
            pid,
            "cmdline",
            binary=True,
        )

    except Exception as exc:
        result["reasons"].append(
            "CMDLINE_UNAVAILABLE · "
            + str(exc)
        )

        return result

    result["cmdline"] = cmdline

    if (
        "sshd: greg"
        not in cmdline
    ):
        result["reasons"].append(
            "OWNER_NOT_GREG_SSH_SESSION"
        )

    try:
        ppid = _proc_ppid(
            pid
        )

        result["ppid"] = ppid

    except Exception as exc:
        result["reasons"].append(
            "PPID_UNAVAILABLE · "
            + str(exc)
        )

        return result

    if ppid == int(
        ssh_master
    ):
        result["reasons"].append(
            "OWNER_IS_DIRECT_SSH_MASTER_CHILD"
        )

    try:
        parent_comm = _proc_text(
            ppid,
            "comm",
        )

        result["parentComm"] = (
            parent_comm
        )

        if parent_comm != "sshd":
            result["reasons"].append(
                "PARENT_NOT_SSHD"
            )

    except Exception as exc:
        result["reasons"].append(
            "PARENT_UNAVAILABLE · "
            + str(exc)
        )

    result["safe"] = (
        len(
            result["reasons"]
        )
        == 0
    )

    return result


def wan_transport_bank_status(
    bank,
):
    bank = str(
        bank
    ).strip().upper()

    if bank not in WAN_TRANSPORT_BANKS:
        raise ValueError(
            "TRANSPORT BANK MUST BE AB OR CD"
        )

    cfg = (
        WAN_TRANSPORT_BANKS[
            bank
        ]
    )

    ssh_master = (
        _ssh_master_pid()
    )

    listeners = (
        _trade_reverse_listeners()
    )

    port_state = {}

    owner_pids = set()

    unsafe = []

    for port, role in (
        cfg["ports"].items()
    ):
        listener = (
            listeners.get(
                port
            )
        )

        if listener is None:
            port_state[
                str(port)
            ] = {
                "role":
                    role,

                "state":
                    "ABSENT",

                "pid":
                    None,

                "safeOwner":
                    None,
            }

            continue

        pid = listener.get(
            "pid"
        )

        if pid is None:
            port_state[
                str(port)
            ] = {
                "role":
                    role,

                "state":
                    "OWNER AMBIGUOUS",

                "pid":
                    None,

                "safeOwner":
                    False,

                "line":
                    listener.get(
                        "line"
                    ),
            }

            unsafe.append(
                {
                    "port":
                        port,

                    "reason":
                        "OWNER_AMBIGUOUS",
                }
            )

            continue

        validation = (
            _validate_reverse_owner(
                pid,
                ssh_master,
            )
        )

        port_state[
            str(port)
        ] = {
            "role":
                role,

            "state":
                (
                    "LISTENING"
                    if validation[
                        "safe"
                    ]
                    else
                    "UNSAFE OWNER"
                ),

            "pid":
                pid,

            "safeOwner":
                validation[
                    "safe"
                ],

            "owner":
                validation,
        }

        owner_pids.add(
            int(pid)
        )

        if not validation[
            "safe"
        ]:
            unsafe.append(
                {
                    "port":
                        port,

                    "pid":
                        pid,

                    "reasons":
                        validation[
                            "reasons"
                        ],
                }
            )

    complete = all(
        port_state[
            str(port)
        ]["state"]
        == "LISTENING"

        for port in cfg["ports"]
    )

    reset_available = (
        bool(
            owner_pids
        )
        and
        not unsafe
    )

    if complete:
        state = "LISTENING"

    elif owner_pids:
        state = "DEGRADED"

    else:
        state = "OFFLINE"

    return {
        "bank":
            bank,

        "label":
            cfg["label"],

        "state":
            state,

        "complete":
            complete,

        "resetAvailable":
            reset_available,

        "sshMasterPid":
            ssh_master,

        "ownerPids":
            sorted(
                owner_pids
            ),

        "unsafeOwners":
            unsafe,

        "ports":
            port_state,

        "router":
            dict(
                cfg["router"]
            ),

        "policy": {
            "action":
                "TRADE_SIDE_REVERSE_FORWARD_SESSION_RETIREMENT_ONLY",

            "sshServiceRestart":
                False,

            "sshMasterAction":
                "NONE",

            "remotePiRestart":
                False,

            "arduinoAction":
                "NONE",

            "core20Action":
                "NONE",

            "core21Action":
                "NONE",

            "carrierRateAction":
                "NONE",

            "phaseAction":
                "NONE",

            "routerReboot":
                (
                    "QUALIFIED_LOCAL_AGENT"
                    if bank == "AB"
                    else
                    "LOCKED_NOT_QUALIFIED"
                ),
        },
    }


def wan_transport_status():
    return {
        "schema":
            "A8-CE-WAN-TRANSPORT-V1",

        "ab":
            wan_transport_bank_status(
                "AB"
            ),

        "cd":
            wan_transport_bank_status(
                "CD"
            ),
    }


def reset_wan_transport(
    bank,
):
    bank = str(
        bank
    ).strip().upper()

    if bank not in WAN_TRANSPORT_BANKS:
        raise ValueError(
            "TRANSPORT BANK MUST BE AB OR CD"
        )

    before = (
        wan_transport_bank_status(
            bank
        )
    )

    if before[
        "unsafeOwners"
    ]:
        raise RuntimeError(
            "RESET REFUSED · UNSAFE OR AMBIGUOUS LISTENER OWNER"
        )

    targets = list(
        before[
            "ownerPids"
        ]
    )

    if not targets:
        return {
            "bank":
                bank,

            "before":
                before,

            "signal":
                "NONE",

            "targetPids":
                [],

            "alreadyAbsent":
                True,

            "oldOwnersRetired":
                True,

            "after":
                wan_transport_bank_status(
                    bank
                ),

            "sshServiceAction":
                "NONE",

            "sshMasterAction":
                "NONE",

            "core20Action":
                "NONE",

            "core21Action":
                "NONE",

            "arduinoAction":
                "NONE",

            "routerAction":
                "NONE",
        }

    master = before[
        "sshMasterPid"
    ]

    for pid in targets:
        if int(pid) == int(master):
            raise RuntimeError(
                "RESET REFUSED · SSH MASTER WOULD BE TARGETED"
            )

        validation = (
            _validate_reverse_owner(
                pid,
                master,
            )
        )

        if not validation[
            "safe"
        ]:
            raise RuntimeError(
                "RESET REFUSED · OWNER CHANGED BEFORE SIGNAL"
            )

    for pid in targets:
        os.kill(
            int(pid),
            signal.SIGTERM,
        )

    deadline = (
        time.monotonic()
        + 3.0
    )

    after = None

    while (
        time.monotonic()
        < deadline
    ):
        time.sleep(
            0.20
        )

        after = (
            wan_transport_bank_status(
                bank
            )
        )

        still_old = {
            int(x)
            for x in (
                after[
                    "ownerPids"
                ]
            )
        }.intersection(
            {
                int(x)
                for x in targets
            }
        )

        if not still_old:
            break

    if after is None:
        after = (
            wan_transport_bank_status(
                bank
            )
        )

    still_old = sorted(
        {
            int(x)
            for x in (
                after[
                    "ownerPids"
                ]
            )
        }.intersection(
            {
                int(x)
                for x in targets
            }
        )
    )

    return {
        "bank":
            bank,

        "before":
            before,

        "signal":
            "SIGTERM",

        "targetPids":
            targets,

        "oldOwnersStillListening":
            still_old,

        "oldOwnersRetired":
            not bool(
                still_old
            ),

        "after":
            after,

        "expectedReconnect":
            (
                "REMOTE SYSTEMD RETRY"
            ),

        "sshServiceAction":
            "NONE",

        "sshMasterAction":
            "NONE",

        "core20Action":
            "NONE",

        "core21Action":
            "NONE",

        "arduinoAction":
            "NONE",

        "routerAction":
            "NONE",
    }


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
        "disciplineState": "INDEPENDENT_NATURAL_RECURRENCES",
        "normalization": "NONE",
        "liveDevelopmentRulerRaw":
            AUTHORITY_PERIODS[body],
        "liveDevelopmentRulerRole":
            "SELECTED_NATURAL_RECURRENCE",
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



def normalize_carrier_ratio(numerator, denominator):
    num = int(numerator)
    den = int(denominator)

    if num <= 0 or den <= 0:
        raise ValueError(
            "CARRIER RATIO MUST BE POSITIVE"
        )

    g = math.gcd(
        num,
        den,
    )

    return {
        "numerator":
            str(num // g),
        "denominator":
            str(den // g),
    }


def carrier_stage_state():
    try:
        with open(
            CARRIER_STAGE_FILE,
            "r",
            encoding="utf-8",
        ) as f:
            state = json.load(f)

    except FileNotFoundError:
        return None

    except Exception as exc:
        return {
            "schema":
                "A8-CE-CARRIER-STAGE-V1",
            "status":
                "INVALID_LOCAL_STAGE",
            "error":
                str(exc),
        }

    return state


def carrier_review_state():
    try:
        with open(
            CARRIER_REVIEW_FILE,
            "r",
            encoding="utf-8",
        ) as f:
            return json.load(f)

    except FileNotFoundError:
        return None

    except Exception as exc:
        return {
            "schema":
                "A8-CE-CARRIER-REVIEW-V1",
            "status":
                "INVALID_LOCAL_REVIEW",
            "error":
                str(exc),
        }


def carrier_review_public_state():
    state = carrier_review_state()

    if not isinstance(state, dict):
        return state

    result = dict(state)

    token = result.pop(
        "reviewToken",
        None,
    )

    result["reviewTokenHeldServerSide"] = (
        bool(token)
    )

    return result


def clear_carrier_review_state():
    try:
        os.unlink(
            CARRIER_REVIEW_FILE
        )
    except FileNotFoundError:
        pass


def clear_carrier_stage_state():
    try:
        os.unlink(
            CARRIER_STAGE_FILE
        )
    except FileNotFoundError:
        pass


def carrier_seal_readiness():
    stage = carrier_stage_state()
    review = carrier_review_state()

    if not isinstance(stage, dict):
        return False, "STAGE_REQUIRED"

    if (
        stage.get("status")
        != "STAGED_REVIEW_REQUIRED"
    ):
        return False, "VALID_STAGE_REQUIRED"

    if not isinstance(review, dict):
        return False, "REVIEW_REQUIRED"

    if (
        review.get("status")
        != "REVIEWED_READY_TO_SEAL"
    ):
        return False, "FRESH_REVIEW_REQUIRED"

    if (
        stage.get("bank") != "C/D"
        or review.get("bank") != "C/D"
    ):
        return False, "C_D_REVIEW_REQUIRED"

    if (
        (stage.get("ratio") or {})
        !=
        (review.get("proposedRatio") or {})
    ):
        return False, "STAGE_REVIEW_RATIO_MISMATCH"

    if not review.get("reviewToken"):
        return False, "PRIVATE_REVIEW_TOKEN_MISSING"

    return True, "REVIEWED_READY_TO_SEAL"


def carrier_control_state():
    ready, seal_status = (
        carrier_seal_readiness()
    )

    return {
        "stageAvailable":
            True,

        "reviewAvailable":
            True,

        "sealAvailable":
            ready,

        "sealStatus":
            seal_status,

        "stagedProposal":
            carrier_stage_state(),

        "reviewedProposal":
            carrier_review_public_state(),
    }


def write_carrier_review(stage, review):
    state = {
        "schema":
            "A8-CE-CARRIER-REVIEW-V1",

        "status":
            "REVIEWED_READY_TO_SEAL",

        "bank":
            "C/D",

        "authority":
            "NONE",

        "stagedRatio":
            dict(
                stage["ratio"]
            ),

        "runId":
            str(
                review["runId"]
            ),

        "currentSegment":
            int(
                review["currentSegment"]
            ),

        "nextSegment":
            int(
                review["nextSegment"]
            ),

        "currentStateSha256":
            str(
                review["currentStateSha256"]
            ),

        "reviewToken":
            str(
                review["reviewToken"]
            ),

        "reviewPhysicalRaw":
            str(
                review["reviewPhysicalRaw"]
            ),

        "reviewSequence":
            str(
                review["reviewSequence"]
            ),

        "exactCurrentDisciplined":
            dict(
                review["exactCurrentDisciplined"]
            ),

        "currentRatio":
            dict(
                review["currentRatio"]
            ),

        "proposedRatio":
            dict(
                review["proposedRatio"]
            ),

        "futureSealRule":
            dict(
                review["futureSealRule"]
            ),

        "writesGhost":
            False,

        "signalsSender":
            False,

        "sealAvailable":
            True,
    }

    tmp = (
        CARRIER_REVIEW_FILE
        + ".tmp."
        + str(os.getpid())
    )

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
        f.flush()
        os.fsync(
            f.fileno()
        )

    os.chmod(
        tmp,
        0o600,
    )

    os.replace(
        tmp,
        CARRIER_REVIEW_FILE,
    )

    return state


def write_carrier_stage(numerator, denominator):
    ratio = normalize_carrier_ratio(
        numerator,
        denominator,
    )

    state = {
        "schema":
            "A8-CE-CARRIER-STAGE-V1",

        "status":
            "STAGED_REVIEW_REQUIRED",

        "bank":
            "C/D",

        "authority":
            "NONE",

        "ratio":
            ratio,

        "writesGhost":
            False,

        "writesArduino":
            False,

        "writesCore20":
            False,

        "writesJovianGovernor":
            False,

        "signalsSender":
            False,

        "sealAvailable":
            False,
    }

    tmp = (
        CARRIER_STAGE_FILE
        + ".tmp."
        + str(os.getpid())
    )

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
        f.flush()
        os.fsync(
            f.fileno()
        )

    os.chmod(
        tmp,
        0o644,
    )

    os.replace(
        tmp,
        CARRIER_STAGE_FILE,
    )

    # Any new STAGE invalidates every prior REVIEW token.
    clear_carrier_review_state()

    return state


def ghost_carrier_review(stage):
    if (
        not stage
        or stage.get("status")
        != "STAGED_REVIEW_REQUIRED"
    ):
        raise ValueError(
            "NO VALID C/D STAGED RATIO"
        )

    ratio = (
        stage.get("ratio")
        or {}
    )

    normalized = normalize_carrier_ratio(
        ratio.get("numerator"),
        ratio.get("denominator"),
    )

    p = run(
        GHOST_SSH,

        "-o",
        "BatchMode=yes",

        "-o",
        "ConnectTimeout=5",

        "-o",
        "StrictHostKeyChecking=yes",

        "-o",
        "UserKnownHostsFile="
        + GHOST_KNOWN_HOSTS,

        "-o",
        "IdentitiesOnly=yes",

        "-i",
        GHOST_SSH_KEY,

        "-p",
        GHOST_SSH_PORT,

        GHOST_SSH_USER,

        GHOST_DISCIPLINE_HELPER,

        "review",

        normalized["numerator"],
        normalized["denominator"],

        timeout=10,
    )

    if p.returncode != 0:
        raise RuntimeError(
            "GHOST REVIEW FAILED · "
            + p.stderr.strip()
        )

    try:
        result = json.loads(
            p.stdout
        )
    except Exception as exc:
        raise RuntimeError(
            "GHOST REVIEW INVALID JSON · "
            + str(exc)
        )

    if result.get("ok") is not True:
        raise RuntimeError(
            "GHOST REVIEW REJECTED"
        )

    if result.get("mode") != "REVIEW_ONLY":
        raise RuntimeError(
            "GHOST REVIEW MODE NOT READ ONLY"
        )

    if result.get("writesState") is not False:
        raise RuntimeError(
            "GHOST REVIEW CLAIMS STATE WRITE"
        )

    if result.get("signalsSender") is not False:
        raise RuntimeError(
            "GHOST REVIEW CLAIMS SENDER SIGNAL"
        )

    return result


def ghost_carrier_seal(review):
    ratio = (
        review.get("proposedRatio")
        or {}
    )

    normalized = normalize_carrier_ratio(
        ratio.get("numerator"),
        ratio.get("denominator"),
    )

    token = str(
        review.get(
            "reviewToken",
            ""
        )
    )

    if not token:
        raise ValueError(
            "PRIVATE REVIEW TOKEN MISSING"
        )

    expected_segment = int(
        review["nextSegment"]
    )

    proc = run(
        GHOST_SSH,

        "-o",
        "BatchMode=yes",

        "-o",
        "ConnectTimeout=5",

        "-o",
        "StrictHostKeyChecking=yes",

        "-o",
        "UserKnownHostsFile="
        + GHOST_KNOWN_HOSTS,

        "-o",
        "IdentitiesOnly=yes",

        "-i",
        GHOST_SSH_KEY,

        "-p",
        GHOST_SSH_PORT,

        GHOST_SSH_USER,

        GHOST_DISCIPLINE_HELPER,

        "seal",

        normalized["numerator"],
        normalized["denominator"],

        "--review-token",
        token,

        timeout=15,
    )

    if proc.returncode != 0:
        raise RuntimeError(
            "GHOST SEAL FAILED · "
            + proc.stderr.strip()
            + (
                " · "
                + proc.stdout.strip()
                if proc.stdout.strip()
                else ""
            )
        )

    try:
        result = json.loads(
            proc.stdout
        )
    except Exception as exc:
        raise RuntimeError(
            "GHOST SEAL INVALID JSON · "
            + str(exc)
        )

    if result.get("ok") is not True:
        raise RuntimeError(
            "GHOST SEAL REJECTED"
        )

    if result.get("mode") != "SEALED":
        raise RuntimeError(
            "GHOST DID NOT REPORT SEALED MODE"
        )

    if (
        int(result.get("segment"))
        != expected_segment
    ):
        raise RuntimeError(
            "GHOST SEALED UNEXPECTED SEGMENT"
        )

    if (
        result.get("ratio")
        != normalized
    ):
        raise RuntimeError(
            "GHOST SEALED UNEXPECTED RATIO"
        )

    if (
        result.get("phaseContinuity")
        != "EXACT"
    ):
        raise RuntimeError(
            "GHOST DID NOT REPORT EXACT PHASE CONTINUITY"
        )

    return result


def wait_for_ghost_segment(
    expected_segment,
    timeout=8,
):
    deadline = (
        time.monotonic()
        + timeout
    )

    while time.monotonic() < deadline:
        payload = get_json_url(
            "http://127.0.0.1:18027/api/shadow/ghost",
            timeout=2,
        ) or {}

        ghost = (
            payload.get("ghost")
            or {}
        )

        discipline = (
            ghost.get("carrierDiscipline")
            or {}
        )

        try:
            segment = int(
                discipline.get(
                    "segmentNumber"
                )
            )
        except Exception:
            segment = None

        if (
            segment
            == int(expected_segment)
        ):
            return ghost

        time.sleep(
            0.2
        )

    return None


def cd_transport_readiness():
    machine = snapshot()

    expected_epoch = str(
        machine.get(
            "externalPhysicalSourceEpoch",
            "",
        )
    )

    direct = (
        get_json_url(
            MAIN_DIRECT_URL,
            timeout=2,
        )
        or {}
    )

    cache = (
        get_json_url(
            MAIN_CACHE_URL,
            timeout=2,
        )
        or {}
    )

    shadow_payload = (
        get_json_url(
            SHADOW_MAIN_URL,
            timeout=2,
        )
        or {}
    )

    shadow_physical = (
        shadow_payload.get("physical")
        or {}
    )

    ghost_payload = (
        get_json_url(
            GHOST_SHADOW_URL,
            timeout=2,
        )
        or {}
    )

    ghost = (
        ghost_payload.get("ghost")
        or {}
    )

    discipline = (
        ghost.get("carrierDiscipline")
        or {}
    )

    try:
        with open(
            SHADOW_CORE_SOURCE_FILE,
            "r",
            encoding="utf-8",
        ) as f:
            shadow_source = f.read()

        shadow_wired_main = (
            MAIN_DIRECT_URL
            in shadow_source
        )

    except Exception:
        shadow_wired_main = False

    stage = carrier_stage_state()
    review = carrier_review_state()

    checks = {
        "core20Online":
            machine.get("state")
            == "ONLINE",

        "abFeederActive":
            active(FEED)
            == "active",

        "shadowCoreActive":
            active(SHADOW_CORE)
            == "active",

        "shadowRecorderActive":
            active(SHADOW_RECORDER)
            == "active",

        "shadowGhostActive":
            active(SHADOW_GHOST)
            == "active",

        "shadowCoreWiredToMainAB":
            shadow_wired_main,

        "directMainActive":
            direct.get("STATUS")
            == "ACTIVE",

        "directMainEpochMatches":
            str(
                direct.get("SOURCE_EPOCH")
            )
            == expected_epoch,

        "cachedMainActive":
            cache.get("STATUS")
            == "ACTIVE",

        "cachedMainEpochMatches":
            str(
                cache.get("SOURCE_EPOCH")
            )
            == expected_epoch,

        "shadowMainActive":
            shadow_physical.get("status")
            == "ACTIVE",

        "shadowMainEpochMatches":
            str(
                shadow_physical.get(
                    "sourceEpoch"
                )
            )
            == expected_epoch,

        "cdShadowReceiving":
            ghost.get("linkStatus")
            == "RECEIVING",

        "cdRoleRemoteWitness":
            ghost.get("role")
            == "REMOTE_PHYSICAL_WITNESS",

        "cdAuthorityNone":
            ghost.get("authority")
            == "NONE",

        "cdDisciplineNoCoreWrite":
            discipline.get(
                "writesCore20"
            )
            is False,

        "cdStageClear":
            stage is None,

        "cdReviewClear":
            review is None,
    }

    ready = all(
        checks.values()
    )

    return {
        "schema":
            "A8-CE-CD-TRANSPORT-READINESS-V1",

        "status":
            (
                "READY_FOR_C_D_TRANSPORT_SHUTDOWN"
                if ready
                else
                "NOT_READY"
            ),

        "ready":
            ready,

        "operation":
            "C_D_TRANSPORT_SEAL_AND_SAFE_POWEROFF",

        "mainCarrier":
            "A/B",

        "core20Action":
            "NONE",

        "shadowCoreAction":
            "NONE",

        "shadowCoreSource":
            "A/B_DIRECT_MAIN",

        "cdRole":
            "STANDBY",

        "confirmationPhrase":
            GHOST_TRANSPORT_CONFIRM,

        "checks":
            checks,

        "main": {
            "sourceEpoch":
                expected_epoch,

            "directRaw":
                direct.get("RAW_COUNT"),

            "cachedRaw":
                cache.get("RAW_COUNT"),

            "shadowRaw":
                shadow_physical.get(
                    "rawCount"
                ),
        },

        "cd": {
            "runId":
                ghost.get("runId"),

            "physicalRaw":
                ghost.get("rawCount"),

            "segmentNumber":
                discipline.get(
                    "segmentNumber"
                ),

            "ratio":
                discipline.get("ratio"),

            "linkStatus":
                ghost.get("linkStatus"),
        },

        "pendingCompensation": {
            "stage":
                stage,

            "review":
                carrier_review_public_state(),
        },
    }


def run_cd_transport_shutdown():
    cmd = [
        GHOST_SSH,

        "-o",
        "BatchMode=yes",

        "-o",
        "ConnectTimeout=5",

        "-o",
        "StrictHostKeyChecking=yes",

        "-o",
        "UserKnownHostsFile="
        + GHOST_KNOWN_HOSTS,

        "-o",
        "IdentitiesOnly=yes",

        "-i",
        GHOST_SSH_KEY,

        "-p",
        GHOST_SSH_PORT,

        GHOST_SSH_USER,

        "sudo",
        "-n",
        GHOST_TRANSPORT_HELPER,
    ]

    stdout = ""
    stderr = ""
    exit_value = None

    try:
        proc = subprocess.run(
            cmd,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
        )

        stdout = (
            proc.stdout
            or ""
        )

        stderr = (
            proc.stderr
            or ""
        )

        exit_value = (
            proc.returncode
        )

    except subprocess.TimeoutExpired as exc:
        raw_out = (
            exc.stdout
            or ""
        )

        raw_err = (
            exc.stderr
            or ""
        )

        if isinstance(
            raw_out,
            bytes,
        ):
            raw_out = raw_out.decode(
                "utf-8",
                errors="replace",
            )

        if isinstance(
            raw_err,
            bytes,
        ):
            raw_err = raw_err.decode(
                "utf-8",
                errors="replace",
            )

        stdout = raw_out
        stderr = raw_err
        exit_value = "TIMEOUT_AFTER_REMOTE_ACTION"

    seal_reported = (
        "PASS · GHOST TRANSPORT SEALED"
        in stdout
    )

    seal_path = None

    for line in stdout.splitlines():
        if line.startswith(
            "SEAL · "
        ):
            seal_path = (
                line.split(
                    "SEAL · ",
                    1,
                )[1].strip()
            )

    if not seal_reported:
        raise RuntimeError(
            "C/D TRANSPORT HELPER DID NOT REPORT SEALED · "
            + f"exit={exit_value} · "
            + stderr.strip()
        )

    return {
        "sealReported":
            True,

        "sealPath":
            seal_path,

        "sshExit":
            exit_value,

        "stdout":
            stdout,

        "stderr":
            stderr,
    }


def cd_main_preservation_state():
    return {
        "core20":
            active(CORE),

        "abFeeder":
            active(FEED),

        "shadowCore":
            active(SHADOW_CORE),

        "shadowRecorder":
            active(SHADOW_RECORDER),
    }


def carrier_compensation_status():
    clock_payload = get_json(
        "/api/core20/clock"
    ) or {}

    clock = (
        clock_payload.get("clock")
        or {}
    )

    alignment = (
        clock.get("alignment")
        or {}
    )

    primary_physical = get_json_url(
        "http://127.0.0.1:28790/snapshot"
    ) or {}

    ghost_payload = get_json_url(
        "http://127.0.0.1:18027/api/shadow/ghost"
    ) or {}

    ghost = (
        ghost_payload.get("ghost")
        or {}
    )

    discipline = (
        ghost.get("carrierDiscipline")
        or {}
    )

    disciplined = (
        ghost.get("disciplinedRaw")
        or {}
    )

    cd_physical_raw = ghost.get("rawCount")

    cd_num = disciplined.get("numerator")
    cd_den = disciplined.get("denominator")

    consumed = None

    try:
        p_raw = int(cd_physical_raw)
        d_num = int(cd_num)
        d_den = int(cd_den)

        consumed_num = (
            p_raw * d_den
            - d_num
        )

        consumed = {
            "numerator":
                str(consumed_num),
            "denominator":
                str(d_den),
            "decimalRaw":
                consumed_num / d_den,
        }

    except Exception:
        consumed = None

    return {
        "schema":
            "A8-CE-CARRIER-COMPENSATION-V1",

        "status":
            "DUAL_BANK_CABINET",

        "authority":
            "NONE",

        "naturalRuler":
            "EUROPA",

        "policy": {
            "physicalRawPreserved":
                True,
            "writesArduino":
                False,
            "writesJovianGovernor":
                False,
            "automaticServo":
                False,
            "phaseJumpAllowed":
                False,
        },

        "control":
            carrier_control_state(),

        "banks": {
            "primaryAB": {
                "bank":
                    "A/B",
                "role":
                    "PRIMARY_PHYSICAL_CARRIER",
                "physicalSourceEpoch":
                    alignment.get(
                        "externalPhysicalSourceEpoch"
                    ),
                "physicalRaw":
                    primary_physical.get(
                        "RAW_COUNT"
                    ),
                "physicalStatus":
                    primary_physical.get(
                        "STATUS"
                    ),

                "compensation": {
                    "status":
                        "PREPARED_LOCKED",
                    "baseCalibration":
                        "NOT_SEALED",
                    "fineNeedlePpb":
                        0,
                    "effectiveRatio": {
                        "numerator": "1",
                        "denominator": "1",
                    },
                    "actuation":
                        "LOCKED_PENDING_C_D_QUALIFICATION",
                    "writesCore20":
                        False,
                    "writesArduino":
                        False,
                    "writesJovianGovernor":
                        False,
                },
            },

            "ghostCD": {
                "bank":
                    "C/D",
                "role":
                    "STANDBY_QUALIFICATION_CARRIER",
                "runId":
                    ghost.get("runId"),
                "linkStatus":
                    ghost.get("linkStatus"),
                "physicalRaw":
                    cd_physical_raw,
                "disciplinedRaw":
                    disciplined,
                "carrierDiscipline":
                    discipline,
                "oscillatorExcessConsumed":
                    consumed,

                "compensation": {
                    "status":
                        discipline.get(
                            "status",
                            "UNAVAILABLE",
                        ),
                    "role":
                        discipline.get(
                            "role"
                        ),
                    "ratio":
                        discipline.get(
                            "ratio"
                        ),
                    "physicalAnchorRaw":
                        discipline.get(
                            "physicalAnchorRaw"
                        ),
                    "segmentNumber":
                        discipline.get(
                            "segmentNumber"
                        ),
                    "disciplinedAnchor":
                        discipline.get(
                            "disciplinedAnchor"
                        ),
                    "actuation":
                        "ACTIVE_TRIAL_EXTERNAL_GHOST_STATE",
                    "writesCore20":
                        discipline.get(
                            "writesCore20"
                        ),
                    "writesArduino":
                        discipline.get(
                            "writesArduino"
                        ),
                    "writesJovianGovernor":
                        discipline.get(
                            "writesJovianGovernor"
                        ),
                },
            },
        },
    }


def snapshot():
    core_state = active(CORE)
    feed_state = active(FEED)
    auto_state = active(AUTO)

    result = {
        "schema": "A8-CE-CORE20-SERVICE-CONTROL-V2",
        "state": "UNKNOWN",
        "online": False,

        "core20Service": core_state,
        "core20SubState": prop(CORE, "SubState"),
        "core20MainPID": prop(CORE, "MainPID"),
        "core20Result": prop(CORE, "Result"),

        "externalPhysicalFeederService":
            feed_state,
        "externalPhysicalFeederSubState":
            prop(FEED, "SubState"),
        "externalPhysicalFeederMainPID":
            prop(FEED, "MainPID"),
        "externalPhysicalFeederResult":
            prop(FEED, "Result"),

        # Historical observer only. This failed/retired unit
        # no longer determines current Epoch-8 machine health.
        "autorecoveryService": auto_state,
        "autorecoveryResult": prop(AUTO, "Result"),
        "autorecoveryRole":
            "HISTORICAL_NOT_CURRENT_PATH_AUTHORITY",

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
        and feed_state == "active"
        and clock.get("status") ==
            "CORE20_CLOCK_RUNNING"
        and physical_primary
    )

    result["machineQualificationBasis"] = (
        "CORE20_PLUS_EXTERNAL_PHYSICAL_PRIMARY"
    )

    result["externalPhysicalSourceEpoch"] = (
        alignment.get("externalPhysicalSourceEpoch")
    )

    result["calendarRole"] = (
        "PRESENTATION_NOT_MACHINE_QUALIFICATION"
    )

    result["yearOrientationRole"] = (
        "PRESENTATION_OR_FALLBACK_NOT_MACHINE_QUALIFICATION"
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
            or active(FEED) == "failed"
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



# ============================================================
# A8 CE A/B DISCIPLINE CONTROL V1
#
# Stage/review only.
# NO SEAL / NO FEEDER / NO CORE20 actuation.
# ============================================================

AB_DISCIPLINE_STATE = (
    "/etc/a8-core20/"
    "ab-carrier-discipline.json"
)

AB_DISCIPLINE_HELPER = (
    "/usr/local/sbin/"
    "a8-ab-carrier-discipline.py"
)

AB_STAGE_FILE = (
    "/run/a8-ce-ab-carrier-stage.json"
)

AB_REVIEW_FILE = (
    "/run/a8-ce-ab-carrier-review.json"
)


def ab_control_read_json(path):
    try:
        with open(
            path,
            "r",
            encoding="utf-8",
        ) as f:
            return json.load(f)

    except FileNotFoundError:
        return None


def ab_control_write_json(path, obj):
    import os as _ab_os
    import tempfile as _ab_tempfile

    directory = (
        _ab_os.path.dirname(path)
        or "."
    )

    fd,tmp = _ab_tempfile.mkstemp(
        prefix=".a8-ce-ab-control.",
        dir=directory,
    )

    try:
        with _ab_os.fdopen(
            fd,
            "w",
            encoding="utf-8",
        ) as f:
            json.dump(
                obj,
                f,
                indent=2,
                sort_keys=True,
            )
            f.write("\n")
            f.flush()
            _ab_os.fsync(f.fileno())

        _ab_os.chmod(
            tmp,
            0o600,
        )

        _ab_os.replace(
            tmp,
            path,
        )

    finally:
        if _ab_os.path.exists(tmp):
            _ab_os.unlink(tmp)


def ab_control_clear(path):
    import os as _ab_os

    try:
        _ab_os.unlink(path)
    except FileNotFoundError:
        pass


def ab_helper_json(*args):
    import subprocess as _ab_subprocess

    p = _ab_subprocess.run(
        [
            AB_DISCIPLINE_HELPER,
            *args,
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=8,
    )

    return json.loads(
        p.stdout
    )


def ab_reference_ghost():
    import urllib.request as _ab_urllib

    with _ab_urllib.urlopen(
        "http://127.0.0.1:18027"
        "/api/shadow/ghost",
        timeout=3,
    ) as r:
        x=json.load(r)

    if x.get("ok") is not True:
        raise ValueError(
            "C/D REFERENCE NOT OK"
        )

    g=x.get("ghost") or {}
    d=(
        g.get("carrierDiscipline")
        or {}
    )

    if (
        g.get("linkStatus")
        != "RECEIVING"
    ):
        raise ValueError(
            "C/D REFERENCE NOT RECEIVING"
        )

    if (
        d.get("status")
        != "ACTIVE_TRIAL"
    ):
        raise ValueError(
            "C/D REFERENCE DISCIPLINE NOT ACTIVE"
        )

    # Segment / ratio are intentionally not hard-coded here.
    #
    # This function validates the CURRENT C/D witness only.
    # Qualification against the historical A/B reference is
    # performed separately by ab_reference_qualification().
    #
    # A changed C/D run / segment / ratio therefore becomes
    # REQUALIFICATION_REQUIRED instead of a transport error.

    for key in (
        "writesArduino",
        "writesCore20",
        "writesJovianGovernor",
        "usesUTC",
        "usesHostTimeForPace",
    ):
        if d.get(key) is not False:
            raise ValueError(
                "C/D REFERENCE SAFETY CHANGED · "
                + key
            )

    return {
        "runId":
            g.get("runId"),

        "physicalRaw":
            str(g.get("rawCount")),

        "segmentNumber":
            int(d["segmentNumber"]),

        "ratio":
            dict(d["ratio"]),

        "status":
            d.get("status"),
    }


def ab_foundation_status():
    x=ab_helper_json(
        "status"
    )

    p=x.get("physical") or {}
    d=x.get("discipline") or {}

    if p.get("sourceEpoch") != "8":
        raise ValueError(
            "A/B PHYSICAL EPOCH IS NOT 8"
        )

    if p.get("status") != "ACTIVE":
        raise ValueError(
            "A/B PHYSICAL SOURCE NOT ACTIVE"
        )

    if int(d.get("segmentNumber")) != 0:
        raise ValueError(
            "A/B FOUNDATION SEGMENT IS NOT 0"
        )

    if (
        d.get("ratio")
        != {
            "numerator":"1",
            "denominator":"1",
        }
    ):
        raise ValueError(
            "A/B FOUNDATION IS NOT 1/1"
        )

    if (
        d.get("actuation")
        != "NOT_CONNECTED_TO_FEEDER"
    ):
        raise ValueError(
            "A/B FEEDER ACTUATION STATE CHANGED"
        )

    safety=d.get("safety") or {}

    if safety.get("sealEnabled") is not False:
        raise ValueError(
            "A/B SEAL UNEXPECTEDLY ENABLED"
        )

    return x


def ab_expected_ratio():
    x=ab_foundation_status()

    ref=(
        x["discipline"]
        .get("reference")
        or {}
    )

    ratio=(
        ref.get("proposedFirstABRatio")
        or {}
    )

    n=str(
        ratio.get("numerator")
        or ""
    )

    d=str(
        ratio.get("denominator")
        or ""
    )

    if not n.isdigit() or not d.isdigit():
        raise ValueError(
            "A/B PROPOSED RATIO MISSING"
        )

    if int(n) <= 0 or int(d) <= 0:
        raise ValueError(
            "A/B PROPOSED RATIO INVALID"
        )

    return {
        "numerator":n,
        "denominator":d,
    }


def ab_reference_qualification():
    live=ab_foundation_status()

    current=ab_reference_ghost()

    foundation_reference=(
        live["discipline"]
        .get("reference")
        or {}
    )

    historical_ratio=dict(
        foundation_reference.get("ratio")
        or {}
    )

    historical_segment=(
        foundation_reference.get(
            "segmentNumber"
        )
    )

    try:
        historical_segment_int=(
            int(historical_segment)
        )

    except (
        TypeError,
        ValueError,
    ):
        historical_segment_int=None

    historical={
        "carrier":
            foundation_reference.get(
                "carrier"
            ),

        "runId":
            foundation_reference.get(
                "runId"
            ),

        "segmentNumber":
            historical_segment_int,

        "ratio":
            historical_ratio,

        "proposedFirstABRatio":
            foundation_reference.get(
                "proposedFirstABRatio"
            ),
    }

    same_reference=(
        current.get("runId")
        == historical.get("runId")

        and

        current.get("segmentNumber")
        == historical.get("segmentNumber")

        and

        current.get("ratio")
        == historical.get("ratio")
    )

    return {
        "schema":
            "A8-CE-AB-REFERENCE-QUALIFICATION-V1",

        "status":
            (
                "CURRENT_REFERENCE_MATCHES_"
                "HISTORICAL_QUALIFICATION"

                if same_reference

                else

                "REQUALIFICATION_REQUIRED_"
                "CURRENT_C_D_REFERENCE_CHANGED"
            ),

        "requalificationRequired":
            not same_reference,

        "currentReference":
            current,

        "historicalReference":
            historical,

        "actuation":
            "NONE",

        "physicalRawAction":
            "NONE",

        "core20Action":
            "NONE",

        "jovianAction":
            "NONE",
    }


def ab_stage_state():
    return ab_control_read_json(
        AB_STAGE_FILE
    )


def ab_review_state():
    return ab_control_read_json(
        AB_REVIEW_FILE
    )


def ab_write_stage(
    numerator,
    denominator,
):
    qualification=(
        ab_reference_qualification()
    )

    if qualification[
        "requalificationRequired"
    ]:
        raise ValueError(
            "A/B REQUALIFICATION REQUIRED · "
            "CURRENT C/D REFERENCE CHANGED"
        )

    expected=ab_expected_ratio()

    n=str(numerator or "")
    d=str(denominator or "")

    if (
        n != expected["numerator"]
        or
        d != expected["denominator"]
    ):
        raise ValueError(
            "A/B STAGE MUST MATCH "
            "QUALIFIED EXACT PROPOSAL"
        )

    live=ab_foundation_status()
    ref=ab_reference_ghost()

    foundation_ref=(
        live["discipline"]
        .get("reference")
        or {}
    )

    if (
        ref["runId"]
        != foundation_ref.get("runId")
    ):
        raise ValueError(
            "C/D REFERENCE RUN CHANGED"
        )

    stage={
        "schema":
            "A8-CE-AB-CARRIER-STAGE-V1",

        "status":
            "STAGED_REVIEW_REQUIRED",

        "bank":
            "A/B",

        "physicalSourceEpoch":
            "8",

        "currentSegment":
            0,

        "nextSegment":
            1,

        "ratio":
            expected,

        "reference":
            ref,

        "authority":
            "NONE",

        "writesState":
            False,

        "writesFeeder":
            False,

        "writesCore20":
            False,

        "writesArduino":
            False,

        "writesJovianGovernor":
            False,

        "epochChange":
            False,

        "sealAvailable":
            False,
    }

    # A new stage destroys any prior review.
    ab_control_clear(
        AB_REVIEW_FILE
    )

    ab_control_write_json(
        AB_STAGE_FILE,
        stage,
    )

    return stage


def ab_review_stage():
    qualification=(
        ab_reference_qualification()
    )

    if qualification[
        "requalificationRequired"
    ]:
        raise ValueError(
            "A/B REQUALIFICATION REQUIRED · "
            "CURRENT C/D REFERENCE CHANGED"
        )

    stage=ab_stage_state()

    if stage is None:
        raise ValueError(
            "A/B STAGE REQUIRED"
        )

    if (
        stage.get("status")
        != "STAGED_REVIEW_REQUIRED"
    ):
        raise ValueError(
            "A/B VALID STAGE REQUIRED"
        )

    expected=ab_expected_ratio()

    if stage.get("ratio") != expected:
        raise ValueError(
            "A/B STAGED RATIO CHANGED"
        )

    live=ab_foundation_status()
    ref=ab_reference_ghost()

    if (
        ref["runId"]
        != stage["reference"]["runId"]
    ):
        raise ValueError(
            "C/D REFERENCE RUN CHANGED"
        )

    preview=ab_helper_json(
        "preview",
        expected["numerator"],
        expected["denominator"],
    )

    if (
        preview.get("operation")
        != "PREVIEW_ONLY_NO_WRITE"
    ):
        raise ValueError(
            "A/B PREVIEW CONTRACT CHANGED"
        )

    if (
        int(preview.get("currentSegment"))
        != 0
        or
        int(preview.get("proposedNextSegment"))
        != 1
    ):
        raise ValueError(
            "A/B PREVIEW SEGMENT CHANGED"
        )

    continuity=(
        preview.get("continuity")
        or {}
    )

    if continuity.get("phaseJump") is not False:
        raise ValueError(
            "A/B REVIEW WOULD PHASE JUMP"
        )

    if continuity.get("rawRewrite") is not False:
        raise ValueError(
            "A/B REVIEW WOULD REWRITE RAW"
        )

    safety=(
        preview.get("safety")
        or {}
    )

    for key in (
        "stateWrite",
        "feederWrite",
        "core20Write",
        "arduinoWrite",
        "jovianGovernorWrite",
        "epochChange",
        "usesUTC",
        "usesHostTimeForPace",
    ):
        if safety.get(key) is not False:
            raise ValueError(
                "A/B PREVIEW SAFETY CHANGED · "
                + key
            )

    review={
        "schema":
            "A8-CE-AB-CARRIER-REVIEW-V1",

        "status":
            "REVIEWED_SEAL_LOCKED",

        "bank":
            "A/B",

        "physicalSourceEpoch":
            "8",

        "currentSegment":
            0,

        "nextSegment":
            1,

        "ratio":
            expected,

        "reference":
            ref,

        # This is a review witness only.
        # Final seal must obtain a fresh seam.
        "reviewPreview":
            preview,

        "authority":
            "NONE",

        "sealAvailable":
            False,

        "sealStatus":
            "LOCKED_PENDING_FEEDER_"
            "ACTUATION_QUALIFICATION",

        "writesState":
            False,

        "writesFeeder":
            False,

        "writesCore20":
            False,

        "writesArduino":
            False,

        "writesJovianGovernor":
            False,

        "epochChange":
            False,
    }

    ab_control_write_json(
        AB_REVIEW_FILE,
        review,
    )

    return review


def ab_control_status():
    live=ab_foundation_status()

    qualification=(
        ab_reference_qualification()
    )

    return {
        "schema":
            "A8-CE-AB-CARRIER-CONTROL-V1",

        "status":
            (
                "REQUALIFICATION_REQUIRED"

                if qualification[
                    "requalificationRequired"
                ]

                else

                "STAGE_REVIEW_ONLY"
            ),

        "bank":
            "A/B",

        "physicalSourceEpoch":
            "8",

        "naturalRuler":
            "EUROPA",

        "discipline":
            live["discipline"],

        "physical":
            live["physical"],

        "reference":
            qualification[
                "currentReference"
            ],

        "referenceQualification":
            qualification,

        "historicalReference":
            qualification[
                "historicalReference"
            ],

        "expectedRatio":
            (
                None

                if qualification[
                    "requalificationRequired"
                ]

                else

                ab_expected_ratio()
            ),

        "historicalExpectedRatio":
            (
                live["discipline"]
                .get("reference")
                or {}
            ).get(
                "proposedFirstABRatio"
            ),

        "control":{
            "stageAvailable":
                not qualification[
                    "requalificationRequired"
                ],

            "reviewAvailable":
                (
                    not qualification[
                        "requalificationRequired"
                    ]

                    and

                    ab_stage_state()
                    is not None
                ),

            "sealAvailable":
                False,

            "sealStatus":
                (
                    "LOCKED_PENDING_"
                    "A_B_REQUALIFICATION"

                    if qualification[
                        "requalificationRequired"
                    ]

                    else

                    "LOCKED_PENDING_FEEDER_"
                    "ACTUATION_QUALIFICATION"
                ),

            "stagedProposal":
                ab_stage_state(),

            "reviewedProposal":
                ab_review_state(),
        },

        "policy":{
            "epochChange":
                False,

            "physicalRawPreserved":
                True,

            "manualSealedSegments":
                True,

            "automaticServo":
                False,

            "phaseJumpAllowed":
                False,

            "feederChanged":
                False,
        },
    }



# ============================================================
# CORE20 / CORE21 HOURLY BACKUP STATUS · READ ONLY
# ============================================================

BACKUP_CADENCE_SECONDS = 3600

# Two missed hourly cycles before STALE.
BACKUP_STALE_AFTER_SECONDS = 7200

BACKUP_SPECS = {
    "core20": {
        "service":
            "a8-core20-checkpoint.service",

        "timer":
            "a8-core20-checkpoint.timer",

        "root":
            "/home/greg/a8-backups/automatic-core20",

        "prefix":
            "core20-checkpoint-",

        "statusFile":
            "CHECKPOINT_STATUS",
    },

    "core21": {
        "service":
            "a8-core21-checkpoint.service",

        "timer":
            "a8-core21-checkpoint.timer",

        "root":
            "/home/greg/a8-backups/automatic-core21",

        "prefix":
            "core21-checkpoint-",

        "statusFile":
            None,
    },
}


def backup_systemd_state(unit):
    props = (
        "ActiveState",
        "SubState",
        "Result",
        "ExecMainStatus",
        "ExecMainStartTimestamp",
        "ExecMainExitTimestamp",
        "UnitFileState",
        "LastTriggerUSec",
        "NextElapseUSecRealtime",
    )

    args = [
        "systemctl",
        "show",
        unit,
    ]

    for prop in props:
        args.extend(
            [
                "-p",
                prop,
            ]
        )

    proc = run(
        *args,
        timeout=5,
    )

    if proc.returncode != 0:
        return {
            "available": False,
            "error": proc.stderr.strip(),
        }

    result = {
        "available": True,
    }

    for raw in proc.stdout.splitlines():
        if "=" not in raw:
            continue

        key, value = raw.split(
            "=",
            1,
        )

        result[key] = value

    return result


def backup_checkpoint_epoch(name, prefix):
    if not name.startswith(prefix):
        return None

    stamp = name[len(prefix):]

    try:
        dt = datetime.strptime(
            stamp,
            "%Y%m%dT%H%M%SZ",
        ).replace(
            tzinfo=timezone.utc,
        )

    except ValueError:
        return None

    return dt.timestamp()


def backup_latest_artifact(spec):
    root = spec["root"]
    prefix = spec["prefix"]

    if not os.path.isdir(root):
        return None

    candidates = []

    try:
        names = os.listdir(root)

    except OSError:
        return None

    for name in names:
        if not name.startswith(prefix):
            continue

        path = os.path.join(
            root,
            name,
        )

        if not os.path.isdir(path):
            continue

        epoch = backup_checkpoint_epoch(
            name,
            prefix,
        )

        if epoch is None:
            continue

        candidates.append(
            (
                epoch,
                name,
                path,
            )
        )

    if not candidates:
        return None

    epoch, name, path = max(
        candidates,
        key=lambda item: item[0],
    )

    checkpoint_status = None

    status_file = spec.get(
        "statusFile"
    )

    if status_file:
        status_path = os.path.join(
            path,
            status_file,
        )

        if os.path.isfile(status_path):
            try:
                with open(
                    status_path,
                    encoding="utf-8",
                ) as f:
                    checkpoint_status = (
                        f.read().strip()
                    )

            except OSError:
                checkpoint_status = None

    return {
        "name":
            name,

        "timestampUtc":
            datetime.fromtimestamp(
                epoch,
                tz=timezone.utc,
            ).isoformat(),

        "epoch":
            epoch,

        "checkpointStatus":
            checkpoint_status,
    }


def backup_one(name):
    spec = BACKUP_SPECS[name]

    service = backup_systemd_state(
        spec["service"]
    )

    timer = backup_systemd_state(
        spec["timer"]
    )

    artifact = backup_latest_artifact(
        spec
    )

    now = time.time()

    age = None

    if artifact is not None:
        age = max(
            0,
            int(
                now
                - artifact["epoch"]
            ),
        )

    state = "UNKNOWN"
    reason = "INSUFFICIENT_EVIDENCE"

    service_active = (
        service.get("ActiveState")
        if service.get("available")
        else None
    )

    if service_active in (
        "activating",
        "active",
    ):
        state = "IN PROGRESS"
        reason = (
            "CHECKPOINT_SERVICE_RUNNING"
        )

    elif (
        service.get("available")
        and
        (
            service.get("Result")
            not in (
                "",
                "success",
            )
            or
            service.get("ExecMainStatus")
            not in (
                "",
                "0",
            )
        )
    ):
        state = "FAILED"
        reason = (
            "LATEST_CHECKPOINT_RUN_FAILED"
        )

    elif (
        artifact is not None
        and
        artifact.get("checkpointStatus")
        not in (
            None,
            "",
            "PASS",
        )
    ):
        state = "FAILED"
        reason = (
            "CHECKPOINT_ARTIFACT_NOT_PASS"
        )

    elif (
        not timer.get("available")
        or
        timer.get("ActiveState")
        != "active"
        or
        timer.get("SubState")
        != "waiting"
    ):
        state = "FAILED"
        reason = (
            "HOURLY_TIMER_NOT_ARMED"
        )

    elif artifact is None:
        state = "UNKNOWN"
        reason = (
            "NO_CHECKPOINT_ARTIFACT"
        )

    elif (
        age is not None
        and
        age >
        BACKUP_STALE_AFTER_SECONDS
    ):
        state = "STALE"
        reason = (
            "ARTIFACT_OLDER_THAN_TWO_"
            "HOURLY_CYCLES"
        )

    else:
        state = "HEALTHY"
        reason = (
            "TIMER_RUN_AND_ARTIFACT_CURRENT"
        )

    return {
        "core":
            name.upper(),

        "status":
            state,

        "reason":
            reason,

        "cadenceSeconds":
            BACKUP_CADENCE_SECONDS,

        "staleAfterSeconds":
            BACKUP_STALE_AFTER_SECONDS,

        "ageSeconds":
            age,

        "latestCheckpoint":
            artifact,

        "service":
            service,

        "timer":
            timer,
    }


def core_backup_status():
    return {
        "schema":
            "A8-CE-CORE-BACKUP-STATUS-V1",

        "readOnly":
            True,

        "writesTimingState":
            False,

        "generatedUtcEvidenceOnly":
            datetime.now(
                timezone.utc
            ).isoformat(),

        "core20":
            backup_one("core20"),

        "core21":
            backup_one("core21"),
    }


# ============================================================
# A8 CE A/B PI GEARBOX RATCHET V2
#
# Adjustable q exists on the A/B Pi only.
#
# Pi disciplined coordinate:
#   D = D0 + (P - P0) * q
#
# Core20 feeder:
#   F = F0 + (D - D0)
#
# Therefore disciplined carrier → feeder slope = 1/1.
# ============================================================

AB_GEARBOX_SSH = "/usr/bin/ssh"
AB_GEARBOX_SSH_PORT = "22072"
AB_GEARBOX_SSH_USER = "pi@127.0.0.1"

AB_GEARBOX_SSH_KEY = (
    "/etc/a8-ce/ab-gearbox/"
    "id_ed25519"
)

AB_GEARBOX_KNOWN_HOSTS = (
    "/home/greg/.ssh/"
    "known_hosts"
)

AB_GEARBOX_LIVE_URL = (
    "http://127.0.0.1:28789/health"
)

AB_FEEDER_ACTUATION_STATE = (
    "/etc/a8-core20/"
    "ab-feeder-actuation.json"
)


def _ab_v2_remote_json(*parts, timeout=15):
    import shlex

    command = (
        "gearbox-ab "
        +
        " ".join(
            shlex.quote(str(x))
            for x in parts
        )
    )

    p = run(
        AB_GEARBOX_SSH,

        "-p",
        AB_GEARBOX_SSH_PORT,

        "-i",
        AB_GEARBOX_SSH_KEY,

        "-o",
        "BatchMode=yes",

        "-o",
        "IdentitiesOnly=yes",

        "-o",
        "StrictHostKeyChecking=yes",

        "-o",
        (
            "UserKnownHostsFile="
            + AB_GEARBOX_KNOWN_HOSTS
        ),

        AB_GEARBOX_SSH_USER,

        command,

        timeout=timeout,
    )

    if p.returncode != 0:
        raise RuntimeError(
            "A/B REMOTE GEARBOX FAILED · "
            + (
                p.stderr.strip()
                or p.stdout.strip()
                or str(p.returncode)
            )
        )

    try:
        result = json.loads(
            p.stdout
        )
    except Exception as exc:
        raise RuntimeError(
            "A/B REMOTE INVALID JSON · "
            + str(exc)
        )

    if result.get("ok") is not True:
        raise RuntimeError(
            "A/B REMOTE REJECTED · "
            + str(
                result.get(
                    "error",
                    "UNKNOWN"
                )
            )
        )

    return result


def _ab_v2_live():
    x = get_json_url(
        AB_GEARBOX_LIVE_URL,
        timeout=3,
    )

    if not isinstance(x, dict):
        raise RuntimeError(
            "A/B LIVE GEARBOX UNAVAILABLE"
        )

    if x.get("status") != "READY":
        raise RuntimeError(
            "A/B LIVE GEARBOX NOT READY"
        )

    source = (
        x.get("source")
        or {}
    )

    if str(
        source.get("SOURCE_EPOCH")
    ) != "8":
        raise RuntimeError(
            "A/B SOURCE EPOCH CHANGED"
        )

    if source.get("STATUS") != "ACTIVE":
        raise RuntimeError(
            "A/B PHYSICAL SOURCE NOT ACTIVE"
        )

    disciplined = (
        source.get("disciplinedRaw")
        or {}
    )

    carrier = (
        source.get("carrierDiscipline")
        or {}
    )

    if (
        disciplined.get("status")
        != "ACTIVE_TRIAL"
    ):
        raise RuntimeError(
            "A/B DISCIPLINED RAW NOT ACTIVE"
        )

    if (
        carrier.get("schema")
        != "A8-AB-CARRIER-DISCIPLINE-V1"
    ):
        raise RuntimeError(
            "A/B DISCIPLINE SCHEMA CHANGED"
        )

    if (
        carrier.get("status")
        != "ACTIVE_TRIAL"
    ):
        raise RuntimeError(
            "A/B DISCIPLINE NOT ACTIVE"
        )

    if (
        carrier.get("role")
        != "OSCILLATOR_COMPENSATION_ONLY"
    ):
        raise RuntimeError(
            "A/B DISCIPLINE ROLE CHANGED"
        )

    if carrier.get("authority") != "NONE":
        raise RuntimeError(
            "A/B DISCIPLINE CLAIMS AUTHORITY"
        )

    if (
        carrier.get("automaticReanchor")
        is not False
    ):
        raise RuntimeError(
            "A/B AUTOMATIC REANCHOR ENABLED"
        )

    safety = (
        carrier.get("safety")
        or {}
    )

    for key in (
        "usesUTC",
        "usesHostTimeForPace",
        "writesArduino",
        "writesCore20",
        "writesReporter",
        "changesSourceEpoch",
    ):
        if safety.get(key) is not False:
            raise RuntimeError(
                "A/B SAFETY FLAG CHANGED · "
                + key
            )

    ratio = (
        carrier.get("ratio")
        or {}
    )

    normalized = normalize_carrier_ratio(
        ratio.get("numerator"),
        ratio.get("denominator"),
    )

    if normalized != ratio:
        raise RuntimeError(
            "A/B LIVE RATIO NOT NORMALIZED"
        )

    return (
        source,
        carrier,
        disciplined,
    )


def _ab_v2_feeder():
    if active(FEED) != "active":
        raise RuntimeError(
            "CORE20 FEEDER NOT ACTIVE"
        )

    with open(
        AB_FEEDER_ACTUATION_STATE,
        "r",
        encoding="utf-8",
    ) as f:
        x = json.load(f)

    if (
        x.get("schema")
        != "A8-AB-FEEDER-ACTUATION-V1"
    ):
        raise RuntimeError(
            "A/B FEEDER STATE SCHEMA CHANGED"
        )

    if x.get("status") != "ACTIVE":
        raise RuntimeError(
            "A/B FEEDER ACTUATION NOT ACTIVE"
        )

    if str(
        x.get("physicalSourceEpoch")
    ) != "8":
        raise RuntimeError(
            "A/B FEEDER EPOCH CHANGED"
        )

    if x.get("phaseJump") is not False:
        raise RuntimeError(
            "A/B FEEDER PHASE JUMP FLAG"
        )

    if x.get("rawRewrite") is not False:
        raise RuntimeError(
            "A/B FEEDER RAW REWRITE FLAG"
        )

    return x


def _ab_v2_remote_status():
    x = _ab_v2_remote_json(
        "status",
        timeout=10,
    )

    if x.get("mode") != "STATUS":
        raise RuntimeError(
            "A/B REMOTE STATUS MODE CHANGED"
        )

    if x.get("bank") != "A/B":
        raise RuntimeError(
            "A/B REMOTE STATUS BANK CHANGED"
        )

    x["segment"] = int(
        x["segment"]
    )

    x["ratio"] = normalize_carrier_ratio(
        x["ratio"]["numerator"],
        x["ratio"]["denominator"],
    )

    if x.get("writesState") is not False:
        raise RuntimeError(
            "A/B STATUS CLAIMS STATE WRITE"
        )

    digest = str(
        x.get(
            "stateSha256",
            ""
        )
    )

    if not re.fullmatch(
        r"[0-9a-f]{64}",
        digest,
    ):
        raise RuntimeError(
            "A/B REMOTE STATE HASH INVALID"
        )

    return x


def ab_stage_state():
    x = ab_control_read_json(
        AB_STAGE_FILE
    )

    if not isinstance(x, dict):
        return None

    if (
        x.get("schema")
        != "A8-CE-AB-CARRIER-STAGE-V2"
    ):
        return None

    return x


def ab_review_state():
    x = ab_control_read_json(
        AB_REVIEW_FILE
    )

    if not isinstance(x, dict):
        return None

    if (
        x.get("schema")
        != "A8-CE-AB-CARRIER-REVIEW-V2"
    ):
        return None

    return x


def ab_review_public_state():
    x = ab_review_state()

    if not isinstance(x, dict):
        return x

    result = dict(x)

    token = result.pop(
        "reviewToken",
        None,
    )

    result[
        "reviewTokenHeldServerSide"
    ] = bool(token)

    return result


def ab_write_stage(
    numerator,
    denominator,
):
    proposed = normalize_carrier_ratio(
        numerator,
        denominator,
    )

    _ab_v2_feeder()

    (
        source,
        carrier,
        disciplined,
    ) = _ab_v2_live()

    remote = _ab_v2_remote_status()

    segment = int(
        carrier["segmentNumber"]
    )

    if segment != remote["segment"]:
        raise RuntimeError(
            "A/B LIVE / REMOTE SEGMENT MISMATCH"
        )

    if (
        carrier.get("ratio")
        != remote.get("ratio")
    ):
        raise RuntimeError(
            "A/B LIVE / REMOTE RATIO MISMATCH"
        )

    stage = {
        "schema":
            "A8-CE-AB-CARRIER-STAGE-V2",

        "status":
            "STAGED_REVIEW_REQUIRED",

        "bank":
            "A/B",

        "physicalSourceEpoch":
            "8",

        "currentSegment":
            segment,

        "nextSegment":
            segment + 1,

        "currentRatio":
            dict(
                remote["ratio"]
            ),

        "ratio":
            proposed,

        "baseStateSha256":
            str(
                remote["stateSha256"]
            ),

        "physicalRawAtStage":
            str(
                source["RAW_COUNT"]
            ),

        "disciplinedRawAtStage": {
            "numerator":
                str(
                    disciplined[
                        "numerator"
                    ]
                ),

            "denominator":
                str(
                    disciplined[
                        "denominator"
                    ]
                ),
        },

        "naturalRuler":
            "EUROPA",

        "authority":
            "NONE",

        "writesState":
            False,

        "writesFeeder":
            False,

        "writesCore20":
            False,

        "writesArduino":
            False,

        "epochChange":
            False,

        "sealAvailable":
            False,
    }

    ab_control_clear(
        AB_REVIEW_FILE
    )

    ab_control_write_json(
        AB_STAGE_FILE,
        stage,
    )

    return stage


def ab_review_stage():
    stage = ab_stage_state()

    if not isinstance(stage, dict):
        raise ValueError(
            "A/B STAGE REQUIRED"
        )

    if (
        stage.get("status")
        != "STAGED_REVIEW_REQUIRED"
    ):
        raise ValueError(
            "A/B VALID STAGE REQUIRED"
        )

    _ab_v2_feeder()

    remote = _ab_v2_remote_status()

    if (
        str(
            remote["stateSha256"]
        )
        != str(
            stage["baseStateSha256"]
        )
    ):
        raise ValueError(
            "A/B STATE CHANGED SINCE STAGE"
        )

    if (
        remote["segment"]
        != int(stage["currentSegment"])
    ):
        raise ValueError(
            "A/B SEGMENT CHANGED SINCE STAGE"
        )

    if (
        remote.get("ratio")
        != stage.get("currentRatio")
    ):
        raise ValueError(
            "A/B RATIO CHANGED SINCE STAGE"
        )

    proposed = (
        stage.get("ratio")
        or {}
    )

    result = _ab_v2_remote_json(
        "review",

        proposed["numerator"],
        proposed["denominator"],

        timeout=12,
    )

    if result.get("mode") != "REVIEW_ONLY":
        raise RuntimeError(
            "A/B REVIEW MODE CHANGED"
        )

    if result.get("bank") != "A/B":
        raise RuntimeError(
            "A/B REVIEW BANK CHANGED"
        )

    if (
        int(
            result["currentSegment"]
        )
        !=
        int(
            stage["currentSegment"]
        )
    ):
        raise RuntimeError(
            "A/B REVIEW CURRENT SEGMENT CHANGED"
        )

    if (
        int(
            result["nextSegment"]
        )
        !=
        int(
            stage["nextSegment"]
        )
    ):
        raise RuntimeError(
            "A/B REVIEW NEXT SEGMENT CHANGED"
        )

    if (
        result.get("currentRatio")
        != stage.get("currentRatio")
    ):
        raise RuntimeError(
            "A/B REVIEW CURRENT RATIO CHANGED"
        )

    if (
        result.get("proposedRatio")
        != stage.get("ratio")
    ):
        raise RuntimeError(
            "A/B REVIEW PROPOSED RATIO CHANGED"
        )

    if (
        str(
            result.get("stateSha256")
        )
        !=
        str(
            stage["baseStateSha256"]
        )
    ):
        raise RuntimeError(
            "A/B REVIEW STATE HASH CHANGED"
        )

    for key in (
        "writesState",
        "signalsSender",
        "writesArduino",
        "writesCore20",
        "writesReporter",
    ):
        if result.get(key) is not False:
            raise RuntimeError(
                "A/B REVIEW SAFETY CHANGED · "
                + key
            )

    rule = (
        result.get("futureSealRule")
        or {}
    )

    if (
        rule.get(
            "freshPhysicalSeam"
        )
        is not True
    ):
        raise RuntimeError(
            "A/B FRESH SEAM RULE MISSING"
        )

    if (
        rule.get(
            "exactDisciplinedContinuity"
        )
        is not True
    ):
        raise RuntimeError(
            "A/B CONTINUITY RULE MISSING"
        )

    for key in (
        "phaseJump",
        "physicalRawRewrite",
        "serviceRestart",
    ):
        if rule.get(key) is not False:
            raise RuntimeError(
                "A/B UNSAFE REVIEW RULE · "
                + key
            )

    token = str(
        result.get(
            "reviewToken",
            ""
        )
    )

    if not re.fullmatch(
        r"[0-9a-f]{64}",
        token,
    ):
        raise RuntimeError(
            "A/B REVIEW TOKEN INVALID"
        )

    review = {
        "schema":
            "A8-CE-AB-CARRIER-REVIEW-V2",

        "status":
            "REVIEWED_READY_TO_SEAL",

        "bank":
            "A/B",

        "physicalSourceEpoch":
            "8",

        "currentSegment":
            int(
                result[
                    "currentSegment"
                ]
            ),

        "nextSegment":
            int(
                result[
                    "nextSegment"
                ]
            ),

        "currentRatio":
            dict(
                result[
                    "currentRatio"
                ]
            ),

        "proposedRatio":
            dict(
                result[
                    "proposedRatio"
                ]
            ),

        "baseStateSha256":
            str(
                result[
                    "stateSha256"
                ]
            ),

        "physicalRawAtReview":
            str(
                result[
                    "physicalRaw"
                ]
            ),

        "exactCurrentDisciplined":
            dict(
                result[
                    "exactCurrentDisciplined"
                ]
            ),

        "futureSealRule":
            dict(
                result[
                    "futureSealRule"
                ]
            ),

        "reviewToken":
            token,

        "authority":
            "NONE",

        "writesState":
            False,

        "writesFeeder":
            False,

        "writesCore20":
            False,

        "writesArduino":
            False,

        "sealAvailable":
            True,
    }

    ab_control_write_json(
        AB_REVIEW_FILE,
        review,
    )

    return ab_review_public_state()


def ab_seal_readiness():
    stage = ab_stage_state()
    review = ab_review_state()

    if not isinstance(stage, dict):
        return False, "STAGE_REQUIRED"

    if not isinstance(review, dict):
        return False, "REVIEW_REQUIRED"

    if (
        review.get("status")
        != "REVIEWED_READY_TO_SEAL"
    ):
        return (
            False,
            "FRESH_REVIEW_REQUIRED",
        )

    if (
        stage.get("ratio")
        !=
        review.get("proposedRatio")
    ):
        return (
            False,
            "STAGE_REVIEW_RATIO_MISMATCH",
        )

    if (
        int(stage["currentSegment"])
        !=
        int(review["currentSegment"])
    ):
        return (
            False,
            "STAGE_REVIEW_SEGMENT_MISMATCH",
        )

    if not review.get("reviewToken"):
        return (
            False,
            "PRIVATE_REVIEW_TOKEN_MISSING",
        )

    try:
        _ab_v2_feeder()

        (
            source,
            carrier,
            disciplined,
        ) = _ab_v2_live()

    except Exception as exc:
        return (
            False,
            "LIVE_GATE_FAIL · "
            + str(exc),
        )

    if (
        int(
            carrier["segmentNumber"]
        )
        !=
        int(
            review["currentSegment"]
        )
    ):
        return (
            False,
            "LIVE_SEGMENT_CHANGED",
        )

    if (
        carrier.get("ratio")
        !=
        review.get("currentRatio")
    ):
        return (
            False,
            "LIVE_RATIO_CHANGED",
        )

    return (
        True,
        "REVIEWED_READY_TO_SEAL",
    )


def _ab_v2_remote_seal(review):
    proposed = (
        review.get("proposedRatio")
        or {}
    )

    token = str(
        review.get(
            "reviewToken",
            ""
        )
    )

    result = _ab_v2_remote_json(
        "seal",

        proposed["numerator"],
        proposed["denominator"],

        "--review-token",
        token,

        timeout=18,
    )

    if result.get("mode") != "SEALED":
        raise RuntimeError(
            "A/B REMOTE DID NOT REPORT SEALED"
        )

    if (
        int(
            result["segment"]
        )
        !=
        int(
            review["nextSegment"]
        )
    ):
        raise RuntimeError(
            "A/B SEALED WRONG SEGMENT"
        )

    if (
        result.get("ratio")
        != proposed
    ):
        raise RuntimeError(
            "A/B SEALED WRONG RATIO"
        )

    if (
        result.get(
            "phaseContinuity"
        )
        != "EXACT"
    ):
        raise RuntimeError(
            "A/B CONTINUITY NOT EXACT"
        )

    if (
        result.get(
            "physicalRawRewrite"
        )
        is not False
    ):
        raise RuntimeError(
            "A/B PHYSICAL RAW REWRITE"
        )

    if (
        result.get(
            "serviceRestart"
        )
        is not False
    ):
        raise RuntimeError(
            "A/B SERVICE RESTART REPORTED"
        )

    return result


def wait_for_ab_segment(
    expected_segment,
    expected_ratio,
    timeout=8,
):
    deadline = (
        time.monotonic()
        + timeout
    )

    while (
        time.monotonic()
        <
        deadline
    ):
        try:
            (
                source,
                carrier,
                disciplined,
            ) = _ab_v2_live()

            if (
                int(
                    carrier[
                        "segmentNumber"
                    ]
                )
                ==
                int(expected_segment)
                and
                carrier.get("ratio")
                ==
                expected_ratio
            ):
                return {
                    "source":
                        source,

                    "carrierDiscipline":
                        carrier,

                    "disciplinedRaw":
                        disciplined,
                }

        except Exception:
            pass

        time.sleep(0.25)

    return None


def ab_seal_reviewed():
    ready, status = (
        ab_seal_readiness()
    )

    if not ready:
        raise ValueError(
            "A/B SEAL NOT READY · "
            + status
        )

    review = ab_review_state()

    expected_segment = int(
        review["nextSegment"]
    )

    expected_ratio = dict(
        review["proposedRatio"]
    )

    remote = _ab_v2_remote_seal(
        review
    )

    #
    # Remote state changed. Local authorization is consumed
    # immediately even if live verification is still arriving.
    #
    ab_control_clear(
        AB_REVIEW_FILE
    )

    ab_control_clear(
        AB_STAGE_FILE
    )

    live = wait_for_ab_segment(
        expected_segment,
        expected_ratio,
        timeout=8,
    )

    return {
        "remoteSeal":
            remote,

        "authorizationConsumed":
            True,

        "liveVerified":
            live is not None,

        "liveAB":
            live,
    }


def ab_control_status():
    (
        source,
        carrier,
        disciplined,
    ) = _ab_v2_live()

    feeder = _ab_v2_feeder()

    ready, seal_status = (
        ab_seal_readiness()
    )

    stage = ab_stage_state()
    review = (
        ab_review_public_state()
    )

    discipline = dict(
        carrier
    )

    discipline[
        "liveDisciplinedRaw"
    ] = {
        "numerator":
            str(
                disciplined[
                    "numerator"
                ]
            ),

        "denominator":
            str(
                disciplined[
                    "denominator"
                ]
            ),

        "floor":
            str(
                disciplined.get(
                    "floorRaw",
                    ""
                )
            ),
    }

    discipline[
        "actuation"
    ] = (
        "ACTIVE_PI_SIDE_GEARBOX"
        "_TO_CORE20_FEEDER"
    )

    discipline[
        "feederSlope"
    ] = {
        "numerator": "1",
        "denominator": "1",
        "status":
            "SEAM_PRESERVED_DELTA",
    }

    discipline[
        "coreCarrierTrim"
    ] = {
        "numerator": "1",
        "denominator": "1",
        "status": "FIXED",
    }

    return {
        "schema":
            "A8-CE-AB-CARRIER-CONTROL-V2",

        "status":
            "ACTIVE_RATCHET",

        "bank":
            "A/B",

        "physicalSourceEpoch":
            "8",

        "naturalRuler":
            "EUROPA",

        "discipline":
            discipline,

        "physical": {
            "raw":
                str(
                    source[
                        "RAW_COUNT"
                    ]
                ),

            "reportSequence":
                source.get(
                    "REPORT_SEQUENCE"
                ),

            "sourceEpoch":
                str(
                    source[
                        "SOURCE_EPOCH"
                    ]
                ),

            "status":
                source[
                    "STATUS"
                ],
        },

        "reference": {
            "body":
                "EUROPA",

            "role":
                "NATURAL_RATE_RULER",

            "crossCarrierReferenceRequired":
                False,
        },

        "referenceQualification": {
            "status":
                "NOT_REQUIRED",

            "requalificationRequired":
                False,
        },

        "expectedRatio":
            None,

        "historicalExpectedRatio":
            None,

        "feeder": {
            "service":
                active(FEED),

            "status":
                feeder.get(
                    "status"
                ),

            "coordinate":
                feeder.get(
                    "coordinate"
                ),

            "carrierTrim": {
                "numerator": "1",
                "denominator": "1",
                "status": "FIXED",
            },

            "phaseJump":
                feeder.get(
                    "phaseJump"
                ),

            "rawRewrite":
                feeder.get(
                    "rawRewrite"
                ),
        },

        "policy": {
            "physicalRawPreserved":
                True,

            "manualSealedSegments":
                True,

            "automaticServo":
                False,

            "phaseJumpAllowed":
                False,

            "crossCarrierReferenceRequired":
                False,

            "coreCarrierTrim": {
                "numerator": "1",
                "denominator": "1",
                "status": "FIXED",
            },
        },

        "control": {
            "stageAvailable":
                True,

            "reviewAvailable":
                stage is not None,

            "sealAvailable":
                ready,

            "sealStatus":
                seal_status,

            "stagedProposal":
                stage,

            "reviewedProposal":
                review,
        },
    }


#
# Preserve C/D's existing cabinet implementation.
# Replace only its obsolete A/B presentation.
#
_carrier_compensation_status_pre_ab_v2 = (
    carrier_compensation_status
)


def carrier_compensation_status():
    state = (
        _carrier_compensation_status_pre_ab_v2()
    )

    banks = (
        state.get("banks")
        or {}
    )

    ab_bank = (
        banks.get("primaryAB")
        or {}
    )

    try:
        ab = ab_control_status()

        d = (
            ab.get("discipline")
            or {}
        )

        p = (
            ab.get("physical")
            or {}
        )

        ab_bank[
            "physicalSourceEpoch"
        ] = ab.get(
            "physicalSourceEpoch"
        )

        ab_bank[
            "physicalRaw"
        ] = p.get("raw")

        ab_bank[
            "physicalStatus"
        ] = p.get("status")

        ab_bank[
            "disciplinedRaw"
        ] = d.get(
            "liveDisciplinedRaw"
        )

        ab_bank[
            "carrierDiscipline"
        ] = d

        ab_bank[
            "compensation"
        ] = {
            "status":
                d.get("status"),

            "baseCalibration":
                (
                    "SEGMENT "
                    +
                    str(
                        d.get(
                            "segmentNumber",
                            "—"
                        )
                    )
                ),

            "fineNeedlePpb":
                0,

            "coreCarrierTrim":
                "1/1 · FIXED",

            "effectiveRatio":
                d.get("ratio"),

            "actuation":
                (
                    "ACTIVE · PI-SIDE RATCHET"
                    " · CORE20 1/1"
                ),

            "segmentNumber":
                d.get(
                    "segmentNumber"
                ),

            "writesCore20":
                False,

            "writesArduino":
                False,

            "writesJovianGovernor":
                False,
        }

    except Exception as exc:
        ab_bank[
            "compensation"
        ] = {
            "status":
                "UNAVAILABLE",

            "coreCarrierTrim":
                "1/1 · FIXED",

            "actuation":
                str(exc),

            "writesCore20":
                False,

            "writesArduino":
                False,

            "writesJovianGovernor":
                False,
        }

    cd_bank = (
        banks.get("ghostCD")
        or {}
    )

    cd_comp = (
        cd_bank.get(
            "compensation"
        )
        or {}
    )

    cd_comp[
        "coreCarrierTrim"
    ] = "1/1 · FIXED"

    cd_bank[
        "compensation"
    ] = cd_comp

    banks["primaryAB"] = ab_bank
    banks["ghostCD"] = cd_bank

    state["banks"] = banks

    state[
        "carrierTrimPolicy"
    ] = {
        "A/B":
            "CORE20 · 1/1 · FIXED",

        "C/D":
            "CORE21 · 1/1 · FIXED",

        "coreTrimAdjustable":
            False,
    }

    return state


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
        if (
            self.path ==
            "/api/ce/core20-service/"
            "clock-adjust/status"
        ):
            if not self.authorized():
                return self.respond(
                    403,
                    {
                        "ok": False,
                        "error": "forbidden",
                    },
                )

            try:
                status = clock_adjust_call(
                    "status",
                    timeout=30,
                )
            except Exception as exc:
                return self.respond(
                    409,
                    {
                        "ok": False,
                        "operation": "CLOCK_ADJUST_STATUS",
                        "error": str(exc),
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,
                    "clockAdjust": status,
                },
            )

        if (
            self.path
            ==
            "/api/ce/core20-service/"
            "core21-clock-adjust/status"
        ):
            if not self.authorized():
                return self.respond(
                    403,
                    {"ok": False, "error": "forbidden"},
                )

            try:
                status = core21_clock_adjust_call(
                    "status",
                    timeout=30,
                )
            except Exception as exc:
                return self.respond(
                    409,
                    {
                        "ok": False,
                        "operation": "CORE21_CLOCK_ADJUST_STATUS",
                        "error": str(exc),
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,
                    "clockAdjust": status,
                },
            )

        if (
            self.path ==
            "/api/ce/core20-service/"
            "wan-transport/router-ab/status"
        ):
            if not self.authorized():
                return self.respond(
                    403,
                    {
                        "ok": False,
                        "error": "forbidden",
                    },
                )

            try:
                status = (
                    ab_router_remote_status()
                )

            except Exception as exc:
                return self.respond(
                    409,
                    {
                        "ok": False,

                        "operation":
                            "AB_ROUTER_STATUS",

                        "error":
                            str(exc),
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,

                    "operation":
                        "AB_ROUTER_STATUS",

                    "routerControl":
                        status,
                },
            )

        if (
            self.path ==
            "/api/ce/core20-service/wan-transport/status"
        ):
            if not self.authorized():
                return self.respond(
                    403,
                    {
                        "ok": False,
                        "error": "forbidden",
                    },
                )

            try:
                status = (
                    wan_transport_status()
                )

            except Exception as exc:
                return self.respond(
                    409,
                    {
                        "ok": False,
                        "operation":
                            "WAN_TRANSPORT_STATUS",

                        "error":
                            str(exc),
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,
                    "transport":
                        status,
                },
            )

        if (
            self.path ==
            "/api/ce/core20-service/cd-transport/status"
        ):
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
                    "transport":
                        cd_transport_readiness(),
                },
            )

        if (
            self.path ==
            "/api/ce/core20-service/backup-status"
        ):
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
                    "backup":
                        core_backup_status(),
                },
            )

        if (
            self.path ==
            "/api/ce/core20-service/carrier-compensation/status"
        ):
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
                    "carrierCompensation":
                        carrier_compensation_status(),
                },
            )

        if (
            self.path ==
            "/api/ce/core20-service/"
            "ab-carrier-compensation/status"
        ):
            if not self.authorized():
                return self.respond(
                    403,
                    {
                        "ok": False,
                        "error": "forbidden",
                    },
                )

            try:
                status=ab_control_status()

            except Exception as exc:
                return self.respond(
                    409,
                    {
                        "ok": False,
                        "operation":
                            "A_B_CARRIER_STATUS",
                        "error":
                            str(exc),
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,
                    "abCarrierControl":
                        status,
                },
            )

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
        core21_clock_prefix = (
            "/api/ce/core20-service/"
            "core21-clock-adjust/"
        )

        if self.path.startswith(core21_clock_prefix):
            if not self.authorized():
                return self.respond(
                    403,
                    {"ok": False, "error": "forbidden"},
                )

            tail = self.path[len(core21_clock_prefix):]
            parts = tail.split("/")

            if len(parts) != 2:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "error": "CORE21 CLOCK ADJUST PATH MUST BE action/amount",
                    },
                )

            action, amount = parts

            if action not in ("advance", "retard"):
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "error": "CORE21 CLOCK ADJUST ACTION MUST BE advance OR retard",
                    },
                )

            if not amount.isdigit() or int(amount) <= 0:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "error": "CORE21 CLOCK ADJUST AMOUNT MUST BE A POSITIVE A8 STATE COUNT",
                    },
                )

            try:
                with operation_lock:
                    result = core21_clock_adjust_call(
                        action,
                        amount,
                        timeout=180,
                    )
            except Exception as exc:
                return self.respond(
                    409,
                    {
                        "ok": False,
                        "operation": "CORE21_CLOCK_ADJUST",
                        "error": str(exc),
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,
                    "operation": "CORE21_CLOCK_ADJUST",
                    "clockAdjust": result,
                },
            )

        clock_prefix = (
            "/api/ce/core20-service/"
            "clock-adjust/"
        )

        if self.path.startswith(clock_prefix):
            if not self.authorized():
                return self.respond(
                    403,
                    {
                        "ok": False,
                        "error": "forbidden",
                    },
                )

            tail = self.path[len(clock_prefix):]
            parts = tail.split("/")

            if len(parts) != 2:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "error": "CLOCK ADJUST PATH MUST BE action/amount",
                    },
                )

            action, amount = parts

            if action not in ("advance", "retard"):
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "error": "CLOCK ADJUST ACTION MUST BE advance OR retard",
                    },
                )

            if not amount.isdigit() or int(amount) <= 0:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "error": "CLOCK ADJUST AMOUNT MUST BE A POSITIVE A8 STATE COUNT",
                    },
                )

            try:
                with operation_lock:
                    result = clock_adjust_call(
                        action,
                        amount,
                        timeout=430,
                    )
            except Exception as exc:
                return self.respond(
                    409,
                    {
                        "ok": False,
                        "operation": "CLOCK_ADJUST",
                        "error": str(exc),
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,
                    "operation": "CLOCK_ADJUST",
                    "clockAdjust": result,
                },
            )

        # ====================================================
        # A/B PI GEARBOX RATCHET V2 · EARLY INTERCEPT
        #
        # These returns intentionally make the older
        # stage/review-only A/B route block unreachable.
        # ====================================================

        if (
            self.path ==
            "/api/ce/core20-service/"
            "ab-carrier-compensation/stage"
        ):
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
                    )
                    or "0"
                )

                raw = (
                    self.rfile.read(length)
                    if length > 0
                    else b"{}"
                )

                payload = json.loads(
                    raw.decode("utf-8")
                )

                with carrier_operation_lock:
                    stage = ab_write_stage(
                        payload.get(
                            "numerator"
                        ),
                        payload.get(
                            "denominator"
                        ),
                    )

            except Exception as exc:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "operation":
                            "STAGE_A_B_CARRIER_RATIO",
                        "error":
                            str(exc),
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,
                    "operation":
                        "STAGE_A_B_CARRIER_RATIO",
                    "stage":
                        stage,
                    "sealAvailable":
                        False,
                    "sealStatus":
                        "REVIEW_REQUIRED",
                },
            )

        if (
            self.path ==
            "/api/ce/core20-service/"
            "ab-carrier-compensation/review"
        ):
            if not self.authorized():
                return self.respond(
                    403,
                    {
                        "ok": False,
                        "error": "forbidden",
                    },
                )

            try:
                with carrier_operation_lock:
                    reviewed = (
                        ab_review_stage()
                    )

                    (
                        seal_available,
                        seal_status,
                    ) = (
                        ab_seal_readiness()
                    )

            except Exception as exc:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "operation":
                            "REVIEW_A_B_CARRIER_RATIO",
                        "error":
                            str(exc),
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,
                    "operation":
                        "REVIEW_A_B_CARRIER_RATIO",
                    "reviewed":
                        reviewed,
                    "sealAvailable":
                        seal_available,
                    "sealStatus":
                        seal_status,
                },
            )

        if (
            self.path ==
            "/api/ce/core20-service/"
            "ab-carrier-compensation/seal"
        ):
            if not self.authorized():
                return self.respond(
                    403,
                    {
                        "ok": False,
                        "error": "forbidden",
                    },
                )

            try:
                with carrier_operation_lock:
                    result = (
                        ab_seal_reviewed()
                    )

            except Exception as exc:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "operation":
                            "SEAL_A_B_CARRIER_SEGMENT",
                        "error":
                            str(exc),
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,
                    "operation":
                        "SEAL_A_B_CARRIER_SEGMENT",
                    "remoteSeal":
                        result[
                            "remoteSeal"
                        ],
                    "authorizationConsumed":
                        result[
                            "authorizationConsumed"
                        ],
                    "liveVerified":
                        result[
                            "liveVerified"
                        ],
                    "liveAB":
                        result[
                            "liveAB"
                        ],
                    "control":
                        ab_control_status()[
                            "control"
                        ],
                },
            )
        if (
            self.path
            == "/api/ce/core20-service/"
               "wan-transport/router-ab/check"
        ):
            if not self.authorized():
                return self.respond(
                    403,
                    {
                        "ok": False,
                        "error": "forbidden",
                    },
                )

            try:
                with (
                    transport_operation_lock
                ):
                    result = (
                        ab_router_remote_check()
                    )

            except Exception as exc:
                return self.respond(
                    400,
                    {
                        "ok": False,

                        "operation":
                            "AB_ROUTER_CHECK",

                        "error":
                            str(exc),
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,

                    "operation":
                        "AB_ROUTER_CHECK",

                    "result":
                        result,
                },
            )

        if (
            self.path
            == "/api/ce/core20-service/"
               "wan-transport/router-ab/reboot"
        ):
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
                    )
                    or "0"
                )

                raw = (
                    self.rfile.read(
                        length
                    )
                    if length > 0
                    else b"{}"
                )

                payload = json.loads(
                    raw.decode(
                        "utf-8"
                    )
                )

                confirmation = (
                    payload.get(
                        "confirm"
                    )
                )

                with (
                    transport_operation_lock
                ):
                    result = (
                        schedule_ab_router_reboot(
                            confirmation
                        )
                    )

            except Exception as exc:
                return self.respond(
                    400,
                    {
                        "ok": False,

                        "operation":
                            "AB_ROUTER_REBOOT",

                        "error":
                            str(exc),
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,

                    "operation":
                        "AB_ROUTER_REBOOT",

                    "result":
                        result,
                },
            )

        if (
            self.path
            == "/api/ce/core20-service/"
               "wan-transport/reset"
        ):
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
                    )
                    or "0"
                )

                raw = (
                    self.rfile.read(
                        length
                    )
                    if length > 0
                    else b"{}"
                )

                payload = json.loads(
                    raw.decode(
                        "utf-8"
                    )
                )

                bank = str(
                    payload.get(
                        "bank",
                        "",
                    )
                ).strip().upper()

                if (
                    bank
                    not in
                    WAN_TRANSPORT_BANKS
                ):
                    raise ValueError(
                        "BANK MUST BE AB OR CD"
                    )

                expected = (
                    WAN_TRANSPORT_BANKS[
                        bank
                    ][
                        "confirm"
                    ]
                )

                if (
                    payload.get(
                        "confirm"
                    )
                    != expected
                ):
                    raise ValueError(
                        "EXACT CONFIRMATION PHRASE REQUIRED"
                    )

                with (
                    transport_operation_lock
                ):
                    result = (
                        reset_wan_transport(
                            bank
                        )
                    )

            except Exception as exc:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "operation":
                            "RESET_WAN_TRANSPORT",

                        "error":
                            str(exc),
                    },
                )

            ok = bool(
                result.get(
                    "oldOwnersRetired"
                )
            )

            return self.respond(
                200 if ok else 500,
                {
                    "ok":
                        ok,

                    "operation":
                        "RESET_WAN_TRANSPORT",

                    "bank":
                        bank,

                    "result":
                        result,
                },
            )

        if (
            self.path
            == "/api/ce/core20-service/"
               "cd-transport/shutdown"
        ):
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
                    )
                )

                payload = json.loads(
                    self.rfile.read(
                        length
                    ).decode(
                        "utf-8"
                    )
                    or "{}"
                )

            except Exception as exc:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "error":
                            "INVALID JSON · "
                            + str(exc),
                    },
                )

            if (
                payload.get("confirm")
                != GHOST_TRANSPORT_CONFIRM
            ):
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "operation":
                            "C_D_TRANSPORT_SHUTDOWN",
                        "error":
                            "EXACT CONFIRMATION PHRASE REQUIRED",
                    },
                )

            try:
                with carrier_operation_lock:
                    before = (
                        cd_transport_readiness()
                    )

                    if not before["ready"]:
                        raise RuntimeError(
                            "C/D TRANSPORT SHUTDOWN NOT READY"
                        )

                    result = (
                        run_cd_transport_shutdown()
                    )

            except Exception as exc:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "operation":
                            "C_D_TRANSPORT_SHUTDOWN",
                        "error":
                            str(exc),
                    },
                )

            main_after = (
                cd_main_preservation_state()
            )

            main_preserved = (
                main_after["core20"]
                == "active"
                and
                main_after["abFeeder"]
                == "active"
                and
                main_after["shadowCore"]
                == "active"
                and
                main_after["shadowRecorder"]
                == "active"
            )

            return self.respond(
                200 if main_preserved else 500,
                {
                    "ok":
                        main_preserved,

                    "operation":
                        "C_D_TRANSPORT_SHUTDOWN",

                    "transportSealReported":
                        result["sealReported"],

                    "transportSealPath":
                        result["sealPath"],

                    "remoteSshExit":
                        result["sshExit"],

                    "remoteOutput":
                        result["stdout"],

                    "remoteError":
                        result["stderr"],

                    "mainPreserved":
                        main_preserved,

                    "mainAfter":
                        main_after,

                    "core20Action":
                        "NONE",

                    "shadowCoreAction":
                        "NONE",

                    "expectedResult":
                        "C/D SHADOW LEG OFFLINE AFTER POWEROFF",
                },
            )

        if (
            self.path
            == "/api/ce/core20-service/"
               "carrier-compensation/stage"
        ):
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

                numerator = payload.get(
                    "numerator"
                )

                denominator = payload.get(
                    "denominator"
                )

                with carrier_operation_lock:
                    stage = write_carrier_stage(
                        numerator,
                        denominator,
                    )

            except Exception as exc:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "operation":
                            "STAGE_C_D_CARRIER_RATIO",
                        "error":
                            str(exc),
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,
                    "operation":
                        "STAGE_C_D_CARRIER_RATIO",
                    "stage":
                        stage,
                },
            )

        if (
            self.path
            == "/api/ce/core20-service/"
               "carrier-compensation/review"
        ):
            if not self.authorized():
                return self.respond(
                    403,
                    {
                        "ok": False,
                        "error": "forbidden",
                    },
                )

            try:
                with carrier_operation_lock:
                    stage = carrier_stage_state()

                    review = ghost_carrier_review(
                        stage
                    )

                    reviewed = write_carrier_review(
                        stage,
                        review,
                    )

            except Exception as exc:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "operation":
                            "REVIEW_C_D_CARRIER_RATIO",
                        "error":
                            str(exc),
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,
                    "operation":
                        "REVIEW_C_D_CARRIER_RATIO",
                    "stage":
                        stage,

                    # Browser receives the reviewed facts,
                    # but never the actuator token.
                    "reviewed":
                        carrier_review_public_state(),

                    "sealAvailable":
                        carrier_seal_readiness()[0],

                    "sealStatus":
                        carrier_seal_readiness()[1],
                },
            )

        if (
            self.path
            == "/api/ce/core20-service/"
               "carrier-compensation/seal"
        ):
            if not self.authorized():
                return self.respond(
                    403,
                    {
                        "ok": False,
                        "error": "forbidden",
                    },
                )

            remote_seal = None

            try:
                with carrier_operation_lock:
                    ready, seal_status = (
                        carrier_seal_readiness()
                    )

                    if not ready:
                        raise ValueError(
                            "C/D SEAL NOT READY · "
                            + seal_status
                        )

                    review = (
                        carrier_review_state()
                    )

                    expected_segment = int(
                        review["nextSegment"]
                    )

                    remote_seal = (
                        ghost_carrier_seal(
                            review
                        )
                    )

                    # Remote Ghost state has changed.
                    #
                    # Destroy local authorization immediately.
                    # A browser retry cannot replay this seal.
                    clear_carrier_review_state()
                    clear_carrier_stage_state()

            except Exception as exc:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "operation":
                            "SEAL_C_D_CARRIER_SEGMENT",
                        "error":
                            str(exc),
                        "remoteSeal":
                            remote_seal,
                    },
                )

            ghost = wait_for_ghost_segment(
                expected_segment,
                timeout=8,
            )

            return self.respond(
                200,
                {
                    "ok": True,

                    "operation":
                        "SEAL_C_D_CARRIER_SEGMENT",

                    "remoteSeal":
                        remote_seal,

                    "authorizationConsumed":
                        True,

                    "shadowVerified":
                        ghost is not None,

                    "shadowGhost":
                        ghost,

                    "control":
                        carrier_control_state(),
                },
            )

        if (
            self.path ==
            "/api/ce/core20-service/"
            "ab-carrier-compensation/stage"
        ):
            if not self.authorized():
                return self.respond(
                    403,
                    {
                        "ok": False,
                        "error": "forbidden",
                    },
                )

            try:
                length=int(
                    self.headers.get(
                        "Content-Length",
                        "0",
                    ) or "0"
                )

                raw=(
                    self.rfile.read(length)
                    if length > 0
                    else b"{}"
                )

                payload=json.loads(
                    raw.decode("utf-8")
                )

                with carrier_operation_lock:
                    stage=ab_write_stage(
                        payload.get("numerator"),
                        payload.get("denominator"),
                    )

            except Exception as exc:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "operation":
                            "STAGE_A_B_CARRIER_RATIO",
                        "error":
                            str(exc),
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,
                    "operation":
                        "STAGE_A_B_CARRIER_RATIO",
                    "stage":
                        stage,
                    "sealAvailable":
                        False,
                },
            )

        if (
            self.path ==
            "/api/ce/core20-service/"
            "ab-carrier-compensation/review"
        ):
            if not self.authorized():
                return self.respond(
                    403,
                    {
                        "ok": False,
                        "error": "forbidden",
                    },
                )

            try:
                with carrier_operation_lock:
                    review=ab_review_stage()

            except Exception as exc:
                return self.respond(
                    400,
                    {
                        "ok": False,
                        "operation":
                            "REVIEW_A_B_CARRIER_RATIO",
                        "error":
                            str(exc),
                    },
                )

            return self.respond(
                200,
                {
                    "ok": True,
                    "operation":
                        "REVIEW_A_B_CARRIER_RATIO",
                    "reviewed":
                        review,
                    "sealAvailable":
                        False,
                    "sealStatus":
                        "LOCKED_PENDING_FEEDER_"
                        "ACTUATION_QUALIFICATION",
                },
            )

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

                # Current Path-A fresh start requires the
                # Epoch-8 external physical feeder.
                feed_p = run(
                    "systemctl",
                    "start",
                    FEED,
                    timeout=30,
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

                            "physicalFeederStartExit":
                                feed_p.returncode,

                            "physicalFeederStartError":
                                feed_p.stderr.strip(),

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
                        "physicalFeederStartExit":
                            feed_p.returncode,
                        "physicalFeederStartError":
                            feed_p.stderr.strip(),
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
