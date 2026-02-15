import { applyAction, getLegalActions, isWin } from "../engine/engine";
import { Action, CardLibrary, GameState } from "../engine/types";
import { createDfsState, stepDfsSearch, type SolverEngine } from "./core";

export interface SolveResult {
  wins: Action[][];
  visited: number;
  expanded: number;
}

const solverEngine: SolverEngine = {
  applyAction,
  getLegalActions,
  isWin,
};

export function solve(
  state: GameState,
  cards: CardLibrary,
  options?: {
    maxWins?: number;
  }
): SolveResult {
  const search = createDfsState(state, {
    maxWins: options?.maxWins ?? 0,
    recordPaths: true,
  });

  while (true) {
    const result = stepDfsSearch(search, cards, solverEngine, {
      iterationLimit: 5000,
    });
    if (result.status === "continue") {
      continue;
    }
    break;
  }

  return {
    wins: search.winPaths,
    visited: search.visited,
    expanded: search.expanded,
  };
}
