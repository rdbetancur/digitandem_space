import { ReactNode } from 'react';
import { MISSIONS } from '../sim/missions';
import { Report } from '../sim/report';

const n = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

interface Props {
  logbook: Report[];
  onStart: (missionId: string) => void;
  onAtlas: () => void;
  onClearLog: () => void;
  /** Tripulación y tablero de vuelos. */
  extra?: ReactNode;
}

const SOON = [
  { nombre: 'Career', texto: 'Run an agency: budget, contracts and research.' },
  { nombre: 'Mars and beyond', texto: 'Land on Mars with a heat shield, parachutes and aerobraking; grow a crewed base and make propellant from ice.' },
  { nombre: 'Online co-op', texto: 'Today a crew of up to four shares one screen and trades designs by link. Next: each role on its own device, live.' },
];

export default function Home({ logbook, onStart, onAtlas, onClearLog, extra }: Props) {
  return (
    <div className="home">
      <div className="home-sky" aria-hidden />
      <div className="home-inner">
        <header className="hero">
          <p className="kicker">NASA Space Apps Challenge 2026 · Space Mission Design Game</p>
          <h1>ASCENT</h1>
          <p className="lead">Design a craft, put it to the test, fly it to orbit and do science. Every engineering decision has a physical consequence you can see and understand.</p>
        </header>

        <section className="modes">
          <button className="mode primary" onClick={() => onStart('sandbox')}>
            <span className="mode-tag">Sandbox</span>
            <h2>{MISSIONS.sandbox.nombre}</h2>
            <p>{MISSIONS.sandbox.resumen}</p>
            <span className="go">Open the lab →</span>
          </button>
          <button className="mode" onClick={() => onStart('cubesat')}>
            <span className="mode-tag">Challenge · {MISSIONS.cubesat.nivel}</span>
            <h2>{MISSIONS.cubesat.nombre}</h2>
            <p>{MISSIONS.cubesat.resumen}</p>
            <span className="muted small">Inspired by: {MISSIONS.cubesat.inspiracion}</span>
            <span className="go">Accept mission →</span>
          </button>
          <button className="mode" onClick={() => onStart('ojo')}>
            <span className="mode-tag">Challenge · {MISSIONS.ojo.nivel}</span>
            <h2>{MISSIONS.ojo.nombre}</h2>
            <p>{MISSIONS.ojo.resumen}</p>
            <span className="muted small">Inspired by: {MISSIONS.ojo.inspiracion}</span>
            <span className="go">Accept mission →</span>
          </button>
          <button className="mode" onClick={() => onStart('luna')}>
            <span className="mode-tag">Challenge · {MISSIONS.luna.nivel}</span>
            <h2>{MISSIONS.luna.nombre}</h2>
            <p>{MISSIONS.luna.resumen}</p>
            <span className="muted small">Inspired by: {MISSIONS.luna.inspiracion}</span>
            <span className="go">Go to the Moon →</span>
          </button>
          <button className="mode" onClick={onAtlas}>
            <span className="mode-tag">Atlas</span>
            <h2>Solar system</h2>
            <p>See where each planet is today, how long a signal takes to get there and how much more delta-v your craft needs to go.</p>
            <span className="muted small">Positions computed from NASA JPL orbital elements.</span>
            <span className="go">Open the atlas →</span>
          </button>
        </section>

        {extra}

        <section className="soon">
          <h3>In development</h3>
          <div className="soon-grid">
            {SOON.map((s) => (
              <div key={s.nombre} className="soon-card"><b>{s.nombre}</b><span>{s.texto}</span></div>
            ))}
          </div>
        </section>

        <section className="log">
          <div className="card-head">
            <h3>Logbook</h3>
            {logbook.length > 0 && <button className="btn tiny ghost" onClick={onClearLog}>Clear</button>}
          </div>
          {logbook.length === 0 && <p className="muted">No flights logged yet. Every flight is recorded here with its result and its cause.</p>}
          {logbook.slice(0, 8).map((r, i) => (
            <div key={i} className="log-row">
              <span className={`dot ${r.resultado}`} />
              <b>{r.titulo}</b>
              <span className="muted">{r.mision} · {r.nave}</span>
              <span className="num">{n(r.puntaje)} pts</span>
            </div>
          ))}
        </section>

        <footer className="home-foot">
          <p>Physics with Earth's real constants. Simplifications and sources are documented in the repository. Open-source project under the Apache 2.0 license.</p>
        </footer>
      </div>
    </div>
  );
}
