import { applyAction, getLegalActions, isWin } from "../engine/engine";
import { Action, CardLibrary, GameState } from "../engine/types";

export interface SolveResult {
  wins: Action[][];
  visited: number;
  expanded: number;
}

function hashState(state: GameState): string {
  return JSON.stringify(state);
}

export function solve(
  state: GameState,
  cards: CardLibrary,
  options?: {
    maxDepth?: number;
    maxWins?: number;
  }
): SolveResult {
  const maxDepth = options?.maxDepth ?? 8;
  const maxWins = options?.maxWins ?? 2;
  const wins: Action[][] = [];
  const seen = new Map<string, number>();
  let visited = 0;
  let expanded = 0;

  function dfs(current: GameState, depth: number, path: Action[]): void {
    visited += 1;

    if (isWin(current)) {
      wins.push([...path]);
      return;
    }

    if (depth >= maxDepth || wins.length >= maxWins) {
      return;
    }

    const key = hashState(current);
    const prevDepth = seen.get(key);
    if (prevDepth !== undefined && prevDepth <= depth) {
      return;
    }
    seen.set(key, depth);

    const actions = getLegalActions(current, cards);
    expanded += 1;

    for (const action of actions) {
      if (wins.length >= maxWins) {
        return;
      }
      try {
        const next = applyAction(current, action, cards);
        dfs(next, depth + 1, [...path, action]);
      } catch {
        continue;
      }
    }
  }

  dfs(state, 0, []);

  return { wins, visited, expanded };
}
