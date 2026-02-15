import type { Action, CardLibrary, GameState } from "../engine/types";

export interface SolverEngine {
  applyAction: (state: GameState, action: Action, cards: CardLibrary) => GameState;
  getLegalActions: (state: GameState, cards: CardLibrary) => Action[];
  isWin: (state: GameState) => boolean;
}

export interface SolverNode {
  state: GameState;
  depth: number;
  path?: Action[];
}

export interface DfsSearchState {
  wins: number;
  visited: number;
  expanded: number;
  maxNodes: number;
  maxSeen: number;
  maxDepth: number;
  maxWins: number;
  recordPaths: boolean;
  seen: Map<string, number>;
  stack: SolverNode[];
  winPaths: Action[][];
}

export interface CreateDfsStateOptions {
  maxNodes?: number;
  maxSeen?: number;
  maxDepth?: number;
  maxWins?: number;
  recordPaths?: boolean;
}

export type DfsStepStatus =
  | "continue"
  | "done"
  | "budget"
  | "max_wins"
  | "reject";

export interface DfsStepResult {
  status: DfsStepStatus;
  reason?: string;
}

export interface DfsStepOptions {
  iterationLimit?: number;
  skipEndOnFinalRound?: boolean;
  rejectWin?: (state: GameState) => string | undefined;
}

function normalizeLimit(raw: number | undefined): number {
  if (raw === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  if (!Number.isFinite(raw) || raw <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return raw;
}

function normalizeDepth(raw: number | undefined): number {
  if (raw === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  if (!Number.isFinite(raw)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, raw);
}

function readRoundLimit(state: GameState): number | null {
  const totalRounds =
    typeof state.targetRounds === "number"
      ? state.targetRounds
      : Number(state.targetRounds);
  if (!Number.isFinite(totalRounds)) {
    return null;
  }
  return totalRounds;
}

export function hashState(state: GameState): string {
  return JSON.stringify(state);
}

export function isFinalRoundForSolver(state: GameState): boolean {
  const totalRounds = readRoundLimit(state);
  if (totalRounds === null) {
    return false;
  }
  return totalRounds - (state.turn - 1) === 1;
}

export function isPastRoundLimit(state: GameState): boolean {
  const totalRounds = readRoundLimit(state);
  if (totalRounds === null) {
    return false;
  }
  return state.turn > totalRounds;
}

export function isEarlyWin(state: GameState, targetRounds?: number): boolean {
  const rounds =
    typeof targetRounds === "number" ? targetRounds : Number(targetRounds ?? 0);
  if (!Number.isFinite(rounds) || rounds <= 1) {
    return false;
  }
  return state.turn < rounds;
}

export function createDfsState(
  startState: GameState,
  options?: CreateDfsStateOptions
): DfsSearchState {
  const recordPaths = Boolean(options?.recordPaths);
  return {
    wins: 0,
    visited: 0,
    expanded: 0,
    maxNodes: normalizeLimit(options?.maxNodes),
    maxSeen: normalizeLimit(options?.maxSeen),
    maxDepth: normalizeDepth(options?.maxDepth),
    maxWins: normalizeLimit(options?.maxWins),
    recordPaths,
    seen: new Map<string, number>(),
    stack: [{ state: startState, depth: 0, path: recordPaths ? [] : undefined }],
    winPaths: [],
  };
}

export function stepDfsSearch(
  search: DfsSearchState,
  cards: CardLibrary,
  engine: SolverEngine,
  options?: DfsStepOptions
): DfsStepResult {
  const iterationLimit = Math.max(1, Math.floor(options?.iterationLimit ?? 250));
  const skipEndOnFinalRound = options?.skipEndOnFinalRound ?? true;
  let iterations = 0;

  while (search.stack.length > 0 && iterations < iterationLimit) {
    const node = search.stack.pop();
    if (!node) {
      break;
    }

    search.visited += 1;
    if (
      Number.isFinite(search.maxNodes) &&
      search.maxNodes !== Number.POSITIVE_INFINITY &&
      search.visited >= search.maxNodes
    ) {
      return { status: "budget" };
    }

    if (engine.isWin(node.state)) {
      const rejectReason = options?.rejectWin?.(node.state);
      if (rejectReason) {
        return { status: "reject", reason: rejectReason };
      }

      search.wins += 1;
      if (search.recordPaths && node.path) {
        search.winPaths.push(node.path);
      }
      if (search.wins >= search.maxWins) {
        return { status: "max_wins" };
      }
      iterations += 1;
      continue;
    }

    if (isPastRoundLimit(node.state)) {
      iterations += 1;
      continue;
    }

    if (node.depth >= search.maxDepth) {
      iterations += 1;
      continue;
    }

    const key = hashState(node.state);
    const prevDepth = search.seen.get(key);
    if (prevDepth !== undefined && prevDepth <= node.depth) {
      iterations += 1;
      continue;
    }
    search.seen.set(key, node.depth);
    if (
      Number.isFinite(search.maxSeen) &&
      search.maxSeen !== Number.POSITIVE_INFINITY &&
      search.seen.size >= search.maxSeen
    ) {
      return { status: "budget" };
    }

    const actions = engine.getLegalActions(node.state, cards);
    search.expanded += 1;

    for (let i = actions.length - 1; i >= 0; i -= 1) {
      const action = actions[i];
      if (
        skipEndOnFinalRound &&
        action.type === "end" &&
        isFinalRoundForSolver(node.state)
      ) {
        continue;
      }
      try {
        const next = engine.applyAction(node.state, action, cards);
        search.stack.push({
          state: next,
          depth: node.depth + 1,
          path: search.recordPaths
            ? [...(node.path ?? []), action]
            : undefined,
        });
      } catch {
        continue;
      }
    }

    iterations += 1;
  }

  if (search.stack.length === 0) {
    return { status: "done" };
  }

  return { status: "continue" };
}
