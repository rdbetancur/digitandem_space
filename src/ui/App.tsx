import { useEffect, useState } from 'react';
import { ATM_TOP, RE } from '../sim/constants';
import { Flight as FlightState, orbitOf } from '../sim/flight';
import { MISSIONS } from '../sim/missions';
import { Report as ReportData, buildReport } from '../sim/report';
import { SharePayload, SharedResult, readShareHash } from '../sim/share';
import { Design, cloneDesign, computeStats } from '../sim/vehicle';
import Atlas from './Atlas';
import Flight from './Flight';
import Home from './Home';
import Lander from './Lander';
import Lab from './Lab';
import MissionControl from './MissionControl';
import Report from './Report';
import { BadLinkNotice, CrewStrip, FlightBoard, ShareButton, SharedBanner } from './Team';
import { loadCrew, saveCrew } from './crew';
import { GuestScreen, RoomCard, RoomPill } from './room/RoomUI';
import { normalizeCode } from './room/protocol';
import { roomJoin, roomPublishIdle, roomState, useRoom } from './room/room';
import { RankEntry, addEntry, entryFromShare, loadRanking, newId, saveRanking } from './ranking';

type Screen = 'home' | 'lab' | 'flight' | 'report' | 'atlas' | 'luna';

const DESIGN_KEY = 'ascenso.diseno.v1';
const LOG_KEY = 'ascenso.bitacora.v1';
/** Misiones con laboratorio: las únicas que aceptan un diseño compartido. */
const LAB_MISSIONS = ['sandbox', 'cubesat', 'ojo'];

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
  // Equipo: tripulación, diseño recibido por enlace y tablero de vuelos.
  const [crew] = useState<string[]>(loadCrew);
  const [ranking, setRanking] = useState<RankEntry[]>(loadRanking);
  const [shared, setShared] = useState<{ payload: SharePayload; previous: Design | null } | null>(null);
  const [badLink, setBadLink] = useState(false);
  const [lastEntry, setLastEntry] = useState<RankEntry | null>(null);
  // Sala de misión: multijugador en vivo con invitados.
  const room = useRoom();

  const mission = MISSIONS[missionId];
  const design = designs[missionId] ?? mission.preset;

  useEffect(() => save(DESIGN_KEY, designs), [designs]);
  useEffect(() => save(LOG_KEY, logbook), [logbook]);
  useEffect(() => saveCrew(crew), [crew]);
  useEffect(() => saveRanking(ranking), [ranking]);

  // Un enlace compartido trae la nave dentro de la dirección (#s=...). Se valida, se carga en el
  // laboratorio y se limpia la dirección. Un enlace dañado no cambia nada.
  useEffect(() => {
    const open = () => {
      if (!window.location.hash.startsWith('#s=')) return;
      const payload = readShareHash(window.location.hash, LAB_MISSIONS);
      try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* sin historial */ }
      if (!payload) { setBadLink(true); setScreen('home'); return; }
      setBadLink(false);
      setDesigns((all) => {
        setShared({ payload, previous: all[payload.mission] ?? null });
        return { ...all, [payload.mission]: payload.design };
      });
      const entry = entryFromShare(payload, MISSIONS[payload.mission].nombre);
      // Abrir tu propio enlace no convierte tu vuelo en uno "compartido".
      if (entry) setRanking((l) => (l.some((x) => x.id === entry.id && x.mine) ? l : addEntry(l, entry)));
      setMissionId(payload.mission);
      setScreen('lab');
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);

  // Un enlace de invitación (#room=CÓDIGO) entra a la sala como invitado, sin cuenta.
  useEffect(() => {
    const join = () => {
      if (!window.location.hash.startsWith('#room=')) return;
      const code = normalizeCode(window.location.hash);
      try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* sin historial */ }
      if (code) void roomJoin(code, roomState().name);
      else setBadLink(true);
    };
    join();
    window.addEventListener('hashchange', join);
    return () => window.removeEventListener('hashchange', join);
  }, []);

  const setDesign = (d: Design) => setDesigns((all) => ({ ...all, [missionId]: d }));

  const start = (id: string) => {
    setMissionId(id);
    if (!designs[id]) setDesigns((all) => ({ ...all, [id]: cloneDesign(MISSIONS[id].preset) }));
    setScreen(id === 'luna' ? 'luna' : 'lab');
  };

  const finish = (f: FlightState) => {
    const r = buildReport(f, mission);
    setReport(r);
    // El vuelo entra al tablero con las cifras de su telemetría.
    try {
      const o = orbitOf(f.r, f.v);
      const entry: RankEntry = {
        id: newId(), mine: true, by: crew[0] ?? '', crew, mission: missionId, missionName: mission.nombre,
        nave: f.design.nombre, titulo: r.titulo, resultado: r.resultado, puntaje: r.puntaje,
        maxAltKm: f.stats.maxAlt / 1000, dvUsed: f.stats.dvUsed, timeMin: f.t / 60, cost: computeStats(f.design).cost,
        orbit: !f.landed && o.e < 1 && o.pe - RE > ATM_TOP, tip: '', tags: [], design: cloneDesign(f.design),
        fecha: r.fecha,
      };
      setLastEntry(entry);
      setRanking((l) => addEntry(l, entry));
    } catch { setLastEntry(null); }
    setLogbook((l) => [r, ...l].slice(0, 40));
    setScreen('report');
  };

  const launch = () => { setFlightKey((k) => k + 1); setScreen(missionId === 'luna' ? 'luna' : 'flight'); };
  // La misión lunar arma su propio informe.
  const finishLuna = (r: ReportData) => {
    setReport(r); setLogbook((l) => [r, ...l].slice(0, 40)); setScreen('report');
    setLastEntry(null);
    setRanking((l) => addEntry(l, {
      id: newId(), mine: true, by: crew[0] ?? '', crew, mission: 'luna', missionName: MISSIONS.luna.nombre, nave: r.nave,
      titulo: r.titulo, resultado: r.resultado, puntaje: r.puntaje, tip: '', tags: [], design: null, fecha: r.fecha,
    }));
  };
  const loadEntry = (e: RankEntry) => {
    if (!e.design || !LAB_MISSIONS.includes(e.mission)) return;
    const payload: SharePayload = { mission: e.mission, design: cloneDesign(e.design), by: e.by, crew: e.crew, tip: e.tip, tags: e.tags, result: null, id: e.id };
    setShared(e.mine ? null : { payload, previous: designs[e.mission] ?? null });
    setDesigns((all) => ({ ...all, [e.mission]: cloneDesign(e.design!) }));
    setMissionId(e.mission);
    setScreen('lab');
  };
  const sharedHere = shared && shared.payload.mission === missionId ? shared : null;
  const lastResult: SharedResult | null = lastEntry
    ? { titulo: lastEntry.titulo, resultado: lastEntry.resultado, puntaje: lastEntry.puntaje, maxAltKm: lastEntry.maxAltKm, dvUsed: lastEntry.dvUsed, timeMin: lastEntry.timeMin, cost: lastEntry.cost, orbit: lastEntry.orbit }
    : null;

  // El Atlas compara los destinos con la nave del juego libre.
  const atlasDesign = designs.sandbox ?? MISSIONS.sandbox.preset;
  // El piloto cuenta a los invitados qué está haciendo cuando no vuela.
  useEffect(() => {
    roomPublishIdle({
      screen: screen === 'home' || screen === 'lab' || screen === 'report' ? screen : 'other',
      missionName: mission.nombre,
      design: screen === 'lab' ? design : null,
      result: report ? { titulo: report.titulo, puntaje: report.puntaje, resultado: report.resultado } : null,
    });
  }, [screen, mission, design, report, room.members.length]);

  let view: JSX.Element;
  let shown: Screen = screen;
  if (screen === 'lab') {
    view = (
      <Lab
        design={design} mission={mission} onChange={setDesign} onLaunch={launch} onHome={() => setScreen('home')}
        headerExtra={<><CrewStrip crew={crew} /><ShareButton design={design} missionId={missionId} crew={crew} /></>}
        banner={sharedHere && (
          <SharedBanner
            shared={sharedHere.payload} previous={sharedHere.previous}
            onRestore={() => { if (sharedHere.previous) setDesign(sharedHere.previous); setShared(null); }}
            onDismiss={() => setShared(null)}
          />
        )}
      />
    );
  } else if (screen === 'flight') {
    view = <Flight key={flightKey} design={design} mission={mission} onEnd={finish} onBack={() => setScreen('lab')} />;
  } else if (screen === 'report' && report) {
    view = (
      <Report
        report={report} onRetry={launch} onLab={missionId === 'luna' ? undefined : () => setScreen('lab')} onHome={() => setScreen('home')}
        extra={(crew.length > 0 || lastEntry) && (
          <div className="report-team">
            <CrewStrip crew={crew} />
            {lastEntry && lastEntry.design && (
              <div><ShareButton design={lastEntry.design} missionId={lastEntry.mission} crew={crew} result={lastResult} entryId={lastEntry.id} label="Share this flight" /></div>
            )}
          </div>
        )}
      />
    );
  } else if (screen === 'luna') {
    view = <Lander key={flightKey} onEnd={finishLuna} onHome={() => setScreen('home')} />;
  } else if (screen === 'atlas') {
    view = <Atlas design={atlasDesign} onHome={() => setScreen('home')} onLab={() => start('sandbox')} />;
  } else {
    shown = 'home';
    view = (
      <Home
        logbook={logbook} onStart={start} onAtlas={() => setScreen('atlas')} onClearLog={() => setLogbook([])}
        extra={(
          <>
            {badLink && <BadLinkNotice onDismiss={() => setBadLink(false)} />}
            <RoomCard />
            <FlightBoard entries={ranking} crew={crew} onLoad={loadEntry} onClear={() => setRanking([])} />
          </>
        )}
      />
    );
  }
  // Un invitado ve la sala en lugar del juego propio; al salir vuelve a su partida.
  if (room.role === 'guest') {
    return <GuestScreen />;
  }
  return (
    <>
      {view}
      <RoomPill />
      <MissionControl screen={shown} mission={mission} design={shown === 'atlas' ? atlasDesign : design} report={report} />
    </>
  );
}
