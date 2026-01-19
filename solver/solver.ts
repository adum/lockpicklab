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

function isFinalRound(state: GameState): boolean {
  const totalRounds = state.targetRounds;
  if (!Number.isFinite(totalRounds)) {
    return false;
  }
  return totalRounds - (state.turn - 1) === 1;
}

function isPastRoundLimit(state: GameState): boolean {
  const totalRounds = state.targetRounds;
  if (!Number.isFinite(totalRounds)) {
    return false;
  }
  return state.turn > totalRounds;
}

export function solve(
  state: GameState,
  cards: CardLibrary,
  options?: {
    maxWins?: number;
  }
): SolveResult {
  const maxDepth = estimateMaxDepth(state);
  const maxWinsRaw = options?.maxWins ?? 0;
  const maxWins =
    maxWinsRaw === 0 ? Number.POSITIVE_INFINITY : maxWinsRaw;
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

    if (isPastRoundLimit(current)) {
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
      if (action.type === "end" && isFinalRound(current)) {
        continue;
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

function estimateMaxDepth(state: GameState): number {
  const roundsRaw = state.targetRounds;
  const rounds =
    typeof roundsRaw === "number" && Number.isFinite(roundsRaw)
      ? roundsRaw
      : Number(roundsRaw) || 1;
  const handSize = state.player?.hand?.length ?? 0;
  const baseBoardCount = state.player?.board?.length ?? 0;
  const maxCreatures = baseBoardCount + handSize;
  const plays = handSize;
  const attacks = maxCreatures * rounds;
  const activates = maxCreatures;
  const ends = Math.max(0, rounds - 1);
  return Math.max(1, plays + attacks + activates + ends);
}
