'use strict';

const fs =
  require('fs');

const http =
  require('http');

const MODEL_PATH =
  '/opt/a8-jovian-live/model.json';

const STATE_PATH =
  '/var/lib/a8-jovian-live/baseline.json';

const SOURCE_URL =
  'http://127.0.0.1:28788/snapshot';

const HOST =
  '127.0.0.1';

const PORT =
  18028;

const POLL_MS =
  250;

const Q32 =
  1n << 32n;

const TURN_STATES =
  512n;

const TURN_Q32 =
  TURN_STATES * Q32;

const model =
  JSON.parse(
    fs.readFileSync(
      MODEL_PATH,
      'utf8'
    )
  );

if (
  model.schema !==
    'A8-LIVE-JOVIAN-PERIOD-SEED-V1' ||
  model.status !== 'READY'
) {
  throw new Error(
    'LIVE JOVIAN MODEL INVALID'
  );
}

const AUTHORITY_PATH =
  '/etc/a8-core20/jovian-authority.json';

const NATURAL_PERIODS =
  Object.freeze({
    IO: 4650745n,
    EUROPA: 9344598n,
    GANYMEDE: 18866420n,
    CALLISTO: 44245909n,
  });

const laneDefs = {
  io: {
    label: 'IO',
    periodRaw: NATURAL_PERIODS.IO,
  },

  europa: {
    label: 'EUROPA',
    periodRaw: NATURAL_PERIODS.EUROPA,
  },

  ganymede: {
    label: 'GANYMEDE',
    periodRaw: NATURAL_PERIODS.GANYMEDE,
  },

  callisto: {
    label: 'CALLISTO',
    periodRaw: NATURAL_PERIODS.CALLISTO,
  },
};

function readAuthoritySelection() {
  const a =
    JSON.parse(
      fs.readFileSync(
        AUTHORITY_PATH,
        'utf8'
      )
    );

  if (
    a.schema !==
    'A8-JOVIAN-AUTHORITY-SELECTION-V1'
  ) {
    throw new Error(
      'JOVIAN_AUTHORITY_SCHEMA_MISMATCH'
    );
  }

  const body =
    String(
      a.selectedAuthority || ''
    ).toUpperCase();

  if (
    body !== 'IO' &&
    body !== 'EUROPA' &&
    body !== 'GANYMEDE'
  ) {
    throw new Error(
      'JOVIAN_AUTHORITY_NOT_SELECTABLE'
    );
  }

  const periodRaw =
    NATURAL_PERIODS[body];

  if (
    BigInt(a.selectedPeriodRaw) !==
    periodRaw
  ) {
    throw new Error(
      'JOVIAN_AUTHORITY_PERIOD_MISMATCH'
    );
  }

  return {
    body,
    periodRaw,
  };
}

let activeEpoch =
  null;

let baselineRaw =
  null;

let currentRaw =
  null;

let reportSequence =
  null;

let lastError =
  null;

let busy =
  false;

let persisted =
  null;

let pulsePrimed =
  false;

let lastPulseTotals =
  {};

let lastPulse =
  null;

let state = {
  ok: false,
  status: 'STARTING',
};

function getJson(url) {
  return new Promise(
    (resolve, reject) => {
      const req =
        http.get(
          url,
          res => {
            let body = '';

            res.setEncoding(
              'utf8'
            );

            res.on(
              'data',
              chunk => {
                body += chunk;
              }
            );

            res.on(
              'end',
              () => {
                if (
                  res.statusCode < 200 ||
                  res.statusCode >= 300
                ) {
                  reject(
                    new Error(
                      `HTTP_${res.statusCode}`
                    )
                  );
                  return;
                }

                try {
                  resolve(
                    JSON.parse(body)
                  );
                } catch (err) {
                  reject(
                    new Error(
                      'INVALID_SOURCE_JSON'
                    )
                  );
                }
              }
            );
          }
        );

      req.setTimeout(
        2000,
        () => {
          req.destroy(
            new Error(
              'SOURCE_TIMEOUT'
            )
          );
        }
      );

      req.on(
        'error',
        reject
      );
    }
  );
}

function loadPersisted() {
  try {
    const x =
      JSON.parse(
        fs.readFileSync(
          STATE_PATH,
          'utf8'
        )
      );

    if (
      x.schema !==
      'A8-LIVE-JOVIAN-BASELINE-V1'
    ) {
      return null;
    }

    return x;
  } catch {
    return null;
  }
}

function persistBaseline() {
  const tmp =
    STATE_PATH + '.tmp';

  const out = {
    schema:
      'A8-LIVE-JOVIAN-BASELINE-V1',

    sourceEpoch:
      activeEpoch,

    baselineRaw:
      baselineRaw.toString(),

    crossEpochContinuity:
      false,

    outageElapsedInferred:
      false,
  };

  fs.writeFileSync(
    tmp,
    JSON.stringify(
      out,
      null,
      2
    ) + '\n'
  );

  fs.renameSync(
    tmp,
    STATE_PATH
  );
}

function ceilDiv(a, b) {
  return (
    a + b - 1n
  ) / b;
}

function octal9(n) {
  return Number(n)
    .toString(8)
    .padStart(3, '0') +
    '₈';
}

function laneState(
  name,
  deltaRaw
) {
  const def =
    laneDefs[name];

  const periodRaw =
    def.periodRaw;

  const scaledStatesNumerator =
    deltaRaw *
    TURN_STATES;

  const pulseTotal =
    scaledStatesNumerator /
    periodRaw;

  const phaseQ32 =
    (
      scaledStatesNumerator *
      Q32 /
      periodRaw
    ) %
    TURN_Q32;

  const phase9 =
    phaseQ32 /
    Q32;

  const phaseExactNumerator =
    scaledStatesNumerator %
    (
      TURN_STATES *
      periodRaw
    );

  return {
    body:
      def.label,

    naturalPeriodRaw:
      periodRaw.toString(),

    seedFullOrbitRaw:
      periodRaw.toString(),

    liveDriverFullOrbitRaw:
      periodRaw.toString(),

    rawPerPhaseStateExact:
      periodRaw.toString() +
      '/' +
      TURN_STATES.toString(),

    statePulseTotal:
      pulseTotal.toString(),

    phase9:
      Number(phase9),

    phase9Octal:
      octal9(
        phase9
      ),

    phaseQ32:
      phaseQ32.toString(),

    phase512Exact: {
      numerator:
        phaseExactNumerator.toString(),

      denominator:
        periodRaw.toString(),
    },
  };
}

function buildState() {
  if (
    activeEpoch === null ||
    baselineRaw === null ||
    currentRaw === null
  ) {
    return {
      ok: false,
      status: 'WAITING_FOR_PHYSICAL_SOURCE',
      lastError,
    };
  }

  const deltaRaw =
    currentRaw -
    baselineRaw;

  const authority =
    readAuthoritySelection();

  const lanes = {
    io:
      laneState(
        'io',
        deltaRaw
      ),

    europa:
      laneState(
        'europa',
        deltaRaw
      ),

    ganymede:
      laneState(
        'ganymede',
        deltaRaw
      ),

    callisto:
      laneState(
        'callisto',
        deltaRaw
      ),
  };

  for (
    const lane
    of Object.values(lanes)
  ) {
    lane.role =
      lane.body === authority.body
        ? 'SELECTED_AUTHORITY'
        : 'WITNESS';
  }

  return {
    ok: true,

    schema:
      'A8-LIVE-JOVIAN-PERIOD-DRIVER-V2',

    status:
      'JOVIAN_PERIOD_LIVE',

    role:
      'JUPITER_LIVE_PERIOD_DRIVER',

    driverConnection:
      'OPERATIONAL_JOVIAN_AUTHORITY_NO_CORE_WRITE',

    qualification: {
      periodModel:
        'INDEPENDENT_NATURAL_RECURRENCES',

      observationallyReacquired:
        false,

      absoluteMoonPhaseQualified:
        false,

      orientationRole:
        'NONE',

      predictedTurnsCountAsNatureEvidence:
        false,

      operationallyQualified:
        true,

      operationalRulerLocked:
        true,

      operationalRulerRaw:
        authority.periodRaw.toString(),

      operationalAuthorityBody:
        authority.body,

      newTurnWindowRequiredForOperation:
        false,

      newTurnWindowRole:
        'INDEPENDENT_VALIDATION_ONLY',

      contradictionPolicy:
        'FLAG_ONLY_NO_SILENT_RETUNE',

      recovery842Role:
        'PRESERVED_PROOF_RECOVERY_PATH_NOT_OPERATIONAL_GATE',
    },

    authority: {
      selectedBody:
        authority.body,

      selectedPeriodRaw:
        authority.periodRaw.toString(),

      selectionSource:
        'CE_JOVIAN_AUTHORITY_STATE',

      selectableBodies: [
        'IO',
        'EUROPA',
        'GANYMEDE',
      ],

      callistoRole:
        'WITNESS_ONLY',
    },

    physical: {
      sourceEpoch:
        activeEpoch,

      baselineRaw:
        baselineRaw.toString(),

      currentRaw:
        currentRaw.toString(),

      epochRawAdvance:
        deltaRaw.toString(),

      reportSequence:
        reportSequence,

      progression:
        'PHYSICAL_RAW_DELTA_ONLY',
    },

    resonance: {
      normalization:
        'NONE',

      resonantAuthoritySet:
        'IO / EUROPA / GANYMEDE',

      relationship:
        'NATURAL_1_2_4_RESONANT_FAMILY',

      phaseOrigin:
        'CURRENT_SOURCE_EPOCH_BASELINE_ONLY',

      outageElapsedInferred:
        false,
    },

    naturalPeriodsRaw: {
      IO:
        NATURAL_PERIODS.IO.toString(),

      EUROPA:
        NATURAL_PERIODS.EUROPA.toString(),

      GANYMEDE:
        NATURAL_PERIODS.GANYMEDE.toString(),

      CALLISTO:
        NATURAL_PERIODS.CALLISTO.toString(),
    },

    developmentHistory: {
      priorNormalizedRulerRaw:
        '18719532',

      priorMethod:
        'ARITHMETIC_MEAN_OF_NORMALIZED_IO4_EUROPA2_GANYMEDE1',

      status:
        'DORMANT_DEVELOPMENT_EVIDENCE',
    },

    lanes,

    pulse: {
      type:
        'A8_1_OF_512_PHASE_STATE_CROSSING',

      lastPulse,
    },

    safety: {
      writesCore20:
        false,

      writesArduino:
        false,

      writesShadowWitnessRecorder:
        false,

      usesUTCForProgression:
        false,

      usesHostTimeForProgression:
        false,

      hostSchedulerAffectsPhase:
        false,

      sourceEpochChangeForcesRearm:
        true,

      crossEpochRawContinuity:
        false,
    },

    provenance: {
      sourceModelSha256:
        model
          .sourceModel
          .sha256,

      sourceModelEpoch:
        model
          .sourceModel
          .sourceEpoch,
    },

    lastError,
  };
}

function primePulseTotals(
  snapshot
) {
  for (
    const name
    of Object.keys(laneDefs)
  ) {
    lastPulseTotals[name] =
      BigInt(
        snapshot
          .lanes[name]
          .statePulseTotal
      );
  }

  pulsePrimed =
    true;
}

function emitNewPulses(
  snapshot
) {
  if (!pulsePrimed) {
    primePulseTotals(
      snapshot
    );
    return;
  }

  for (
    const name
    of Object.keys(laneDefs)
  ) {
    const currentTotal =
      BigInt(
        snapshot
          .lanes[name]
          .statePulseTotal
      );

    const prior =
      lastPulseTotals[name];

    if (
      prior !== undefined &&
      currentTotal > prior
    ) {
      const periodRaw =
        laneDefs[name]
          .periodRaw;

      for (
        let k = prior + 1n;
        k <= currentTotal;
        k += 1n
      ) {
        const crossingRaw =
          baselineRaw +
          ceilDiv(
            k * periodRaw,
            TURN_STATES
          );

        const phase9 =
          k %
          TURN_STATES;

        lastPulse = {
          body:
            laneDefs[name].label,

          event:
            'PHASE_STATE',

          sourceEpoch:
            activeEpoch,

          phase9:
            Number(phase9),

          phase9Octal:
            octal9(
              phase9
            ),

          predictedCrossingRaw:
            crossingRaw.toString(),

          natureObservation:
            false,
        };

        console.log(
          'A8 JOVIAN PULSE · ' +
          JSON.stringify(lastPulse)
        );
      }
    }

    lastPulseTotals[name] =
      currentTotal;
  }
}

function rearm(
  epoch,
  raw
) {
  activeEpoch =
    epoch;

  baselineRaw =
    raw;

  currentRaw =
    raw;

  lastPulseTotals =
    {};

  pulsePrimed =
    false;

  lastPulse =
    null;

  persistBaseline();

  console.log(
    'A8 JOVIAN REARM · ' +
    JSON.stringify({
      sourceEpoch:
        activeEpoch,

      baselineRaw:
        baselineRaw.toString(),

      manufacturedContinuity:
        false,
    })
  );
}

function initializeEpoch(
  epoch,
  raw
) {
  if (
    persisted &&
    Number(
      persisted.sourceEpoch
    ) === epoch
  ) {
    const saved =
      BigInt(
        persisted.baselineRaw
      );

    if (raw >= saved) {
      activeEpoch =
        epoch;

      baselineRaw =
        saved;

      currentRaw =
        raw;

      console.log(
        'A8 JOVIAN BASELINE RESTORED · ' +
        JSON.stringify({
          sourceEpoch:
            activeEpoch,

          baselineRaw:
            baselineRaw.toString(),
        })
      );

      return;
    }
  }

  rearm(
    epoch,
    raw
  );
}

async function poll() {
  if (busy) {
    return;
  }

  busy =
    true;

  try {
    const p =
      await getJson(
        SOURCE_URL
      );

    if (
      p.STATUS !== 'ACTIVE'
    ) {
      throw new Error(
        'PHYSICAL_SOURCE_NOT_ACTIVE'
      );
    }

    const epoch =
      Number(
        p.SOURCE_EPOCH
      );

    const raw =
      BigInt(
        String(
          p.RAW_COUNT
        )
      );

    if (
      !Number.isSafeInteger(epoch) ||
      epoch < 1
    ) {
      throw new Error(
        'INVALID_SOURCE_EPOCH'
      );
    }

    if (
      activeEpoch === null
    ) {
      initializeEpoch(
        epoch,
        raw
      );
    } else if (
      epoch !== activeEpoch
    ) {
      rearm(
        epoch,
        raw
      );
    } else if (
      currentRaw !== null &&
      raw < currentRaw
    ) {
      throw new Error(
        'RAW_REGRESSION_WITHIN_SOURCE_EPOCH'
      );
    } else {
      currentRaw =
        raw;
    }

    reportSequence =
      p.REPORT_SEQUENCE;

    lastError =
      null;

    let next =
      buildState();

    emitNewPulses(
      next
    );

    /*
     * lastPulse may have changed while
     * emitting crossings.
     */
    next =
      buildState();

    state =
      next;

  } catch (err) {
    lastError =
      String(
        err &&
        err.message
          ? err.message
          : err
      );

    state = {
      ...buildState(),

      ok:
        false,

      status:
        'HOLDOVER_NO_LIVE_CARRIER',

      lastError,
    };
  } finally {
    busy =
      false;
  }
}

persisted =
  loadPersisted();

const server =
  http.createServer(
    (req, res) => {
      const url =
        new URL(
          req.url,
          `http://${HOST}:${PORT}`
        );

      if (
        req.method !== 'GET'
      ) {
        res.writeHead(
          405,
          {
            'Content-Type':
              'application/json',
          }
        );

        res.end(
          JSON.stringify({
            ok: false,
            error:
              'METHOD_NOT_ALLOWED',
          }) + '\n'
        );

        return;
      }

      if (
        url.pathname === '/state' ||
        url.pathname === '/health'
      ) {
        const body =
          JSON.stringify(
            state,
            null,
            2
          ) + '\n';

        res.writeHead(
          state.ok ? 200 : 503,
          {
            'Content-Type':
              'application/json; charset=utf-8',

            'Cache-Control':
              'no-store',

            'Content-Length':
              Buffer.byteLength(
                body
              ),
          }
        );

        res.end(
          body
        );

        return;
      }

      res.writeHead(
        404,
        {
          'Content-Type':
            'application/json',
        }
      );

      res.end(
        JSON.stringify({
          ok: false,
          error: 'NOT_FOUND',
        }) + '\n'
      );
    }
  );

server.listen(
  PORT,
  HOST,
  () => {
    console.log(
      'A8 LIVE JOVIAN PERIOD DRIVER · ' +
      `${HOST}:${PORT}`
    );

    console.log(
      'PERIOD SOURCE · INDEPENDENT NATURAL JOVIAN RECURRENCES'
    );

    console.log(
      'PACE SOURCE · PHYSICAL RAW DELTA ONLY'
    );

    console.log(
      'CORE20 WRITES · NO'
    );
  }
);

poll();

setInterval(
  poll,
  POLL_MS
);

function shutdown() {
  server.close(
    () => process.exit(0)
  );
}

process.on(
  'SIGTERM',
  shutdown
);

process.on(
  'SIGINT',
  shutdown
);
