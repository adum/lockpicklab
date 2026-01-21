import { applyAction, getLegalActions, isWin } from "../engine/engine";
import { cloneState } from "../engine/state";
import { Action, CardLibrary, GameState, Puzzle } from "../engine/types";

export interface GhostResult {
  trace: Action[];
  state: GameState;
  startState: GameState;
  aborted?: boolean;
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
  targetRounds?: number;
  maxActions?: number;
}

export function ghostWalk(
  state: GameState,
  cards: CardLibrary,
  options?: GhostOptions
): GhostResult {
  const rng = options?.rng ?? new Rng(Date.now());
  const excludeEnd = options?.excludeEnd ?? false;
  const stopOnWin = options?.stopOnWin ?? false;
  const roundsRaw = options?.targetRounds ?? state.targetRounds;
  const maxActions = options?.maxActions ?? 200;
  const rounds =
    typeof roundsRaw === "number" && Number.isFinite(roundsRaw)
      ? roundsRaw
      : Number(roundsRaw) || 1;

  const startState = cloneState(state);
  let current = cloneState(state);
  const trace: Action[] = [];
  const seen = new Set<string>();

  while (true) {
    const key = JSON.stringify(current);
    if (seen.has(key)) {
      break;
    }
    seen.add(key);

    let actions = getLegalActions(current, cards);
    if (excludeEnd) {
      actions = actions.filter((action) => action.type !== "end");
    }
    const nonEnd = actions.filter((action) => action.type !== "end");
    let choices: Action[] = [];

    if (excludeEnd) {
      choices = actions;
    } else if (rounds <= 1 || current.turn >= rounds) {
      choices = nonEnd;
    } else if (nonEnd.length > 0) {
      choices = nonEnd;
    } else {
      choices = actions.filter((action) => action.type === "end");
    }

    if (choices.length === 0) {
      break;
    }

    let options: { action: Action; next: GameState }[] = [];
    for (const action of choices) {
      try {
        const next = applyAction(current, action, cards);
        const nextKey = JSON.stringify(next);
        if (nextKey === key || seen.has(nextKey)) {
          continue;
        }
        options.push({ action, next });
      } catch {
        continue;
      }
    }

    if (
      options.length === 0 &&
      !excludeEnd &&
      rounds > 1 &&
      current.turn < rounds
    ) {
      const endActions = actions.filter((action) => action.type === "end");
      for (const action of endActions) {
        try {
          const next = applyAction(current, action, cards);
          const nextKey = JSON.stringify(next);
          if (nextKey === key || seen.has(nextKey)) {
            continue;
          }
          options.push({ action, next });
        } catch {
          continue;
        }
      }
    }

    if (options.length === 0) {
      break;
    }

    const pick = rng.pick(options);
    current = pick.next;
    trace.push(pick.action);
    if (trace.length >= maxActions) {
      return { trace, state: current, startState, aborted: true };
    }
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

  const actionCount = ghost.trace.length;
  const difficulty =
    options?.difficulty ??
    (actionCount >= 5 ? "hard" : actionCount >= 3 ? "medium" : "easy");

  return {
    id: `puzzle_${options?.seed ?? Date.now()}`,
    difficulty,
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
      card.type === "creature" ||
      card.type === "spell" ||
      card.type === "effect" ||
      card.type === "mod"
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
