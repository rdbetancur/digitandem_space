// Constantes físicas de la simulación. Valores reales; las simplificaciones
// están declaradas en docs/FUENTES.md.

/** Gravedad estándar (m/s²), usada para convertir impulso específico. */
export const G0 = 9.80665;
/** Parámetro gravitacional de la Tierra (m³/s²). */
export const MU = 3.986004418e14;
/** Radio medio de la Tierra (m). */
export const RE = 6.371e6;
/** Velocidad angular de rotación de la Tierra (rad/s). */
export const OMEGA = 7.2921159e-5;
/** Densidad del aire a nivel del mar (kg/m³). */
export const RHO0 = 1.225;
/** Altura de escala de la atmósfera exponencial (m). Simplificación. */
export const H_SCALE = 8500;
/** Altitud sobre la cual se ignora la atmósfera (m). */
export const ATM_TOP = 140e3;
/** Presión a nivel del mar (Pa). */
export const P0 = 101325;
/** Velocidad de la luz (m/s). */
export const C_LIGHT = 299792458;
/** Línea de Kármán (m). */
export const KARMAN = 100e3;
/** Dirección fija del Sol en el plano de la simulación (rad). */
export const SUN_ANGLE = Math.PI / 3;
/** Posición angular inicial de la plataforma de lanzamiento (rad). */
export const SITE_ANGLE0 = Math.PI / 2;
/** Estaciones terrestres: desfase angular respecto a la plataforma (rad). */
export const STATION_OFFSETS = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
