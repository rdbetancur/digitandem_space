import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ANTENNAS, AntennaId, CORES, CoreId, ENGINES, EngineId, INSTRUMENTS, InstrumentId, MATERIALS, MaterialId,
  TANKS, TankId,
} from '../sim/catalog';
import { predictAscentLoad } from '../sim/flight';
import { Mission } from '../sim/missions';
import { Design, PRESETS, StageDesign, cloneDesign, computeStats, hasFairing } from '../sim/vehicle';
import { drawVehicle, vehicleHeight } from './vehicleDraw';
import Term from './Term';

const n = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
/** Delta-v de referencia para órbita baja terrestre, incluidas las pérdidas. */
const DV_LEO = 9400;

interface Props {
  design: Design;
  mission: Mission;
  onChange: (d: Design) => void;
  onLaunch: () => void;
  onHome: () => void;
}

export default function Lab({ design, mission, onChange, onLaunch, onHome }: Props) {
  const stats = useMemo(() => computeStats(design), [design]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tunnel, setTunnel] = useState<{ maxLoad: number; alt: number; speed: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const mat = MATERIALS[design.material];
  const core = CORES[design.core];

  /** Cambios de estructura invalidan los ensayos: el ensayo corresponde a un diseño concreto. */
  const edit = (fn: (d: Design) => void, structural = true) => {
    const d = cloneDesign(design);
    fn(d);
    if (structural) { d.tested = { vibracion: false, tunel: false }; setTunnel(null); }
    onChange(d);
  };
  const editStage = (i: number, fn: (s: StageDesign) => void) => edit((d) => fn(d.stages[i]));

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const fair = hasFairing(design);
    const vh = vehicleHeight(design, 0, fair);
    const scale = Math.min((h - 70) / vh, (w - 60) / Math.max(stats.diameter * 2.4, 3));
    // Regla de altura
    ctx.strokeStyle = 'rgba(140,170,210,0.25)';
    ctx.fillStyle = 'rgba(160,185,220,0.7)';
    ctx.font = '11px ui-monospace, Menlo, monospace';
    const base = h - 34;
    const step = vh > 40 ? 10 : vh > 16 ? 5 : 2;
    for (let m = 0; m <= vh + step; m += step) {
      const y = base - m * scale;
      if (y < 10) break;
      ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(w - 18, y); ctx.stroke();
      ctx.fillText(`${m} m`, 20, y - 3);
    }
    ctx.fillStyle = '#39414f';
    ctx.fillRect(w / 2 - 90, base, 180, 6);
    ctx.save();
    ctx.translate(w / 2, base - (vh * scale) / 2);
    ctx.scale(scale, scale);
    drawVehicle(ctx, design, { fromStage: 0, fairingOn: fair, deployed: false, chute: false, flame: 0, vac: 0, time: 0 });
    ctx.restore();
  }, [design, stats.diameter]);

  const runTest = (kind: 'vibracion' | 'tunel') => {
    setBusy(kind);
    window.setTimeout(() => {
      if (kind === 'tunel') setTunnel(predictAscentLoad(design));
      edit((d) => { d.tested[kind] = true; }, false);
      setBusy(null);
    }, 900);
  };

  const twr = stats.twrLiftoff;
  const overBudget = mission.presupuesto !== null && stats.cost > mission.presupuesto;
  const issues: { tone: 'bad' | 'warn'; text: string }[] = [];
  if (design.stages.length === 0) issues.push({ tone: 'bad', text: 'The craft has no propulsion stages.' });
  if (design.stages.length && twr < 1) issues.push({ tone: 'bad', text: `Thrust/weight of ${n(twr, 2)}: below 1 it will not lift off.` });
  else if (twr < 1.2 && design.stages.length) issues.push({ tone: 'warn', text: `Thrust/weight of ${n(twr, 2)}: it will lift off very slowly and waste propellant fighting gravity.` });
  if (twr > 2.2) issues.push({ tone: 'warn', text: `Thrust/weight of ${n(twr, 2)}: it will accelerate very fast in dense air. Watch the aerodynamic load.` });
  if (stats.dvVacTotal < DV_LEO) issues.push({ tone: 'warn', text: `Delta-v of ${n(stats.dvVacTotal)} m/s: not enough for low orbit (about ${n(DV_LEO)} m/s).` });
  if (design.instruments.length > 0 && design.antenna === 'ninguna') issues.push({ tone: 'warn', text: 'It carries instruments but no antenna: data only counts if it gets back to Earth.' });
  if (stats.solarW < stats.baseW) issues.push({ tone: 'warn', text: `It generates ${n(stats.solarW)} W and uses ${n(stats.baseW)} W at rest: it will depend on the battery (${n(stats.batteryWh / Math.max(1, stats.baseW - stats.solarW), 1)} h).` });
  if (overBudget) issues.push({ tone: 'bad', text: `It costs ${n(stats.cost, 1)} M USD and the contract allows ${n(mission.presupuesto!)} M USD.` });
  if (tunnel && tunnel.maxLoad > mat.qLimit && design.tested.vibracion) issues.push({ tone: 'warn', text: 'At full throttle the load exceeds the structural limit: you will need to throttle down in dense air.' });
  const blocked = design.stages.length === 0 || overBudget;

  return (
    <div className="lab">
      <header className="lab-head">
        <button className="btn ghost" onClick={onHome}>← Home</button>
        <div>
          <h2>Lab</h2>
          <p className="muted">{mission.nombre}{mission.presupuesto ? ` · budget ${n(mission.presupuesto)} M USD` : ' · no budget, no clock'}</p>
        </div>
        <label className="field inline">
          <span>Base designs</span>
          <select value="" onChange={(e) => { if (e.target.value) { setTunnel(null); onChange(cloneDesign(PRESETS[e.target.value])); } }}>
            <option value="">Load a design…</option>
            {Object.entries(PRESETS).map(([k, p]) => <option key={k} value={k}>{p.nombre}</option>)}
          </select>
        </label>
      </header>

      <div className="lab-body">
        <section className="lab-col parts">
          <div className="card">
            <h3>Payload</h3>
            <label className="field"><span>Vehicle</span>
              <select value={design.core} onChange={(e) => edit((d) => {
                d.core = e.target.value as CoreId;
                d.instruments = d.instruments.slice(0, CORES[d.core].maxInstruments);
              })}>
                {Object.entries(CORES).map(([k, c]) => <option key={k} value={k}>{c.nombre} · {n(c.mass)} kg</option>)}
              </select>
            </label>
            <p className="note">{core.nota}</p>
            <div className="chips">
              {(Object.keys(INSTRUMENTS) as InstrumentId[]).map((k) => {
                const on = design.instruments.includes(k);
                const full = !on && design.instruments.length >= core.maxInstruments;
                return (
                  <button key={k} className={`chipbtn ${on ? 'on' : ''}`} disabled={full} title={INSTRUMENTS[k].nota}
                    onClick={() => edit((d) => { d.instruments = on ? d.instruments.filter((x) => x !== k) : [...d.instruments, k]; }, false)}>
                    {INSTRUMENTS[k].nombre}<small>{n(INSTRUMENTS[k].mass, 1)} kg · {n(INSTRUMENTS[k].mb, 1)} MB</small>
                  </button>
                );
              })}
            </div>
            <p className="note">Instruments: {design.instruments.length} of {core.maxInstruments}.</p>
            <div className="grid2">
              <Stepper label="Solar panels" value={design.panels} min={0} max={6} onChange={(v) => edit((d) => { d.panels = v; }, false)} />
              <Stepper label="Extra batteries" value={design.batteries} min={0} max={6} onChange={(v) => edit((d) => { d.batteries = v; }, false)} />
            </div>
            <label className="field"><span>Antenna</span>
              <select value={design.antenna} onChange={(e) => edit((d) => { d.antenna = e.target.value as AntennaId; }, false)}>
                {Object.entries(ANTENNAS).map(([k, a]) => <option key={k} value={k}>{a.nombre}{a.rate ? ` · ${n(a.rate, 2)} MB/s` : ''}</option>)}
              </select>
            </label>
            <div className="toggles">
              <Toggle label="Aerodynamic fairing" on={design.fairing && design.core !== 'capsula'} disabled={design.core === 'capsula'} onChange={(v) => edit((d) => { d.fairing = v; })} />
              <Toggle label="Heat shield" on={design.shield || design.core === 'capsula'} disabled={design.core === 'capsula'} onChange={(v) => edit((d) => { d.shield = v; })} />
              <Toggle label="Parachute" on={design.chute && core.chuteCdA > 0} disabled={core.chuteCdA === 0} onChange={(v) => edit((d) => { d.chute = v; })} />
            </div>
          </div>

          {design.stages.map((_, idx) => {
            const i = design.stages.length - 1 - idx;
            const s = design.stages[i];
            const st = stats.stages[i];
            return (
              <div className="card" key={i}>
                <div className="card-head">
                  <h3>Stage {i + 1}{i === 0 ? ' · liftoff' : ''}</h3>
                  <button className="btn tiny ghost" onClick={() => edit((d) => { d.stages.splice(i, 1); })}>Remove</button>
                </div>
                <label className="field"><span>Engine</span>
                  <select value={s.engine} onChange={(e) => editStage(i, (x) => { x.engine = e.target.value as EngineId; })}>
                    {Object.entries(ENGINES).map(([k, en]) => <option key={k} value={k}>{en.nombre} · {n(en.thrustVac / 1000)} kN · Isp {en.ispVac} s</option>)}
                  </select>
                </label>
                <p className="note">{ENGINES[s.engine].nota}</p>
                <label className="field"><span>Tank</span>
                  <select value={s.tank} onChange={(e) => editStage(i, (x) => { x.tank = e.target.value as TankId; })}>
                    {Object.entries(TANKS).map(([k, t]) => <option key={k} value={k}>{t.nombre} · Ø {n(t.diameter, 1)} m</option>)}
                  </select>
                </label>
                <div className="grid2">
                  <Stepper label="Engines" value={s.engines} min={1} max={9} onChange={(v) => editStage(i, (x) => { x.engines = v; })} />
                  <Stepper label="Tanks" value={s.tanks} min={1} max={12} onChange={(v) => editStage(i, (x) => { x.tanks = v; })} />
                </div>
                <div className="stage-stats">
                  <span>Δv <b>{n(st.dvVac)} m/s</b></span>
                  <span><Term text="Thrust/weight" /> <b className={st.twr < 1 && i === 0 ? 'bad' : ''}>{n(st.twr, 2)}</b></span>
                  <span>Burn <b>{n(st.burnTime)} s</b></span>
                </div>
              </div>
            );
          })}
          {design.stages.length < 3 && (
            <button className="btn wide" onClick={() => edit((d) => { d.stages.unshift({ engine: 'colibri', engines: 3, tank: 't1000', tanks: 3 }); })}>
              + Add stage below
            </button>
          )}
          <div className="card">
            <h3>Structural material</h3>
            <div className="chips col">
              {(Object.keys(MATERIALS) as MaterialId[]).map((k) => (
                <button key={k} className={`chipbtn ${design.material === k ? 'on' : ''}`} onClick={() => edit((d) => { d.material = k; })}>
                  {MATERIALS[k].nombre}<small>{MATERIALS[k].nota}</small>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="lab-col view">
          <canvas ref={canvasRef} className="lab-canvas" />
          <input className="name" value={design.nombre} onChange={(e) => edit((d) => { d.nombre = e.target.value; }, false)} aria-label="Craft name" />
        </section>

        <section className="lab-col summary">
          {mission.requisitos && (
            <div className="card">
              <h3>Mission requirements</h3>
              {mission.requisitos.map((r, i) => <p key={i} className="note">{r}</p>)}
            </div>
          )}
          <div className="card">
            <h3>Vehicle summary</h3>
            <Meter label="Total delta-v (vacuum)" value={`${n(stats.dvVacTotal)} m/s`} pct={(stats.dvVacTotal / 12000) * 100} mark={(DV_LEO / 12000) * 100} markLabel="low orbit" tone={stats.dvVacTotal >= DV_LEO ? 'ok' : 'warn'} />
            <Meter label="Liftoff thrust/weight" value={n(twr, 2)} pct={(twr / 3) * 100} mark={(1 / 3) * 100} markLabel="1.0" tone={twr < 1 ? 'bad' : twr < 1.2 || twr > 2.2 ? 'warn' : 'ok'} />
            <Meter label="Cost" value={`${n(stats.cost, 1)} M USD`} pct={mission.presupuesto ? (stats.cost / mission.presupuesto) * 100 : Math.min(100, stats.cost)} tone={overBudget ? 'bad' : 'ok'} mark={mission.presupuesto ? 100 : undefined} markLabel={mission.presupuesto ? 'cap' : undefined} />
            <div className="kv">
              <span>Liftoff mass</span><b>{n(stats.liftoffMass)} kg</b>
              <span>Payload</span><b>{n(stats.payload, 1)} kg</b>
              <span>Power</span><b>{n(stats.solarW)} W solar · {n(stats.batteryWh)} Wh</b>
              <span>Base consumption</span><b>{n(stats.baseW)} W</b>
              <span>Data</span><b>{n(stats.storageMB)} MB · {n(stats.rateMBs, 2)} MB/s</b>
            </div>
          </div>

          <div className="card">
            <h3>Test benches</h3>
            <p className="note">A test does not change the craft: it reveals limits that are already there. You can fly untested, but blind.</p>
            <div className="test">
              <div>
                <b>Vibration table</b>
                <p className="note">{design.tested.vibracion
                  ? `Structural limit: ${n(mat.qLimit / 1000)} kPa of aerodynamic load and ${n(mat.gLimit)} g. It now shows on the flight instruments.`
                  : 'Loads the structure until it finds its limit.'}</p>
              </div>
              <button className={`btn tiny ${design.tested.vibracion ? 'on' : ''}`} disabled={busy !== null || design.tested.vibracion} onClick={() => runTest('vibracion')}>
                {busy === 'vibracion' ? 'Testing…' : design.tested.vibracion ? 'Tested' : 'Run test'}
              </button>
            </div>
            <div className="test">
              <div>
                <b>Wind tunnel</b>
                <p className="note">{design.tested.tunel && tunnel
                  ? `Drag coefficient ${n(stats.cd, 2)} over ${n(stats.area, 1)} m². At full throttle the load would reach ${n(tunnel.maxLoad / 1000, 1)} kPa at ${n(tunnel.alt / 1000, 1)} km and ${n(tunnel.speed)} m/s.`
                  : design.tested.tunel ? `Drag coefficient ${n(stats.cd, 2)} over ${n(stats.area, 1)} m².`
                    : 'Measures drag and predicts the peak load of a full-throttle ascent.'}</p>
              </div>
              <button className={`btn tiny ${design.tested.tunel ? 'on' : ''}`} disabled={busy !== null || design.stages.length === 0 || (design.tested.tunel && tunnel !== null)} onClick={() => runTest('tunel')}>
                {busy === 'tunel' ? 'Testing…' : design.tested.tunel && tunnel ? 'Tested' : 'Run test'}
              </button>
            </div>
          </div>

          <div className="card">
            <h3>Prelaunch review</h3>
            {issues.length === 0 && <p className="ok-line">No warnings. The design is consistent.</p>}
            {issues.map((x, i) => <p key={i} className={`issue ${x.tone}`}>{x.text}</p>)}
            <button className="btn primary wide big" disabled={blocked} onClick={onLaunch}>Roll out to the pad</button>
            {!blocked && issues.some((x) => x.tone === 'bad') && <p className="note">You can launch anyway. The report will explain what happens.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <div>
        <button className="btn tiny" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label}`}>−</button>
        <b>{value}</b>
        <button className="btn tiny" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label}`}>+</button>
      </div>
    </div>
  );
}

function Toggle({ label, on, disabled, onChange }: { label: string; on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`toggle ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Meter({ label, value, pct, mark, markLabel, tone }: { label: string; value: string; pct: number; mark?: number; markLabel?: string; tone: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="meter">
      <div className="gauge-head"><Term text={label} /><b>{value}</b></div>
      <div className={`bar ${tone}`}>
        <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
        {mark !== undefined && <em style={{ left: `${Math.min(100, mark)}%` }} />}
      </div>
      {markLabel && mark !== undefined && <div className="mark-label" style={{ left: `${Math.min(92, mark)}%` }}>{markLabel}</div>}
    </div>
  );
}
