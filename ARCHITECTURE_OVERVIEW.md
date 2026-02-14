# Lockpick Lab Architecture Overview

This document explains how the project is organized, how puzzle data flows through the system, and how the CLI/UI tools work together.

## 1. What This Project Is

Lockpick Lab is a deterministic card-combat puzzle sandbox:

- The game state is fully visible.
- The rules engine is deterministic (no RNG inside simulation).
- Puzzles are generated, validated, played, and solved with shared core logic.

The repo contains:

- Core engine (`engine/`) for state transitions and legal actions.
- Puzzle generator (`generator/`) for ghost-walk construction + filtering.
- Solver (`solver/`) for DFS solution search.
- CLI tools (`scripts/`) for generation, solving, and terminal rendering.
- Web UI (`ui/`) for playing, generating, editing, and solving puzzles.
- Data contracts (`cards/cards.json`, `schema/puzzle.schema.json`, `puzzles/*.json`).

## 2. Top-Level Layout

- `engine/`
  - `types.ts`: canonical TypeScript model types (`CardDefinition`, `GameState`, `Action`, `Puzzle`, etc.).
  - `state.ts`: `cloneState()` + `normalizeState()` helpers.
  - `cards.ts`: loads/builds card library.
  - `engine.ts`: core rules implementation (`applyAction`, `getLegalActions`, `isWin`).
- `generator/`
  - `core.ts`: RNG, ghost walk, materialization, decoying, generator attempts, incremental solve checks.
  - `generator.ts`: wrapper exporting `core.ts` with the default engine wiring.
- `solver/`
  - `solver.ts`: DFS solver for full solution discovery/counting.
- `scripts/`
  - `generate_puzzle.ts`: CLI generator pipeline.
  - `solve_puzzle.ts`: CLI solver runner.
  - `render_puzzle.ts`: terminal puzzle renderer.
  - `generate_card_art.py`: single image generation via OpenAI.
  - `populate_missing_art.py`: batch image generation + JPG conversion.
- `ui/`
  - `index.html` + `app.js`: main game board, generator UI, solver UI, puzzle editing.
  - `engine.js`: browser engine mirror (same behavior as TS engine).
  - `cards.html` + `cards.js`: card library browser.
  - `rules.html`: rules reference page.
  - `tooltip.js`, `keywords.js`: shared UI utility behavior.
  - `styles.css`, `cards.css`, `rules.css`: UI styling.
  - `assets/`: art for bosses/cards/placeholders.
  - `gen/generator/core.js`: browser-consumable build of `generator/core.ts`.
- `cards/cards.json`: full card catalog (40 cards at current snapshot).
- `schema/puzzle.schema.json`: JSON schema for puzzle structure.
- `puzzles/example.json`: sample playable puzzle.
- `dist/`: compiled Node-target JS output from TypeScript build.

## 3. Core Data Model

### Card definitions

`cards/cards.json` defines cards by:

- `id`, `name`, `type` (`creature` | `spell` | `effect` | `mod`)
- `cost`
- optional `keywords`
- optional `stats` (creature `power`)
- optional `effects[]` (typed effect definitions)

### Runtime state

`GameState` tracks:

- `player`: mana, hand, board
- `opponent`: health, board, poison
- turn context: `turn`, `targetRounds`, `manaPerRound`
- sequencing context: `chainCount`, `lastSpell`
- lifecycle counters: `roundDeaths`, `nextUid`

### Puzzle format

Puzzle JSON includes:

- metadata: `id`, `difficulty`, `seed`, `tags`
- constraints: `targetRounds`, `manaPerRound`
- initial state: `player`, `opponent`
- optional `solution[]` action trace

Schema lives in `schema/puzzle.schema.json`, but the runtime scripts do not hard-validate against schema by default.

## 4. Rules Engine (`engine/`)

`engine/engine.ts` is the authoritative state machine in Node/TypeScript:

- `applyAction(state, action, cards)`:
  - Supports `play`, `attack`, `activate`, `end`.
  - Clones state first; returns new state.
- `getLegalActions(state, cards)`:
  - Generates all legal plays/targets/attacks/activations + `end`.
- `isWin(state)`:
  - True when boss health is `<= 0`.

The engine handles:

- Target resolution (`player:slotN`, `opponent:slotN`, or `uid`).
- Guard restrictions, attack/retaliation, pierce overflow.
- Keywords/mod/effect mechanics (testudo, venom, brood, rebirth, relay, order, sleepy, etc.).
- Round transitions (`end`): poison ticks, end-of-round buffs/damage, borrowed creature return, mana adjustments, untiring, turn advance.
- Death pipeline (`handleDeaths`), including on-death damage/heal/splash, rebirth replacement, scavenger growth, effect counters, anchored aura reflows.

`engine/state.ts` normalizes incomplete puzzle state into fully operational runtime state with defaults and UIDs.

## 5. Generator Pipeline (`generator/core.ts`)

The generator is constructive:

1. Pick random candidate hand.
2. Build boss board (optional random boss creatures + allowed mods).
3. Run `ghostWalk()` through legal actions to get a valid trace.
4. `materialize()` puzzle around that trace.
5. Optionally add decoys.
6. Validate with incremental solve (`createSolveState()` + `stepSolve()`) for:
   - early-win rejection (multi-round puzzles),
   - max-solution cap rejection.

Important pieces:

- `Rng`: seeded deterministic PRNG used across generator.
- `deriveManaPlan()`: computes start mana + mana-per-round from ghost trace requirements.
- `buildPuzzleAttempt()`: one candidate attempt + rejection reason classification.

## 6. Solver Paths

There are two solver implementations:

- `solver/solver.ts`:
  - Recursive DFS returning explicit winning lines.
  - Used by CLI `solve_puzzle.ts`.
- `generator/core.ts` (`stepSolve` flow):
  - Incremental stack-based DFS with iteration budgeting.
  - Used in puzzle generation loops (CLI + UI) to avoid blocking and to enforce generator constraints.

The UI also has its own local DFS loop in `ui/app.js` (`startSolver`/`stepSolver`) for interactive solving from arbitrary edited states.

## 7. CLI Tools (`scripts/`)

### `generate_puzzle.ts`

End-to-end generator command with controls for:

- seed, hand sizing, decoys
- target rounds
- boss board size/mod density
- ghost action budget
- solver budget and max-solutions cap
- optional JSON output path

It loops attempts until accepted, prints final puzzle JSON.

### `solve_puzzle.ts`

- Loads card library + puzzle JSON.
- Normalizes state.
- Runs DFS solver and prints summary + first winning line.

### `render_puzzle.ts`

- Terminal formatter for puzzle cards/board/hand.
- Useful quick inspection tool before opening UI.

### Art scripts (`*.py`)

- `generate_card_art.py`: single prompt -> image via OpenAI `responses.create` image tool.
- `populate_missing_art.py`: batch art generation by card type/boss, converts PNG to JPG (Pillow), writes into `ui/assets/*`.

## 8. Web UI (`ui/`)

### Main board (`index.html` + `app.js`)

Features:

- Load puzzle JSON from textarea/file or built-in examples.
- Manual play using engine legality (including target selection UI).
- Playback (`step solution`, autoplay, undo/reset).
- Generator panel with same core generator logic as CLI.
- Solver panel for solution search from current board state.
- Edit mode for direct puzzle mutation (click-to-add/remove cards, edit stats resources via prompts).

Data flow in browser:

- Load `cards/cards.json` (falls back to embedded minimal library if fetch fails).
- Normalize puzzle -> runtime state.
- Render boards/hand/effects.
- On action: call `applyAction` then re-render.

### Other pages

- `cards.html` + `cards.js`: searchable card compendium with art preview modal.
- `rules.html`: human-readable rules summary.

## 9. Build and Artifact Flow

- `npm run build`
  - Compiles TypeScript (`engine`, `solver`, `generator`, `scripts`, etc.) to `dist/`.
- `npm run build:ui-gen`
  - Compiles `generator/core.ts` to `ui/gen/generator/core.js` for browser import.

Notable duplication:

- Browser engine lives in `ui/engine.js` and mirrors logic from `engine/engine.ts`.
- This is not generated by current npm scripts, so behavior parity must be maintained manually.

## 10. Typical Workflows

### Generate a puzzle (CLI)

1. `npm run build`
2. `node dist/scripts/generate_puzzle.js --target-rounds 2 --max-solutions 1 --output puzzles/new.json`

### Inspect + solve (CLI)

1. `node dist/scripts/render_puzzle.js puzzles/new.json`
2. `node dist/scripts/solve_puzzle.js puzzles/new.json --max-wins 3`

### Play/test in browser

1. Serve repo via local HTTP server.
2. Open `ui/index.html`.
3. Load/edit puzzle, run solver/generator, step actions.

## 11. Architecture Notes / Gotchas

- Determinism is the core invariant: all logic assumes reproducible transitions.
- State hashing uses `JSON.stringify(state)` in multiple DFS flows; shape stability matters.
- Several systems have duplicated logic (engine/solver behavior across Node and UI), so drift is the primary maintenance risk.
- `schema/puzzle.schema.json` exists, but there is no strict schema gate in current CLI/UI load paths.

