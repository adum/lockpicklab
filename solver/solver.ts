import { applyAction, getLegalActions, isWin } from "../engine/engine";
import { Action, CardLibrary, GameState } from "../engine/types";
import { createDfsState, stepDfsSearch, type SolverEngine } from "./core";

export interface SolveResult {
  wins: Action[][];
  visited: number;
  expanded: number;
  status: "done" | "budget" | "max_wins";
}

export interface SolveProgress {
  visited: number;
  expanded: number;
  wins: number;
  status: "continue" | "done" | "budget" | "max_wins";
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
    maxNodes?: number;
    maxSeen?: number;
    iterationLimit?: number;
    progressEvery?: number;
    onProgress?: (progress: SolveProgress) => void;
  }
): SolveResult {
  const search = createDfsState(state, {
    maxWins: options?.maxWins ?? 0,
    maxNodes: options?.maxNodes,
    maxSeen: options?.maxSeen,
    recordPaths: true,
  });
  let status: SolveResult["status"] = "done";
  const iterationLimit = Math.max(1, Math.floor(options?.iterationLimit ?? 5000));
  const progressEvery = Math.max(0, Math.floor(options?.progressEvery ?? 0));
  let nextProgressVisited = progressEvery;

  while (true) {
    const result = stepDfsSearch(search, cards, solverEngine, {
      iterationLimit,
    });
    if (options?.onProgress) {
      const shouldEmit =
        result.status !== "continue" ||
        progressEvery <= 0 ||
        search.visited >= nextProgressVisited;
      if (shouldEmit) {
        options.onProgress({
          visited: search.visited,
          expanded: search.expanded,
          wins: search.wins,
          status:
            result.status === "continue"
              ? "continue"
              : result.status === "budget"
                ? "budget"
                : result.status === "max_wins"
                  ? "max_wins"
                  : "done",
        });
        if (result.status === "continue" && progressEvery > 0) {
          while (nextProgressVisited <= search.visited) {
            nextProgressVisited += progressEvery;
          }
        }
      }
    }
    if (result.status === "continue") {
      continue;
    }
    if (result.status === "budget") {
      status = "budget";
    } else if (result.status === "max_wins") {
      status = "max_wins";
    } else {
      status = "done";
    }
    break;
  }

  return {
    wins: search.winPaths,
    visited: search.visited,
    expanded: search.expanded,
    status,
  };
}
