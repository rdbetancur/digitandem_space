import { useEffect, useState } from 'react';
import { Flight as FlightState } from '../sim/flight';
import { MISSIONS } from '../sim/missions';
import { Report as ReportData, buildReport } from '../sim/report';
import { Design, cloneDesign } from '../sim/vehicle';
import Atlas from './Atlas';
import Flight from './Flight';
import Home from './Home';
import Lab from './Lab';
import Report from './Report';

type Screen = 'home' | 'lab' | 'flight' | 'report' | 'atlas';

const DESIGN_KEY = 'ascenso.diseno.v1';
const LOG_KEY = 'ascenso.bitacora.v1';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* almacenamiento no disponible */ }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [missionId, setMissionId] = useState('sandbox');
  const [designs, setDesigns] = useState<Record<string, Design>>(() => load(DESIGN_KEY, {}));
  const [logbook, setLogbook] = useState<ReportData[]>(() => load(LOG_KEY, []));
  const [report, setReport] = useState<ReportData | null>(null);
  const [flightKey, setFlightKey] = useState(0);

  const mission = MISSIONS[missionId];
  const design = designs[missionId] ?? mission.preset;

  useEffect(() => save(DESIGN_KEY, designs), [designs]);
  useEffect(() => save(LOG_KEY, logbook), [logbook]);

  const setDesign = (d: Design) => setDesigns((all) => ({ ...all, [missionId]: d }));

  const start = (id: string) => {
    setMissionId(id);
    if (!designs[id]) setDesigns((all) => ({ ...all, [id]: cloneDesign(MISSIONS[id].preset) }));
    setScreen('lab');
  };

  const finish = (f: FlightState) => {
    const r = buildReport(f, mission);
    setReport(r);
    setLogbook((l) => [r, ...l].slice(0, 40));
    setScreen('report');
  };

  const launch = () => { setFlightKey((k) => k + 1); setScreen('flight'); };

  if (screen === 'lab') {
    return <Lab design={design} mission={mission} onChange={setDesign} onLaunch={launch} onHome={() => setScreen('home')} />;
  }
  if (screen === 'flight') {
    return <Flight key={flightKey} design={design} mission={mission} onEnd={finish} onBack={() => setScreen('lab')} />;
  }
  if (screen === 'report' && report) {
    return <Report report={report} onRetry={launch} onLab={() => setScreen('lab')} onHome={() => setScreen('home')} />;
  }
  if (screen === 'atlas') {
    // El Atlas compara los destinos con la nave del juego libre.
    return <Atlas design={designs.sandbox ?? MISSIONS.sandbox.preset} onHome={() => setScreen('home')} onLab={() => start('sandbox')} />;
  }
  return <Home logbook={logbook} onStart={start} onAtlas={() => setScreen('atlas')} onClearLog={() => setLogbook([])} />;
}
