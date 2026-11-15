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
  "Eye on Earth" mission is a real, currently active fire taken from NASA EONET when the
  mission opens (or a saved one if the service does not answer). The game places it on its
  equatorial flight plane; its real latitude does not affect the flight. The satellite scene
  shown for each capture is real, but its sharpness is simulated from the player's orbit.
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

## Live NASA data and imagery

Requested from the player's browser when the screen opens. NASA content is generally not
subject to copyright in the United States; each image shows its credit in the game.

| Data | Use | Source |
| --- | --- | --- |
| Open wildfire events: name, coordinates, date and burned area | Target of the "Eye on Earth" mission | [NASA EONET API v3](https://eonet.gsfc.nasa.gov/docs/v3) |
| Daily true-color imagery and thermal anomalies (VIIRS on NOAA-20) | Satellite view of the wildfire area on the report date | [NASA GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api) |
| One image per body: Sun (SDO), Mercury (MESSENGER), Venus (Mariner 10), Earth (Suomi NPP), Moon (Galileo), Mars (Viking), Jupiter and Saturn (Cassini), Uranus and Neptune (Voyager 2) | Photo in each Atlas card | [NASA Image and Video Library](https://images.nasa.gov/) |
| Rotation period of each body | Atlas card | [NASA Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) |

A saved copy of one EONET event and its GIBS image (`public/nasa/wildfire-snapshot.jpg`,
Red Hill fire, Mississippi, 12 November 2026) is used if the services are unreachable.

Apart from those NASA images, no third-party images, models or sounds are used: all other
graphics are drawn in code.
