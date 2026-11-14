import { G0 } from './constants';
import {
  ANTENNAS, AntennaId, BATTERY, CORES, CoreId, ENGINES, EngineId, INSTRUMENTS,
  InstrumentId, MATERIALS, MaterialId, PANEL, SHIELD_MASS, TANKS, TankId,
} from './catalog';

export interface StageDesign {
  engine: EngineId;
  engines: number;
  tank: TankId;
  tanks: number;
}

export interface Design {
  nombre: string;
  material: MaterialId;
  /** Etapas de abajo hacia arriba: stages[0] es la primera en encender. */
  stages: StageDesign[];
  core: CoreId;
  instruments: InstrumentId[];
  panels: number;
  batteries: number;
  antenna: AntennaId;
  shield: boolean;
  chute: boolean;
  fairing: boolean;
  /** Ensayos realizados sobre este diseño. Un ensayo revela, no cambia. */
  tested: { vibracion: boolean; tunel: boolean };
}

export function stageProp(s: StageDesign): number {
  return TANKS[s.tank].prop * s.tanks;
}

export function stageDry(s: StageDesign, material: MaterialId): number {
  return stageProp(s) * MATERIALS[material].dryFrac + ENGINES[s.engine].mass * s.engines + 20;
}

export function fairingMass(d: Design): number {
  if (!d.fairing || d.core === 'capsula') return 0;
  return d.core === 'cubesat' ? 25 : 45;
}

export function hasFairing(d: Design): boolean {
  return d.fairing && d.core !== 'capsula';
}

export function hasShield(d: Design): boolean {
  return d.core === 'capsula' || d.shield;
}

export function hasChute(d: Design): boolean {
  return d.chute && CORES[d.core].chuteCdA > 0;
}

export function payloadMass(d: Design): number {
  const core = CORES[d.core];
  let m = core.mass;
  for (const i of d.instruments) m += INSTRUMENTS[i].mass;
  m += d.panels * PANEL.mass + d.batteries * BATTERY.mass + ANTENNAS[d.antenna].mass;
  if (d.shield && d.core !== 'capsula') m += SHIELD_MASS;
  if (hasChute(d)) m += core.chuteMass;
  return m;
}

export function maxDiameter(d: Design, fromStage = 0): number {
  let w = CORES[d.core].width;
  for (let i = fromStage; i < d.stages.length; i++) w = Math.max(w, TANKS[d.stages[i].tank].diameter);
  return w;
}

/** Coeficiente de arrastre según la forma de la punta. Simplificación. */
export function dragCd(d: Design, fairingOn: boolean): number {
  if (fairingOn) return 0.3;
  return d.core === 'capsula' ? 0.5 : 0.62;
}

export interface StageStats {
  prop: number;
  dry: number;
  /** Masa total al encender esta etapa (kg). */
  m0: number;
  m1: number;
  dvVac: number;
  dvSL: number;
  /** Relación empuje/peso al encender (nivel del mar para la etapa 1). */
  twr: number;
  thrust: number;
  burnTime: number;
}

export interface VehicleStats {
  stages: StageStats[];
  payload: number;
  liftoffMass: number;
  /** Delta-v total estimado: etapa 1 a nivel del mar, el resto en vacío. */
  dvTotal: number;
  dvVacTotal: number;
  twrLiftoff: number;
  cost: number;
  diameter: number;
  cd: number;
  area: number;
  solarW: number;
  baseW: number;
  batteryWh: number;
  storageMB: number;
  rateMBs: number;
  qLimit: number;
  gLimit: number;
}

export function computeStats(d: Design): VehicleStats {
  const mat = MATERIALS[d.material];
  const core = CORES[d.core];
  const payload = payloadMass(d);
  const fair = fairingMass(d);
  const stages: StageStats[] = [];
  let above = payload;
  // De arriba hacia abajo para acumular la masa que carga cada etapa.
  for (let i = d.stages.length - 1; i >= 0; i--) {
    const s = d.stages[i];
    const e = ENGINES[s.engine];
    const prop = stageProp(s);
    const dry = stageDry(s, d.material);
    // La cofia se suelta a 110 km: se cuenta solo en la primera etapa si hay varias.
    const fairHere = i === 0 || d.stages.length === 1 ? fair : 0;
    const m0 = above + fairHere + dry + prop;
    const m1 = m0 - prop;
    const thrustVac = e.thrustVac * s.engines;
    const thrustSL = thrustVac * (e.ispSL / e.ispVac);
    const dvVac = e.ispVac * G0 * Math.log(m0 / m1);
    const dvSL = e.ispSL * G0 * Math.log(m0 / m1);
    const thrust = i === 0 ? thrustSL : thrustVac;
    stages[i] = {
      prop, dry, m0, m1, dvVac, dvSL,
      twr: thrust / (m0 * G0),
      thrust,
      burnTime: prop / (thrustVac / (e.ispVac * G0)),
    };
    above += dry + prop;
  }
  let cost = core.cost + ANTENNAS[d.antenna].cost + d.panels * PANEL.cost + d.batteries * BATTERY.cost;
  for (const i of d.instruments) cost += INSTRUMENTS[i].cost;
  for (const s of d.stages) {
    cost += ENGINES[s.engine].cost * s.engines + TANKS[s.tank].cost * s.tanks * mat.costFactor;
  }
  if (d.shield && d.core !== 'capsula') cost += 0.5;
  if (hasChute(d)) cost += 0.1;
  if (fair > 0) cost += 0.2;
  const diameter = maxDiameter(d);
  const dvTotal = stages.reduce((a, s, i) => a + (i === 0 ? (s.dvSL + s.dvVac) / 2 : s.dvVac), 0);
  return {
    stages,
    payload,
    liftoffMass: above + fair,
    dvTotal,
    dvVacTotal: stages.reduce((a, s) => a + s.dvVac, 0),
    twrLiftoff: stages.length ? stages[0].twr : 0,
    cost,
    diameter,
    cd: dragCd(d, hasFairing(d)),
    area: Math.PI * (diameter / 2) ** 2,
    solarW: core.solar + d.panels * PANEL.watts,
    baseW: core.basePower,
    batteryWh: core.battery + d.batteries * BATTERY.wh,
    storageMB: core.storage,
    rateMBs: ANTENNAS[d.antenna].rate,
    qLimit: mat.qLimit,
    gLimit: mat.gLimit,
  };
}

const untested = { vibracion: false, tunel: false };

export const PRESETS: Record<string, Design> = {
  pequeno: {
    nombre: 'Lanzador pequeño de dos etapas',
    material: 'alli',
    stages: [
      { engine: 'colibri', engines: 7, tank: 't1000', tanks: 9 },
      { engine: 'colibriV', engines: 1, tank: 't1000', tanks: 2 },
    ],
    core: 'cubesat', instruments: ['termo', 'camara'], panels: 0, batteries: 0,
    antenna: 'simple', shield: false, chute: false, fairing: true, tested: { ...untested },
  },
  sondeo: {
    nombre: 'Cohete de sondeo',
    material: 'acero',
    stages: [{ engine: 'colibri', engines: 1, tank: 't250', tanks: 4 }],
    core: 'sonda', instruments: ['termo', 'radiacion'], panels: 0, batteries: 0,
    antenna: 'simple', shield: true, chute: true, fairing: true, tested: { ...untested },
  },
  mediano: {
    nombre: 'Lanzador mediano con cápsula',
    material: 'alli',
    stages: [
      { engine: 'halcon', engines: 3, tank: 't25000', tanks: 6 },
      { engine: 'halconV', engines: 1, tank: 't25000', tanks: 2 },
    ],
    core: 'capsula', instruments: ['camara', 'radiacion', 'magneto'], panels: 2, batteries: 0,
    antenna: 'alta', shield: false, chute: true, fairing: false, tested: { ...untested },
  },
};

export function cloneDesign(d: Design): Design {
  return JSON.parse(JSON.stringify(d)) as Design;
}
