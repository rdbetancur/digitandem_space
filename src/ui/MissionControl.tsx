import { useEffect, useRef, useState } from 'react';
import { Mission } from '../sim/missions';
import { Report } from '../sim/report';
import { Design } from '../sim/vehicle';
import { describeDesign, describeMission, describeReport, flightContext } from './missionControlContext';

type Screen = 'home' | 'lab' | 'flight' | 'report' | 'atlas' | 'luna';
interface Msg { role: 'user' | 'assistant'; text: string; error?: boolean }

const SCREEN_NAME: Record<Screen, string> = {
  home: 'Home', lab: 'Lab (designing the craft)', flight: 'Flight', report: 'Mission report', atlas: 'Solar system atlas',
  luna: 'Lunar landing and surface base',
};

const IDEAS: Record<Screen, string[]> = {
  home: ['Where do I start?', 'What is an orbit?', 'How do you design a space mission?'],
  lab: ['Can my craft reach orbit?', 'What is delta-v?', 'What should I change in this design?'],
  flight: ['What do I do now?', 'How do I get to orbit?', 'What do apoapsis and periapsis mean?'],
  report: ['Why did my flight end like this?', 'What should I change for the next attempt?', 'Explain gravity losses to me'],
  atlas: ['What is a launch window?', 'Why is it so hard to get to Mercury?', 'Why does the signal take minutes to arrive?'],
  luna: ['When should I start braking?', 'Why is there water ice at the lunar south pole?', 'How do I make oxygen from ice?'],
};

interface Props {
  screen: Screen;
  mission: Mission;
  design: Design;
  report: Report | null;
}

export default function MissionControl({ screen, mission, design, report }: Props) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [msgs, busy, open]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const context = () => {
    const parts = [`Current screen: ${SCREEN_NAME[screen]}.`];
    if (screen !== 'home' && screen !== 'atlas') parts.push(describeMission(mission));
    if (screen !== 'home' && mission.id !== 'luna') parts.push(describeDesign(design));
    if (screen === 'flight' || screen === 'luna') { const f = flightContext(); if (f) parts.push(`Live telemetry:\n${f}`); }
    if (screen === 'report' && report) parts.push(describeReport(report));
    return parts.join('\n\n');
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const history = [...msgs.filter((m) => !m.error), { role: 'user' as const, text: q }];
    setMsgs((m) => [...m, { role: 'user', text: q }]);
    setText('');
    setBusy(true);
    try {
      const res = await fetch('/api/mission-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-10), context: context() }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.text) setMsgs((m) => [...m, { role: 'assistant', text: data.text }]);
      else setMsgs((m) => [...m, { role: 'assistant', error: true, text: data?.message ?? 'Mission Control is not available right now.' }]);
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', error: true, text: 'No connection to Mission Control.' }]);
    }
    setBusy(false);
  };

  if (!open) {
    return (
      <button className="mc-fab" onClick={() => setOpen(true)} title="Ask Mission Control">
        <span className="mc-dot" />Mission Control
      </button>
    );
  }

  return (
    <section className="mc-panel" aria-label="Mission Control">
      <header className="mc-head">
        <div>
          <b><span className="mc-dot" />Mission Control</b>
          <small>AI assistant · {SCREEN_NAME[screen].split(' (')[0]}</small>
        </div>
        <div className="mc-head-actions">
          {msgs.length > 0 && <button className="btn tiny ghost" onClick={() => setMsgs([])}>Clear</button>}
          <button className="btn tiny" onClick={() => setOpen(false)} aria-label="Close Mission Control">✕</button>
        </div>
      </header>

      <div className="mc-list" ref={listRef}>
        {msgs.length === 0 && (
          <div className="mc-empty">
            <p>Mission Control here. I can see your craft and your flight: ask me what to do, why something happened or how any part of the game works.</p>
            {IDEAS[screen].map((q) => <button key={q} className="mc-idea" onClick={() => ask(q)}>{q}</button>)}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`mc-msg ${m.role} ${m.error ? 'error' : ''}`}>{m.text}</div>
        ))}
        {busy && <div className="mc-msg assistant mc-typing"><i /><i /><i /></div>}
      </div>

      <form className="mc-form" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <textarea
          ref={inputRef} value={text} rows={2} maxLength={1200} placeholder="Type your question…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text); } }}
        />
        <button className="btn primary" disabled={busy || !text.trim()}>Send</button>
      </form>
      <p className="mc-note">AI-generated answers may contain mistakes. Check them against the game's sources.</p>
    </section>
  );
}
