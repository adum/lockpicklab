import { applyAction, getLegalActions, isWin } from "../engine/engine";
import { cloneState } from "../engine/state";
import { Action, CardLibrary, GameState, Puzzle } from "../engine/types";

export interface GhostResult {
  trace: Action[];
  state: GameState;
  startState: GameState;
}

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(max: number): number {
    if (max <= 0) {
      return 0;
    }
    return Math.floor(this.next() * max);
  }

  pick<T>(items: T[]): T {
    return items[this.int(items.length)];
  }
}

export interface GhostOptions {
  rng?: Rng;
  excludeEnd?: boolean;
  stopOnWin?: boolean;
}

export function ghostWalk(
  state: GameState,
  cards: CardLibrary,
  steps: number,
  options?: GhostOptions
): GhostResult {
  const rng = options?.rng ?? new Rng(Date.now());
  const excludeEnd = options?.excludeEnd ?? true;
  const stopOnWin = options?.stopOnWin ?? false;

  const startState = cloneState(state);
  let current = cloneState(state);
  const trace: Action[] = [];

  for (let step = 0; step < steps; step += 1) {
    let actions = getLegalActions(current, cards);
    if (excludeEnd) {
      actions = actions.filter((action) => action.type !== "end");
    }
    if (actions.length === 0) {
      break;
    }
    const action = rng.pick(actions);
    current = applyAction(current, action, cards);
    trace.push(action);
    if (stopOnWin && isWin(current)) {
      break;
    }
  }

  return { trace, state: current, startState };
}

export function materialize(
  ghost: GhostResult,
  cards: CardLibrary,
  options?: {
    difficulty?: Puzzle["difficulty"];
    seed?: number;
    targetRounds?: number;
    manaPerRound?: number;
  }
): Puzzle {
  const usedCards = ghost.trace
    .filter((action) => action.type === "play")
    .map((action) => action.card);
  const manaSpent = usedCards.reduce((sum, cardId) => {
    const def = cards.byId[cardId];
    return sum + (def?.cost ?? 0);
  }, 0);

  const startHealth = ghost.startState.opponent.health;
  const endHealth = ghost.state.opponent.health;
  const damage = startHealth - endHealth;
  if (damage <= 0) {
    throw new Error("Ghost walk did not deal damage; cannot materialize puzzle.");
  }

  const tags = new Set<string>();
  usedCards.forEach((cardId) => {
    const def = cards.byId[cardId];
    def?.keywords?.forEach((kw) => tags.add(kw));
  });

  return {
    id: `puzzle_${options?.seed ?? Date.now()}`,
    difficulty: options?.difficulty ?? "easy",
    seed: options?.seed,
    tags: Array.from(tags),
    targetRounds: options?.targetRounds ?? 1,
    manaPerRound: options?.manaPerRound ?? 0,
    player: {
      mana: manaSpent,
      hand: usedCards,
      board: [],
    },
    opponent: {
      name: ghost.startState.opponent.name ?? "Boss",
      health: Math.max(1, damage),
      board: [],
    },
    solution: ghost.trace,
  };
}

export function obfuscate(
  puzzle: Puzzle,
  cards: CardLibrary,
  options?: {
    rng?: Rng;
    extraCards?: number;
  }
): Puzzle {
  const rng = options?.rng ?? new Rng(Date.now());
  const hand = [...puzzle.player.hand];
  const pool = Object.values(cards.byId).filter(
    (card) =>
      card.type === "creature" || card.type === "spell" || card.type === "effect"
  );
  const extraCards = options?.extraCards ?? Math.max(0, 5 - hand.length);

  for (let i = 0; i < extraCards; i += 1) {
    if (pool.length === 0) {
      break;
    }
    const candidate = rng.pick(pool);
    hand.push(candidate.id);
  }

  return {
    ...puzzle,
    player: {
      ...puzzle.player,
      hand,
    },
  };
}
