import { Report as ReportData } from '../sim/report';

const n = (x: number, d = 0) => x.toLocaleString('es-CO', { maximumFractionDigits: d, minimumFractionDigits: d });

const TONE: Record<ReportData['resultado'], string> = { exito: 'ok', parcial: 'warn', fallo: 'bad', libre: 'info' };
const TAG: Record<ReportData['resultado'], string> = { exito: 'Éxito', parcial: 'Parcial', fallo: 'Fallo', libre: 'Vuelo libre' };

interface Props {
  report: ReportData;
  onRetry: () => void;
  onLab: () => void;
  onHome: () => void;
}

export default function Report({ report, onRetry, onLab, onHome }: Props) {
  return (
    <div className="report">
      <div className="report-inner">
        <header>
          <span className={`tag ${TONE[report.resultado]}`}>{TAG[report.resultado]}</span>
          <h1>{report.titulo}</h1>
          <p className="muted">{report.mision} · {report.nave}</p>
          <p className="lead">{report.resumen}</p>
        </header>

        <div className="report-grid">
          <div className="report-main">
            {report.causas.length > 0 && (
              <section className="card">
                <h3>Qué pasó y por qué</h3>
                {report.causas.map((c, i) => <p key={i} className="cause">{c}</p>)}
              </section>
            )}
            {report.aciertos.length > 0 && (
              <section className="card">
                <h3>Lo que salió bien</h3>
                {report.aciertos.map((c, i) => <p key={i} className="win">{c}</p>)}
              </section>
            )}
            {report.sugerencias.length > 0 && (
              <section className="card">
                <h3>Qué probar ahora</h3>
                {report.sugerencias.map((c, i) => <p key={i} className="tip">{c}</p>)}
              </section>
            )}
            {report.referencia && (
              <section className="card ref">
                <h3>La ciencia detrás</h3>
                <p>{report.referencia.texto}</p>
                <a href={report.referencia.url} target="_blank" rel="noreferrer">{report.referencia.fuente}</a>
              </section>
            )}
          </div>

          <aside className="report-side">
            <section className="card score">
              <span className="muted">Puntaje</span>
              <b>{n(report.puntaje)}</b>
            </section>
            {report.objetivos.length > 0 && (
              <section className="card">
                <h3>Objetivos</h3>
                <ul className="objectives">
                  {report.objetivos.map((o, i) => (
                    <li key={i} className={o.ok ? 'done' : ''}><span className="tick">{o.ok ? '✓' : '○'}</span>{o.texto}</li>
                  ))}
                </ul>
              </section>
            )}
            <section className="card">
              <h3>Ciencia</h3>
              <div className="kv">
                <span>Mediciones</span><b>{report.ciencia.mediciones}</b>
                <span>Obtenida</span><b>{n(report.ciencia.obtenida, 1)}</b>
                <span>Entregada en Tierra</span><b>{n(report.ciencia.entregada, 1)}</b>
              </div>
            </section>
            <section className="card">
              <h3>Telemetría</h3>
              <div className="kv">
                {report.cifras.map((c) => [<span key={`${c.k}k`}>{c.k}</span>, <b key={`${c.k}v`}>{c.v}</b>])}
              </div>
            </section>
          </aside>
        </div>

        <footer className="report-actions">
          <button className="btn primary" onClick={onRetry}>Volar de nuevo</button>
          <button className="btn" onClick={onLab}>Modificar la nave</button>
          <button className="btn ghost" onClick={onHome}>Inicio</button>
        </footer>
      </div>
    </div>
  );
}
