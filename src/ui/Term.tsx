import { useId } from 'react';

const explanations: Record<string, string> = {
  'Delta-v restante': 'Cuánto más puede cambiar su velocidad la nave con el combustible que queda; no es su velocidad actual.',
  'Delta-v total (vacío)': 'Cambio de velocidad disponible al gastar el combustible en el vacío; sirve para estimar hasta dónde puede llegar la nave.',
  'Periapsis': 'Punto más bajo de la órbita: si queda dentro de la atmósfera, la nave volverá a entrar en ella.',
  'Apoapsis': 'Punto más alto de la órbita; acelerar cerca de él permite subir el punto más bajo.',
  'T. al apoapsis': 'Tiempo que falta para llegar al punto más alto de la órbita.',
  'Empuje/peso': 'Compara la fuerza del motor con el peso de la nave; al despegar debe ser mayor que 1.',
  'Empuje/peso al despegue': 'Compara la fuerza de los motores con el peso inicial; con menos de 1 la nave no despega.',
  'Prograda': 'Apunta en la dirección en la que viaja la nave; acelerar así aumenta su velocidad orbital.',
  'Retrógrada': 'Apunta contra la dirección de viaje; encender el motor así frena la nave.',
  'Carga aerodinámica': 'Esfuerzo que causa el aire sobre la nave; girar de lado durante el ascenso lo aumenta.',
};

export default function Term({ text }: { text: string }) {
  const id = useId();
  const explanation = explanations[text];
  if (!explanation) return <span>{text}</span>;
  return (
    <span className="term" tabIndex={0} aria-describedby={id}>
      {text}<span className="term-tip" role="tooltip" id={id}>{explanation}</span>
    </span>
  );
}
