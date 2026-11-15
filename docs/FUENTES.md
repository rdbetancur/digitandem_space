# Sources, data and simplifications

The Space Apps terms require citing every resource used. This list is updated with every change.

## Physical constants

| Quantity | Value used | Source |
| --- | --- | --- |
| Earth's gravitational parameter | 3.986004418 × 10¹⁴ m³/s² | [NASA Earth Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html) |
| Earth's mean radius | 6,371 km | NASA Earth Fact Sheet |
| Earth's rotation | 7.2921159 × 10⁻⁵ rad/s | NASA Earth Fact Sheet (sidereal day) |
| Standard gravity | 9.80665 m/s² | Conventional value |
| Air density at sea level | 1.225 kg/m³ | [NASA Glenn, Earth Atmosphere Model](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/earth-atmosphere-equation-metric/) |

## "Ice in the shadows" mission (Moon)

| Data | Value used | Source |
| --- | --- | --- |
| Moon's gravitational parameter | 4.902800118 × 10¹² m³/s² (DE440) | [JPL Solar System Dynamics, Astrodynamic Parameters](https://ssd.jpl.nasa.gov/astro_par.html); the [NASA Moon Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html) rounds it to 4.90 × 10¹² |
| Moon's mean radius | 1,737.4 km | NASA Moon Fact Sheet |
| Surface gravity | 1.62 m/s² | NASA Moon Fact Sheet |
| Lunar day (synodic month), so night at the equator lasts about 14.75 Earth days | 29.53 days | NASA Moon Fact Sheet |
| At the poles the Sun stays near the horizon, so some crater floors never see it ("permanently shadowed regions") | — | [NASA Science, Water and Ices on the Moon](https://science.nasa.gov/moon/moon-water-and-ices/) |
| Water ice in a permanently shadowed crater (Cabeus), about 5.6 % of the regolith by mass | 5.6 % | [NASA Science, LCROSS](https://science.nasa.gov/mission/lcross/); Colaprete et al. (2010), *Detection of Water in the LCROSS Ejecta Plume*, Science 330, 463–468 |
| Artemis targets the lunar south pole for its ice and its sunlit rims | — | [NASA, Artemis](https://www.nasa.gov/humans-in-space/artemis/) |
| Radiation on the lunar surface, Chang'e 4 lander | 1.369 mSv per day | Zhang et al. (2020), *First measurements of the radiation dose on the lunar surface*, Science Advances 6, eaaz1334 |
| Crew dose limit for 30 days (blood-forming organs) | 250 mSv | NASA-STD-3001, NASA Space Flight Human-System Standard, Volume 1 |
| Oxygen used per crew member | 0.84 kg per day | NASA, Life Support Baseline Values and Assumptions Document (NASA/TP-2015-218570) |
| Oxygen in water by mass | 16 / 18.015 = 0.888 | Atomic masses (IUPAC) |
| Energy to split water: at least 15.9 MJ (4.4 kWh) per kg; the game uses about 6 kWh/kg for a real electrolyzer | 285.8 kJ/mol | Standard enthalpy of formation of liquid water, [NIST Chemistry WebBook](https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185) |
| Specific impulse of a storable (hypergolic) descent engine | 311 s | Order of magnitude of the Apollo Lunar Module descent engine, [NASA History, Apollo Lunar Surface Journal](https://www.nasa.gov/history/alsj/) |

Simplifications of this mission:

- **Lander.** Masses and thrust (2,600 kg dry, 3,400 kg propellant, 24 kN) are game values of the
  right order for a small lander. The sim is a point mass in a single plane (a polar orbit), with
  a smooth, round Moon; the craters, distant ridges and the Earth on the horizon are decoration.
  The Moon's rotation (4.6 m/s at the equator, almost zero at the pole) is ignored. The
  starting orbit (15 km) and the "high gate" where braking ends (about 1.5 km) follow the
  Apollo descent profile described in the Apollo Lunar Surface Journal; the exact values are
  rounded for the game.
- **Camera.** The distance on screen between the lander and the ground grows with the logarithm
  of the altitude, so the ground keeps getting closer during the whole descent.
- **Braking distance.** Computed with the rocket equation for horizontal braking at full thrust,
  plus a small margin for the thrust that goes into holding up the fall.
- **Assists.** "Braking" splits the thrust between cancelling horizontal speed and a descent rate
  chosen so the lander reaches the high gate just as the horizontal speed runs out. The landing assist works only below 2 km, like a landing radar.
- **Base.** Power, oxygen, water, temperature and dose are simple balances per hour. Panel power
  (8 kW), battery (30 kWh), loads, drill rate (1 kg of water per hour) and the shelter factor (a
  tenth) are game values. The 12 h shadow behind a ridge and the solar storm (8 h at 40 mSv/h
  outside the shelter) are invented scenarios, not real forecasts.

## Solar system atlas

| Data | Source |
| --- | --- |
| Planetary orbital elements (a, e, L, longitude of perihelion and their rates per century), valid from 1800 to 2050 | [JPL Solar System Dynamics, Approximate Positions of the Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html) |
| Radius, gravity, mean temperature and atmosphere of each body; mean Earth–Moon distance | [NASA Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) |
| Sun's gravitational parameter and astronomical unit | [JPL Solar System Dynamics, Astrodynamic Parameters](https://ssd.jpl.nasa.gov/astro_par.html) |
| Missions cited on each card (MESSENGER, Magellan, Landsat, LCROSS, Artemis, Perseverance, Juno, Europa Clipper, Cassini, Voyager 2, Parker Solar Probe) | [NASA Science, Missions](https://science.nasa.gov/missions/) |

## Models and concepts

| Concept | Source |
| --- | --- |
| Rocket equation | [NASA Glenn, Ideal Rocket Equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/) |
| Dynamic pressure | [NASA Glenn, Dynamic Pressure](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/dynamic-pressure/) |
| Thrust-to-weight ratio | [NASA Glenn, Thrust to Weight Ratio](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/thrust-to-weight-ratio/) |
| Phases of a CubeSat mission | [NASA CSLI, CubeSat 101](https://www3.nasa.gov/sites/default/files/atoms/files/nasa_csli_cubesat_101_508.pdf) |
| Earth observation: 30 m per pixel from 705 km (Landsat 8 and 9) | [NASA, Landsat Science](https://landsat.gsfc.nasa.gov/) |
| Tracking natural events such as wildfires | [NASA EONET](https://eonet.gsfc.nasa.gov/) |
| Segments of a mission | [NASA, Design and Develop Science Missions](https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf) |

The NASA Glenn links still need to be checked one by one before submission.

## Stated simplifications

- **Single plane.** Flight happens in the equatorial plane. There is no orbital inclination.
- **Exponential atmosphere.** Density with an 8.5 km scale height, and no air above 140 km.
  The temperature reported by the thermometer follows the piecewise standard atmosphere.
- **Drag.** A fixed coefficient depending on the nose shape; no transonic effects.
- **Structural load.** Dynamic pressure multiplied by a factor that grows with the angle of attack.
- **Heating.** Heat flux from a simplified Sutton-Graves correlation, with a threshold per configuration.
- **Attitude.** The craft turns at a limited rate, with no inertia or control propellant.
- **Fixed Sun.** The direction of the Sun does not change during the mission.
- **Ground stations.** Three evenly spaced stations on the equator; a link only with line of sight.
- **Observation camera.** Image detail grows in proportion to altitude: 6 m per pixel
  for every 100 km. The camera can point up to 30° off vertical. The wildfire in the
  "Eye on Earth" mission is an invented scenario, not a real EONET event.
- **Atlas.** A flat map of the ecliptic: orbital inclinations are ignored. The Moon follows a
  circular orbit. The delta-v and duration of each trip are those of a Hohmann transfer
  between circular, coplanar orbits, departing from a 200 km Earth orbit, not counting
  braking on arrival. The launch window is the date when the angle between Earth and the
  destination matches the one for that transfer.
- **Radiation and magnetic field.** Approximate curves: an equatorial dipole for the field and a
  qualitative curve for the dose, with the rise in the Van Allen belts.
- **Parts.** Engines, tanks and materials are generic, with orders of magnitude taken from real
  small and medium launchers. The values are still to be calibrated.

## Third-party software

| Package | License |
| --- | --- |
| React, React DOM | MIT |
| Vite, @vitejs/plugin-react | MIT |
| TypeScript | Apache 2.0 |
| Vitest | MIT |

## External services

| Service | Use |
| --- | --- |
| [Gemini API](https://ai.google.dev/gemini-api/docs), Gemini 3.8 Flash model (Google) | Optional "Mission Control" assistant. It is only called when the player asks a question. |

No third-party images, models or sounds are used: all graphics are drawn in code.
