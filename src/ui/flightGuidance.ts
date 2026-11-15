/** La guía observa el vuelo; no modifica la simulación ni avanza por temporizadores. */
export interface GuideState {
  launched: boolean; landed: boolean; ended: string | null;
  alt: number; ap: number; pe: number; toAp: number; vr: number;
  throttle: number; twr: number; free: boolean; fairing: boolean;
  deployed: boolean; canDeploy: boolean; orbiting: boolean;
  stages: { fill: number; active: boolean; gone: boolean }[];
}

export function flightGuide(h: GuideState) {
  if (!h.launched) return {
    step: 1, title: 'Enciende los motores',
    text: h.throttle > 0 && h.twr < 1
      ? 'El empuje/peso no alcanza 1: vuelve al laboratorio y añade empuje o reduce masa.'
      : 'Pulsa Espacio para encender a plena potencia. Primero sube en vertical.',
  };
  const orbit = h.orbiting && h.pe > 150e3;
  if (orbit) {
    if (!h.free) return { step: 5, title: 'Libera el satélite', text: 'Pulsa X para cortar el motor y Espacio para soltar la última etapa. No necesitas gastar el combustible restante.' };
    if (!h.deployed) return {
      step: 6, title: 'Despliega paneles y antena',
      text: h.canDeploy ? 'Pulsa G o el botón Desplegar en Sistemas.'
        : h.fairing ? 'Espera a que se suelte la cofia; protege al satélite durante el ascenso.'
        : 'Espera a estar sin empuje y fuera del aire denso. Entonces podrás pulsar G.',
    };
    return { step: 6, title: '¡Primer vuelo completado!', text: 'Ya estás en órbita con el satélite desplegado. Abre Ciencia, toma una medición y transmite cuando tengas enlace.' };
  }
  if (h.free) return { step: 4, title: 'La nave quedó sin motor', text: 'El periapsis aún no supera 150 km. Para intentarlo de nuevo, vuelve al laboratorio y conserva la última etapa hasta alcanzar la órbita.' };
  if (h.stages.some((s) => s.active && s.fill <= 0)) return {
    step: 3, title: 'Separa la etapa agotada', text: 'Pulsa Espacio para soltarla y activar la siguiente. Si era la última, necesitarás más delta-v en tu próximo diseño.',
  };
  if (h.ap >= 160e3 && h.vr > 0 && h.toAp > 35) return {
    step: 4, title: 'Espera cerca del apoapsis', text: 'Pulsa X para cortar el motor. Espera hasta que T. al apoapsis baje a unos 35 s; aún necesitas velocidad horizontal para entrar en órbita.',
  };
  if (h.alt >= 100e3 || (h.ap >= 160e3 && h.toAp <= 35)) return {
    step: 4, title: 'Eleva el periapsis', text: 'Selecciona Prograda y pulsa Z para acelerar cerca del apoapsis. Usa W/S para ajustar potencia hasta que el periapsis supere 150 km. P activa la ayuda automática de ascenso.',
  };
  return {
    step: 2, title: h.alt < 1000 ? 'Gana altura' : 'Inclina hacia el este',
    text: h.alt < 1000 ? 'Mantén la nave vertical durante los primeros segundos. Vigila las cargas; W/S ajusta la potencia.'
      : 'Mantén D brevemente para inclinar poco a poco hacia el este. Gana velocidad horizontal sin girar de golpe; busca un apoapsis por encima de 160 km. P activa la ayuda automática.',
  };
}
