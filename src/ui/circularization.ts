import { G0, MU, RE } from '../sim/constants';
import { Flight, currentMass, orbitOf, remainingDv } from '../sim/flight';

/** Ideal full-throttle estimate at apoapsis; finite burns also incur gravity losses. */
export function circularizationEstimate(f: Flight) {
  const o = orbitOf(f.r, f.v);
  const st = f.stages[f.stageIdx];
  if (!st || o.e >= 1 || o.ap < RE + 150e3) return undefined;
  const momentum = Math.abs(f.r.x * f.v.y - f.r.y * f.v.x);
  const dv = Math.max(0, Math.sqrt(MU / o.ap) - momentum / o.ap);
  const exhaust = st.ispVac * G0;
  const propNeeded = currentMass(f) * (1 - Math.exp(-dv / exhaust));
  return {
    dv,
    seconds: propNeeded * exhaust / st.thrustVac,
    enoughFuel: remainingDv(f) >= dv,
    needsStaging: propNeeded > st.prop,
  };
}
