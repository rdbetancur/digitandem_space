import { ATM_TOP, KARMAN, RE } from './constants';
import { Flight, Vec, orbitOf, payloadOnly } from './flight';
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
    nombre: 'Juego libre',
    nivel: 'Sandbox',
    resumen: 'Construye lo que quieras, vuela a donde puedas y haz ciencia sin contrato, presupuesto ni reloj.',
    inspiracion: '',
    fuente: '',
    presupuesto: null,
    preset: PRESETS.pequeno,
    objetivos: [],
  },
  cubesat: {
    id: 'cubesat',
    nombre: 'Primer CubeSat',
    nivel: 'Inicial',
    resumen: 'Pon un CubeSat en órbita baja, despliégalo, toma una medición y envíala a Tierra.',
    inspiracion: 'Iniciativa de lanzamiento de CubeSats de la NASA (CSLI) y la guía CubeSat 101.',
    fuente: 'https://www3.nasa.gov/sites/default/files/atoms/files/nasa_csli_cubesat_101_508.pdf',
    presupuesto: 12,
    preset: PRESETS.pequeno,
    objetivos: [
      {
        id: 'karman', texto: 'Llega al espacio: supera los 100 km',
        ayuda: 'La línea de Kármán marca por convención el inicio del espacio.',
        check: (f) => f.stats.maxAlt > KARMAN,
      },
      {
        id: 'orbita', texto: 'Órbita estable: periapsis sobre 150 km',
        ayuda: 'Subir no basta: necesitas unos 7,8 km/s de velocidad horizontal para no volver a caer.',
        check: inOrbit,
      },
      {
        id: 'liberar', texto: 'Libera el satélite de la última etapa',
        ayuda: 'Separa la etapa final con la barra espaciadora cuando ya estés en órbita.',
        check: (f) => payloadOnly(f) && inOrbit(f),
      },
      {
        id: 'desplegar', texto: 'Despliega paneles y antena',
        ayuda: 'Sin antena desplegada no hay enlace; sin paneles, la batería se agota.',
        check: (f) => f.deployed,
      },
      {
        id: 'medir', texto: 'Toma una medición desde la órbita',
        ayuda: 'Usa cualquier instrumento a bordo por encima de 100 km.',
        check: (f) => f.measurements.some((m) => m.context === 'espacio_cercano' || m.context === 'espacio_alto'),
      },
      {
        id: 'transmitir', texto: 'Transmite los datos a una estación terrestre',
        ayuda: 'Solo hay enlace con línea de vista a una estación. Espera a pasar sobre una.',
        check: (f) => f.measurements.some((m) => m.sent >= m.mb && m.alt > KARMAN),
      },
    ],
  },
  ojo: OJO,
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
