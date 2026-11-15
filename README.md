# ASCENT

A space mission design game for the **Space Mission Design Game** challenge of the
NASA Space Apps Challenge 2026. You design a craft, put it to the test, fly it to
orbit and do science. Every engineering decision has a visible physical consequence.

> Working title.

## What this version includes (0.1)

- **Lab**: payload, instruments, power, antenna, up to three stages, three materials,
  and a live review of mass, delta-v, thrust/weight, cost, power and data.
- **Test benches**: vibration table (reveals the structural limit) and wind tunnel
  (predicts the peak ascent load using the same physics as the flight).
- **Continuous flight** over a real-scale Earth: liftoff, gravity turn, staging,
  orbit, reentry and parachute. Seamless zoom from the launch pad to the orbital map.
- **Three levels of assistance**: manual, assisted (hold, prograde, retrograde) and an
  ascent autopilot.
- **Contract-free science**: four instruments, five contexts, diminishing returns,
  and data that only counts in full once it reaches a ground station.
- **Mission Control**: an AI assistant that sees your craft and your flight, and explains what
  to do, why something happened or how any mechanic works.
- **Solar system atlas**: where each planet is on any date, signal delay, available solar
  power, and the delta-v and launch window to get there, compared with your craft.
- **"Eye on Earth" challenge**: track a wildfire from orbit. Altitude decides how detailed
  the images are and how much link time you get to downlink them.
- **"First CubeSat" challenge** with six objectives, and a **free play mode** with no budget or clock.
- **Crew of up to four**: type your names on the home screen and each player owns a role
  (mission director, engineer, pilot, scientist). Names appear on the panels each one is
  responsible for, in the Lab, in flight and on the report.
- **Share designs and flights by link**: the whole craft travels inside the URL, with your name,
  your advice and what the design is good at. Whoever opens it lands in the Lab with that craft,
  can compare it with their own, change it and send it back. No account or server.
- **Flight board**: your flights on this device plus the flights teammates send you by link,
  ranked by score, altitude, ascent efficiency, cost or time. It is stored in the browser, so it
  is a board among people who trade links, not a global ranking.
- **Causal report**: explains what happened using telemetry numbers and links to the science behind it.

## How to run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # simulation tests
npm run build    # production build in dist/
```

## Flight controls

| Key | Action |
| --- | --- |
| Space | Ignite engines · separate stage |
| W / S | Throttle up · down |
| Z / X | Full throttle · cut engine |
| A / D | Tilt west · east |
| T | Assistance: hold, prograde, retrograde |
| P | Ascent autopilot |
| , / . | Time warp |
| M · wheel | Orbital map · zoom |
| G | Deploy · stow panels and antenna |
| Esc | Pause |
| C · 1–4 | Science panel · use instrument |

## Structure

| Folder | Contents |
| --- | --- |
| `src/sim` | Pure TypeScript simulation, no React: physics, vehicle, science, missions and report |
| `src/ui` | React screens and Canvas 2D drawing |
| `docs` | Sources, data and simplifications |

The simulation does not depend on the interface. That lets us test it against known values
(`src/sim/sim.test.ts`) and reuse it later on a server for a co-op mode.

## Science, sources and simplifications

See [`docs/FUENTES.md`](docs/FUENTES.md). Every source used is cited there, as the
Space Apps terms require.

## Use of artificial intelligence

This project was built with AI assistance for writing code and documentation, under the
team's direction and review: Claude (Anthropic, through Claude Code) and Codex (OpenAI).
Commits written with Claude say so in their metadata with a `Co-Authored-By` line. The game
idea and the design decisions are the team's.

The game includes **Mission Control**, an optional assistant that answers the player's questions
with generative AI (Gemini 3.8 Flash, by Google). It receives the question and a summary of the
design and the flight telemetry; it receives no personal data. Its answers are labeled as
AI-generated. The rest of the game (physics, missions, report and Atlas) does not use AI and
works without it. Mission Control answers in the language the player writes in, English by default.

### Turning on Mission Control

The API key lives only on the server; it is never committed to the repository and never reaches the browser.

- **On your machine:** create a `.env.local` file at the root (git ignores it) with the line
  `GEMINI_API_KEY=your_key` and restart `npm run dev`. Everyone can create their own free key
  in [Google AI Studio](https://aistudio.google.com/apikey).
- **On Vercel:** add the `GEMINI_API_KEY` variable under Settings → Environment Variables and
  redeploy.

Without a key, the game works the same and the assistant says it is not set up.

## License

[Apache 2.0](LICENSE).
