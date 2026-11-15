import { H_SCALE, P0, RE } from './constants';
import { InstrumentId } from './catalog';

export type ContextId = 'superficie' | 'atm_baja' | 'atm_alta' | 'espacio_cercano' | 'espacio_alto';

export const CONTEXTS: Record<ContextId, string> = {
  superficie: 'Surface',
  atm_baja: 'Lower atmosphere',
  atm_alta: 'Upper atmosphere',
  espacio_cercano: 'Near space',
  espacio_alto: 'High space',
};

export function contextOf(alt: number, landed: boolean): ContextId {
  if (landed) return 'superficie';
  if (alt < 18e3) return 'atm_baja';
  if (alt < 100e3) return 'atm_alta';
  if (alt < 2000e3) return 'espacio_cercano';
  return 'espacio_alto';
}

/** Valor científico base de cada instrumento en cada contexto. */
export const SCIENCE_VALUE: Record<InstrumentId, Record<ContextId, number>> = {
  termo: { superficie: 2, atm_baja: 5, atm_alta: 8, espacio_cercano: 3, espacio_alto: 3 },
  camara: { superficie: 1, atm_baja: 3, atm_alta: 6, espacio_cercano: 12, espacio_alto: 15 },
  radiacion: { superficie: 1, atm_baja: 3, atm_alta: 6, espacio_cercano: 10, espacio_alto: 20 },
  magneto: { superficie: 1, atm_baja: 2, atm_alta: 4, espacio_cercano: 10, espacio_alto: 14 },
};

/** Repetir el mismo experimento en el mismo contexto rinde cada vez menos. */
export const REPEAT_FACTOR = 0.35;

/** Temperatura del aire (°C) según la atmósfera estándar, simplificada por tramos. */
export function airTemperature(alt: number): number {
  const km = alt / 1000;
  if (km < 11) return 15 - 6.5 * km;
  if (km < 20) return -56.5;
  if (km < 32) return -56.5 + (km - 20);
  if (km < 47) return -44.5 + 2.8 * (km - 32);
  if (km < 51) return -2.5;
  if (km < 71) return -2.5 - 2.8 * (km - 51);
  if (km < 85) return -58.5 - 2 * (km - 71);
  return -86.5;
}

export function airPressure(alt: number): number {
  return P0 * Math.exp(-Math.max(alt, 0) / H_SCALE);
}

function fmt(n: number, d = 1): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
}

/** Lectura del instrumento con valores calculados por la simulación. */
export function reading(inst: InstrumentId, alt: number, r: number, sunlit: boolean): string {
  const km = alt / 1000;
  switch (inst) {
    case 'termo': {
      if (alt > 100e3) {
        return `Pressure practically zero. With no air, temperature depends on light: the craft is ${sunlit ? 'in sunlight' : 'in shadow'}.`;
      }
      const hpa = airPressure(alt) / 100;
      return `${fmt(airTemperature(alt))} °C and ${fmt(hpa, hpa < 10 ? 2 : 0)} hPa at ${fmt(km)} km.`;
    }
    case 'camara':
      if (alt < 50) return 'Photo of the launch pad.';
      if (alt < 100e3) return `Image of the horizon at ${fmt(km)} km: the curvature is already visible.`;
      return `Image of Earth from ${fmt(km, 0)} km. Horizon visible at ${fmt(Math.sqrt(2 * RE * alt + alt * alt) / 1000, 0)} km.`;
    case 'radiacion': {
      // Dosis aproximada: crece con la altitud y se dispara en los cinturones de Van Allen.
      let dose = 0.1 + 6 * Math.min(km, 20) / 12;
      if (km > 20) dose = 10 + 12 * Math.min((km - 20) / 400, 1);
      if (km > 1000) dose = 22 + 2000 * Math.min((km - 1000) / 2500, 1);
      const extra = km > 1000 ? ' You are entering the Van Allen belts.' : '';
      return `Dose of ${fmt(dose)} µSv/h at ${fmt(km, 0)} km.${extra}`;
    }
    case 'magneto': {
      // Campo dipolar en el ecuador: 31 µT en superficie, cae con el cubo de la distancia.
      const b = 31 * (RE / r) ** 3;
      return `Magnetic field of ${fmt(b)} µT at ${fmt(km, 0)} km.`;
    }
  }
}
