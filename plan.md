# Puzzle Generation + Web UI Plan

## Goals
- Generate deterministic, single-turn lethal puzzles using constructive generation ("painted target").
- Validate puzzles with a brute-force solver and filter by uniqueness/difficulty.
- Provide a web-based UI to load, test, and playback puzzles and solutions.
- Keep the core game engine deterministic and stateless to support solver backtracking.

## Scope
- Core rules engine (cards, keywords, combat, zones, actions).
- Puzzle generator pipeline (ghost walk -> materialize -> obfuscate -> validate).
- Solver/validator and difficulty scoring.
- JSON puzzle format and tooling.
- Web UI for interactive testing and playback.

## Assumptions
- No hidden information, no RNG, opponent is static.
- Deterministic resolution order for effects and combat.

## System Architecture
- `rules.md`: basic English description of the core game mechanics
- `engine/`: Pure rules engine with immutable state transitions.
- `generator/`: Ghost walk, materializer, obfuscator, and difficulty scaler.
- `solver/`: DFS/backtracking with pruning and solution counting.
- `puzzles/`: JSON inputs/outputs and a small seed library.
- `api/` (optional local server): Serve puzzles, run solver, and provide generation endpoints.
- `ui/`: Web client for testing and playback.

## Data Model (Core)
- `Card`: id, name, cost, type, stats, keywords, effects.
- `Effect`: trigger, condition, action, target rules, resolve order.
- `State`: player mana/hand/board, enemy hp/board, stack/queue, turn flags.
- `Action`: play card, activate ability, attack target.
- `Puzzle`: metadata + initial `State` + solution trace (optional).

## Puzzle JSON Schema (Minimum)
- `id`, `difficulty`, `seed`, `tags`.
- `player`: `mana`, `hand`
- `opponent`: `hp`, `board`.
- `solution`: optional ordered list of actions (for playback and regression).

## Generator Pipeline
1) **Ghost Walk**
   - Start with empty board and infinite mana.
   - Randomly pick a short sequence of legal actions.
   - Record full action trace and derived outcomes (mana spent, damage dealt).
2) **Materialize (Paint Target)**
   - Set player mana to exact spend.
   - Set enemy hp to exact lethal from trace.
   - Place used cards into hand/board as required by trace.
   - Populate enemy board to justify attacks (guards, blockers, pierce math).
3) **Obfuscate**
   - Add decoy cards (cost/impact look correct but fail due to constraints).
   - Add enemy decoys that distract without enabling alternate wins.
   - Enforce board space pressure and order-dependency mechanics.
4) **Validate**
   - Run solver from initial state.
   - If 0 wins, discard; if >1 win, mark "loose" or discard for hard tiers.
5) **Score & Tag**
   - Difficulty = action count, branching factor, sequencing constraints.
   - Tag by mechanics used (guard, sacrifice, chain, etc.).

## Solver/Validator Design
- DFS over legal actions with memoized state hashing.
- Track all winning lines up to a limit (e.g., 2) for uniqueness tests.
- Output minimal winning trace for UI playback and regression tests.

## Web UI (Testing + Playback)
### Core Features
- **Puzzle Browser**: list, search, tags, difficulty, seed; load from JSON.
- **Board View**: player board, enemy board, boss HP, mana, hand.
- **Action Panel**: legal moves, card details, and tooltips.
- **Playback Controls**: play/pause, step forward/back, speed, jump to step.
- **Timeline**: action list with timestamps and state diffs on hover.
- **Solver Panel**: run solver, show solution count, show best line.
- **State Inspector**: raw state JSON and derived stats (damage possible).

### Interaction Flow
1) Load puzzle JSON or click "Generate".
2) Play manually or run solver.
3) Playback solution trace with step-by-step highlights. This mode should be collapsed by default as it's confusing to a UI. The default mode is play manually.
4) Export updated puzzle JSON + solution trace.

### UI Layout Suggestion
- Left: Board + hero stats.
- Right: Hand + card detail panel. User can click a card to play it, or drag onto a target when appropriate.
- Bottom: Timeline + collapsed playback controls.
- Side panel: solver output and debug info -- hidden by default.

## Implementation Phases
### Phase 0: Specs and Fixtures
- Write rule reference and card catalog.
- Define JSON schema and example puzzles.
- Decide stack (recommended: Node/JS engine + local API, web UI in JS).

### Phase 1: Engine Core
- Implement state model, action validation, and resolver.
- Define tiny subset of cards to start. Two creatures and a simple spell
- Add deterministic ordering for simultaneous effects.
- Create unit tests for keywords and core combat.

### Phase 2: Solver + Generator
- Build brute force DFS solver
- Implement ghost walk, materialize, and obfuscation.
- Add difficulty scoring and tagging.
- Generate and validate a small puzzle corpus.

### Phase 3: Web UI MVP
- Load puzzle JSON and render board/hand.
- Manual play with legal action list.
- Playback from a solution trace.

### Phase 4: UI + Tooling Enhancements
- Add solver integration and one-click validation.
- Add timeline diffs, state inspector, and export tools.
- Add batch generation and stats dashboard.

## Acceptance Criteria
- Generator produces puzzles with 1 unique solution at hard difficulty.
- Solver can validate puzzles within a reasonable time budget.
- Web UI can load a puzzle, play it, and playback a solution trace.
- JSON puzzles are round-trip safe (no data loss on export).

## Risks and Mitigations
- **Branching explosion**: add pruning rules and limit action depth.
- **Accidental alternate wins**: strict validator; tighten obfuscation.
- **Ambiguous rules**: formalize effect order and targeting.
- **UI drift from engine**: use single engine source
