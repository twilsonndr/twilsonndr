# Tiny Claw

*It's not the size of the claw. It's the side to side.*

A silly 3D browser game about Sidney, a fiddler crab. Fiddler crabs are famous for one enormous claw. Sidney's is... right there. No, lower. There.

Admiral Clawdius Maximus, owner of the largest claw on Earth, is building a machine to pinch the Moon out of the sky. No Moon means no tides, and no tides means the ocean just sits there. Experts are calling it "no motion in the ocean." Sidney says he'll stop him. Everybody laughs.

## How it plays

The whole game is built around one joke that turns out to be a real mechanic: crabs walk sideways.

- **Scuttling sideways is fast. Walking forward is slow.** Sidney moves about 3.5x faster left and right than up and down the beach.
- **Big claws only hit what's in front of them.** Enemies with huge claws are slow to turn and block pinches from the front. Get to their side.
- **Side to side charges a Mega Snip.** Wiggle left-right-left-right fast enough and your next pinch hits everything nearby and ignores blocks.
- **Side dash** makes you briefly untouchable. Tide walls roll up the beach with gaps in them; scuttle into the gap.

Three chapters:

1. **Nobody Believes in Sidney.** Snip six-pack rings off trapped baby turtles, fish and a seal. Dodge Steven the seagull (MINE!). Everyone you free joins your conga line.
2. **The Big Claw Brigade.** Purple brutes in sunglasses with claws the size of sofas. Flank them. Pinch their pinky toes.
Between chapters 2 and 3 there's a cutscene: the Admiral surfaces, reaches an absurdly long arm into the sky and yanks the Moon down. The tides go haywire: the west beach floods (Gerald and Linda end up floating) and the east side drains to cracked seabed with stranded fish. It stays that way until you win.

3. **The Moon Pincher.** The Admiral slams his claw into the sand, fires bubbles and sends tide walls. Every time his claw gets stuck, a tiny screw pops loose that only a tiny claw can reach. Five screws and the whole thing falls apart like cheap patio furniture.

The townsfolk heckle you the whole way (Gerald the Clam, Starla the Starfish, Linda who lives in a yogurt cup, Dr. Pufferton) and come round one at a time. Gerald holds out until the very end. As the Admiral wins, the sky darkens and the ocean literally stops moving; beat him and the waves come back.

Clear a stage (free everyone, down your first big claw, pack up the brigade, pop the first screw, save the Moon) and the camera zooms in while Sidney does a victory dance: two spins, tiny claws up, clack clack clack.

There's a *believe-in-yourself mode* (no damage) in the pause menu, and it's offered after a loss, for anyone who just wants the story.

### Controls

| | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| Scuttle sideways | A / D, ← → | left stick, d-pad | left thumb |
| Forward / back (slow) | W / S, ↑ ↓ | left stick | left thumb |
| Pinch | Space, J, left click | A / X | PINCH |
| Side dash | Shift, L, right click | B / RB / RT | DASH |
| Pause | Esc, P | Start | ❚❚ |
| Mute | M | | 🔊 |

## Run it locally

```bash
cd tiny-claw
npm ci
npm run dev      # http://localhost:5173
```

## Build and test

```bash
npm run typecheck
npm test          # physics, chapter flow, content checks, and a bot that has to beat the game
npm run build     # dist/index.html: one self-contained file, ~690 KB
npm run smoke     # boots the build in headless Chromium, plays every chapter, then a touch pass on a phone viewport
```

The test suite includes a bot that plays all three chapters with real inputs (no god mode) across several seeds. It has to win in under six deaths and can't finish too fast, so balance changes that make the game impossible or trivial fail CI.

The smoke test looks for Chromium at `CHROMIUM_PATH`, `/opt/pw-browsers/chromium`, `/usr/bin/chromium` or `/usr/bin/google-chrome`. Pass `-- --shots <dir>` to save screenshots. Add `?lq` or `?hq` to the URL to pin low or high graphics quality (otherwise it adapts).

## How it's built

- **Three.js** with toon shading, shadows, and custom shaders for the sky, the sea (its wave motion and tide level follow the story) and the curling tide walls.
- **Adaptive quality.** The renderer starts at a sensible tier for the device, watches real frame times, and steps resolution and shadow quality down when frames run long (or up once when there's lots of headroom). Static scenery is merged into a handful of draw calls, and only large meshes cast shadows. `?hq` / `?lq` pin a tier.
- **Everything is procedural.** Every model is built from primitives in `src/models.ts`, every sound and the little steel-drum calypso loop come from a WebAudio synth, and there are no asset files.
- **The simulation is pure TypeScript** (`src/sim.ts`) with no rendering dependencies, deterministic per seed, so it's unit tested and balance tested headless.
- **Vite + vite-plugin-singlefile** bundle everything into one HTML file that can be hosted anywhere.

```
src/
  content.ts   every line of dialogue, chapter scripts, heckles, ranks
  sim.ts       movement, pinching, combos, enemies, tide walls, the boss, chapter flow
  models.ts    Sidney, the brigade, the Admiral, townsfolk, critters, props, the Moon
  world.ts     sky, sand, the sea shader, decor
  render.ts    syncs sim state into the scene: camera, telegraphs, particles, juice
  audio.ts     synth sound effects and music
  input.ts     keyboard, mouse, touch joystick, gamepad
  ui.ts        title, dialog, HUD, speech bubbles, overlays
  game.ts      glue and story flow
tests/         vitest suite, including the bot
scripts/       smoke test, artifact converter
```

## CI and hosting

`.github/workflows/tiny-claw.yml` only runs when something under `tiny-claw/` (or the workflow itself) changes. Every game in this repo has its own independent workflow.

1. **build**: typecheck, tests, build, headless smoke test, then uploads the playable build and the smoke screenshots as artifacts. Runs on pushes and PRs.
2. **deploy**: on any push that passes, from any branch, commits the build to `tiny-claw/` on the `gh-pages` branch. It never touches other games' folders, and the latest green push wins.

One-time setup for the public site: *Settings > Pages > Build and deployment > Source* = *Deploy from a branch*, branch `gh-pages`, folder `/ (root)`. The game is then at `https://<owner>.github.io/<repo>/tiny-claw/`, with the arcade landing page (`arcade/`, its own workflow) at the root.

`npm run build` also writes `dist/artifact.html`, the same game reshaped for hosting as a Claude artifact.
