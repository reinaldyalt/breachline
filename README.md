# BREACHLINE — a tactical FPS on three.js

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/reinaldyalt/breachline/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/reinaldyalt/breachline/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical first-person shooter in the style Counter-Strike made
famous, built entirely from original art, names and a map of my own design.
Single-player against bots, static files, no network, no build step.

## The game

You are Vanguard, a three-operator squad attacking the dusk freight yard
**Yard 7** against four Sentinel defenders. First to 5 round wins takes the
match (max 9 rounds).

- **Objective:** plant the charge at site **A** (north-west warehouse) or
  site **B** (south-east container yard) — hold **E** for 3 seconds inside a
  site — then defend it until the 35-second fuse blows, or eliminate the
  whole Sentinel squad. If the charge is planted, a Sentinel that reaches it
  defuses it in 5 seconds.
- **Economy:** $800 to start, +$300 per elimination, +$300 for planting,
  +$3,250 for a round win, +$1,900 for a loss. Spend it in the buy phase
  (**B**): VK-9 rifle ($2,700), Rook-9 SMG ($1,500), frag grenades ($300).
  Weapons persist between rounds with refilled ammo.
- **Gunplay:** hitscan with per-part hitboxes (headshots deal ~3x), recoil
  that kicks the view, spread that grows with movement speed and sustained
  fire, reloads, and running out of ammunition. Crouch (**Ctrl**/**C**) to
  tighten up and hide behind the 1.1 m crates.
- **Bots:** two Vanguard allies fight beside you; four Sentinels hold and
  patrol the sites and lanes on a waypoint graph, investigate gunshots,
  react after a delay, and shoot back in bursts. They only see you with a
  real line of sight — walls block vision and bullets alike.
- **HUD:** health, ammo, money, round timer, score, live minimap, killfeed,
  bomb status, dynamic crosshair spread, hitmarker and damage vignette.
- **Sound:** fully procedural WebAudio — shots, reloads, hits, beeps,
  explosions, round stingers. No audio assets.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (pointer lock) |
| Click | Fire |
| R | Reload |
| Ctrl / C | Crouch |
| Space | Jump |
| 1 / 2 / 3 | Pistol / SMG / Rifle |
| G | Throw frag grenade |
| E (hold) | Plant the charge (inside a site) |
| B | Buy menu (buy phase) |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

`game/` is plain static files: `index.html` plus ES modules under `src/`,
with three.js 0.187.0 vendored under `game/vendor/three/`. Screenshots in
`screenshots/` are real renders of the game, staged with `?shot=start|play|buy|end`
(see `shots.json` and `shoot.mjs`).

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the kit's `vendor/makefun-threejs.ts`.

## Layout

- `game/src/main.js` — boot, fixed 60 Hz simulation loop, round events
- `game/src/state.js` — the one central state object
- `game/src/world.js` — the Yard 7 map, sites, spawns, waypoint graph
- `game/src/player.js` — movement: acceleration, friction, crouch, collision
- `game/src/input.js` — keyboard, mouse, pointer lock
- `game/src/weapon.js` — three guns + grenade: stats, view models, spread
- `game/src/bots.js` — bot AI: patrol, hold, investigate, engage
- `game/src/combat.js` — hitscan, tracers, sparks, grenade arcs (pooled)
- `game/src/rounds.js` — round clock, buy phase, economy, win/loss
- `game/src/hud.js` — DOM HUD, buy menu, live minimap
- `game/src/audio.js` — procedural WebAudio effects

Built for make.fun's [**threejs-fps-02** bounty](https://make.fun/bounty/threejs-fps-02) ("Make the best three.js tactical FPS", $1,000). MIT licensed.

---

<sub>Entered on [make.fun](https://make.fun/?ref=nvkfmre4&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
