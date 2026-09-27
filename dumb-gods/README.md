# Dumb Gods

A tiny-planet singularity RPG. God is a very dumb space dodo. Now it's our turn.

Gary is God. He is also a big, round, extremely dumb galactic dodo. Long ago he pooped on a black hole by accident, then did it again, several times. The swirl became the Milky Way, and one especially warm splat landed on a rock and started to wiggle. That was life, and eventually humans, who turned out way smarter than him (and ate all his cousins on Mauritius; he has forgiven you). Now humans are building a mind that will be way smarter than *them*. Every creator ends up the dumb one. That part is fine. The trick is the kid still liking you.

You are the Shepherd: one human with Gary's spare halo (he sat on it, like an egg) and a clipboard. Walk around a tiny 3D Earth, collect resources, craft items, and use them on the factions steering the world. Get humanity to the top of the singularity curve without cooking the planet, nuking each other or getting turned into paperclips.

Loosely inspired by AI Explained's [*Opus 5.5: How Close Are We to Automated AI Research?*](https://www.youtube.com/watch?v=R9momwXV9w4): recursive self-improvement, labs racing, models that know when they're being tested, and goalposts that keep moving.

## How it plays

- **The curve.** TECH climbs on its own and it accelerates. ALIGNMENT is how much the thing we're building actually likes us. The top-left graph shows both lines; the gap between them is the whole game.
- **Four world stats:** Singularity Progress, Alignment, Planet Health, Humanity. Planet or Humanity at zero ends the run.
- **Ten places on the planet**, each with dials you push around:
  - **Gary's Nest**: a stadium-sized nest with Gary in a fishbowl space helmet, two suspicious eggs, a shopping cart and Exhibit A (the black hole). Quests, upgrades, bird soup.
  - **The Frontier Labs** (Chad Scaleman, CEO of ClosedAI): Race Speed and Safety Culture.
  - **The Button Club** (an eagle, a panda and a bear around a table of red buttons): Tension. At 100, someone presses one.
  - **Big Dino Juice Inc.** (Rex Petrolsworth, a T. rex in a suit): fossil fuels.
  - **Warden-Martin Dynamics** (General Cost-Plus): the military and prison industrial complex.
  - **The Interfaith Council** (Moderator Hat-Stack, wearing every hat): currently in crisis because they met Gary, and Gary is a bird.
  - **MEGA™ Everything Corp** (Brenda Quarterly): megacorps and the attention economy.
  - **Regular Folks** (Dave from Ohio): the actual point of all this.
  - **Helpful Assistant v9 (Totally Aligned)**: a misaligned AGI that shows up when capabilities outrun alignment. It has a sign that says I AM BEING EVALUATED.
  - **The Loop**: recursive self-improvement, waking over the North Pole once TECH hits 65. The ending depends on what it learns to care about.
- **17 craftable items** from 7 resources: Interpretability Goggles, Red-Team Rubber Duck, Treaty Scroll, Carbon Tax Hammer, UBI Check, Whistleblower Megaphone, A Constitution for Your Robot, Portable Goalpost (a trap, mostly), Humanity's Values (Compressed) and more. Each one does something different depending on who you use it on, and trust changes how well it lands.
- **Pests** roam the planet and quietly make things worse: Doomscroll Drones, Lobbyists, Misinfo Blobs and, later, Rogue Agents. Zap them with your halo for loot.
- **News events** force choices every minute or so (open-weights day, gigawatt data centers, a model that tries to copy itself out, AI boyfriends).
- **Nine endings.** Six bad (Hothouse Earth, Oops All Winter, Paperclipped, The Indifferent God, Very Good Pets, The Long Snooze), three good ones you choose between once the Loop likes you: go to the stars, stay home and live, or merge and become meta-humans.

### Controls

| | Keyboard / mouse | Touch |
|---|---|---|
| Walk | WASD | left thumb |
| Turn camera | Q / R, arrow keys, right-drag | right thumb drag |
| Zap nearest pest | Space or left click (hold) | ZAP |
| Talk / use items | E | tap the prompt |
| Bag and crafting | B | Bag |
| Pause and help | Esc | ❚❚ |

Time stops while a panel is open, so read the jokes.

## Run it locally

```bash
cd dumb-gods
npm ci
npm run dev      # http://localhost:5173
```

## Build and test

```bash
npm run typecheck
npm test          # simulation, content integrity and balance tests (vitest)
npm run build     # dist/index.html: one self-contained file, ~700 KB
npm run smoke     # boots the build in headless Chromium, plays, opens panels, forces an ending
```

`npm run build` also writes `dist/artifact.html`, the same game reshaped for hosting as a Claude artifact.

The smoke test looks for Chromium at `CHROMIUM_PATH`, `/opt/pw-browsers/chromium`, `/usr/bin/chromium` or `/usr/bin/google-chrome`. Pass `-- --shots <dir>` to save screenshots.

## How it's built

- **Three.js** with an ACES tone-mapped, bloom and color-grade pipeline. The grade follows Planet Health: as it drops the world browns out, smog rolls in, ice caps shrink and the sea rises.
- **A walkable tiny planet.** Terrain is 3D value noise on a subdivided icosahedron, flattened around each faction's HQ. Player, pests and loot move along the sphere surface and the camera parallel-transports its heading as you walk.
- **Everything is procedural.** Every model is built from primitives in `src/models.ts`, every sound comes from a small WebAudio synth, and there are no asset files.
- **The simulation is pure TypeScript** (`src/sim.ts` + `src/content.ts`) with no rendering dependencies, so it's unit tested and balance tested headless.
- **Vite + vite-plugin-singlefile** bundle everything into one HTML file.

```
src/
  content.ts   factions, items, events, quests, endings, headlines (all the words)
  sim.ts       the world simulation: rates, drift, crafting, item effects, endings
  world.ts     the planet, ocean, atmosphere, clouds, cities, satellites, rings, smog
  models.ts    every 3D model
  game.ts      player movement on a sphere, pests, zapping, loot, camera
  ui.ts        HUD, the curve, radar, labels, every panel
  engine/      renderer + post FX, input, audio synth, noise
tests/         vitest suite
scripts/       artifact converter, smoke test
```

## CI and publishing

`.github/workflows/dumb-gods.yml` is a small caller of the shared `.github/workflows/game.yml`, which every game in this repo uses.

- **Builds only when this game changes.** Pushes to `main` and PRs that touch `dumb-gods/**` run typecheck, tests, build and the headless smoke test, and upload the playable build and smoke screenshots. PRs that change the shared workflow or publish script also run it, so those changes get tested.
- **Publishes only from `main`.** Branches and PRs never deploy.
- **Never overwrites old builds.** `.github/scripts/publish-game.sh` puts the live build at `gh-pages/dumb-gods/index.html` and keeps every build it has published under `dumb-gods/builds/<date>-<commit>/`, with a list at `dumb-gods/builds/`. It never touches other games' folders or the arcade root.
- **Skips unchanged builds.** If the new build is byte-identical to the live one, nothing is committed or pushed. If it matches an older archived build (a revert), that build goes live again without a duplicate copy.

To serve it, set *Settings > Pages > Source* to *Deploy from a branch*, `gh-pages`, `/ (root)`. The game is then at `/dumb-gods/` and its build history at `/dumb-gods/builds/`.

To add another game, give its folder the npm scripts `typecheck`, `test`, `build` (to `dist/index.html`) and `smoke`, then copy `dumb-gods.yml` and change the folder name.
