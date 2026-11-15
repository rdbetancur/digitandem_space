import { MISSIONS } from '../sim/missions';
import { Report } from '../sim/report';

const n = (x: number, d = 0) => x.toLocaleString('es-CO', { maximumFractionDigits: d, minimumFractionDigits: d });

interface Props {
  logbook: Report[];
  onStart: (missionId: string) => void;
  onClearLog: () => void;
}

const SOON = [
  { nombre: 'Atlas', texto: 'Sistema solar navegable con datos de efemérides de la NASA.' },
  { nombre: 'Carrera', texto: 'Dirige una agencia: presupuesto, contratos e investigación.' },
  { nombre: 'Hielo en la sombra', texto: 'Aluniza y mide recursos en el polo sur lunar.' },
  { nombre: 'Tripulación de 2 a 4', texto: 'Piloto, navegante, ingeniero y científico en la misma nave.' },
];

export default function Home({ logbook, onStart, onClearLog }: Props) {
  return (
    <div className="home">
      <div className="home-sky" aria-hidden />
      <div className="home-inner">
        <header className="hero">
          <p className="kicker">NASA Space Apps Challenge 2026 · Space Mission Design Game</p>
          <h1>ASCENSO</h1>
          <p className="lead">Diseña una nave, ponla a prueba, pilótala hasta la órbita y haz ciencia. Cada decisión de ingeniería tiene una consecuencia física que puedes ver y entender.</p>
        </header>

        <section className="modes">
          <button className="mode primary" onClick={() => onStart('sandbox')}>
            <span className="mode-tag">Sandbox</span>
            <h2>{MISSIONS.sandbox.nombre}</h2>
            <p>{MISSIONS.sandbox.resumen}</p>
            <span className="go">Abrir laboratorio →</span>
          </button>
          <button className="mode" onClick={() => onStart('cubesat')}>
            <span className="mode-tag">Desafío · {MISSIONS.cubesat.nivel}</span>
            <h2>{MISSIONS.cubesat.nombre}</h2>
            <p>{MISSIONS.cubesat.resumen}</p>
            <span className="muted small">Inspirado en: {MISSIONS.cubesat.inspiracion}</span>
            <span className="go">Aceptar misión →</span>
          </button>
          <button className="mode" onClick={() => onStart('ojo')}>
            <span className="mode-tag">Desafío · {MISSIONS.ojo.nivel}</span>
            <h2>{MISSIONS.ojo.nombre}</h2>
            <p>{MISSIONS.ojo.resumen}</p>
            <span className="muted small">Inspirado en: {MISSIONS.ojo.inspiracion}</span>
            <span className="go">Aceptar misión →</span>
          </button>
        </section>

        <section className="soon">
          <h3>En desarrollo</h3>
          <div className="soon-grid">
            {SOON.map((s) => (
              <div key={s.nombre} className="soon-card"><b>{s.nombre}</b><span>{s.texto}</span></div>
            ))}
          </div>
        </section>

        <section className="log">
          <div className="card-head">
            <h3>Bitácora</h3>
            {logbook.length > 0 && <button className="btn tiny ghost" onClick={onClearLog}>Borrar</button>}
          </div>
          {logbook.length === 0 && <p className="muted">Todavía no hay vuelos registrados. Cada vuelo queda aquí con su resultado y su causa.</p>}
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
          <p>Física con constantes reales de la Tierra. Simplificaciones y fuentes declaradas en el repositorio. Proyecto de código abierto bajo licencia Apache 2.0.</p>
        </footer>
      </div>
    </div>
  );
}
