'use strict';
// STARTUP-ONLY, OFFLINE-CANDIDATE. Must not be loaded into live process.
// Call only after fresh runtime qualification completes, before any external feed.
function restoreSealedClock(runtime, certificate, {expectedPreviousEpoch='8', nextPhysicalEpoch='9'}={}) {
  const c = certificate.core20;
  const a = c && c.alignment;
  const eq=(x,y)=>String(x)===String(y);
  if (!c || !a || runtime.status!=='RUNNING' || !runtime.externalPhysicalPrimary || !runtime.getNaturalRecurrenceText || runtime.alignment!==null || runtime.externalClockRaw!==null) throw Error('RESTORE_STATE_GUARD');
  if (!eq(c.sourceEpoch,'3') || !eq(runtime.getSourceEpoch(),'3') || !eq(a.sourceEpoch,'3') || !eq(a.externalPhysicalSourceEpoch,expectedPreviousEpoch)) throw Error('RESTORE_EPOCH_GUARD');
  if (!eq(c.currentSelectedRawPulse,'24009351725') || !eq(c.currentClockRawPulse,'921464910') || !eq(c.dayCount,'28') || !eq(c.dayPhase17,'110153')) throw Error('RESTORE_COORDINATE_GUARD');
  if (a.role!=='QUALIFIED_EXTERNAL_PHYSICAL_PRIMARY' || c.status!=='CORE20_CLOCK_RUNNING' || c.clockRawDomain!=='EUROPA_NATURAL_MODEL_RAW') throw Error('RESTORE_AUTHORITY_GUARD');
  if (!eq(runtime._activeRecurrenceText(), c.naturalRawPerSunReturn)) throw Error('RESTORE_RECURRENCE_GUARD');
  const cur=BigInt(runtime.getRaw());
  const goal=BigInt(c.currentSelectedRawPulse);
  if(cur>goal) throw Error('RESTORE_RAW_AHEAD');
  const originalAlign = {...a};
  const newAlign={...originalAlign,externalPhysicalSourceEpoch:String(nextPhysicalEpoch)};
  // The historical alignment (raw anchors, target day, phase) is NOT reanchored.
  // Verify the archived natural-clock coordinate independently before any RAW write.
  const recurrence=runtime._activeRecurrenceText().split('/').map(BigInt);
  const elapsed=BigInt(c.currentClockRawPulse)-BigInt(a.clockAnchorRawPulse);
  if(elapsed<0n) throw Error('RESTORE_NATURAL_REGRESSION');
  const statesNumerator=elapsed*recurrence[1]*131072n;
  const completed=statesNumerator/recurrence[0];
  const rem=statesNumerator%recurrence[0];
  const total=BigInt(a.targetDayCount)*131072n+BigInt(a.targetDayPhase17)+completed;
  if(total/131072n!==BigInt(c.dayCount) || total%131072n!==BigInt(c.dayPhase17) || rem*BigInt(c.exactSubstate.denominator)!==BigInt(c.exactSubstate.numerator)*recurrence[0]) throw Error('RESTORE_FRACTION_GUARD');
  if(cur<goal) runtime.advanceRaw(goal-cur);
  if(BigInt(runtime.getRaw())!==goal) throw Error('RESTORE_ADVANCE_MISMATCH');
  runtime.externalClockRaw=BigInt(c.currentClockRawPulse);
  runtime.alignment=newAlign;
  const out=runtime.clockSnapshot();
  if (!eq(out.currentSelectedRawPulse,c.currentSelectedRawPulse) || !eq(out.currentClockRawPulse,c.currentClockRawPulse) || !eq(out.dayCount,c.dayCount) || !eq(out.dayPhase17,c.dayPhase17) || (BigInt(out.exactSubstate.numerator)!==BigInt(c.exactSubstate.numerator) || BigInt(out.exactSubstate.denominator)!==BigInt(c.exactSubstate.denominator))) throw Error('RESTORE_POST_GUARD');
  return out;
}
module.exports={restoreSealedClock};
