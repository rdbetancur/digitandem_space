import { flightGuide, GuideState } from './flightGuidance';

export default function FlightGuide({ hud, paused, autopilot, onClose }: {
  hud: GuideState; paused: boolean; autopilot: boolean; onClose: () => void;
}) {
  if (hud.ended) return null;
  const guide = flightGuide(hud);
  return (
    <aside className="hud flight-guide panel" aria-label="Primer vuelo guiado">
      <div className="flight-guide-heading">
        <span className="lbl">Primer vuelo · {guide.step}/6</span>
        <button className="btn tiny" onClick={onClose} aria-label="Cerrar guía de vuelo">Cerrar</button>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true">
        <h3>{guide.title}</h3>
        <p>{guide.text}</p>
      </div>
      {paused && <p className="muted">En pausa · Esc para continuar.</p>}
      {autopilot && <p className="muted">Piloto automático activo: observa las maniobras. P devuelve el control manual.</p>}
    </aside>
  );
}
