# ASCENSO

Juego de diseño de misiones espaciales para el reto **Space Mission Design Game** del
NASA Space Apps Challenge 2026. Diseñas una nave, la pones a prueba, la pilotas hasta la
órbita y haces ciencia. Cada decisión de ingeniería tiene una consecuencia física visible.

> Nombre provisional.

## Qué incluye esta versión (0.1)

- **Laboratorio**: carga útil, instrumentos, energía, antena, hasta tres etapas, tres materiales
  y revisión en vivo de masa, delta-v, empuje/peso, costo, energía y datos.
- **Bancos de ensayo**: mesa de vibración (revela el límite estructural) y túnel de viento
  (predice la carga máxima del ascenso con la misma física del vuelo).
- **Vuelo continuo** sobre una Tierra a escala real: despegue, giro gravitacional, etapas,
  órbita, reentrada y paracaídas. Zoom continuo de la plataforma al mapa orbital.
- **Asistencia en tres niveles**: manual, asistida (mantener, prograda, retrógrada) y piloto
  automático de ascenso.
- **Ciencia sin contrato**: cuatro instrumentos, cinco contextos, rendimientos decrecientes,
  y datos que solo cuentan del todo cuando llegan a una estación terrestre.
- **Control de Misión**: asistente con IA que ve tu nave y tu vuelo, y explica qué hacer, por qué
  pasó algo o cómo funciona cualquier mecánica.
- **Atlas del sistema solar**: posición de cada planeta en cualquier fecha, retraso de una señal,
  energía solar disponible, impulso y ventana de lanzamiento para llegar, comparados con tu nave.
- **Desafío "Ojo en la Tierra"**: seguir un incendio desde la órbita. La altura decide el detalle
  de las imágenes y el tiempo de enlace para bajarlas.
- **Desafío "Primer CubeSat"** con seis objetivos, y **modo libre** sin presupuesto ni reloj.
- **Informe causal**: explica qué pasó con números de la telemetría y enlaza la ciencia detrás.

## Cómo correrlo

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # pruebas de la simulación
npm run build    # versión de producción en dist/
```

## Controles de vuelo

| Tecla | Acción |
| --- | --- |
| Espacio | Encender motores · separar etapa |
| W / S | Subir · bajar potencia |
| Z / X | Potencia máxima · cortar motor |
| A / D | Inclinar al oeste · al este |
| T | Asistencia: mantener, prograda, retrógrada |
| P | Piloto automático de ascenso |
| , / . | Aceleración temporal |
| M · rueda | Mapa orbital · zoom |
| G | Desplegar · recoger paneles y antena |
| Esc | Pausa |
| C · 1–4 | Panel de ciencia · usar instrumento |

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `src/sim` | Simulación pura en TypeScript, sin React: física, vehículo, ciencia, misiones e informe |
| `src/ui` | Pantallas en React y dibujo en Canvas 2D |
| `docs` | Fuentes, datos y simplificaciones |

La simulación no depende de la interfaz. Eso permite probarla con valores conocidos
(`src/sim/sim.test.ts`) y reutilizarla más adelante en un servidor para el modo cooperativo.

## Ciencia, fuentes y simplificaciones

Ver [`docs/FUENTES.md`](docs/FUENTES.md). Toda fuente usada está citada ahí, como exigen los
términos de Space Apps.

## Uso de inteligencia artificial

Este proyecto se desarrolló con asistencia de IA para escribir código y documentación, bajo la
dirección y revisión del equipo: Claude (Anthropic, mediante Claude Code) y Codex (OpenAI). Los
commits escritos con Claude lo indican en sus metadatos con la línea `Co-Authored-By`. La idea
del juego y las decisiones de diseño son del equipo.

El juego incluye **Control de Misión**, un asistente opcional que responde preguntas del jugador
con IA generativa (Gemini 3.8 Flash, de Google). Recibe la pregunta y un resumen del diseño y de
la telemetría del vuelo; no recibe datos personales. Sus respuestas van marcadas como generadas
por IA. El resto del juego (física, misiones, informe y Atlas) no usa IA y funciona sin él.

### Activar Control de Misión

La clave de la API vive solo en el servidor; nunca se sube al repositorio ni llega al navegador.

- **En tu equipo:** crea el archivo `.env.local` en la raíz (git lo ignora) con una línea
  `GEMINI_API_KEY=tu_clave` y reinicia `npm run dev`. Cada persona puede crear su propia clave
  gratuita en [Google AI Studio](https://aistudio.google.com/apikey).
- **En Vercel:** agrega la variable `GEMINI_API_KEY` en Settings → Environment Variables y
  vuelve a desplegar.

Sin clave, el juego funciona igual y el asistente avisa que no está configurado.

## Licencia

[Apache 2.0](LICENSE).
