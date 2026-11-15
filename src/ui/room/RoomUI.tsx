// Mission room screens: the card on the home screen, the pill the pilot sees while playing,
// and the full guest view with its stations.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ATM_TOP, RE } from '../../sim/constants';
import { INSTRUMENTS, MATERIALS } from '../../sim/catalog';
import {
  Flight, Sas, altitude, canDeploy, groundVelocity, linkStatus, orbitOf, payloadOnly, remainingDv, scienceTotals,
  storageUsed, timeToApsides, transmitBlocker,
} from '../../sim/flight';
import { MISSIONS, objectivesDone } from '../../sim/missions';
import { CONTEXTS, contextOf } from '../../sim/science';
import { CORES } from '../../sim/catalog';
import { computeStats, hasFairing } from '../../sim/vehicle';
import { Camera, isMapView, updateCamera, zoomCamera } from '../flightCamera';
import { Particle, fitZoom, render } from '../renderer';
import { drawVehicle, vehicleHeight } from '../vehicleDraw';
import { CODE_LENGTH, MAX_GUESTS, NAME_MAX, NOTE_MAX, STATIONS, Seat, Station, normalizeCode, seatName } from './protocol';
import {
  RoomState, inviteLink, roomCommand, roomGuestFlight, roomGuestNote, roomHostNote, roomJoin, roomLeave, roomOpen,
  roomTakeSeat, useRoom,
} from './room';
import '../team.css';
import './room.css';

const n = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const dist = (m: number) => (Math.abs(m) < 10e3 ? `${n(m)} m` : `${n(m / 1000, Math.abs(m) < 1000e3 ? 1 : 0)} km`);
const clock = (s: number) => {
  if (!isFinite(s)) return '—';
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), ss = t % 60;
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}`;
};

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function Roster({ room }: { room: RoomState }) {
  return (
    <ul className="room-roster">
      {room.members.map((m) => (
        <li key={m.id} className={m.id === room.myId ? 'me' : ''}>
          <span className={`seat-dot ${m.seat ?? 'none'}`} />
          <b>{m.name}</b>
          <i>{seatName(m.seat)}{m.id === room.myId ? ' · you' : ''}</i>
        </li>
      ))}
      {Array.from({ length: Math.max(0, MAX_GUESTS + 1 - room.members.length) }, (_, i) => (
        <li key={`free${i}`} className="free"><span className="seat-dot none" /><i>Open seat</i></li>
      ))}
    </ul>
  );
}

function Notes({ room, onSend }: { room: RoomState; onSend: (t: string) => void }) {
  const [text, setText] = useState('');
  const send = () => { if (text.trim()) { onSend(text); setText(''); } };
  return (
    <div className="room-notes">
      <div className="room-notes-list">
        {room.notes.length === 0 && <p className="muted small">Chat with your crew: a call, a warning, an idea for the craft.</p>}
        {room.notes.slice(-6).map((x, i) => <p key={`${x.at}-${i}`}><b>{x.from}</b> {x.text}</p>)}
      </div>
      <div className="room-notes-send">
        <input
          value={text} maxLength={NOTE_MAX} placeholder="Message the crew" aria-label="Message the crew"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') send(); }}
          onKeyUp={(e) => e.stopPropagation()}
        />
        <button className="btn tiny" onClick={send}>Send</button>
      </div>
    </div>
  );
}

// ---------- Home card ----------

export function RoomCard({ joinCode }: { joinCode?: string }) {
  const room = useRoom();
  const [name, setName] = useState(room.name);
  const [code, setCode] = useState(joinCode ?? '');
  const [copied, setCopied] = useState(false);
  const link = room.code ? inviteLink(room.code) : '';
  const busy = room.status === 'connecting';

  if (room.role === 'host' && (room.status === 'open' || room.status === 'connecting')) {
    return (
      <section className="team-card room-card live">
        <div className="team-head">
          <span className="mode-tag">Mission room · {room.status === 'open' ? 'open' : 'opening…'}</span>
          <h2>Your room is {room.status === 'open' ? 'live' : 'starting'}</h2>
          <p>Send the code or the link to up to three people. They join as guests, with no account, and each takes a station. Then pick a mission and fly: they see your flight live and operate their part of the craft.</p>
        </div>
        <div className="room-code-row">
          <div className="room-code" aria-label="Room code">{room.code}</div>
          <div className="share-link">
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
            <button className="btn primary" disabled={room.status !== 'open'} onClick={async () => { setCopied(await copy(link)); window.setTimeout(() => setCopied(false), 2500); }}>
              {copied ? 'Copied ✓' : 'Copy invite link'}
            </button>
          </div>
        </div>
        {room.error && <p className="issue">{room.error}</p>}
        <Roster room={room} />
        <Notes room={room} onSend={roomHostNote} />
        <div className="crew-foot">
          <span className="muted small">You are the pilot. Guests connect straight to your browser; if the room closes, your game keeps going solo.</span>
          <button className="btn tiny ghost" onClick={roomLeave}>Close room</button>
        </div>
      </section>
    );
  }

  return (
    <section className="team-card room-card">
      <div className="team-head">
        <span className="mode-tag">Mission room · live multiplayer · 2 to 4 players</span>
        <h2>Fly together</h2>
        <p>One of you pilots; the others join from their own computers as guests, with no account, and run the navigator, engineer and scientist stations on the same flight, live.</p>
      </div>
      <label className="field room-name">
        <span>Your name</span>
        <input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="room-actions">
        <div className="room-option">
          <b>I will pilot</b>
          <span>Open a room and invite your crew.</span>
          <button className="btn primary" disabled={busy} onClick={() => void roomOpen(name)}>{busy && room.role === 'host' ? 'Opening…' : 'Open a mission room'}</button>
        </div>
        <div className="room-option">
          <b>I have a code</b>
          <span>Join your pilot’s room as a guest.</span>
          <div className="room-join">
            <input value={code} maxLength={40} placeholder={'A'.repeat(CODE_LENGTH).replace(/A/g, '•')} aria-label="Room code" onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && normalizeCode(code)) void roomJoin(code, name); }} />
            <button className="btn" disabled={busy || !normalizeCode(code)} onClick={() => void roomJoin(code, name)}>Join</button>
          </div>
        </div>
      </div>
      {(room.status === 'error' || room.status === 'closed') && room.error && <p className="issue">{room.error}</p>}
      <p className="muted small">Players connect directly to each other. It needs internet, and some school or office networks block this kind of connection: if it cannot connect, the game still works solo and you can trade designs by link.</p>
    </section>
  );
}

// ---------- Pilot's pill ----------

/** Small always-visible room status for the pilot, on every screen. */
export function RoomPill() {
  const room = useRoom();
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!room.feedAt) return;
    const id = window.setTimeout(() => tick((x) => x + 1), 5200);
    return () => window.clearTimeout(id);
  }, [room.feedAt]);
  if (room.role !== 'host' || room.status !== 'open') return null;
  const fresh = room.feed && Date.now() - room.feedAt < 5000;
  return (
    <div className={`room-pill ${open ? 'open' : ''}`}>
      <button className="room-pill-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="live-dot" />Room <b>{room.code}</b> · {room.members.length} aboard
      </button>
      {fresh && !open && <div className="room-feed">{room.feed}</div>}
      {open && (
        <div className="room-pill-body">
          <Roster room={room} />
          <Notes room={room} onSend={roomHostNote} />
        </div>
      )}
    </div>
  );
}

// ---------- Guest view ----------

interface GuestHud {
  t: number; alt: number; speed: number; vr: number; ap: number; pe: number; toAp: number; throttle: number; warp: number;
  load: number; g: number; dv: number; stages: { fill: number; active: boolean; gone: boolean }[]; battery: number; batteryMax: number;
  sunlit: boolean; link: boolean; storage: number; storageMax: number; context: string; sas: Sas; deployed: boolean; canDeploy: boolean;
  transmitting: boolean; txBlock: string | null; sciO: number; sciE: number; objectives: boolean[]; ended: string | null;
  launched: boolean; paused: boolean; events: Flight['events']; instruments: Flight['design']['instruments'];
  qLimit: number; gLimit: number; missionId: string; last: Flight['measurements'];
}

function guestHud(f: Flight, warp: number, paused: boolean, missionId: string): GuestHud {
  const rm = Math.hypot(f.r.x, f.r.y);
  const o = orbitOf(f.r, f.v);
  const air = groundVelocity(f.r);
  const alt = rm - RE;
  const core = CORES[f.design.core];
  const sci = scienceTotals(f);
  const mat = MATERIALS[f.design.material];
  const mission = MISSIONS[missionId];
  return {
    t: f.t, alt, speed: alt < 45e3 ? Math.hypot(f.v.x - air.x, f.v.y - air.y) : Math.hypot(f.v.x, f.v.y),
    vr: (f.v.x * f.r.x + f.v.y * f.r.y) / rm, ap: o.e < 1 ? o.ap - RE : Infinity, pe: o.pe - RE,
    toAp: f.landed ? Infinity : timeToApsides(f.r, f.v, o).toAp, throttle: f.throttle, warp,
    load: f.now.load, g: f.now.g, dv: remainingDv(f),
    stages: f.stages.map((s, i) => ({ fill: s.propMax ? s.prop / s.propMax : 0, active: i === f.stageIdx, gone: i < f.stageIdx })),
    battery: f.battery, batteryMax: core.battery + f.design.batteries * 150, sunlit: f.now.sunlit, link: linkStatus(f) !== null,
    storage: storageUsed(f), storageMax: core.storage, context: CONTEXTS[contextOf(alt, f.landed)], sas: f.sas,
    deployed: f.deployed, canDeploy: canDeploy(f), transmitting: f.transmitting, txBlock: transmitBlocker(f),
    sciO: sci.obtenida, sciE: sci.entregada, objectives: mission ? objectivesDone(mission, f) : [], ended: f.ended,
    launched: f.stats.liftoffT !== null, paused, events: f.events.slice(-5), instruments: f.design.instruments,
    qLimit: mat.qLimit, gLimit: mat.gLimit, missionId, last: f.measurements.slice(-3).reverse(),
  };
}

function Row({ k, v, tone }: { k: string; v: string; tone?: 'ok' | 'bad' }) {
  return <div className={`row ${tone ?? ''}`}><span>{k}</span><b>{v}</b></div>;
}
function Bar({ label, value, pct, tone }: { label: string; value: string; pct: number; tone?: string }) {
  return (
    <div className="gauge">
      <div className="gauge-head"><span>{label}</span><b>{value}</b></div>
      <div className={`bar ${tone ?? ''}`}><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
    </div>
  );
}

function SeatPicker({ room, mySeat }: { room: RoomState; mySeat: Seat | null }) {
  return (
    <div className="seat-picker">
      {STATIONS.map((s) => {
        const taken = room.members.filter((m) => m.seat === s.id && m.id !== room.myId).map((m) => m.name);
        return (
          <button key={s.id} className={`seat-btn ${mySeat === s.id ? 'on' : ''}`} onClick={() => roomTakeSeat(mySeat === s.id ? null : s.id)} title={s.does}>
            <b>{s.name}</b>
            <span>{mySeat === s.id ? 'Your station' : taken.length ? `With ${taken.join(', ')}` : 'Free'}</span>
          </button>
        );
      })}
    </div>
  );
}

function CraftPreview({ room }: { room: RoomState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const design = room.idle?.design ?? null;
  const stats = useMemo(() => (design ? computeStats(design) : null), [design]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !design) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    try {
      const fair = hasFairing(design);
      const vh = vehicleHeight(design, 0, fair);
      const scale = Math.min((h - 30) / vh, (w - 40) / Math.max(computeStats(design).diameter * 2.4, 3));
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      drawVehicle(ctx, design, { fromStage: 0, fairingOn: fair, deployed: false, chute: false, flame: 0, vac: 0, time: 0 });
      ctx.restore();
    } catch { /* an odd design is simply not drawn */ }
  }, [design]);
  if (!design || !stats) return null;
  return (
    <div className="room-craft">
      <canvas ref={ref} />
      <div className="kv">
        <span>Craft</span><b>{design.nombre}</b>
        <span>Delta-v</span><b>{n(stats.dvVacTotal)} m/s</b>
        <span>Thrust/weight</span><b>{n(stats.twrLiftoff, 2)}</b>
        <span>Liftoff mass</span><b>{n(stats.liftoffMass)} kg</b>
        <span>Cost</span><b>{n(stats.cost, 1)} M USD</b>
        <span>Instruments</span><b>{design.instruments.map((i) => INSTRUMENTS[i].nombre).join(', ') || 'none'}</b>
      </div>
    </div>
  );
}

const IDLE_TEXT: Record<string, string> = {
  home: 'The pilot is choosing a mission.',
  lab: 'The pilot is in the Lab. This is the craft so far: say in the chat if you would change something.',
  report: 'The flight is over. The pilot is reading the mission report.',
  other: 'The pilot is on a screen that cannot be followed live yet. Stand by.',
};

export function GuestScreen() {
  const room = useRoom();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>({ zoom: 0.16, targetZoom: 0.16 });
  const [hud, setHud] = useState<GuestHud | null>(null);
  const mySeat = room.members.find((m) => m.id === room.myId)?.seat ?? null;
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // The instruments refresh on their own timer, so they work even before the canvas exists.
  useEffect(() => {
    if (!room.flying) { setHud(null); return; }
    const read = () => {
      const g = roomGuestFlight();
      if (!g) return;
      try { setHud(guestHud(g.f, g.warp, g.paused, g.missionId)); } catch { /* skip a bad update */ }
    };
    read();
    const id = window.setInterval(read, 150);
    return () => window.clearInterval(id);
  }, [room.flying]);

  const live = room.flying && hud !== null;
  useEffect(() => {
    if (!live) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0, last = performance.now(), time = 0, seenAt = 0;
    const particles: Particle[] = [];
    const resize = () => {
      const scale = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.round(canvas.clientWidth * scale);
      canvas.height = Math.round(canvas.clientHeight * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoomCamera(camRef.current, e.deltaY); };
    canvas.addEventListener('wheel', wheel, { passive: false });
    const frame = (now: number) => {
      const real = Math.min(0.1, (now - last) / 1000);
      last = now;
      time += real;
      const g = roomGuestFlight();
      if (g) {
        try {
          const f = g.f;
          if (g.at !== seenAt) seenAt = g.at;
          else if (!f.landed && !f.ended && !g.paused && now - g.at < 400) {
            // Between two updates from the pilot, the craft keeps moving along its velocity,
            // but only briefly: if updates stop arriving, the view waits instead of drifting.
            f.r.x += f.v.x * real * g.warp; f.r.y += f.v.y * real * g.warp; f.t += real * g.warp;
          }
          updateCamera(camRef.current, real, Math.atan2(f.r.y, f.r.x));
          render(ctx, canvas.clientWidth, canvas.clientHeight, f, camRef.current, time, particles, MISSIONS[g.missionId]?.target?.pos(f.t));
        } catch { /* a frame that fails is skipped */ }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); canvas.removeEventListener('wheel', wheel); };
  }, [live]);

  const toggleMap = () => {
    const c = canvasRef.current, g = roomGuestFlight();
    if (!c || !g) return;
    camRef.current.targetZoom = isMapView(camRef.current) ? 0.16 : fitZoom(g.f, c.clientWidth, c.clientHeight);
  };
  const say = room.say && Date.now() - room.sayAt < 4500 ? room.say : '';
  const feed = room.feed && Date.now() - room.feedAt < 5000 ? room.feed : '';
  const pilot = room.members.find((m) => m.seat === 'pilot')?.name ?? 'the pilot';

  // --- Not connected (yet, or any more) ---
  if (room.status !== 'open') {
    return (
      <div className="room-lobby">
        <div className="room-lobby-card">
          <span className="mode-tag">Mission room {room.code}</span>
          <h1>{room.status === 'connecting' ? 'Joining the room…' : 'Not connected'}</h1>
          {room.status === 'connecting'
            ? <p className="lead">Connecting to your pilot’s browser as <b>{room.name}</b>.</p>
            : <p className="issue bad">{room.error || 'The room is closed.'}</p>}
          <div className="report-actions">
            {room.status !== 'connecting' && room.code && <button className="btn primary" onClick={() => void roomJoin(room.code, room.name)}>Try again</button>}
            <button className="btn ghost" onClick={roomLeave}>Play solo</button>
          </div>
        </div>
      </div>
    );
  }

  // --- Lobby: the pilot is not flying ---
  if (!room.flying || !hud) {
    return (
      <div className="room-lobby">
        <div className="room-lobby-card wide">
          <span className="mode-tag">Mission room {room.code} · connected</span>
          <h1>Welcome aboard, {room.name}</h1>
          <p className="lead">{room.flying ? 'Receiving the flight…' : room.idle ? IDLE_TEXT[room.idle.screen] : `Waiting for ${pilot}.`}{room.idle?.missionName && room.idle.screen !== 'home' ? ` Mission: ${room.idle.missionName}.` : ''}</p>
          {room.idle?.result && <p className="room-result">Last flight: <b>{room.idle.result.titulo}</b> · {n(room.idle.result.puntaje)} pts</p>}
          <h3>Pick your station</h3>
          <SeatPicker room={room} mySeat={mySeat} />
          <p className="muted small">{mySeat ? STATIONS.find((s) => s.id === mySeat)?.does : 'Without a station you watch the flight as an observer. You can change at any time.'}</p>
          <div className="room-lobby-grid">
            <div><h3>Crew</h3><Roster room={room} /></div>
            <div><h3>Chat</h3><Notes room={room} onSend={roomGuestNote} /></div>
          </div>
          {room.idle?.screen === 'lab' && <CraftPreview room={room} />}
          <div className="report-actions"><button className="btn ghost" onClick={roomLeave}>Leave the room</button></div>
        </div>
      </div>
    );
  }

  // --- Live flight ---
  const mission = MISSIONS[hud.missionId];
  const failed = hud.ended && !['aterrizaje', 'usuario'].includes(hud.ended);
  const sasLabel: Record<Sas, string> = { mantener: 'Hold', prograda: 'Prograde', retrograda: 'Retrograde' };
  return (
    <div className="flight room-guest">
      <canvas ref={canvasRef} className="flight-canvas" />

      <div className="hud hud-top">
        <span className="chip room-chip"><span className="live-dot" />Live · room {room.code}</span>
        <div className="clock"><span className="lbl">T+</span>{clock(hud.t)}</div>
        <span className={`warp-x ${hud.warp > 1 ? 'on' : ''}`}>{hud.paused ? 'Paused' : `${hud.warp}×`}</span>
        <div className="chip">{hud.context}</div>
        <button className="btn tiny" onClick={toggleMap}>{isMapView(camRef.current) ? 'Craft view' : 'Map'}</button>
        <button className="btn tiny ghost" onClick={roomLeave}>Leave</button>
      </div>

      <div className="hud panel hud-left">
        <h4>Flight · piloted by {pilot}</h4>
        <Row k="Altitude" v={dist(hud.alt)} />
        <Row k="Speed" v={`${n(hud.speed)} m/s`} />
        <Row k="Vertical speed" v={`${n(hud.vr)} m/s`} />
        <Row k="Apoapsis" v={hud.launched ? dist(hud.ap) : '—'} tone={hud.ap > ATM_TOP ? 'ok' : undefined} />
        <Row k="Periapsis" v={hud.launched ? (hud.pe > -RE * 0.5 ? dist(hud.pe) : 'below ground') : '—'} tone={hud.pe > ATM_TOP ? 'ok' : undefined} />
        <Row k="Time to apoapsis" v={clock(hud.toAp)} />
        <Bar label="Throttle" value={`${n(hud.throttle * 100)} %`} pct={hud.throttle * 100} />
        <div className="stages">
          {hud.stages.map((s, i) => (
            <div key={i} className={`stage ${s.active ? 'active' : ''} ${s.gone ? 'gone' : ''}`}>
              <span>S{i + 1}</span><div className="bar"><i style={{ width: `${s.fill * 100}%` }} /></div><span className="num">{n(s.fill * 100)}%</span>
            </div>
          )).reverse()}
        </div>
        {mission && mission.objetivos.length > 0 && (
          <>
            <h4>{mission.nombre}</h4>
            <ul className="objectives">
              {mission.objetivos.map((ob, i) => (
                <li key={ob.id} className={hud.objectives[i] ? 'done' : ''}><span className="tick">{hud.objectives[i] ? '✓' : '○'}</span>{ob.texto}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="hud panel hud-right room-station">
        <h4>Your station</h4>
        <SeatPicker room={room} mySeat={mySeat} />
        {mySeat === null && <p className="note">You are observing. Pick a station to take part in the flight.</p>}

        {mySeat === 'navigator' && (
          <>
            <p className="note">Call the burns: tell {pilot} when to cut the engine and when to circularize at apoapsis.</p>
            <h4>Attitude hold</h4>
            <div className="seg">
              {(['mantener', 'prograda', 'retrograda'] as Sas[]).map((m) => (
                <button key={m} className={`btn tiny ${hud.sas === m ? 'on' : ''}`} onClick={() => roomCommand({ a: 'sas', m })}>{sasLabel[m]}</button>
              ))}
            </div>
            <h4>Time warp</h4>
            <div className="seg">
              <button className="btn tiny" onClick={() => roomCommand({ a: 'warp', d: -1 })}>◀ Slower</button>
              <button className="btn tiny" onClick={() => roomCommand({ a: 'warp', d: 1 })}>Faster ▶</button>
            </div>
            <Row k="Delta-v left" v={`${n(hud.dv)} m/s`} />
            <Row k="Orbit" v={hud.pe > ATM_TOP ? 'stable' : hud.ap > ATM_TOP ? 'raise the periapsis' : 'not yet'} tone={hud.pe > ATM_TOP ? 'ok' : undefined} />
          </>
        )}

        {mySeat === 'engineer' && (
          <>
            <p className="note">Watch the loads on the way up and warn {pilot} before a limit. In space, deploy the panels and antenna.</p>
            <Bar label="Aerodynamic load" value={`${n(hud.load / 1000, 1)} / ${n(hud.qLimit / 1000)} kPa`} pct={(hud.load / hud.qLimit) * 100} tone={hud.load > hud.qLimit * 0.85 ? 'bad' : hud.load > hud.qLimit * 0.65 ? 'warn' : ''} />
            <Bar label="Acceleration" value={`${n(hud.g, 1)} / ${n(hud.gLimit)} g`} pct={(hud.g / hud.gLimit) * 100} tone={hud.g > hud.gLimit * 0.85 ? 'bad' : hud.g > hud.gLimit * 0.65 ? 'warn' : ''} />
            <Bar label={`Battery ${hud.sunlit ? '· in sunlight' : '· in shadow'}`} value={`${n(hud.battery)} Wh`} pct={(hud.battery / Math.max(1, hud.batteryMax)) * 100} tone={hud.battery < hud.batteryMax * 0.15 ? 'bad' : ''} />
            <Row k="Delta-v left" v={`${n(hud.dv)} m/s`} />
            <button className={`btn wide ${hud.deployed ? 'on' : ''}`} disabled={!hud.deployed && !hud.canDeploy} onClick={() => roomCommand({ a: 'deploy' })}>
              {hud.deployed ? 'Stow panels and antenna' : 'Deploy panels and antenna'}
            </button>
            {!hud.deployed && !hud.canDeploy && <p className="note">Deploy only in flight, with no fairing, no thrust and out of dense air.</p>}
          </>
        )}

        {mySeat === 'scientist' && (
          <>
            <p className="note">Each instrument is worth more in some places than others, and repeating a reading in the same place is worth less.</p>
            <h4>Instruments · {hud.context}</h4>
            {hud.instruments.length === 0 && <p className="muted">This craft carries no instruments.</p>}
            {hud.instruments.map((i) => (
              <button key={i} className="inst" onClick={() => roomCommand({ a: 'measure', i })}>
                <span className="inst-name">{INSTRUMENTS[i].nombre}</span><span className="inst-val">Measure</span>
              </button>
            ))}
            <Bar label="Data on board" value={`${n(hud.storage, 1)} / ${n(hud.storageMax)} MB`} pct={(hud.storage / hud.storageMax) * 100} />
            <Row k="Link" v={hud.link ? 'station in view' : 'no line of sight'} tone={hud.link ? 'ok' : 'bad'} />
            <Row k="Science" v={`${n(hud.sciE, 1)} delivered / ${n(hud.sciO, 1)}`} />
            <button className={`btn wide ${hud.transmitting ? 'on' : ''}`} onClick={() => roomCommand({ a: 'tx' })}>
              {hud.transmitting ? (hud.txBlock ? 'Waiting for link… (stop)' : 'Downlinking… (stop)') : 'Downlink data'}
            </button>
            <div className="readings">
              {hud.last.map((m) => <div key={m.id} className="reading"><b>{INSTRUMENTS[m.instrument].nombre}</b> · {CONTEXTS[m.context]}<div>{m.reading}</div></div>)}
            </div>
          </>
        )}
        <h4>Chat</h4>
        <Notes room={room} onSend={roomGuestNote} />
      </div>

      <div className="hud events">
        {hud.events.map((e, i) => <div key={`${e.t}-${i}`} className={`event ${e.kind}`}><span>{clock(e.t)}</span>{e.text}</div>)}
      </div>
      {(say || feed) && <div className={`hud toast ${say ? '' : 'room-toast'}`}>{say || feed}</div>}
      {hud.ended && (
        <div className={`hud endcard ${failed ? 'bad' : 'ok'}`}>
          <h3>{failed ? 'Flight lost' : 'Flight ended'}</h3>
          <p>{pilot} is wrapping up. Stay in the room for the next flight.</p>
        </div>
      )}
    </div>
  );
}

export type { Station };
