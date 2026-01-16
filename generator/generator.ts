import { Action, CardLibrary, GameState, Puzzle } from "../engine/types";

export interface GhostResult {
  trace: Action[];
  state: GameState;
}

export function ghostWalk(
  state: GameState,
  cards: CardLibrary,
  steps: number
): GhostResult {
  return { trace: [], state };
}

export function materialize(
  ghost: GhostResult,
  options?: {
    difficulty?: Puzzle["difficulty"];
    seed?: number;
  }
): Puzzle {
  return {
    id: "puzzle_stub",
    difficulty: options?.difficulty ?? "easy",
    seed: options?.seed,
    tags: [],
    player: ghost.state.player,
    opponent: ghost.state.opponent,
    solution: ghost.trace,
  };
}

export function obfuscate(puzzle: Puzzle, cards: CardLibrary): Puzzle {
  return puzzle;
}
