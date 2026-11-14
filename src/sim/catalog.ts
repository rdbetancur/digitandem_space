// Catálogo de piezas. Los valores parten de órdenes de magnitud reales
// (motores y lanzadores pequeños actuales) y están pendientes de calibración.

export type EngineId = 'colibri' | 'colibriV' | 'halcon' | 'halconV' | 'aurora';
export type TankId = 't250' | 't1000' | 't5000' | 't25000';
export type MaterialId = 'alli' | 'carbono' | 'acero';
export type CoreId = 'cubesat' | 'sonda' | 'capsula';
export type InstrumentId = 'termo' | 'camara' | 'radiacion' | 'magneto';
export type AntennaId = 'ninguna' | 'simple' | 'alta';

export interface Engine {
  nombre: string;
  /** Empuje en vacío (N). */
  thrustVac: number;
  /** Impulso específico a nivel del mar y en vacío (s). */
  ispSL: number;
  ispVac: number;
  mass: number;
  /** Costo en millones de USD. */
  cost: number;
  nota: string;
}

export const ENGINES: Record<EngineId, Engine> = {
  colibri: {
    nombre: 'Colibrí',
    thrustVac: 25e3, ispSL: 300, ispVac: 311, mass: 35, cost: 0.4,
    nota: 'Motor pequeño de queroseno. Se usa en racimo para la primera etapa.',
  },
  colibriV: {
    nombre: 'Colibrí de vacío',
    thrustVac: 26e3, ispSL: 110, ispVac: 343, mass: 40, cost: 0.7,
    nota: 'Tobera larga: muy eficiente en el espacio, casi inútil a nivel del mar.',
  },
  halcon: {
    nombre: 'Halcón',
    thrustVac: 900e3, ispSL: 282, ispVac: 311, mass: 470, cost: 2.5,
    nota: 'Motor mediano de queroseno para lanzadores con carga pesada.',
  },
  halconV: {
    nombre: 'Halcón de vacío',
    thrustVac: 950e3, ispSL: 120, ispVac: 348, mass: 550, cost: 3.5,
    nota: 'Versión de etapa superior del Halcón.',
  },
  aurora: {
    nombre: 'Aurora (hidrógeno)',
    thrustVac: 110e3, ispSL: 200, ispVac: 450, mass: 300, cost: 6,
    nota: 'Hidrógeno y oxígeno: el mejor impulso específico, poco empuje y alto costo.',
  },
};

export interface Tank {
  nombre: string;
  /** Masa de propelente (kg). */
  prop: number;
  diameter: number;
  cost: number;
}

export const TANKS: Record<TankId, Tank> = {
  t250: { nombre: 'Depósito 250 kg', prop: 250, diameter: 0.8, cost: 0.05 },
  t1000: { nombre: 'Depósito 1 t', prop: 1000, diameter: 1.2, cost: 0.15 },
  t5000: { nombre: 'Depósito 5 t', prop: 5000, diameter: 2.2, cost: 0.6 },
  t25000: { nombre: 'Depósito 25 t', prop: 25000, diameter: 3.7, cost: 2.4 },
};

export interface Material {
  nombre: string;
  /** Masa seca de estructura como fracción del propelente. */
  dryFrac: number;
  /** Carga aerodinámica máxima (Pa). */
  qLimit: number;
  /** Aceleración máxima (g). */
  gLimit: number;
  costFactor: number;
  color: string;
  nota: string;
}

export const MATERIALS: Record<MaterialId, Material> = {
  alli: {
    nombre: 'Aluminio-litio', dryFrac: 0.09, qLimit: 45e3, gLimit: 10, costFactor: 1,
    color: '#e9edf3',
    nota: 'El equilibrio clásico entre masa, resistencia y costo.',
  },
  carbono: {
    nombre: 'Compuesto de carbono', dryFrac: 0.06, qLimit: 52e3, gLimit: 11, costFactor: 1.8,
    color: '#2c3038',
    nota: 'Muy liviano: más delta-v con el mismo propelente, pero caro.',
  },
  acero: {
    nombre: 'Acero inoxidable', dryFrac: 0.13, qLimit: 80e3, gLimit: 14, costFactor: 0.7,
    color: '#b4bcc6',
    nota: 'Pesado y barato. Aguanta cargas que romperían a los otros.',
  },
};

export interface Core {
  nombre: string;
  mass: number;
  /** Consumo base (W). */
  basePower: number;
  /** Generación solar integrada (W). */
  solar: number;
  /** Batería integrada (Wh). */
  battery: number;
  /** Almacenamiento de datos (MB). */
  storage: number;
  maxInstruments: number;
  cost: number;
  width: number;
  height: number;
  chuteMass: number;
  chuteCdA: number;
  nota: string;
}

export const CORES: Record<CoreId, Core> = {
  cubesat: {
    nombre: 'CubeSat 6U', mass: 9, basePower: 2, solar: 8, battery: 40, storage: 120,
    maxInstruments: 2, cost: 0.3, width: 0.5, height: 0.6, chuteMass: 0, chuteCdA: 0,
    nota: 'Satélite del tamaño de una caja de zapatos. Barato y con poco margen.',
  },
  sonda: {
    nombre: 'Sonda científica', mass: 120, basePower: 15, solar: 0, battery: 300, storage: 2000,
    maxInstruments: 4, cost: 4, width: 1.2, height: 1.4, chuteMass: 8, chuteCdA: 60,
    nota: 'Plataforma robótica para varios instrumentos. Necesita paneles.',
  },
  capsula: {
    nombre: 'Cápsula tripulada', mass: 2800, basePower: 120, solar: 0, battery: 3000, storage: 4000,
    maxInstruments: 4, cost: 30, width: 3.2, height: 2.6, chuteMass: 120, chuteCdA: 900,
    nota: 'Lleva tripulación. Incluye escudo térmico; el paracaídas es opcional.',
  },
};

export interface Instrument {
  nombre: string;
  mass: number;
  /** Energía por medición (Wh). */
  energy: number;
  /** Datos por medición (MB). */
  mb: number;
  cost: number;
  nota: string;
}

export const INSTRUMENTS: Record<InstrumentId, Instrument> = {
  termo: {
    nombre: 'Termómetro y barómetro', mass: 0.5, energy: 0.2, mb: 0.5, cost: 0.05,
    nota: 'Mide temperatura y presión. Brilla dentro de la atmósfera.',
  },
  camara: {
    nombre: 'Cámara', mass: 2, energy: 1.5, mb: 40, cost: 0.4,
    nota: 'Imágenes de la Tierra. Genera muchos datos.',
  },
  radiacion: {
    nombre: 'Detector de radiación', mass: 1, energy: 0.5, mb: 2, cost: 0.2,
    nota: 'Cuenta partículas. Más interesante cuanto más alto.',
  },
  magneto: {
    nombre: 'Magnetómetro', mass: 1.5, energy: 0.5, mb: 3, cost: 0.25,
    nota: 'Mide el campo magnético, que cae con el cubo de la distancia.',
  },
};

export interface Antenna {
  nombre: string;
  mass: number;
  /** Tasa de transmisión (MB/s). */
  rate: number;
  /** Consumo al transmitir (W). */
  power: number;
  cost: number;
}

export const ANTENNAS: Record<AntennaId, Antenna> = {
  ninguna: { nombre: 'Sin antena', mass: 0, rate: 0, power: 0, cost: 0 },
  simple: { nombre: 'Antena simple', mass: 0.5, rate: 0.05, power: 4, cost: 0.05 },
  alta: { nombre: 'Antena de alta ganancia', mass: 6, rate: 1.2, power: 25, cost: 0.6 },
};

export const PANEL = { mass: 2.5, watts: 30, cost: 0.08 };
export const BATTERY = { mass: 4, wh: 150, cost: 0.04 };
export const SHIELD_MASS = 25;
