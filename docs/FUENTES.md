# Fuentes, datos y simplificaciones

Los términos de Space Apps exigen citar todo recurso usado. Esta lista se actualiza con cada cambio.

## Constantes físicas

| Magnitud | Valor usado | Fuente |
| --- | --- | --- |
| Parámetro gravitacional de la Tierra | 3,986004418 × 10¹⁴ m³/s² | [NASA Earth Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html) |
| Radio medio de la Tierra | 6.371 km | NASA Earth Fact Sheet |
| Rotación de la Tierra | 7,2921159 × 10⁻⁵ rad/s | NASA Earth Fact Sheet (día sidéreo) |
| Gravedad estándar | 9,80665 m/s² | Valor convencional |
| Densidad del aire a nivel del mar | 1,225 kg/m³ | [NASA Glenn, Earth Atmosphere Model](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/earth-atmosphere-equation-metric/) |

## Atlas del sistema solar

| Dato | Fuente |
| --- | --- |
| Elementos orbitales de los planetas (a, e, L, longitud del perihelio y su variación por siglo), válidos de 1800 a 2050 | [JPL Solar System Dynamics, Approximate Positions of the Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html) |
| Radio, gravedad, temperatura media y atmósfera de cada cuerpo; distancia media Tierra–Luna | [NASA Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) |
| Parámetro gravitacional del Sol y unidad astronómica | [JPL Solar System Dynamics, Astrodynamic Parameters](https://ssd.jpl.nasa.gov/astro_par.html) |
| Misiones citadas en cada ficha (MESSENGER, Magellan, Landsat, LCROSS, Artemis, Perseverance, Juno, Europa Clipper, Cassini, Voyager 2, Parker Solar Probe) | [NASA Science, Missions](https://science.nasa.gov/missions/) |

## Modelos y conceptos

| Concepto | Fuente |
| --- | --- |
| Ecuación del cohete | [NASA Glenn, Ideal Rocket Equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/) |
| Presión dinámica | [NASA Glenn, Dynamic Pressure](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/dynamic-pressure/) |
| Relación empuje/peso | [NASA Glenn, Thrust to Weight Ratio](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/thrust-to-weight-ratio/) |
| Fases de una misión CubeSat | [NASA CSLI, CubeSat 101](https://www3.nasa.gov/sites/default/files/atoms/files/nasa_csli_cubesat_101_508.pdf) |
| Observación de la Tierra: 30 m por píxel desde 705 km (Landsat 8 y 9) | [NASA, Landsat Science](https://landsat.gsfc.nasa.gov/) |
| Seguimiento de eventos naturales como incendios | [NASA EONET](https://eonet.gsfc.nasa.gov/) |
| Segmentos de una misión | [NASA, Design and Develop Science Missions](https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf) |

Los enlaces de NASA Glenn están pendientes de verificación uno por uno antes de la entrega.

## Simplificaciones declaradas

- **Plano único.** El vuelo ocurre en el plano ecuatorial. No hay inclinación orbital.
- **Atmósfera exponencial.** Densidad con altura de escala de 8,5 km, sin aire por encima de 140 km.
  La temperatura que reporta el termómetro sigue la atmósfera estándar por tramos.
- **Arrastre.** Coeficiente fijo según la forma de la punta; sin efectos transónicos.
- **Carga estructural.** Presión dinámica multiplicada por un factor que crece con el ángulo de ataque.
- **Calentamiento.** Flujo de calor con la correlación de Sutton-Graves simplificada y un umbral por configuración.
- **Actitud.** La nave gira a velocidad limitada, sin inercia ni propelente de control.
- **Sol fijo.** La dirección del Sol no cambia durante la misión.
- **Estaciones terrestres.** Tres estaciones equidistantes sobre el ecuador; enlace solo con línea de vista.
- **Cámara de observación.** El detalle de la imagen crece en proporción a la altura: 6 m por píxel
  por cada 100 km. La cámara apunta hasta 30° fuera de la vertical. El incendio de la misión
  "Ojo en la Tierra" es un escenario inventado, no un evento real de EONET.
- **Atlas.** Mapa plano de la eclíptica: se ignora la inclinación de las órbitas. La Luna sigue una
  órbita circular. El impulso y la duración de cada viaje son los de una transferencia de Hohmann
  entre órbitas circulares y coplanares, saliendo de una órbita terrestre de 200 km, sin contar el
  frenado al llegar. La ventana de lanzamiento es la fecha en que el ángulo entre la Tierra y el
  destino coincide con el de esa transferencia.
- **Radiación y campo magnético.** Curvas aproximadas: dipolo ecuatorial para el campo y una
  curva cualitativa para la dosis, con el aumento de los cinturones de Van Allen.
- **Piezas.** Motores, depósitos y materiales son genéricos, con órdenes de magnitud de
  lanzadores pequeños y medianos reales. Los valores están pendientes de calibración.

## Software de terceros

| Paquete | Licencia |
| --- | --- |
| React, React DOM | MIT |
| Vite, @vitejs/plugin-react | MIT |
| TypeScript | Apache 2.0 |
| Vitest | MIT |

## Servicios externos

| Servicio | Uso |
| --- | --- |
| [Gemini API](https://ai.google.dev/gemini-api/docs), modelo Gemini 3.8 Flash (Google) | Asistente opcional "Control de Misión". Solo se llama cuando el jugador hace una pregunta. |

No se usan imágenes, modelos ni sonidos de terceros: todos los gráficos se dibujan por código.
