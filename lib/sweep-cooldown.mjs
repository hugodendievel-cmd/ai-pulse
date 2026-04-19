// lib/sweep-cooldown.mjs — Decide whether a sweep should be triggered.
//
// Pure helper: no I/O, no logging, no side-effects. Makes the
// "at most one sweep per cooldown window" invariant explicit in one place
// so every call site (on-connect, setInterval, boot) agrees.

/**
 * @param {object} args
 * @param {number | string | null} args.lastSweepTime
 *   Epoch ms or ISO timestamp of the last completed sweep, or null if none yet.
 * @param {number} args.now
 *   Current time as epoch ms (injectable for tests).
 * @param {number} args.cooldownMs
 *   Minimum interval between sweep triggers.
 * @param {boolean} args.sweepInProgress
 *   True iff a sweep is currently in flight.
 * @returns {boolean} true if a sweep should fire, false otherwise.
 */
export function shouldTriggerSweep({
  lastSweepTime,
  now,
  cooldownMs,
  sweepInProgress,
}) {
  if (sweepInProgress) return false;
  if (lastSweepTime == null) return true;
  const last =
    typeof lastSweepTime === "number"
      ? lastSweepTime
      : new Date(lastSweepTime).getTime();
  return now - last >= cooldownMs;
}
