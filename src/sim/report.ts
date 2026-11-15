import { ATM_TOP, G0, MU, RE } from './constants';
import { MATERIALS } from './catalog';
import { Flight, orbitOf, scienceTotals } from './flight';
import { Mission, objectivesDone } from './missions';
import { computeStats } from './vehicle';

export interface Report {
  titulo: string;
  resultado: 'exito' | 'parcial' | 'fallo' | 'libre';
  resumen: string;
  /** Qué ocurrió y por qué, en orden de importancia. */
  causas: string[];
  aciertos: string[];
  sugerencias: string[];
  cifras: { k: string; v: string }[];
  ciencia: { obtenida: number; entregada: number; mediciones: number };
  objetivos: { texto: string; ok: boolean }[];
  referencia: { texto: string; fuente: string; url: string } | null;
  puntaje: number;
  fecha: string;
  mision: string;
  nave: string;
}

const n = (x: number, d = 0) => x.toLocaleString('es-CO', { maximumFractionDigits: d, minimumFractionDigits: d });
const km = (m: number) => `${n(m / 1000, m < 10e3 ? 1 : 0)} km`;

const REFS = {
  maxq: {
    texto: 'La presión dinámica depende de la densidad del aire y del cuadrado de la velocidad. Los lanzadores reales reducen potencia al atravesar su máximo ("max-Q").',
    fuente: 'NASA Glenn Research Center · Dynamic Pressure',
    url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/dynamic-pressure/',
  },
  cohete: {
    texto: 'La ecuación del cohete relaciona el cambio de velocidad con la masa de propelente y el impulso específico del motor: cada kilo de más exige más propelente.',
    fuente: 'NASA Glenn Research Center · Ideal Rocket Equation',
    url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/',
  },
  twr: {
    texto: 'Un cohete solo despega si su empuje supera su peso. La relación empuje/peso determina la aceleración inicial.',
    fuente: 'NASA Glenn Research Center · Thrust to Weight Ratio',
    url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/thrust-to-weight-ratio/',
  },
  cubesat: {
    texto: 'Un CubeSat pasa por las mismas fases que un satélite grande: lanzamiento, despliegue, contacto y operación. Todo con márgenes mínimos de masa, energía y datos.',
    fuente: 'NASA CubeSat Launch Initiative · CubeSat 101',
    url: 'https://www3.nasa.gov/sites/default/files/atoms/files/nasa_csli_cubesat_101_508.pdf',
  },
  reentrada: {
    texto: 'Al reentrar, la nave convierte su enorme energía de movimiento en calor. Sin un escudo térmico, ese calor destruye la estructura.',
    fuente: 'NASA Glenn Research Center · Rocket aerodynamics',
    url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-aerodynamics/',
  },
};

export function buildReport(f: Flight, mission: Mission): Report {
  const d = f.design;
  const s = f.stats;
  const vs = computeStats(d);
  const mat = MATERIALS[d.material];
  const sci = scienceTotals(f);
  const done = objectivesDone(mission, f);
  const objetivos = mission.objetivos.map((o, i) => ({ texto: o.texto, ok: done[i] }));
  const allDone = objetivos.length > 0 && objetivos.every((o) => o.ok);
  const o = orbitOf(f.r, f.v);
  const inOrbit = !f.landed && o.e < 1 && o.pe - RE > ATM_TOP;
  const propLeft = f.stages.slice(f.stageIdx).reduce((a, x) => a + x.prop, 0);

  const causas: string[] = [];
  const aciertos: string[] = [];
  const sugerencias: string[] = [];
  let titulo = 'Vuelo terminado';
  let resultado: Report['resultado'] = mission.objetivos.length ? 'parcial' : 'libre';
  let referencia: Report['referencia'] = null;
  const lostTotal = s.gravLoss + s.dragLoss;

  if (s.liftoffT === null) {
    titulo = 'La nave no despegó';
    resultado = mission.objetivos.length ? 'fallo' : 'libre';
    const st = vs.stages[0];
    if (st && st.twr < 1) {
      causas.push(`El empuje al nivel del mar es de ${n(st.thrust / 1000)} kN y el peso de la nave es de ${n((vs.liftoffMass * G0) / 1000)} kN: una relación empuje/peso de ${n(st.twr, 2)}. Con menos de 1, el cohete no puede levantarse.`);
      if (s.propBurnedOnPad > 0) causas.push(`Quemaste ${n(s.propBurnedOnPad)} kg de propelente en la plataforma sin moverte.`);
      sugerencias.push('Agrega motores a la primera etapa o reduce masa hasta superar una relación de 1,2.');
      referencia = REFS.twr;
    } else {
      causas.push('Los motores nunca se encendieron.');
    }
  } else if (f.ended === 'estructura') {
    titulo = 'Rotura estructural';
    resultado = 'fallo';
    const aoa = (s.failAoa * 180) / Math.PI;
    causas.push(`La carga aerodinámica llegó a ${n(s.failValue / 1000, 1)} kPa a ${km(s.failAlt)} y ${n(s.failSpeed)} m/s. El límite del ${mat.nombre.toLowerCase()} es de ${n(mat.qLimit / 1000)} kPa.`);
    if (aoa > 8) {
      causas.push(`La nave volaba ${n(aoa)}° desviada de su dirección de avance. Ese ángulo multiplicó la carga: de frente habría sido de ${n(s.failValue / (1 + 3 * Math.abs(Math.sin(s.failAoa))) / 1000, 1)} kPa.`);
      sugerencias.push('Mientras haya aire denso, mantén el morro alineado con la trayectoria (modo prograda).');
    } else {
      causas.push(`La relación empuje/peso de ${n(vs.twrLiftoff, 2)} aceleró la nave demasiado rápido dentro del aire denso.`);
      sugerencias.push('Reduce la potencia entre 8 y 15 km de altura, donde la presión dinámica es máxima.');
    }
    sugerencias.push('Otra opción es un material más resistente, a cambio de más masa.');
    if (!d.tested.vibracion) sugerencias.push('No habías ensayado la estructura: el límite existía, pero no lo veías en los instrumentos.');
    referencia = REFS.maxq;
  } else if (f.ended === 'aceleracion') {
    titulo = 'Rotura por aceleración';
    resultado = 'fallo';
    causas.push(`La aceleración llegó a ${n(s.failValue, 1)} g a ${km(s.failAlt)}. La estructura soporta ${n(mat.gLimit)} g.`);
    causas.push('Al vaciarse los depósitos la nave pesa mucho menos, y el mismo empuje la acelera cada vez más.');
    sugerencias.push('Reduce la potencia al final de cada etapa, cuando queda poco propelente.');
    referencia = REFS.cohete;
  } else if (f.ended === 'calor') {
    titulo = 'Destrucción por calentamiento';
    resultado = inOrbit ? 'parcial' : 'fallo';
    causas.push(`La nave entró al aire denso a ${n(s.failSpeed)} m/s y a ${km(s.failAlt)}. El flujo de calor superó lo que soporta sin escudo térmico.`);
    sugerencias.push('Para regresar de órbita la carga útil necesita escudo térmico.');
    referencia = REFS.reentrada;
  } else if (f.ended === 'impacto') {
    titulo = 'Impacto contra la superficie';
    resultado = 'fallo';
    causas.push(`La nave chocó a ${n(s.failValue)} m/s.`);
    if (s.burnoutSpeed !== null) {
      const vCirc = Math.sqrt(MU / (RE + Math.max(s.burnoutAlt, 0)));
      causas.push(`El propelente se agotó a ${km(s.burnoutAlt)} y ${n(s.burnoutSpeed)} m/s. Para quedar en órbita a esa altura se necesitan ${n(vCirc)} m/s: faltaron ${n(Math.max(0, vCirc - s.burnoutSpeed))} m/s.`);
      causas.push(`De los ${n(s.dvUsed)} m/s que entregaron los motores, ${n(s.gravLoss)} se gastaron sosteniendo la nave contra la gravedad y ${n(s.dragLoss)} venciendo el aire.`);
      if (s.gravLoss > 1800) sugerencias.push('Subiste demasiado vertical. Inclina antes la nave hacia el este para convertir empuje en velocidad horizontal.');
      sugerencias.push('Más delta-v ayuda: menos masa seca, más propelente o un motor de vacío en la última etapa.');
      referencia = REFS.cohete;
    } else {
      sugerencias.push('Para aterrizar hace falta paracaídas o frenar con el motor por debajo de 10 m/s.');
    }
  } else if (f.ended === 'aterrizaje') {
    titulo = 'Aterrizaje seguro';
    aciertos.push(`La nave tocó tierra a ${n(s.failSpeed, 1)} m/s.`);
    if (resultado !== 'libre') resultado = allDone ? 'exito' : 'parcial';
  }

  if (s.liftoffT !== null) {
    if (inOrbit && f.ended !== 'calor') {
      titulo = allDone ? 'Misión cumplida' : 'En órbita';
      aciertos.push(`Órbita de ${n((o.pe - RE) / 1000)} × ${n((o.ap - RE) / 1000)} km, con una vuelta cada ${n(o.period / 60, 1)} minutos.`);
      aciertos.push(`El ascenso costó ${n(s.dvUsed)} m/s. Las pérdidas por gravedad y aire fueron de ${n(lostTotal)} m/s (${n((lostTotal / Math.max(1, s.dvUsed)) * 100)} %).`);
      if (propLeft > 1) aciertos.push(`Quedaron ${n(propLeft)} kg de propelente de reserva para maniobras.`);
      if (!referencia) referencia = mission.referencia ?? (mission.id === 'cubesat' ? REFS.cubesat : REFS.cohete);
    }
    if (s.maxLoad > 0 && f.ended !== 'estructura') {
      const pct = (s.maxLoad / mat.qLimit) * 100;
      if (pct > 85) sugerencias.push(`La carga aerodinámica llegó al ${n(pct)} % del límite estructural. Estuviste cerca de romper la nave.`);
      else if (s.maxAlt > 30e3) aciertos.push(`La carga aerodinámica máxima fue de ${n(s.maxLoad / 1000, 1)} kPa a ${km(s.maxQAlt)}: ${n(pct)} % del límite.`);
    }
  }
  if (allDone) resultado = 'exito';

  // Objetivos no cumplidos: explica el primero que faltó.
  if (!allDone && mission.objetivos.length && resultado !== 'fallo') {
    const i = done.indexOf(false);
    if (i >= 0) sugerencias.push(`Siguiente objetivo: ${mission.objetivos[i].texto.toLowerCase()}. ${mission.objetivos[i].ayuda}`);
  }
  if (sci.obtenida > 0 && sci.entregada < sci.obtenida * 0.99) {
    sugerencias.push(`Quedaron ${n(sci.pendientesMB, 1)} MB de datos a bordo sin transmitir. La ciencia cuenta por completo cuando llega a Tierra.`);
  }
  if (f.flags.dead) causas.push('La batería llegó a cero: los instrumentos y la antena dejaron de funcionar.');
  if (f.panelsLost) causas.push('Los paneles y la antena se arrancaron al entrar desplegados al aire.');

  const cifras = [
    { k: 'Altitud máxima', v: km(s.maxAlt) },
    { k: 'Velocidad máxima', v: `${n(s.maxSpeed)} m/s` },
    { k: 'Tiempo de misión', v: `${n(f.t / 60, 1)} min` },
    { k: 'Delta-v usado', v: `${n(s.dvUsed)} m/s` },
    { k: 'Pérdida por gravedad', v: `${n(s.gravLoss)} m/s` },
    { k: 'Pérdida por aire', v: `${n(s.dragLoss)} m/s` },
    { k: 'Presión dinámica máxima', v: `${n(s.maxQ / 1000, 1)} kPa` },
    { k: 'Aceleración máxima', v: `${n(s.maxG, 1)} g` },
    { k: 'Masa al despegue', v: `${n(vs.liftoffMass)} kg` },
    { k: 'Costo del vehículo', v: `${n(vs.cost, 1)} M USD` },
  ];

  let puntaje = sci.entregada * 10 + sci.obtenida * 3;
  if (mission.objetivos.length) puntaje += done.filter(Boolean).length * 100;
  if (allDone) puntaje += 200 + Math.max(0, 600 - (s.doneT ?? f.t) / 6) + (mission.presupuesto ? Math.max(0, (mission.presupuesto - vs.cost) * 20) : 0);

  const resumen = allDone
    ? 'Cumpliste todos los objetivos. Estas fueron las decisiones que lo hicieron posible.'
    : resultado === 'fallo'
      ? 'La misión no se completó. Esto fue lo que ocurrió, según la telemetría.'
      : resultado === 'libre'
        ? 'Vuelo libre registrado en la bitácora.'
        : 'Avanzaste, pero quedaron objetivos pendientes.';

  return {
    titulo, resultado, resumen, causas, aciertos, sugerencias, cifras,
    ciencia: { obtenida: sci.obtenida, entregada: sci.entregada, mediciones: f.measurements.length },
    objetivos, referencia,
    puntaje: Math.round(puntaje),
    fecha: new Date().toISOString(),
    mision: mission.nombre,
    nave: d.nombre,
  };
}
