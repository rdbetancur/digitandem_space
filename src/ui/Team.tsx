// Team features: crew with roles, sharing designs by link, and the flight board.
// Kept in one place so the shared screens only need small hooks into it.

import { useEffect, useMemo, useState } from 'react';
import { DesignDiff, LIMITS, SharePayload, SharedResult, TIP_TAGS, compareDesigns, shareUrl } from '../sim/share';
import { Design, computeStats } from '../sim/vehicle';
import { CREW_MAX, NAME_MAX, ROLES, Role, cleanCrew, crewFor, loadCrew, roleName, rolesBySeat } from './crew';
import { RankEntry, SORTS, SortKey, rank } from './ranking';
import { seatNames, useRoom } from './room/room';
import './team.css';

const n = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

// ---------- Crew ----------

/** Small name tag beside a panel title: who owns this panel. Renders nothing without a crew. */
export function CrewTag({ role }: { role: Role }) {
  const room = useRoom();
  const local = useMemo(() => crewFor(loadCrew(), role), [role]);
  // With a mission room open, the tag shows who sits at that station right now.
  if (room.role === 'host' && room.status === 'open' && room.members.length > 1) {
    const seat = role === 'director' ? 'navigator' : role;
    const names = seatNames(room.members, seat);
    if (!names) return null;
    const label = seat === 'navigator' ? 'Navigator' : roleName(role);
    return <span className="crew-tag" title={`${label}: ${names}`}><i>{label}</i>{names}</span>;
  }
  if (!local) return null;
  return <span className="crew-tag" title={`${roleName(role)}: ${local}`}><i>{roleName(role)}</i>{local}</span>;
}

/** One-line crew roster, for the Lab and the report. */
export function CrewStrip({ crew }: { crew: string[] }) {
  const seats = rolesBySeat(crew);
  if (seats.length === 0) return null;
  return (
    <div className="crew-strip" aria-label="Crew">
      {seats.map((s, i) => (
        <span key={i} className="crew-seat"><b>{s.name}</b><i>{s.roles.map(roleName).join(' · ')}</i></span>
      ))}
    </div>
  );
}

export function CrewCard({ crew, onChange }: { crew: string[]; onChange: (names: string[]) => void }) {
  const [draft, setDraft] = useState<string[]>(() => [...crew, '', '', '', ''].slice(0, CREW_MAX));
  const names = cleanCrew(draft);
  const seats = rolesBySeat(names);
  const set = (i: number, v: string) => {
    const next = draft.slice();
    next[i] = v.slice(0, NAME_MAX);
    setDraft(next);
    onChange(cleanCrew(next));
  };
  return (
    <section className="team-card crew-card">
      <div className="team-head">
        <span className="mode-tag">Crew · 1 to 4 players</span>
        <h2>Play as a crew</h2>
        <p>Gather around one screen. Type your names and each of you owns part of the mission. Your name appears on the panels you are responsible for.</p>
      </div>
      <div className="crew-inputs">
        {draft.map((v, i) => (
          <label key={i} className="field">
            <span>Player {i + 1}</span>
            <input value={v} maxLength={NAME_MAX} placeholder={i === 0 ? 'Your name' : 'Optional'} onChange={(e) => set(i, e.target.value)} />
          </label>
        ))}
      </div>
      {seats.length === 0 ? (
        <div className="crew-roles muted-roles">
          {ROLES.map((r) => <div key={r.id} className="crew-role"><b>{r.name}</b><span>{r.does}</span></div>)}
        </div>
      ) : (
        <div className="crew-roles">
          {ROLES.map((r) => (
            <div key={r.id} className="crew-role on">
              <b>{r.name}</b>
              <em>{crewFor(names, r.id)}</em>
              <span>{r.does}</span>
            </div>
          ))}
        </div>
      )}
      {seats.length > 0 && (
        <div className="crew-foot">
          <span className="muted small">{seats.length === 1 ? 'Flying solo: you hold every role.' : `Crew of ${seats.length}. Roles are shared out automatically.`}</span>
          <button className="btn tiny ghost" onClick={() => { setDraft(['', '', '', '']); onChange([]); }}>Clear crew</button>
        </div>
      )}
    </section>
  );
}

// ---------- Share ----------

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

interface ShareProps {
  design: Design;
  missionId: string;
  crew: string[];
  result?: SharedResult | null;
  /** Id of the flight on the board, so the receiver does not count it twice. */
  entryId?: string;
  label?: string;
  primary?: boolean;
}

/** "Share design" button with its dialog: add your name and advice, copy the link. */
export function ShareButton({ design, missionId, crew, result = null, entryId = '', label, primary }: ShareProps) {
  const [open, setOpen] = useState(false);
  const [by, setBy] = useState('');
  const [tip, setTip] = useState('');
  const [tags, setTags] = useState<number[]>([]);
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('');
  const stats = useMemo(() => computeStats(design), [design]);

  useEffect(() => {
    if (open) { setBy((b) => b || crew[0] || ''); setCopied(''); }
  }, [open, crew]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  const payload: SharePayload = { mission: missionId, design, by: by.trim(), crew, tip: tip.trim(), tags, result, id: entryId };
  const url = open ? shareUrl(window.location.href, payload) : '';
  const copy = async () => setCopied((await copyText(url)) ? 'ok' : 'fail');
  const toggle = (i: number) => setTags((t) => (t.includes(i) ? t.filter((x) => x !== i) : [...t, i].slice(0, 4)));

  return (
    <>
      <button className={`btn ${primary ? 'primary' : ''}`} onClick={() => setOpen(true)}>{label ?? 'Share design'}</button>
      {open && (
        <div className="team-overlay" onClick={() => setOpen(false)} onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}>
          <div className="team-dialog" role="dialog" aria-modal="true" aria-label="Share design" onClick={(e) => e.stopPropagation()}>
            <div className="card-head">
              <h3>{result ? 'Share this flight' : 'Share this design'}</h3>
              <button className="btn tiny ghost" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
            <p className="note">The whole craft travels inside the link: no account, no server. Whoever opens it lands in the Lab with your design, can change it and send it back.</p>
            <div className="share-summary">
              <b>{design.nombre}</b>
              <span>Δv {n(stats.dvVacTotal)} m/s</span>
              <span>T/W {n(stats.twrLiftoff, 2)}</span>
              <span>{n(stats.cost, 1)} M USD</span>
              {result && <span className={`res ${result.resultado}`}>{result.titulo} · {n(result.puntaje)} pts</span>}
            </div>
            <label className="field">
              <span>Your name</span>
              <input value={by} maxLength={LIMITS.by} placeholder="So they know who sent it" onChange={(e) => setBy(e.target.value)} />
            </label>
            <label className="field">
              <span>Advice for your teammate <i className="muted">({tip.length}/{LIMITS.tip})</i></span>
              <textarea value={tip} maxLength={LIMITS.tip} rows={3} placeholder="What worked? What should they change? e.g. “Throttle down to 60 % between 8 and 15 km, or it breaks up.”" onChange={(e) => setTip(e.target.value)} />
            </label>
            <div className="field">
              <span>What is this design good at?</span>
              <div className="tag-row">
                {TIP_TAGS.map((t, i) => (
                  <button key={t} className={`tagbtn ${tags.includes(i) ? 'on' : ''}`} onClick={() => toggle(i)}>{t}</button>
                ))}
              </div>
            </div>
            <div className="share-link">
              <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link to share" />
              <button className="btn primary" onClick={copy}>{copied === 'ok' ? 'Copied ✓' : 'Copy link'}</button>
            </div>
            {copied === 'fail' && <p className="issue">Could not copy automatically. Select the link and copy it by hand.</p>}
            {url.length > 1900 && <p className="note">This link is long. Some chat apps cut long links: a shorter note keeps it safe.</p>}
          </div>
        </div>
      )}
    </>
  );
}

// ---------- Shared design banner (Lab) ----------

function DiffTable({ rows }: { rows: DesignDiff[] }) {
  return (
    <table className="diff">
      <thead><tr><th>Compared</th><th>Shared</th><th>Yours</th><th>Difference</th></tr></thead>
      <tbody>
        {rows.map((r) => {
          const d = r.shared - r.mine;
          const tone = Math.abs(d) < 10 ** -r.digits / 2 || r.higherIsBetter === null ? '' : (d > 0) === r.higherIsBetter ? 'ok' : 'bad';
          return (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>{n(r.shared, r.digits)} {r.unit}</td>
              <td>{n(r.mine, r.digits)} {r.unit}</td>
              <td className={tone}>{d > 0 ? '+' : ''}{n(d, r.digits)} {r.unit}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface BannerProps {
  shared: SharePayload;
  /** The design the player had before opening the link, if any. */
  previous: Design | null;
  onRestore: () => void;
  onDismiss: () => void;
}

export function SharedBanner({ shared, previous, onRestore, onDismiss }: BannerProps) {
  const [compare, setCompare] = useState(false);
  const rows = useMemo(() => (previous ? compareDesigns(shared.design, previous) : []), [shared, previous]);
  const who = shared.by || 'a teammate';
  return (
    <div className="shared-banner">
      <div className="shared-main">
        <span className="mode-tag">Shared design</span>
        <p className="shared-title"><b>{shared.design.nombre}</b> was shared by <b>{who}</b>. Change it, fly it and send it back.</p>
        {shared.crew.length > 1 && <p className="muted small">Crew: {shared.crew.join(', ')}</p>}
        {shared.tip && <blockquote>“{shared.tip}” <cite>— {who}</cite></blockquote>}
        {shared.tags.length > 0 && <div className="tag-row static">{shared.tags.map((t) => <span key={t} className="tagbtn on">{TIP_TAGS[t]}</span>)}</div>}
        {shared.result && (
          <p className="shared-result">
            Their flight: <b className={`res ${shared.result.resultado}`}>{shared.result.titulo}</b> · {n(shared.result.puntaje)} pts
            {shared.result.maxAltKm !== undefined && <> · {n(shared.result.maxAltKm)} km</>}
            {shared.result.dvUsed !== undefined && <> · Δv {n(shared.result.dvUsed)} m/s</>}
            . Can you beat it?
          </p>
        )}
      </div>
      <div className="shared-actions">
        {previous && <button className={`btn tiny ${compare ? 'on' : ''}`} onClick={() => setCompare((v) => !v)}>Compare with mine</button>}
        {previous && <button className="btn tiny" onClick={onRestore}>Restore my design</button>}
        <button className="btn tiny ghost" onClick={onDismiss}>Dismiss</button>
      </div>
      {compare && previous && <DiffTable rows={rows} />}
    </div>
  );
}

/** Shown on Home when a link could not be read. */
export function BadLinkNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="shared-banner bad">
      <div className="shared-main"><p className="shared-title">That shared link is damaged or incomplete, so nothing was loaded. Ask for the link again.</p></div>
      <div className="shared-actions"><button className="btn tiny ghost" onClick={onDismiss}>Dismiss</button></div>
    </div>
  );
}

// ---------- Flight board ----------

interface BoardProps {
  entries: RankEntry[];
  crew: string[];
  onLoad: (e: RankEntry) => void;
  onClear: () => void;
}

export function FlightBoard({ entries, crew, onLoad, onClear }: BoardProps) {
  const [sort, setSort] = useState<SortKey>('score');
  const [mission, setMission] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const missions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) if (!seen.has(e.mission)) seen.set(e.mission, e.missionName);
    return [...seen.entries()];
  }, [entries]);
  const rows = useMemo(() => rank(entries, sort, mission).slice(0, 12), [entries, sort, mission]);
  const note = SORTS.find((s) => s.id === sort)!.note;
  const shared = entries.filter((e) => !e.mine).length;

  return (
    <section className="team-card board">
      <div className="team-head">
        <span className="mode-tag">Flight board</span>
        <h2>Who flew it best?</h2>
        <p>Your flights on this device, plus every flight a teammate sends you by link. Open a row to read their advice and load their craft.</p>
      </div>
      {entries.length === 0 ? (
        <div className="board-empty">
          <b>No flights yet.</b>
          <span>Fly any mission and it appears here. Then press <i>Share this flight</i> on the report and send the link: when your teammates open it, your flight joins their board, and theirs joins yours.</span>
        </div>
      ) : (
        <>
          <div className="board-filters">
            <div className="seg">
              {SORTS.map((s) => <button key={s.id} className={`btn tiny ${sort === s.id ? 'on' : ''}`} onClick={() => setSort(s.id)}>{s.label}</button>)}
            </div>
            {missions.length > 1 && (
              <div className="seg">
                <button className={`btn tiny ${mission === null ? 'on' : ''}`} onClick={() => setMission(null)}>All missions</button>
                {missions.map(([id, name]) => <button key={id} className={`btn tiny ${mission === id ? 'on' : ''}`} onClick={() => setMission(id)}>{name}</button>)}
              </div>
            )}
          </div>
          <p className="muted small">{note}</p>
          {rows.length === 0 && <p className="board-none">No flight qualifies for this category yet.</p>}
          <ol className="board-list">
            {rows.map((e, i) => {
              const isOpen = open === e.id;
              const who = e.crew.length > 1 ? e.crew.join(', ') : e.by || (e.mine ? crew[0] || 'You' : 'A teammate');
              return (
                <li key={e.id} className={`board-row ${isOpen ? 'open' : ''} ${i === 0 ? 'first' : ''}`}>
                  <button className="board-line" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen}>
                    <span className="pos">{i + 1}</span>
                    <span className="who"><b>{who}</b><i>{e.nave} · {e.missionName}</i></span>
                    <span className={`badge ${e.mine ? 'mine' : 'shared'}`}>{e.mine ? 'This device' : 'Shared'}</span>
                    <span className="stat">{e.maxAltKm !== undefined ? `${n(e.maxAltKm)} km` : '—'}</span>
                    <span className="stat">{e.dvUsed !== undefined ? `Δv ${n(e.dvUsed)}` : '—'}</span>
                    <span className={`dot ${e.resultado}`} title={e.titulo} />
                    <span className="score">{n(e.puntaje)}<i>pts</i></span>
                  </button>
                  {isOpen && (
                    <div className="board-more">
                      <p><b>{e.titulo}</b>{e.timeMin !== undefined && <> · {n(e.timeMin, 1)} min</>}{e.cost !== undefined && <> · {n(e.cost, 1)} M USD</>}{e.orbit && <> · reached orbit</>}</p>
                      {e.tip ? <blockquote>“{e.tip}”</blockquote> : <p className="muted small">No advice was added to this flight.</p>}
                      {e.tags.length > 0 && <div className="tag-row static">{e.tags.filter((t) => TIP_TAGS[t]).map((t) => <span key={t} className="tagbtn on">{TIP_TAGS[t]}</span>)}</div>}
                      <div className="board-actions">
                        {e.design && <button className="btn tiny" onClick={() => onLoad(e)}>Load this craft in the Lab</button>}
                        {e.design && (
                          <ShareButton design={e.design} missionId={e.mission} crew={e.crew} entryId={e.id} label="Share" result={{
                            titulo: e.titulo, resultado: e.resultado, puntaje: e.puntaje, maxAltKm: e.maxAltKm, dvUsed: e.dvUsed, timeMin: e.timeMin, cost: e.cost, orbit: e.orbit,
                          }} />
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="crew-foot">
            <span className="muted small">{entries.length} flight{entries.length === 1 ? '' : 's'} · {shared} received by link. Stored in this browser only: there is no account or server.</span>
            <button className="btn tiny ghost" onClick={onClear}>Clear board</button>
          </div>
        </>
      )}
    </section>
  );
}
