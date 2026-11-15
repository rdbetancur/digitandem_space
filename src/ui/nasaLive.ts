// Datos e imágenes de la NASA en vivo. Todo se pide directamente a servicios públicos de la
// NASA (sin clave) y cada función tiene una copia guardada por si el servicio no responde.
// Fuentes en docs/FUENTES.md.

import type { BodyId } from '../sim/atlas';

export interface LiveFire {
  id: string;
  title: string;
  lat: number;
  lon: number;
  /** Fecha del último reporte (AAAA-MM-DD, UTC). */
  date: string;
  /** Área quemada en hectáreas, si el reporte la trae. */
  hectares: number | null;
  link: string;
  /** true si llegó ahora de EONET; false si es la copia guardada. */
  live: boolean;
}

/** Copia guardada: un incendio real tomado de EONET el 14 de noviembre de 2026. */
export const FIRE_SNAPSHOT: LiveFire = {
  id: 'EONET_26331',
  title: 'Wildfire Red Hill, Perry, Mississippi',
  lat: 31.130069,
  lon: -89.063853,
  date: '2026-11-12',
  hectares: 210,
  link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_26331',
  live: false,
};
/** Imagen satelital guardada de ese incendio (VIIRS, 12 de noviembre de 2026). */
export const FIRE_SNAPSHOT_IMAGE = './nasa/wildfire-snapshot.jpg';

const EONET = 'https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=60';
const GIBS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
/** Color real del satélite NOAA-20 más los focos de calor detectados (puntos rojos). */
const GIBS_LAYERS = 'VIIRS_NOAA20_CorrectedReflectance_TrueColor,VIIRS_NOAA20_Thermal_Anomalies_375m_Day';
export const FIRE_IMAGE_CREDIT = 'VIIRS on NOAA-20, true color with detected hot spots in red · NASA GIBS';

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

interface EonetEvent {
  id: string; title: string; link?: string;
  geometry: { date: string; type: string; coordinates: number[]; magnitudeValue?: number | null; magnitudeUnit?: string | null }[];
}

let firePromise: Promise<LiveFire> | null = null;

/** El incendio activo más grande que EONET reporta hoy, o la copia guardada. */
export function loadFire(): Promise<LiveFire> {
  if (firePromise) return firePromise;
  firePromise = (async () => {
    try {
      const res = await fetch(EONET, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { events: EonetEvent[] };
      // La imagen satelital del día tarda en publicarse: se usa a lo sumo la de ayer.
      const latest = Date.now() - 86400e3;
      const recent = Date.now() - 12 * 86400e3;
      let best: LiveFire | null = null;
      let bestScore = -1;
      for (const e of data.events) {
        const g = e.geometry[e.geometry.length - 1];
        if (!g || g.type !== 'Point' || !/^wildfire/i.test(e.title)) continue;
        const when = Date.parse(g.date);
        if (!(when > recent)) continue;
        const acres = g.magnitudeUnit === 'acres' && typeof g.magnitudeValue === 'number' ? g.magnitudeValue : null;
        const fire: LiveFire = {
          id: e.id, title: e.title, lon: g.coordinates[0], lat: g.coordinates[1],
          date: iso(Math.min(when, latest)), hectares: acres === null ? null : Math.round(acres * 0.4047),
          link: e.link ?? `https://eonet.gsfc.nasa.gov/api/v3/events/${e.id}`, live: true,
        };
        // Primero los reportes de los últimos cuatro días (humo y focos visibles); luego el más grande.
        const fresh = when > Date.now() - 4 * 86400e3;
        const score = (fresh ? 1e9 : 0) + (fire.hectares ?? 0);
        if (score > bestScore) { best = fire; bestScore = score; }
      }
      return best ?? FIRE_SNAPSHOT;
    } catch {
      return FIRE_SNAPSHOT;
    }
  })();
  return firePromise;
}

/** Imagen satelital real de la zona del incendio, el día del reporte. */
export function fireImageUrl(fire: LiveFire, size = 512, spanDeg = 1.5): string {
  if (!fire.live) return FIRE_SNAPSHOT_IMAGE;
  const h = spanDeg / 2;
  const bbox = [fire.lat - h, fire.lon - h, fire.lat + h, fire.lon + h].map((x) => x.toFixed(4)).join(',');
  return `${GIBS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&CRS=EPSG:4326&FORMAT=image/jpeg&WIDTH=${size}&HEIGHT=${size}`
    + `&LAYERS=${GIBS_LAYERS}&BBOX=${bbox}&TIME=${fire.date}`;
}

export function formatCoords(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
}

/** Imagen de cada cuerpo en la NASA Image and Video Library, con su crédito. */
export const BODY_IMAGES: Record<BodyId, { id: string; caption: string; credit: string }> = {
  sol: { id: 'GSFC_20171208_Archive_e002035', caption: 'The Sun in extreme ultraviolet light, seen by the Solar Dynamics Observatory (2010).', credit: 'NASA/GSFC/SDO' },
  mercurio: { id: 'GSFC_20171208_Archive_e001922', caption: 'First color image of Mercury taken from orbit, by MESSENGER (2011).', credit: 'NASA/Johns Hopkins APL/Carnegie Institution' },
  venus: { id: 'PIA23791', caption: 'Venus and its cloud tops, from Mariner 10 (1974).', credit: 'NASA/JPL-Caltech' },
  tierra: { id: 'GSFC_20171208_Archive_e001386', caption: 'Blue Marble 2012: Earth from the Suomi NPP satellite.', credit: 'NASA/NOAA/GSFC/Suomi NPP' },
  luna: { id: 'PIA00405', caption: 'The Moon in a color mosaic from the Galileo spacecraft (1992).', credit: 'NASA/JPL/USGS' },
  marte: { id: 'PIA00003', caption: 'Mars and the Valles Marineris canyon system, a Viking orbiter mosaic.', credit: 'NASA/JPL/USGS' },
  jupiter: { id: 'PIA04866', caption: 'Jupiter in true color, a portrait from the Cassini spacecraft (2000).', credit: 'NASA/JPL/Space Science Institute' },
  saturno: { id: 'PIA06193', caption: 'Saturn and its rings in natural color, from Cassini (2004).', credit: 'NASA/JPL/Space Science Institute' },
  urano: { id: 'PIA00032', caption: 'Uranus in true color (left) and false color (right), from Voyager 2 (1986).', credit: 'NASA/JPL' },
  neptuno: { id: 'PIA00046', caption: 'Neptune and its Great Dark Spot, from Voyager 2 (1989).', credit: 'NASA/JPL' },
};

export function bodyImageUrl(id: BodyId): string {
  const nasaId = BODY_IMAGES[id].id;
  return `https://images-assets.nasa.gov/image/${nasaId}/${nasaId}~small.jpg`;
}
