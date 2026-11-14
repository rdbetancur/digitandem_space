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

## Modelos y conceptos

| Concepto | Fuente |
| --- | --- |
| Ecuación del cohete | [NASA Glenn, Ideal Rocket Equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/) |
| Presión dinámica | [NASA Glenn, Dynamic Pressure](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/dynamic-pressure/) |
| Relación empuje/peso | [NASA Glenn, Thrust to Weight Ratio](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/thrust-to-weight-ratio/) |
| Fases de una misión CubeSat | [NASA CSLI, CubeSat 101](https://www3.nasa.gov/sites/default/files/atoms/files/nasa_csli_cubesat_101_508.pdf) |
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

No se usan imágenes, modelos ni sonidos de terceros: todos los gráficos se dibujan por código.
