import { ATM_TOP, KARMAN, RE } from './constants';
import { Flight, Vec, orbitOf, payloadOnly } from './flight';
import { LUNA } from './luna';
import { OJO } from './ojo';
import { Design, PRESETS } from './vehicle';

export interface Objective {
  id: string;
  texto: string;
  ayuda: string;
  check: (f: Flight) => boolean;
}

export interface Mission {
  id: string;
  nombre: string;
  nivel: string;
  resumen: string;
  inspiracion: string;
  fuente: string;
  /** Costo máximo del vehículo en millones de USD, o null si no hay límite. */
  presupuesto: number | null;
  preset: Design;
  objetivos: Objective[];
  /** Requisitos de diseño que el laboratorio muestra antes de construir. */
  requisitos?: string[];
  /** Concepto y fuente que el informe enlaza al cumplir la misión. */
  referencia?: { texto: string; fuente: string; url: string };
  /** Punto de interés sobre la superficie, dibujado en el mapa. */
  target?: { nombre: string; pos: (t: number) => Vec };
  /** Lógica propia de la misión, llamada después de cada paso de simulación. */
  onStep?: (f: Flight) => void;
  /** Filas propias de la misión en el tablero de vuelo. */
  panel?: (f: Flight) => { k: string; v: string; tone?: 'ok' | 'bad' }[];
  /** Acción propia de la misión. run devuelve un aviso para el jugador, o null. */
  accion?: { texto: (f: Flight) => string; run: (f: Flight) => string | null };
}

const inOrbit = (f: Flight) => {
  if (f.landed || f.ended === 'impacto') return false;
  const o = orbitOf(f.r, f.v);
  return o.e < 1 && o.pe - RE > ATM_TOP + 10e3;
};

export const MISSIONS: Record<string, Mission> = {
  sandbox: {
    id: 'sandbox',
    nombre: 'Free play',
    nivel: 'Sandbox',
    resumen: 'Build anything you like, fly wherever you can and do science with no contract, budget or clock.',
    inspiracion: '',
    fuente: '',
    presupuesto: null,
    preset: PRESETS.pequeno,
    objetivos: [],
  },
  cubesat: {
    id: 'cubesat',
    nombre: 'First CubeSat',
    nivel: 'Beginner',
    resumen: 'Put a CubeSat in low orbit, deploy it, take a measurement and send it to Earth.',
    inspiracion: 'NASA CubeSat Launch Initiative (CSLI) and the CubeSat 101 guide.',
    fuente: 'https://www3.nasa.gov/sites/default/files/atoms/files/nasa_csli_cubesat_101_508.pdf',
    presupuesto: 12,
    preset: PRESETS.pequeno,
    objetivos: [
      {
        id: 'karman', texto: 'Reach space: go above 100 km',
        ayuda: 'By convention, the Kármán line marks where space begins.',
        check: (f) => f.stats.maxAlt > KARMAN,
      },
      {
        id: 'orbita', texto: 'Stable orbit: periapsis above 150 km',
        ayuda: 'Going up is not enough: you need about 7.8 km/s of horizontal speed to stop falling back.',
        check: inOrbit,
      },
      {
        id: 'liberar', texto: 'Release the satellite from the last stage',
        ayuda: 'Separate the final stage with the space bar once you are in orbit.',
        check: (f) => payloadOnly(f) && inOrbit(f),
      },
      {
        id: 'desplegar', texto: 'Deploy panels and antenna',
        ayuda: 'Without a deployed antenna there is no link; without panels, the battery runs down.',
        check: (f) => f.deployed,
      },
      {
        id: 'medir', texto: 'Take a measurement from orbit',
        ayuda: 'Use any instrument on board above 100 km.',
        check: (f) => f.measurements.some((m) => m.context === 'espacio_cercano' || m.context === 'espacio_alto'),
      },
      {
        id: 'transmitir', texto: 'Transmit the data to a ground station',
        ayuda: 'There is only a link with line of sight to a station. Wait until you pass over one.',
        check: (f) => f.measurements.some((m) => m.sent >= m.mb && m.alt > KARMAN),
      },
    ],
  },
  ojo: OJO,
  luna: LUNA,
};

/**
 * Estado de cada objetivo. Un objetivo cumplido queda registrado en el vuelo: no se
 * pierde si después la nave deja la órbita o recoge los paneles.
 */
export function objectivesDone(m: Mission, f: Flight): boolean[] {
  const done = m.objetivos.map((o) => {
    const key = `obj:${o.id}`;
    if (!f.flags[key] && o.check(f)) f.flags[key] = true;
    return !!f.flags[key];
  });
  if (done.length > 0 && f.stats.doneT === null && done.every(Boolean)) f.stats.doneT = f.t;
  return done;
}
