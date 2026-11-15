import { useId } from 'react';

const explanations: Record<string, string> = {
  'Delta-v left': 'How much more the craft can change its speed with the propellant it has left; it is not its current speed.',
  'Total delta-v (vacuum)': 'Change in speed available from burning all the propellant in vacuum; use it to estimate how far the craft can go.',
  'Periapsis': 'Lowest point of the orbit: if it is inside the atmosphere, the craft will fall back into it.',
  'Apoapsis': 'Highest point of the orbit; speeding up near it raises the lowest point.',
  'Time to apoapsis': 'Time left until the craft reaches the highest point of its orbit.',
  'Thrust/weight': 'Compares engine force with the weight of the craft; at liftoff it must be greater than 1.',
  'Liftoff thrust/weight': 'Compares engine force with the starting weight; below 1 the craft does not lift off.',
  'Prograde': 'Points the way the craft is traveling; thrusting like this increases its orbital speed.',
  'Retrograde': 'Points against the direction of travel; firing the engine like this slows the craft down.',
  'Aerodynamic load': 'Stress the air puts on the craft; turning sideways during ascent increases it.',
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
