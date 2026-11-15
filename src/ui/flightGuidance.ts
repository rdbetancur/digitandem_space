/** La guía observa el vuelo; no modifica la simulación ni avanza por temporizadores. */
export interface GuideState {
  launched: boolean; landed: boolean; ended: string | null;
  alt: number; ap: number; pe: number; toAp: number; vr: number;
  throttle: number; twr: number; free: boolean; fairing: boolean;
  deployed: boolean; canDeploy: boolean; orbiting: boolean;
  stages: { fill: number; active: boolean; gone: boolean }[];
}

export function flightGuide(h: GuideState) {
  if (!h.launched) return {
    step: 1, title: 'Ignite the engines',
    text: h.throttle > 0 && h.twr < 1
      ? 'Thrust/weight is below 1: go back to the lab and add thrust or cut mass.'
      : 'Press Space to ignite at full throttle. Climb vertically first.',
  };
  const orbit = h.orbiting && h.pe > 150e3;
  if (orbit) {
    if (!h.free) return { step: 5, title: 'Release the satellite', text: 'Press X to cut the engine and Space to drop the last stage. You do not need to burn the remaining propellant.' };
    if (!h.deployed) return {
      step: 6, title: 'Deploy panels and antenna',
      text: h.canDeploy ? 'Press G or the Deploy button under Systems.'
        : h.fairing ? 'Wait for the fairing to come off; it protects the satellite during ascent.'
        : 'Wait until there is no thrust and you are out of dense air. Then you can press G.',
    };
    return { step: 6, title: 'First flight complete!', text: 'You are in orbit with the satellite deployed. Open Science, take a measurement and transmit when you have a link.' };
  }
  if (h.free) return { step: 4, title: 'The craft has no engine left', text: 'The periapsis is not above 150 km yet. To try again, go back to the lab and keep the last stage until you reach orbit.' };
  if (h.stages.some((s) => s.active && s.fill <= 0)) return {
    step: 3, title: 'Separate the spent stage', text: 'Press Space to drop it and activate the next one. If it was the last one, your next design will need more delta-v.',
  };
  if (h.ap >= 160e3 && h.vr > 0 && h.toAp > 35) return {
    step: 4, title: 'Wait near the apoapsis', text: 'Press X to cut the engine. Wait until Time to apoapsis drops to about 35 s; you still need horizontal speed to get into orbit.',
  };
  if (h.alt >= 100e3 || (h.ap >= 160e3 && h.toAp <= 35)) return {
    step: 4, title: 'Raise the periapsis', text: 'Select Prograde and press Z to thrust near the apoapsis. Use W/S to adjust throttle until the periapsis is above 150 km. P turns on the ascent autopilot.',
  };
  return {
    step: 2, title: h.alt < 1000 ? 'Gain altitude' : 'Tilt east',
    text: h.alt < 1000 ? 'Keep the craft vertical for the first few seconds. Watch the loads; W/S adjusts the throttle.'
      : 'Hold D briefly to tilt east little by little. Build horizontal speed without turning sharply; aim for an apoapsis above 160 km. P turns on the autopilot.',
  };
}
