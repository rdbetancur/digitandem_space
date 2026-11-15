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

const n = (x: number, d = 0) => (isFinite(x) ? x.toLocaleString('es-CO', { maximumFractionDigits: d, minimumFractionDigits: d }) : 'infinito');

let flightGetter: (() => string) | null = null;

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
    return `  Etapa ${i + 1}: ${st.engines} × ${ENGINES[st.engine].nombre}, ${st.tanks} × ${TANKS[st.tank].nombre}; delta-v ${n(x.dvVac)} m/s, empuje/peso ${n(x.twr, 2)}, quema ${n(x.burnTime)} s`;
  });
  return [
    `Nave "${d.nombre}": carga útil ${CORES[d.core].nombre} (${n(s.payload, 1)} kg), material ${MATERIALS[d.material].nombre}.`,
    `Instrumentos: ${d.instruments.map((i) => INSTRUMENTS[i].nombre).join(', ') || 'ninguno'}. Antena: ${ANTENNAS[d.antenna].nombre}. Paneles extra: ${d.panels}. Baterías extra: ${d.batteries}.`,
    `Cofia: ${hasFairing(d) ? 'sí' : 'no'}. Escudo térmico: ${hasShield(d) ? 'sí' : 'no'}. Paracaídas: ${hasChute(d) ? 'sí' : 'no'}.`,
    ...stages,
    `Totales: delta-v en vacío ${n(s.dvVacTotal)} m/s (la órbita baja pide unos 9.400), empuje/peso al despegue ${n(s.twrLiftoff, 2)}, masa ${n(s.liftoffMass)} kg, costo ${n(s.cost, 1)} M USD.`,
    `Energía: genera ${n(s.solarW)} W, consume ${n(s.baseW)} W en reposo, batería ${n(s.batteryWh)} Wh. Datos: ${n(s.storageMB)} MB a ${n(s.rateMBs, 2)} MB/s.`,
    `Ensayos hechos: mesa de vibración ${d.tested.vibracion ? 'sí' : 'no'}, túnel de viento ${d.tested.tunel ? 'sí' : 'no'}.`,
  ].join('\n');
}

export function describeMission(m: Mission): string {
  const lines = [`Misión: ${m.nombre}. ${m.resumen}${m.presupuesto ? ` Presupuesto: ${n(m.presupuesto)} M USD.` : ''}`];
  if (m.objetivos.length) lines.push(`Objetivos: ${m.objetivos.map((o) => o.texto).join('; ')}.`);
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
    `Tiempo de misión: ${n(f.t)} s. ${f.landed ? (f.stats.liftoffT === null ? 'En la plataforma, sin despegar.' : 'En tierra.') : 'En vuelo.'}${f.ended ? ` Vuelo terminado: ${f.ended}.` : ''}`,
    `Altitud ${n(altitude(f) / 1000, 1)} km. Velocidad orbital ${n(Math.hypot(f.v.x, f.v.y))} m/s; respecto al suelo ${n(Math.hypot(f.v.x - air.x, f.v.y - air.y))} m/s; vertical ${n((f.v.x * f.r.x + f.v.y * f.r.y) / rm)} m/s.`,
    `Apoapsis ${o.e < 1 ? `${n((o.ap - RE) / 1000, 1)} km` : 'abierta'}, periapsis ${n((o.pe - RE) / 1000, 1)} km.`,
    `Potencia ${n(f.throttle * 100)} %. Asistencia: ${f.autopilot ? 'piloto automático' : f.sas}. ${st ? `Etapa activa ${f.stageIdx + 1} de ${f.stages.length} con ${n((st.prop / Math.max(1, st.propMax)) * 100)} % de propelente.` : 'Solo queda la carga útil.'} Delta-v restante ${n(remainingDv(f))} m/s. Masa ${n(currentMass(f))} kg.`,
    `Carga aerodinámica ${n(f.now.load / 1000, 1)} kPa (límite ${n(MATERIALS[f.design.material].qLimit / 1000)}), aceleración ${n(f.now.g, 1)} g (límite ${n(MATERIALS[f.design.material].gLimit)}). Máximos del vuelo: ${n(f.stats.maxLoad / 1000, 1)} kPa y ${n(f.stats.maxG, 1)} g.`,
    `Cofia ${f.fairingOn ? 'puesta' : 'suelta'}. Paneles y antena ${f.panelsLost ? 'perdidos' : f.deployed ? 'desplegados' : 'recogidos'}. Batería ${n(f.battery)} Wh, ${f.now.sunlit ? 'al sol' : 'en sombra'}. Enlace con estación: ${linkStatus(f) ? 'sí' : 'no'}. Transmitiendo: ${f.transmitting ? 'sí' : 'no'}.`,
    `Datos a bordo ${n(storageUsed(f), 1)} MB. Ciencia obtenida ${n(sci.obtenida, 1)}, entregada ${n(sci.entregada, 1)}. Mediciones: ${f.measurements.length}.`,
  ];
  if (m.objetivos.length) lines.push(`Objetivos: ${m.objetivos.map((ob, i) => `${done[i] ? '[hecho]' : '[pendiente]'} ${ob.texto}`).join('; ')}.`);
  if (m.panel) lines.push(`Estado de la misión: ${m.panel(f).map((r) => `${r.k}: ${r.v}`).join('; ')}.`);
  const ev = f.events.slice(-6).map((e) => `${n(e.t)} s: ${e.text}`);
  if (ev.length) lines.push(`Últimos eventos:\n  ${ev.join('\n  ')}`);
  return lines.join('\n');
}

export function describeReport(r: Report): string {
  return [
    `Informe del último vuelo: ${r.titulo} (${r.resultado}). ${r.resumen}`,
    r.causas.length ? `Qué pasó: ${r.causas.join(' ')}` : '',
    r.aciertos.length ? `Lo que salió bien: ${r.aciertos.join(' ')}` : '',
    r.sugerencias.length ? `Sugerencias del informe: ${r.sugerencias.join(' ')}` : '',
    `Cifras: ${r.cifras.map((c) => `${c.k} ${c.v}`).join('; ')}. Puntaje ${r.puntaje}.`,
  ].filter(Boolean).join('\n');
}
