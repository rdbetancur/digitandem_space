import { useEffect, useRef, useState } from 'react';
import { Mission } from '../sim/missions';
import { Report } from '../sim/report';
import { Design } from '../sim/vehicle';
import { describeDesign, describeMission, describeReport, flightContext } from './missionControlContext';

type Screen = 'home' | 'lab' | 'flight' | 'report' | 'atlas';
interface Msg { role: 'user' | 'assistant'; text: string; error?: boolean }

const SCREEN_NAME: Record<Screen, string> = {
  home: 'Inicio', lab: 'Laboratorio (diseñando la nave)', flight: 'Vuelo', report: 'Informe de misión', atlas: 'Atlas del sistema solar',
};

const IDEAS: Record<Screen, string[]> = {
  home: ['¿Por dónde empiezo?', '¿Qué es una órbita?', '¿Cómo se diseña una misión espacial?'],
  lab: ['¿Mi nave puede llegar a la órbita?', '¿Qué es el delta-v?', '¿Qué me conviene cambiar en este diseño?'],
  flight: ['¿Qué hago ahora?', '¿Cómo llego a la órbita?', '¿Qué significan apoapsis y periapsis?'],
  report: ['¿Por qué terminó así mi vuelo?', '¿Qué cambio para el próximo intento?', 'Explícame las pérdidas por gravedad'],
  atlas: ['¿Qué es una ventana de lanzamiento?', '¿Por qué cuesta tanto llegar a Mercurio?', '¿Por qué la señal tarda minutos en llegar?'],
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
    const parts = [`Pantalla actual: ${SCREEN_NAME[screen]}.`];
    if (screen !== 'home' && screen !== 'atlas') parts.push(describeMission(mission));
    if (screen !== 'home') parts.push(describeDesign(design));
    if (screen === 'flight') { const f = flightContext(); if (f) parts.push(`Telemetría en vivo:\n${f}`); }
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
      else setMsgs((m) => [...m, { role: 'assistant', error: true, text: data?.message ?? 'Control de Misión no está disponible en este momento.' }]);
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', error: true, text: 'Sin conexión con Control de Misión.' }]);
    }
    setBusy(false);
  };

  if (!open) {
    return (
      <button className="mc-fab" onClick={() => setOpen(true)} title="Pregúntale a Control de Misión">
        <span className="mc-dot" />Control de Misión
      </button>
    );
  }

  return (
    <section className="mc-panel" aria-label="Control de Misión">
      <header className="mc-head">
        <div>
          <b><span className="mc-dot" />Control de Misión</b>
          <small>Asistente con IA · {SCREEN_NAME[screen].split(' (')[0]}</small>
        </div>
        <div className="mc-head-actions">
          {msgs.length > 0 && <button className="btn tiny ghost" onClick={() => setMsgs([])}>Limpiar</button>}
          <button className="btn tiny" onClick={() => setOpen(false)} aria-label="Cerrar Control de Misión">✕</button>
        </div>
      </header>

      <div className="mc-list" ref={listRef}>
        {msgs.length === 0 && (
          <div className="mc-empty">
            <p>Aquí Control de Misión. Veo tu nave y tu vuelo: pregúntame qué hacer, por qué pasó algo o cómo funciona cualquier parte del juego.</p>
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
          ref={inputRef} value={text} rows={2} maxLength={1200} placeholder="Escribe tu pregunta…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text); } }}
        />
        <button className="btn primary" disabled={busy || !text.trim()}>Enviar</button>
      </form>
      <p className="mc-note">Respuestas generadas por IA: pueden tener errores. Contrasta con las fuentes del juego.</p>
    </section>
  );
}
