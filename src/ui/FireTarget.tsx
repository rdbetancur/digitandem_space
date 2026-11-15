import { useEffect, useRef, useState } from 'react';
import {
  FIRE_IMAGE_CREDIT, FIRE_SNAPSHOT, FIRE_SNAPSHOT_IMAGE, LiveFire, fireImageUrl, formatCoords, loadFire,
} from './nasaLive';

const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function useFire(): LiveFire | null {
  const [fire, setFire] = useState<LiveFire | null>(null);
  useEffect(() => { let on = true; loadFire().then((f) => { if (on) setFire(f); }); return () => { on = false; }; }, []);
  return fire;
}

/** Imagen satelital del incendio; si el servicio falla, usa la copia guardada. */
function FireImage({ fire, blur = 0, onFallback }: { fire: LiveFire; blur?: number; onFallback?: () => void }) {
  const [src, setSrc] = useState(() => fireImageUrl(fire));
  useEffect(() => setSrc(fireImageUrl(fire)), [fire]);
  return (
    <img
      className="fire-img" src={src} alt={`Satellite image of the area around ${fire.title}`}
      style={{ filter: `brightness(1.5) contrast(1.08) saturate(1.15) blur(${blur.toFixed(1)}px)` }}
      onError={() => { if (src !== FIRE_SNAPSHOT_IMAGE) { setSrc(FIRE_SNAPSHOT_IMAGE); onFallback?.(); } }}
    />
  );
}

/** Tarjeta del laboratorio: el objetivo real de la misión, tomado hoy de la NASA. */
export function FireBriefing() {
  const loaded = useFire();
  const [fallback, setFallback] = useState(false);
  if (!loaded) return <div className="card"><h3>Live target</h3><p className="note">Asking NASA for today's active wildfires…</p></div>;
  const fire = fallback ? FIRE_SNAPSHOT : loaded;
  return (
    <div className="card fire-card">
      <div className="card-head">
        <h3>Your target today</h3>
        <span className={`fire-badge ${fire.live ? 'live' : ''}`}>{fire.live ? '● Live · NASA EONET' : 'Saved NASA snapshot'}</span>
      </div>
      <b className="fire-title">{fire.title}</b>
      <div className="kv">
        <span>Last report</span><b>{longDate(fire.date)}</b>
        {fire.hectares !== null && <><span>Burned area</span><b>{fire.hectares.toLocaleString('en-US')} ha</b></>}
        <span>Location</span><b>{formatCoords(fire.lat, fire.lon)}</b>
      </div>
      <FireImage fire={fire} onFallback={() => setFallback(true)} />
      <p className="note">Real satellite view of the area on {longDate(fire.date)}, about 165 km across. {FIRE_IMAGE_CREDIT}.</p>
      <p className="note">This is a real fire reported to NASA's natural event tracker. The game places it on its equatorial flight plane, so your craft can fly over it.</p>
    </div>
  );
}

/** Aviso en vuelo: cada imagen útil muestra la escena real, con la nitidez de tu órbita. */
export function FireCapture({ shots }: { shots: { id: number; gsd: number }[] }) {
  const fire = useFire();
  const seen = useRef(shots.length);
  const [shown, setShown] = useState<{ n: number; gsd: number } | null>(null);
  useEffect(() => {
    if (shots.length > seen.current) setShown({ n: shots.length, gsd: shots[shots.length - 1].gsd });
    seen.current = shots.length;
  }, [shots.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown || !fire) return null;
  // 12 m por píxel (200 km) se ve nítido; 30 m (500 km) se ve claramente más borroso.
  const blur = Math.max(0, ((shown.gsd - 12) / 18) * 3);
  return (
    <aside className="hud panel fire-capture" aria-label="Captured image">
      <div className="card-head">
        <h4>Image captured · pass {shown.n}</h4>
        <button className="btn tiny" onClick={() => setShown(null)} aria-label="Close captured image">✕</button>
      </div>
      <FireImage fire={fire} blur={blur} />
      <b className="fire-title">{fire.title}</b>
      <p className="note">Sharpness simulated for your orbit: {shown.gsd.toFixed(0)} m per pixel. A lower orbit gives a sharper image.</p>
      <p className="note">Real scene from {longDate(fire.date)}. {FIRE_IMAGE_CREDIT}.</p>
    </aside>
  );
}
