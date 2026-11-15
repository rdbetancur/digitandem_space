// Resumen del estado del juego que Control de Misión recibe con cada pregunta.
// La pantalla de vuelo registra aquí cómo leer su telemetría en vivo.

import { RE } from '../sim/constants';
import { ANTENNAS, CORES, ENGINES, INSTRUMENTS, MATERIALS, TANKS } from '../sim/catalog';
import {
  Flight, altitude, currentMass, groundVelocity, linkStatus, orbitOf, payloadOnly, remainingDv, scienceTotals, storageUsed,
} from '../sim/flight';
import { Mission, objectivesDone } from '../sim/missions';
import { Report } from '../sim/report';
import { Design, computeStats, hasChute, hasFairing, hasShield } from '../sim/vehicle';

const n = (x: number, d = 0) => (isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) : 'infinite');

let flightGetter: (() => string) | null = null;

/** Etiquetas en inglés para los identificadores internos que se envían como texto. */
const SAS_TEXT: Record<string, string> = { mantener: 'hold', prograda: 'prograde', retrograda: 'retrograde' };
const END_TEXT: Record<string, string> = {
  estructura: 'structural failure', aceleracion: 'acceleration failure', calor: 'destroyed by heating',
  impacto: 'impact', aterrizaje: 'landed', usuario: 'ended by the player',
};
const RESULT_TEXT: Record<string, string> = { exito: 'success', parcial: 'partial', fallo: 'failure', libre: 'free flight' };

export function setFlightContext(fn: (() => string) | null) {
  flightGetter = fn;
}

export function flightContext(): string | null {
  return flightGetter ? flightGetter() : null;
}

export function describeDesign(d: Design): string {
  const s = computeStats(d);
  const stages = d.stages.map((st, i) => {
    const x = s.stages[i];
    return `  Stage ${i + 1}: ${st.engines} × ${ENGINES[st.engine].nombre}, ${st.tanks} × ${TANKS[st.tank].nombre}; delta-v ${n(x.dvVac)} m/s, thrust/weight ${n(x.twr, 2)}, burn ${n(x.burnTime)} s`;
  });
  return [
    `Craft "${d.nombre}": payload ${CORES[d.core].nombre} (${n(s.payload, 1)} kg), material ${MATERIALS[d.material].nombre}.`,
    `Instruments: ${d.instruments.map((i) => INSTRUMENTS[i].nombre).join(', ') || 'none'}. Antenna: ${ANTENNAS[d.antenna].nombre}. Extra panels: ${d.panels}. Extra batteries: ${d.batteries}.`,
    `Fairing: ${hasFairing(d) ? 'yes' : 'no'}. Heat shield: ${hasShield(d) ? 'yes' : 'no'}. Parachute: ${hasChute(d) ? 'yes' : 'no'}.`,
    ...stages,
    `Totals: vacuum delta-v ${n(s.dvVacTotal)} m/s (low orbit needs about 9,400), liftoff thrust/weight ${n(s.twrLiftoff, 2)}, mass ${n(s.liftoffMass)} kg, cost ${n(s.cost, 1)} M USD.`,
    `Power: generates ${n(s.solarW)} W, uses ${n(s.baseW)} W at rest, battery ${n(s.batteryWh)} Wh. Data: ${n(s.storageMB)} MB at ${n(s.rateMBs, 2)} MB/s.`,
    `Tests done: vibration table ${d.tested.vibracion ? 'yes' : 'no'}, wind tunnel ${d.tested.tunel ? 'yes' : 'no'}.`,
  ].join('\n');
}

export function describeMission(m: Mission): string {
  const lines = [`Mission: ${m.nombre}. ${m.resumen}${m.presupuesto ? ` Budget: ${n(m.presupuesto)} M USD.` : ''}`];
  if (m.objetivos.length) lines.push(`Objectives: ${m.objetivos.map((o) => o.texto).join('; ')}.`);
  return lines.join('\n');
}

export function describeFlight(f: Flight, m: Mission): string {
  const rm = Math.hypot(f.r.x, f.r.y);
  const o = orbitOf(f.r, f.v);
  const air = groundVelocity(f.r);
  const sci = scienceTotals(f);
  const done = objectivesDone(m, f);
  const st = payloadOnly(f) ? null : f.stages[f.stageIdx];
  const lines = [
    `Mission time: ${n(f.t)} s. ${f.landed ? (f.stats.liftoffT === null ? 'On the pad, not launched yet.' : 'On the ground.') : 'In flight.'}${f.ended ? ` Flight ended: ${END_TEXT[f.ended] ?? f.ended}.` : ''}`,
    `Altitude ${n(altitude(f) / 1000, 1)} km. Orbital speed ${n(Math.hypot(f.v.x, f.v.y))} m/s; relative to the ground ${n(Math.hypot(f.v.x - air.x, f.v.y - air.y))} m/s; vertical ${n((f.v.x * f.r.x + f.v.y * f.r.y) / rm)} m/s.`,
    `Apoapsis ${o.e < 1 ? `${n((o.ap - RE) / 1000, 1)} km` : 'open (escape)'}, periapsis ${n((o.pe - RE) / 1000, 1)} km.`,
    `Throttle ${n(f.throttle * 100)} %. Assistance: ${f.autopilot ? 'autopilot' : SAS_TEXT[f.sas] ?? f.sas}. ${st ? `Active stage ${f.stageIdx + 1} of ${f.stages.length} with ${n((st.prop / Math.max(1, st.propMax)) * 100)} % propellant.` : 'Only the payload is left.'} Delta-v left ${n(remainingDv(f))} m/s. Mass ${n(currentMass(f))} kg.`,
    `Aerodynamic load ${n(f.now.load / 1000, 1)} kPa (limit ${n(MATERIALS[f.design.material].qLimit / 1000)}), acceleration ${n(f.now.g, 1)} g (limit ${n(MATERIALS[f.design.material].gLimit)}). Flight peaks: ${n(f.stats.maxLoad / 1000, 1)} kPa and ${n(f.stats.maxG, 1)} g.`,
    `Fairing ${f.fairingOn ? 'on' : 'released'}. Panels and antenna ${f.panelsLost ? 'lost' : f.deployed ? 'deployed' : 'stowed'}. Battery ${n(f.battery)} Wh, ${f.now.sunlit ? 'in sunlight' : 'in shadow'}. Station link: ${linkStatus(f) ? 'yes' : 'no'}. Transmitting: ${f.transmitting ? 'yes' : 'no'}.`,
    `Data on board ${n(storageUsed(f), 1)} MB. Science collected ${n(sci.obtenida, 1)}, delivered ${n(sci.entregada, 1)}. Measurements: ${f.measurements.length}.`,
  ];
  if (m.objetivos.length) lines.push(`Objectives: ${m.objetivos.map((ob, i) => `${done[i] ? '[done]' : '[pending]'} ${ob.texto}`).join('; ')}.`);
  if (m.panel) lines.push(`Mission status: ${m.panel(f).map((r) => `${r.k}: ${r.v}`).join('; ')}.`);
  const ev = f.events.slice(-6).map((e) => `${n(e.t)} s: ${e.text}`);
  if (ev.length) lines.push(`Latest events:\n  ${ev.join('\n  ')}`);
  return lines.join('\n');
}

export function describeReport(r: Report): string {
  return [
    `Report of the last flight: ${r.titulo} (${RESULT_TEXT[r.resultado] ?? r.resultado}). ${r.resumen}`,
    r.causas.length ? `What happened: ${r.causas.join(' ')}` : '',
    r.aciertos.length ? `What went well: ${r.aciertos.join(' ')}` : '',
    r.sugerencias.length ? `Report suggestions: ${r.sugerencias.join(' ')}` : '',
    `Figures: ${r.cifras.map((c) => `${c.k} ${c.v}`).join('; ')}. Score ${r.puntaje}.`,
  ].filter(Boolean).join('\n');
}
