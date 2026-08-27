'use strict';

const LEGACY_DEGREES_PER_TURN = 360;
const A8_ANGLE_UNITS_PER_TURN = 512;

// Exact rational scale factors.
const LEGACY_DEG_TO_A8_NUM = 64;
const LEGACY_DEG_TO_A8_DEN = 45;
const A8_TO_LEGACY_DEG_NUM = 45;
const A8_TO_LEGACY_DEG_DEN = 64;

function legacyDegreesToA8Units(degrees) {
  const v = Number(degrees);
  if (!Number.isFinite(v)) return NaN;
  return v * LEGACY_DEG_TO_A8_NUM / LEGACY_DEG_TO_A8_DEN;
}

function a8UnitsToLegacyDegrees(a8) {
  const v = Number(a8);
  if (!Number.isFinite(v)) return NaN;
  return v * A8_TO_LEGACY_DEG_NUM / A8_TO_LEGACY_DEG_DEN;
}

function normalizeA8Turn(a8) {
  const v = Number(a8);
  if (!Number.isFinite(v)) return NaN;
  return ((v % A8_ANGLE_UNITS_PER_TURN) + A8_ANGLE_UNITS_PER_TURN) % A8_ANGLE_UNITS_PER_TURN;
}

function normalizeLegacyTurn(degrees) {
  const v = Number(degrees);
  if (!Number.isFinite(v)) return NaN;
  return ((v % LEGACY_DEGREES_PER_TURN) + LEGACY_DEGREES_PER_TURN) % LEGACY_DEGREES_PER_TURN;
}

function toOctalFraction(value, fractionalDigits = 9, { wrapTurn = false } = {}) {
  let v = Number(value);
  if (!Number.isFinite(v)) return '—';
  if (wrapTurn) v = normalizeA8Turn(v);

  const sign = v < 0 ? '-' : '';
  v = Math.abs(v);

  let whole = Math.floor(v + 1e-14);
  let frac = v - whole;

  let digits = '';
  for (let i = 0; i < fractionalDigits; i++) {
    frac *= 8;
    let d = Math.floor(frac + 1e-13);
    if (d > 7) d = 7;
    digits += String(d);
    frac -= d;
  }

  // Always show at least 3 octal whole digits for within-turn A8 angles.
  let wholeOct = whole.toString(8);
  if (whole < 512) wholeOct = wholeOct.padStart(3, '0');

  return sign + wholeOct + (fractionalDigits ? '.' + digits : '') + '₈';
}

function formatA8AngleFromLegacy(degrees, fractionalOctalDigits = 9) {
  const a8 = legacyDegreesToA8Units(degrees);
  if (!Number.isFinite(a8)) return null;
  const normalized = normalizeA8Turn(a8);
  return {
    sourceLegacyDegrees: Number(degrees),
    a8Units: a8,
    a8WithinTurn: normalized,
    a8Octal: toOctalFraction(a8, fractionalOctalDigits, { wrapTurn: false }),
    a8OctalWithinTurn: toOctalFraction(normalized, fractionalOctalDigits, { wrapTurn: false }),
    scaleExact: '64/45',
    inverseScaleExact: '45/64',
  };
}


function arcLengthFromA8Angle(radius, a8AngleUnits) {
  const r = Number(radius);
  const theta = Number(a8AngleUnits);
  if (!Number.isFinite(r) || !Number.isFinite(theta)) return NaN;
  return (theta / A8_ANGLE_UNITS_PER_TURN) * (2 * Math.PI * r);
}

function radiusFromA8ArcLength(arcLength, a8AngleUnits) {
  const s = Number(arcLength);
  const theta = Number(a8AngleUnits);
  if (!Number.isFinite(s) || !Number.isFinite(theta) || theta === 0) return NaN;
  return (s * A8_ANGLE_UNITS_PER_TURN) / (2 * Math.PI * theta);
}

function circumferenceFromRadius(radius) {
  const r = Number(radius);
  return Number.isFinite(r) ? 2 * Math.PI * r : NaN;
}

function radiusFromCircumference(circumference) {
  const c = Number(circumference);
  return Number.isFinite(c) ? c / (2 * Math.PI) : NaN;
}

function areaFromRadius(radius) {
  const r = Number(radius);
  return Number.isFinite(r) ? Math.PI * r * r : NaN;
}

function sharedScaleFacts() {
  return {
    angle: {
      statement: '1 A8 angle unit = 45/64 legacy degree',
      inverse: '1 legacy degree = 64/45 A8 angle units',
    },
    timeMinute: {
      statement: '1 A8 minute = 45/64 legacy minute',
      inverse: '1 legacy minute = 64/45 A8 minutes',
    },
    timeHour: {
      statement: '1 A8 hour = 45 legacy minutes',
    },
  };
}

module.exports = {
  LEGACY_DEGREES_PER_TURN,
  A8_ANGLE_UNITS_PER_TURN,
  LEGACY_DEG_TO_A8_NUM,
  LEGACY_DEG_TO_A8_DEN,
  A8_TO_LEGACY_DEG_NUM,
  A8_TO_LEGACY_DEG_DEN,
  legacyDegreesToA8Units,
  a8UnitsToLegacyDegrees,
  normalizeA8Turn,
  normalizeLegacyTurn,
  toOctalFraction,
  formatA8AngleFromLegacy,
  arcLengthFromA8Angle,
  radiusFromA8ArcLength,
  circumferenceFromRadius,
  radiusFromCircumference,
  areaFromRadius,
  sharedScaleFacts,
};
