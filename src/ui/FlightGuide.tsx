import { flightGuide, GuideState } from './flightGuidance';

export default function FlightGuide({ hud, paused, autopilot, onClose }: {
  hud: GuideState; paused: boolean; autopilot: boolean; onClose: () => void;
}) {
  if (hud.ended) return null;
  const guide = flightGuide(hud);
  return (
    <aside className="hud flight-guide panel" aria-label="Guided first flight">
      <div className="flight-guide-heading">
        <span className="lbl">First flight · {guide.step}/6</span>
        <button className="btn tiny" onClick={onClose} aria-label="Close flight guide">Close</button>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true">
        <h3>{guide.title}</h3>
        <p>{guide.text}</p>
      </div>
      {paused && <p className="muted">Paused · Esc to resume.</p>}
      {autopilot && <p className="muted">Autopilot active: watch the maneuvers. P gives you manual control back.</p>}
    </aside>
  );
}
