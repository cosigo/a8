# A8 / COSIGO — A/B Carrier Segment-5 Recovery Handbook

**Incident and recovery:** 17 October 2026 (Trade/Pi observations); Shadow diagnostic evidence extended into 18 October 2026.
**Record type:** post-incident, evidence-led recovery handbook and CE control design input.
**Status:** Core20 carrier and clock restored; Core22 independent carrier intake restored, native clock **NOT_INITIALIZED**; Shadow main-page primary A/B physical RAW display restored.
**Important correction:** A8 operational ownership standard is **user `greg`, not root**. Actual deployed permissions/identities **have not been reconciled**. A one-time `chmod 644` made the Pi stream readable but is *not* an ownership fix. Preserve running services until a guarded identity/ACL audit supports migration.

## 1. Non-negotiable boundaries

1. **Nature → Jupiter/moon natural recurrences → observed hardware transport → A8 core → presentation.** No software counter, physical Arduino, source epoch, segment, cache, or host clock may redefine astronomical coordinates or the natural ruler.
2. UTC, host time, NTP, and inferred outage duration **never** advance or compensate the native clock. Conventional time can be a quarantined external witness only.
3. Arduino A/B hardware stays powered during this recovery; Pi/Trade software controls do not rewrite physical RAW. Arduino C/D and **Core21 Ganymede remain untouched**.
4. SOURCE_EPOCH remains **9**. Physical-carrier **segment changes 4 → 5** because reset happened within the source epoch. Source epoch and carrier segment are different things.
5. Preserve the exact Pi oscillator ratio `877018067214063868 / 877155239030163555`. The segment shift is a coordinate continuity operation, **not** a rate retune.
6. The historical Core22 birth record, Core20 Meridian-0 anchor, historical `−169` states correction, natural six-reference wheel, Jovian baseline, and historical seals are immutable evidence.
7. Never equate `systemctl active`, HTTP 200, and live counter advance. Use ordered observations and consumer-specific status. Do not bypass a fail-closed guard simply to paint a green dashboard.
8. Ownership requirement: `greg` is the intended operator/service owner, **not `root`**. `sudo` during prior emergency repair was an installer privilege, not approval to leave operational artifacts root-owned. A host where service presently runs under `pi` must have identity/access verified before changing ownership.

## 2. Architecture, hosts, paths, ports

| Host / service | Exact object | Meaning |
|---|---|---|
| Pi physical reporter | `127.0.0.1:8788/snapshot` | Actual Arduino A/B `RAW_COUNT`, `REPORT_SEQUENCE`, `SOURCE_EPOCH`, `STATUS` |
| Trade → Pi physical tunnel | `127.0.0.1:28788/snapshot` | Forward of Pi 8788; remains **reset-domain physical RAW** |
| Pi disciplined gearbox | `127.0.0.1:8789/health`, `/stream` | Corrected exact-fraction `disciplinedRaw`, `carrierDiscipline`, segment |
| Trade → Pi gearbox tunnel | `127.0.0.1:28789/health`, `/stream` | Forward of Pi 8789 |
| Trade persistent cache | `127.0.0.1:28790/snapshot`, `/state` | Segmented **logical** RAW for Core20 feeder. `/state` for freshness |
| Trade Jovian driver | `127.0.0.1:18028/state` | Live natural-recurring period observation, baseline 30466 preserved |
| Trade Core20 engine | `127.0.0.1:18020/api/core20/clock` | Production clock; independent internal RAW and civil phase |
| Trade Core21 server | `127.0.0.1:18032/api/core21/status` | Verified running Ganymede C/D independent clock (`civilClock`) |
| Trade Core22 status | `127.0.0.1:18034/api/core22/status` | Independent Core22 physical intake and uninitialized clock |
| Trade Shadow API | `127.0.0.1:18024/api/shadow/comparison` | Includes `physical555.rawCount` / epoch / status; note legacy field name |
| Public Shadow page | `https://shadow.cosigo.io/` | Main A/B physical RAW now uses comparison API |
| Public Shadow lab | `https://shadow.cosigo.io/inspection.html` | Separate working A/B–C/D window comparisons, **not modified** |
| CE | `https://ce.cosigo.io/` | Canonical control/evidence surface; clock advance/retard already exists |

**Crucial three-coordinate distinction:** (A) actual physical Arduino RAW (example `450139`, segment-5 physical coordinate); (B) Pi exact oscillator-compensated RAW (`disciplinedRaw.floorRaw`, example `18030958`); (C) Trade cache segmented logical physical RAW (example `18496753`). These values are **not interchangeable**. Core20 selected internal RAW (example `29616179364`) is a *fourth* coordinate.

### Executables and writable state

| Purpose | Exact path | Known evidence |
|---|---|---|
| Pi discipline config | `/opt/a8-pulse-box/ab-carrier-discipline.json` | After segment-5 install SHA `11b5645f728ff1b70f0ca76d2baa3767fe19afaa491a631b59c2f77455f8cf4f`; **root:root 600 initially**, later **root:root 644** |
| Pi stream | `/opt/a8-pulse-box/a8-pulse-box-stream-v1.py` | Original SHA `756db04d3a7a96583436835cc2c9d0753cc4f47a0d5c5cc72a80cc2aabcbc16a`; reloads discipline dynamically |
| Pi original discipline backup | `/opt/a8-pulse-box/ab-carrier-discipline.json.before-segment5-4592eb6408e1` | Created by installer; prior mode `600` root; original segment-4 SHA `4592eb6408e111f4a7e57e16f3182bbde894673224546dcee437c7275628ac90` |
| Shared cutover seal, Trade | `/home/greg/a8-segment5-seal.json` | SHA `dc68e388e831a9c23d1355d183de6cd46e1648038bcc1da8893c8f1539773581` |
| Shared cutover seal, Pi | `/home/pi/a8-segment5-seal.json` | Copied identical content; not a new independent seal |
| Pi installer | `/home/pi/pi_install.py` | Source in recovery bundle; script **hardcodes 0600 output** |
| Trade seam preparer | `/home/greg/trade_prepare.py` | `--capture` writes one shared seal |
| Trade installer | `/home/greg/trade_install.py` | Guarded dry run / `--apply`; **requires root for apply** |
| Trade new cache payload | `/home/greg/cache_v2.py` | Installed into `/usr/local/sbin/a8-primary-stream-cache.py` |
| Trade new Jovian payload | `/home/greg/live-jovian-segment5.js` | Installed into `/opt/a8-jovian-live/live-jovian.js` |
| Trade Core22 intake payload | `/home/greg/ab_intake_segment5.py` | Installed into `/opt/a8-core22/ab_intake.py` |
| Cache before backup | `/usr/local/sbin/a8-primary-stream-cache.py.before-a8-segment5-3aaf9bf8ab80` | Pre-recovery SHA `3aaf9bf8ab80882428268fb8255df4749c587ef10065dd8d5f6d527e3251d849` |
| Jovian before backup | `/opt/a8-jovian-live/live-jovian.js.before-a8-segment5-681118494f73` | Pre-recovery SHA `681118494f736c266a65fd765ed6d1c5d6eaa6031df0ee2d8f00b59f8587b46e` |
| Intake before backup | `/opt/a8-core22/ab_intake.py.before-a8-segment5-0a45ca697979` | Pre-recovery SHA `0a45ca6979799533a0924aa0f102ec6ced8be080a866820cd6bfbf7b943569fa` |
| Core22 intake checkpoint | `/var/lib/a8-core22/intake-checkpoint-v1.json` | Pre-recovery SHA `a0a53e60e2b806cfc132c5dffd36afa3fb4b0700940213b2c8cbcea31d58c592`; updated after guarded cutover |
| Original Core22 birth | `/var/lib/a8-core22/physical-birth-v1.json` | Immutable; birth logical RAW `17962286` |
| Core22 natural wheel | `/etc/a8-core22/natural-wheel-v2.json` | Unmodified, pre-recovery SHA `2b74546110057aff1034ec3d80dec73acb694d983ae5fc9eb26cfb7f70b4bd9a` |
| Jovian baseline | `/var/lib/a8-jovian-live/baseline.json` | Baseline epoch 9, RAW `30466`, retained |
| Cache segment seal | `/var/lib/a8-primary-stream-cache/segment5-seal.json` | Installed shared seal; verify effective owner is `greg` in future audit |
| Cache install receipt | `/var/lib/a8-primary-stream-cache/segment5-install-receipt.json` | Records historical SHA values, seam SHA; audit ownership and permissions |
| Core22 segment seal | `/var/lib/a8-core22/segment5-seal.json` | Installed shared seal |
| Core22 checkpoint backup | `/var/lib/a8-core22/intake-checkpoint-v1.json.before-a8-segment5-a0a53e60e2b8` | Created by Trade installer (derived from code; existence not independently displayed) |
| Core20 feeder | `/usr/local/sbin/a8-core20-external-physical-feed.py` | Original SHA `4b3fff22628f5da64cd9a82d631719d38c271ea2e2127c32ac5d88eebf5f2be4`; **not replaced** |
| Core20 actuation | `/etc/a8-core20/ab-feeder-actuation.json` | Original SHA `66cf05d6494206b5af9ef0e119862969771f3fc7dcb649edf9b5e4199230139f`; not revised in this cutover |
| Shadow server | `/opt/a8-shadow-core/server.js` | SHA `e060e64dff26cb0464279ebae2801f9bb5a2387696e419cca87450c795066f71`; **not edited** |
| Shadow Jovian engine | `/opt/a8-shadow-core/jovian-engine.js` | SHA `94fb0bfe7f1d1d24bf447a7e7fbe0238f6c2634bca6449cfcc656cf61b990902`; **not edited** |
| Shadow main page | `/srv/sites/shadow.cosigo.io/public/index.html` | Pre-patch SHA `309d340045508ccf9f865618e27fcbaf0f8fc59f1fe109eb192e239dfc3f8991`; final `694544cae2cb305e6f193597cd2f5dd60baeab77b354a7fc34418351b5d26747` |
| Shadow main backup | `/srv/sites/shadow.cosigo.io/public/index.html.before-primary-feed-repair-20261017T182335` | Successful backup, verified by operator output |
| Shadow inspection page | `/srv/sites/shadow.cosigo.io/public/inspection.html` | SHA `8ff47e996d074147e6b5eadc816b1d98f979842ade5b28515667fd40452150e6`; **not edited** |

Services: Pi `a8-pulse-box-stream.service` (observed running); Trade `a8-primary-stream-cache.service`, `a8-jovian-live-period.service`, `a8-core20-external-physical.service`, `a8-core20.service`, `a8-core22-intake.service`, `a8-core21.service`, `a8-shadow-core.service`, `a8-shadow-recorder.service`, `a8-ce-core20-control.service`. Consult current systemd definitions for actual runtime identities before CE applies ownership rules.

## 3. What failed and why the cores behaved differently

### A. Physical A/B counter reset without changing epoch 9

The previous logical observation accepted by Trade was physical RAW `18399059`, report sequence `11264085`. The original Pi segment 4 required physical RAW at or above `441369`; after reset, live actual physical RAW was below this anchor. The gearbox correctly returned `AB_DISCIPLINE_PHYSICAL_RAW_BEFORE_SEAM` / HTTP 503. It did not invent elapsed pulses. The Trade cache could continue returning its previous `ACTIVE` snapshot (`18399059`) with HTTP 200 despite its data being **stale**. The Jovian driver refused an unexplained same-epoch reversal, reporting `HOLDOVER_NO_LIVE_CARRIER` / `RAW_REGRESSION_WITHIN_SOURCE_EPOCH` until qualified transition. The Arduino kept incrementing normally.

### B. Core20 remained a running process while input pace was held

`a8-core20.service` and its clock could report `CORE20_CLOCK_RUNNING`; that is **not evidence the external physical feeder was delivering current pulses**. The feeder was service-active while rejecting transport / Jovian mismatch and logging hold errors, and the Core20 clock position lagged an independently operating clock after the outage. Its old Meridian-0 and astronomical alignment were not discarded. During Trade cutover the installer **stopped only the external feeder**, never the Core20 engine. After cache + Jovian checks passed, it requested feeder start. Two later samples proved Core20 `currentSelectedRawPulse` advanced `29597551511 → 29597582577` (+31066), while external cache and Jovian RAW advanced. This proved actual post-recovery progress, **not** clock-position correctness.

### C. Core22 intentionally failed closed

Core22's *independent* intake used physical reporter `28788` rather than being mechanically driven by Core20. Its immutable birth logical RAW was `17962286`; pre-reset last accepted physical logical RAW `18399059` gave `436773` Core22 RAW. The old intake detected physical reversal and preserved a `HOLD_PHYSICAL_RAW_REVERSAL` checkpoint; its systemd intake service was failed / restart disabled. The segment-5 intake update preserved historical birth and checkpoint evidence and allowed **only observed post-seam pulses**. It resumed `OBSERVING` without initializing or qualifying a Core22 civil clock. Two samples proved `core22Raw 469991 → 470094` (+103), with `physicalRaw 18432277 → 18432380` (+103). The identity `logical physical − 17962286 = core22 RAW` remained exact; Shadow's Core22 validation was **correct** and required no patch.

### D. Core21 was not part of the failure or carrier cutover

Core21 continued independently on Arduino C/D and Ganymede, and served as the post-recovery clock-position reference via **actual verified** local URL `127.0.0.1:18032/api/core21/status` (`civilClock.dayCount`, `civilClock.dayPhase17`). Earlier guessed `18021` and `18031` routes returned 404; external HTTPS queried with Python once returned 403. Use the verified local endpoint. Core21's own phase correction `+14` had already been part of its established history, not a change made during recovery.

### E. What the clocks showed after carrier restoration

Initial post-recovery near-sequential comparison, both day count 35:

| Sample | Core20 phase | Core21 phase | Core21 minus Core20 |
|---|---:|---:|---:|
| 1 | 113484 | 130287 | +16803 |
| 2 | 113485 | 130288 | +16803 |
| 3 | 113487 | 130288 | +16801 |

The difference was approximately 16803 **A8 phase states**, stable to sequential-read jitter. This was a *clock-position* error, not a demonstrated rate error. CE already offered **A/B CLOCK ADJUST · AFTER RATE STABILIZATION**, with incremental `AMOUNT · A8 SECONDS` and `ADVANCE CLOCK` / `RETARD CLOCK` controls. Existing `adjustmentStates=-678`; historic Meridian-0 `89634 + (-169) = 89465`; rate numerator `696240371506508163006955635571019774400000000` / denominator `2241158246297961225114074824516769512591423`. The operator advanced **16795** A8 states, intentionally retaining the established ~8-state prior residual. CE then showed `adjustmentStates=+16117`, `wheelSequence=3`, `referenceAnchor phase=114687`, `effectiveAnchor phase=130804` (identity `114687+16117=130804`). Meridian0 and rate unchanged. Post-check: three Core21 − Core20 readings were all **+7** (both day35, 130925 vs 130918). This is consistent with established residual, **not evidence of long-term pace stability**. Leave adjustment unless subsequent long-window measurements prove drift.

## 4. Exact cutover evidence and mathematics

The **only** shared segment seal, generated once on Trade by `trade_prepare.py --capture`, was:

```
schema             A8-AB-PHYSICAL-SEGMENT5-SEAL-V1
sourceEpoch        9
segment            5
physicalAnchorRaw  337001
anchorSequence     11471286
oldPhysicalRaw     18399059
oldSequence        11264085
core22RawAtSeam    436773
mode               OBSERVED_RESET_GENERATION_NO_OUTAGE_ELAPSED_INFERENCE
```

Seal SHA256 `dc68e388e831a9c23d1355d183de6cd46e1648038bcc1da8893c8f1539773581`. Shared with Pi unchanged; no separate Pi seam invented.

**Physical coordinate** `P` continues from the observed new segment anchor `337001`.

**Pi disciplined coordinate** for segment 5 (exact rational, not floating point):

```
Q = 877018067214063868 / 877155239030163555
D_seam = (18399059 - 441369) * Q
       = 3149843715085864516348984 / 175431047806032711
D5(P) = D_seam + (P - 337001) * Q
```

**Trade continuous logical carrier coordinate** as implemented in the recovered package:

```
L5(P) = 18399059 + (P - 337001)
```

Only new observed pulses advance it. **Do not infer unseen outage progression**. The Jovian baseline `30466` is preserved, not recomputed from host time. Core22 keeps the logical birth identity:

```
R22(P) = L5(P) - 17962286
       = 436773 + (P - 337001)
```

The new physical segment is neither a new Jovian recurrence nor a new Core20 Meridian anchor. In particular, physical reset within epoch9 does not mean source epoch10, a new astronomical position, or resetting Core22 RAW to zero.

## 5. Chronology: exact commands and observed outcomes

1. **Collect references and dry runs.** The operator transferred `trade_prepare.py`, `trade_install.py`, `cache_v2.py`, `live-jovian-segment5.js`, `ab_intake_segment5.py` to `/home/greg/` on Trade and `pi_install.py` to `/home/pi/` on Pi. Cutover package `a8-segment5-recovery.zip` held these seven documented files (including README). Captured seal once with `python3 /home/greg/trade_prepare.py --capture`, then copied the resulting exact seal to Pi.
2. **Pi dry run passed**, then `sudo python3 /home/pi/pi_install.py /home/pi/a8-segment5-seal.json --apply` wrote the segment5 JSON and backed up the old. **Post-install health failed HTTP 503**: `[Errno 13] Permission denied: '/opt/a8-pulse-box/ab-carrier-discipline.json'`. Actual mode was `-rw------- 600 root:root`, and the Pi service could not read it. Operator performed guarded `chown root:root; chmod 644` under content-SHA guard; content unchanged. Pi `/health` became `READY` HTTP 200, physical `358936`, sequence `11484779`, `disciplinedRaw.floorRaw=17976813`, segment5. **CAUTION: `root:root 644` was emergency read access, not compliance with `greg` ownership requirement.**
3. **Trade dry run:** `sudo python3 /home/greg/trade_install.py /home/greg/a8-segment5-seal.json` → `PASS · SAME SEAM ON PI AND TRADE: 337001`, `PASS · Historical checkpoints and original program hashes`, `DRY RUN`.
4. **Trade apply:** same command with `--apply` → `FEEDER HELD; CORE20 NOT STOPPED`; backups created at exact paths in section 2; `PASS · CACHE, JOVIAN, CORE22; FEEDER START REQUESTED`. Installer manipulates services and checkpoint but does not edit original Core22 birth or the six-reference wheel, and does not change Core21. This is a **multi-host, non-atomic cutover**: a failed intermediate state requires inspection, not blind rerun.
5. **Verify actual progression:** direct physical `370216→370323` (+107), Pi discipline `17988099→17988205` (+106), logical cache `18432277→18432380` (+103), Jovian physical `18432281→18432388` (+107), Core20 internal RAW `29597551511→29597582577` (+31066), Core22 `469991→470094` (+103). Differing increments reflect independent sequential polling and different coordinate rates. Core20 clock running; Core22 `OBSERVING`, clock `NOT_INITIALIZED`.
6. **CE phase recovery:** Core20 behind Core21 ~16803 A8 states; existing CE current adjustment `−678`. Operator used incremental ADVANCE **16795** → accumulated adjustment `+16117`, meridian0 fixed. Three post-action comparisons all +7 Core21 − Core20. No rate/gearbox change.
7. **Site verification:** Operator observed Calendar, Moons, Europa all working. Shadow inspection and Core22 RAW were working; **only main Shadow Primary A→B RAW** was blank.
8. **Shadow 503 diagnosis:** main page `updatePrimary()` fetched `/api/shadow/jovian`, served by `/opt/a8-shadow-core/server.js` via Caddy `127.0.0.1:18024`. Shadow's `/opt/a8-shadow-core/jovian-engine.js` line180 rejected same-epoch physical RAW regression: `SHADOW_JOVIAN_REFRESH_FAILED` / `physical raw count moved backward inside source epoch`. This engine is an independent legacy **observer**; failure did not indicate current physical feed failure. Actual Pi/Trade/Jovian systems still healthy.
9. **Shadow-only repair:** reuse `/api/shadow/comparison` (existing local `:18024` endpoint) returning `physical555: {sourceEpoch,rawCount,reportSequence,status}` straight from Pi reporter `28788`. In `/srv/sites/shadow.cosigo.io/public/index.html`, inside `updatePrimary()` only, change `getJson('/api/shadow/jovian')` to `getJson('/api/shadow/comparison')` and `d.physical || {}` to `d.physical555 || {}`. Original SHA guard verified, backup created, final SHA `694544cae2cb305e6f193597cd2f5dd60baeab77b354a7fc34418351b5d26747`. Physical RAW `450128→450139` and browser operator confirmed **success**. `inspection.html`, Jovian engine, Caddy, all cores unchanged.

## 6. **NEW CRITICAL INCIDENT LESSON — `greg` ownership vs root-created runtime files**

**User governance correction:** All A8 operational applications, configuration, state, and their service access are intended to be **owned/operated by `greg`; nothing operational should be left root-owned**. This is stronger than merely making a root-owned file world-readable. Applying privileged system packages or managing systemd may still require a narrowly scoped administrator action, but **privilege to install is not the identity under which A8 state is owned or services run**.

### Observed defect #1: Pi install hardcoded `0600` while invoked under `sudo`

The actual distributed `pi_install.py` contains:

```python
fd,tmp=tempfile.mkstemp(prefix='.a8-s5-',dir=str(p.parent))
with os.fdopen(fd,'wb') as f:
    os.fchmod(f.fileno(),0o600)
    f.write(b)
os.replace(tmp,p)
```

Because it was run with `sudo`, the replacement file became `root:root` mode `600`. This blocked the Pi stream service from loading discipline and produced the verified 503 permission failure. The emergency `chmod 644` made it readable and restored health but left `root:root`, which **violates the intended ownership**. Also the backup was made with the same `atomic()` helper, so audit the backup's owner/mode too. **Do not change a working Pi config's ownership blindly**: first verify whether `greg` exists on Pi, whether service `User=` actually equals `greg`, and access of all path components.

### Observed code risk #2: Trade installer uses root and preserves / creates multiple owners

The distributed `trade_install.py` enforces `ROOT REQUIRED FOR APPLY`, stops/starts system services, uses existing dest ownership to install executable files, chowns its cache directory to `greg`, but **does not uniformly set `greg` on every created state file**. It creates `/var/lib/a8-primary-stream-cache/segment5-install-receipt.json` as the installer identity; copies the segment seal with inherited input file metadata; writes the checkpoint temporary with `os.chmod(tmp,0o600)` and the *previous checkpoint owner*; and creates its second `/var/lib/a8-core22/segment5-seal.json` without an explicit `greg` owner. Actual installed post-recovery ownership and Core22 service account **have not yet been audited**. This is a risk inventory, *not proof that every listed file is root-owned*.

### Minimum ownership/access audit, **read-only first**

On each host, establish `getent passwd greg`, `id greg`, and `systemctl show SERVICE -p User -p Group -p DynamicUser -p SupplementaryGroups`. For each exact path use `stat -c '%U:%G %a %n' FILE`, `namei -l FILE` (directory traverse), and test file readability as actual service identity (`sudo -u USER test -r FILE` only where allowed). Check writable state dir ownership and atomic rename permission separately (`test -w` of directory). Inspect `systemctl cat` before any migration. Record current hashes before and after any **separately authorized** ownership-only change; do not run installer again. For the Pi, confirm whether `greg` has been provisioned: current interactive `pi` account does not prove `greg` is absent or present.

### Correct design for future installer / CE actuation

1. Configuration owner and group must be explicit (`greg:greg`) on **new files, backup files, journals, lockfiles, seal receipts, checkpoint files, and parent writable dirs** *where architecture confirms this owner*. Restrict permissions to owner / designated group, e.g. `0640` with verified group access, or `0600` **only if the service's effective UID is owner**. Never use `0644` as the normal workaround to a UID mismatch.
2. The installer must fail its dry run if its `User=`/`Group=`/directory owner prerequisites do not match the approved policy. Root-invoked privileged orchestration should use a small controlled helper and explicit `fchown`/`fchmod` **before atomic rename**; the actual runtime remains unprivileged `greg`.
3. Verify access as the service UID *and* `/health` before releasing feeder. `READY` and content SHA must both pass. Check all staged artifacts and rollback backups, not just the main file.
4. CE ownership audit must be read-only until an approved one-time identity/migration plan is prepared and services' live access is proved. No bulk recursive chown, no blind `chown -R`, no reboot/restart as a permissions test.
5. Record separately `expectedOwner`, `actualOwner`, `serviceUID`, `accessReadable`, `configMode`, `writableStateDir`, `fileHash`, `reloadBehavior`, and `ownershipCompliant`; **never mark ownership compliant merely because HTTP 200**.

## 7. CE control design: evidence, approvals, no magic green lights

### Proposed read-only CE Recovery dashboard

- **A/B Physical:** reporter `28788`, epoch9, segment5 (seam certificate), actual RAW and report sequence, two-sample delta; direct freshness.
- **Pi Gearbox:** `28789/health` HTTP status, disciplined exact rational/floor, physical anchor337001, segment5, rate ratio exact, SHA of discipline config, **config owner/mode and effective service identity**.
- **Trade cache:** `/state` `streamConnected`, errors, physical-input progression, logical-cache progression; flag `200 + ACTIVE but stale` and any invalid snapshot.
- **Jovian:** `18028/state`, status `JOVIAN_PERIOD_LIVE`, fixed baseline30466, no source regression, no reanchor; Jovian recurrence is not a transport odometer.
- **Core20 feeder:** feeder process active **and** last successful accepted sample, monotonic source and disciplined RAW, consumer advancement, engine clock and phase as separate metrics.
- **Core21:** read-only `18032/api/core21/status`, independent C/D reference; no A/B recovery actuation here.
- **Core22:** `18034/api/core22/status`, `intakeStatus OBSERVING`, `continuity OBSERVING`, `core22Raw`, preserved birth relation, **clockStatus NOT_INITIALIZED** distinctly shown; do not mislabel as clock qualified.
- **Shadow:** main page primary physical RAW from comparison API (can succeed while the separate `/api/shadow/jovian` remains 503). Inspection and main card health are separate.
- **Ownership:** service UID/GID, each live config owner/mode, file accessibility, receipt/checkpoint owner, and approved `greg` standard; show *non-compliant* where applicable, not a silent auto-fix.
- **Evidence:** captured seal SHA, backups, source program hashes, segment and sequence, operator and action receipt, before/after observations. Never overwrite historic seals.

### Proposed controlled CE workflow

1. **Observe**, at least two ordered fresh samples. Identify actual reset in physical generation and historical last **accepted** coordinates. Read all service identities and filesystem ownership.
2. **Qualify**, preserve immutable history, exact original ratio, same physical seam and source epoch, last Core22 checkpoint, Jovian baseline. Verify no unseen interval is fabricated. State explicitly which consumer is held and why.
3. **Prepare**, one shared segment seal and dry-run both hosts with file SHA + permission/access checks as intended service accounts; maintain explicit approval boundary.
4. **Cutover**, Pi exact disciplined segment first; require health and permissions correct. Hold Core20 feeder only; Trade cache → Jovian → Core22 intake qualified → feeder release. Record intermediate success/failure. Non-atomic; fail closed and don't repeat blindly.
5. **Verify**, two or more actual advancing observations at every boundary. Validate Core22 birth identity, Core20 internal RAW, holdover clearing, public pages. Confirm Core21 remained independent.
6. **Position align**, only *after* pace stabilizes and under CE existing `ADVANCE CLOCK / RETARD CLOCK` mechanism. Compare both `DAY_COUNT` and `DAY_PHASE17` with close-bracket reads. Explicitly distinguish incremental AMOUNT from accumulated adjustment and preserve Meridian0 `−169` separately. No rate retune.
7. **Close**, collect receipts and operator confirmation. Track independent issues (Shadow Jovian 503, ownership migration, extended drift check, Core22 clock qualification) instead of pretending all are resolved.

### Safe-state and prohibited CE actions

No auto reanchor; no resetting Jovian phase on physical carrier reset; no SOURCE_EPOCH increment merely because segment changed; no rate trim during position recovery; no rewriting Arduino RAW; no host-clock gap fill; no Core21 handoff; no unqualified consumer restart; no automatic `chmod 644` or `chown -R`; no exposing a raw `--apply` without an explicit health/identity preflight and rollback receipt. CE acts at the existing approved control boundary, not by duplicating its controls with ad hoc alternate software.

## 8. Known remaining tasks (not disguised as recovery failures)

1. **Ownership normalization to `greg`: OPEN.** Pi segment5 config observed `root:root 644`; root owner remains. Audit Pi runtime user and presence of `greg`; audit Trade newly created receipts/segment seals/Core22 checkpoint ownership. Migration requires separate guarded plan, no blind edits while running.
2. **Shadow Jovian historical observer endpoint: OPEN.** `/api/shadow/jovian` returned 503 `SHADOW_JOVIAN_REFRESH_FAILED`; `/opt/a8-shadow-core/jovian-engine.js:180` regression guard untouched. The main physical RAW card has been repaired via comparison API; do **not** remove guard. If this legacy observer is needed, introduce an explicitly qualified segment-aware transport adapter/contract separately without resetting Jovian authority.
3. **Extended Core20 vs Core21 drift check: OPEN.** Three comparisons showing +7 A8 states are a point-in-time position validation, not long-duration rate proof.
4. **Core22 native clock qualification: OPEN.** Its carrier was restored, but status remains `NOT_INITIALIZED`; six-reference wheel is still reference only. Do not claim takeover readiness.
5. **Site verification:** calendar/moons/europa behavior and Shadow browser success are operator-observed; no independent automated end-to-end browser test or deployment-system audit was performed.
6. **CE implementation:** proposal, not installed. Preserve CE as canonical control surface; don't build alternate control paths.

## 9. Read-only command appendix

**Trade, point-in-time checks:**

```bash
for endpoint in 28788/snapshot 28789/health 28790/state 18028/state 18020/api/core20/clock 18032/api/core21/status 18034/api/core22/status 18024/api/shadow/comparison; do
  printf '\n=== %s ===\n' "$endpoint"
  curl -sS --max-time 5 -w '\nHTTP %{http_code}\n' "http://127.0.0.1:$endpoint" | head -c 800
  printf '\n'
done
```

**Trade ownership audit (no mutations):**

```bash
getent passwd greg
for svc in a8-primary-stream-cache a8-jovian-live-period a8-core22-intake a8-core20-external-physical a8-shadow-core a8-ce-core20-control; do
  systemctl show "$svc.service" -p User -p Group -p DynamicUser --no-pager
done
for p in /var/lib/a8-primary-stream-cache/segment5-seal.json /var/lib/a8-primary-stream-cache/segment5-install-receipt.json /var/lib/a8-core22/segment5-seal.json /var/lib/a8-core22/intake-checkpoint-v1.json /usr/local/sbin/a8-primary-stream-cache.py /opt/a8-core22/ab_intake.py; do
  test -e "$p" && stat -c '%U:%G %a %n' "$p"
done
```

**Pi ownership audit (no mutations):**

```bash
getent passwd greg || true
systemctl show a8-pulse-box-stream.service -p User -p Group -p DynamicUser --no-pager
stat -c '%U:%G %a %n' /opt/a8-pulse-box/ab-carrier-discipline.json
namei -l /opt/a8-pulse-box/ab-carrier-discipline.json
curl -sS --max-time 5 -w '\nHTTP %{http_code}\n' http://127.0.0.1:8789/health
```

Do not treat these snippets as an automatic maintenance routine. Do not use `--apply` or restart any services during an evidence-only audit.

## 10. Evidence sources / limitations

Prepared from the verified session console output, canonical source snippets, supplied incident artifacts (`a8-segment5-recovery.zip`, `a8-segment5-seal.json`, `A8_AB_carrier_CE_runbook_2026-10-17.md`, original Core20/Jovian/PI/Core22 code extracts), the Shadow repair transcript and explicit user confirmation. The recovery installer files were read directly from the provided ZIP, including ownership/permission operations. Pre/post service and browser results are operator-provided, not independently re-run from this document. Some hashes identify original files; **do not expect the pre-recovery SHA to match the currently installed updated program**. The owner/mode of Trade-generated files and the current Pi service user are **unknown until audited**.
