import test from "node:test";
import assert from "node:assert/strict";
import type {
  Action,
  CardDefinition,
  CardLibrary,
  GameState,
  Puzzle,
} from "../../engine/types";
import {
  Rng,
  addDecoys,
  buildGeneratorPools,
  buildPuzzleAttempt,
  createSolveState,
  isBossModAllowed,
  isEarlyWin,
  isFinalRoundForSolver,
  isPastRoundLimit,
  stepSolve,
  type GeneratorEngine,
  type GeneratorState,
} from "../../generator/core";
import { loadCards } from "../engine/helpers";

class CyclingRng extends Rng {
  private cursor = 0;

  override int(max: number): number {
    if (max <= 0) {
      return 0;
    }
    const value = this.cursor % max;
    this.cursor += 1;
    return value;
  }
}

function cloneGameState<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeSimpleCards(): CardLibrary {
  const cards: CardDefinition[] = [
    {
      id: "strike",
      name: "Strike",
      type: "spell",
      cost: 1,
      effects: [{ type: "damage", amount: 1 }],
    },
    {
      id: "squire",
      name: "Squire",
      type: "creature",
      cost: 1,
      stats: { power: 1 },
    },
    {
      id: "ward",
      name: "Ward",
      type: "mod",
      cost: 1,
      effects: [{ type: "shield", amount: 1 }],
    },
    {
      id: "banner",
      name: "Banner",
      type: "effect",
      cost: 1,
      effects: [{ type: "end_mana", amount: 1 }],
    },
    {
      id: "piercing_rune",
      name: "Piercing Rune",
      type: "mod",
      cost: 1,
      effects: [{ type: "grant_keyword", keyword: "pierce" }],
    },
  ];
  const byId = cards.reduce<Record<string, CardDefinition>>((acc, card) => {
    acc[card.id] = card;
    return acc;
  }, {});
  return { byId };
}

function makeSimpleEngine(): GeneratorEngine {
  return {
    normalizeState(input) {
      return {
        player: {
          mana: input.player.mana ?? 0,
          hand: [...(input.player.hand ?? [])],
          board: [...(input.player.board ?? [])],
          deck: input.player.deck ? [...input.player.deck] : undefined,
          graveyard: input.player.graveyard
            ? [...input.player.graveyard]
            : undefined,
        },
        opponent: {
          health: input.opponent.health ?? 20,
          name: input.opponent.name ?? "Boss",
          board: [...(input.opponent.board ?? [])],
          deck: input.opponent.deck ? [...input.opponent.deck] : undefined,
          graveyard: input.opponent.graveyard
            ? [...input.opponent.graveyard]
            : undefined,
          poison: input.opponent.poison ?? 0,
        },
        chainCount: input.chainCount ?? 0,
        turn: input.turn ?? 1,
        nextUid: input.nextUid ?? 1,
        manaPerRound: input.manaPerRound ?? 0,
        targetRounds: input.targetRounds,
        roundDeaths: input.roundDeaths ?? 0,
        lastSpell: input.lastSpell ?? null,
      };
    },
    cloneState(state) {
      return cloneGameState(state);
    },
    isWin(state) {
      return state.opponent.health <= 0;
    },
    getLegalActions(state) {
      if ((state.player.hand ?? []).length === 0) {
        return [];
      }
      return state.player.hand.map((card) => ({
        type: "play",
        card,
      })) as Action[];
    },
    applyAction(state, action, cards) {
      if (action.type !== "play") {
        return state;
      }
      const hand = [...state.player.hand];
      const cardIndex = hand.indexOf(action.card);
      if (cardIndex >= 0) {
        hand.splice(cardIndex, 1);
      }
      const cost = cards.byId[action.card]?.cost ?? 0;
      return {
        ...state,
        player: {
          ...state.player,
          hand,
          mana: Math.max(0, state.player.mana - cost),
        },
        opponent: {
          ...state.opponent,
          health: state.opponent.health - 1,
        },
      };
    },
  };
}

function makeGeneratorState(
  cards: CardLibrary,
  overrides?: Partial<GeneratorState>
): GeneratorState {
  const playable = overrides?.playable ?? [
    cards.byId.strike,
    cards.byId.squire,
    cards.byId.ward,
  ];
  const creaturePool = overrides?.creaturePool ?? [cards.byId.squire];
  return {
    seed: overrides?.seed ?? 1,
    rng: overrides?.rng ?? new CyclingRng(1),
    handSize: overrides?.handSize ?? 2,
    minHandSize: overrides?.minHandSize ?? 0,
    requiredCards: overrides?.requiredCards ?? [],
    decoys: overrides?.decoys ?? 0,
    targetRounds: overrides?.targetRounds ?? 1,
    bossMin: overrides?.bossMin ?? 0,
    bossMax: overrides?.bossMax ?? 0,
    bossModsMax: overrides?.bossModsMax ?? 0,
    bossModPool: overrides?.bossModPool ?? [],
    bossName: overrides?.bossName ?? "Boss",
    actionBudget: overrides?.actionBudget ?? 10,
    playable,
    creaturePool,
  };
}

function makePuzzle(overrides?: Partial<Puzzle>): Puzzle {
  return {
    id: overrides?.id ?? "t",
    difficulty: overrides?.difficulty ?? "easy",
    targetRounds: overrides?.targetRounds ?? 1,
    manaPerRound: overrides?.manaPerRound ?? 0,
    player: {
      mana: overrides?.player?.mana ?? 0,
      hand: [...(overrides?.player?.hand ?? [])],
      board: [...(overrides?.player?.board ?? [])],
    },
    opponent: {
      name: overrides?.opponent?.name ?? "Boss",
      health: overrides?.opponent?.health ?? 1,
      board: [...(overrides?.opponent?.board ?? [])],
    },
    solution: overrides?.solution,
    metadata: overrides?.metadata,
    seed: overrides?.seed,
    tags: overrides?.tags,
  };
}

test("isBossModAllowed rejects pierce rune and boss damage mods", () => {
  const cards = loadCards();
  assert.equal(isBossModAllowed(cards.byId.piercing_rune), false);
  assert.equal(isBossModAllowed(cards.byId.requiem_rune), false);
  assert.equal(isBossModAllowed(cards.byId.wooden_shield), true);
});

test("buildGeneratorPools applies playable and boss-mod filters", () => {
  const cards = makeSimpleCards();
  const pools = buildGeneratorPools(cards, {
    playableFilter: (card) => card.type !== "effect",
  });
  const playableIds = pools.playable.map((card) => card.id).sort();
  assert.deepEqual(playableIds, ["piercing_rune", "squire", "strike", "ward"]);
  assert.deepEqual(pools.creaturePool.map((card) => card.id), ["squire"]);
  assert.deepEqual(pools.bossModPool, ["ward"]);
});

test("addDecoys appends the configured number of extra cards", () => {
  const cards = makeSimpleCards();
  const rng = new CyclingRng(2);
  const puzzle = makePuzzle({
    player: {
      mana: 2,
      hand: ["strike"],
      board: [],
    },
    opponent: {
      health: 3,
      board: [],
    },
  });
  const withDecoys = addDecoys(
    puzzle,
    rng,
    [cards.byId.strike, cards.byId.squire, cards.byId.ward],
    2
  );
  assert.equal(withDecoys.player.hand.length, 3);
  assert.equal(withDecoys.player.hand[0], "strike");
});

test("buildPuzzleAttempt rejects when required cards are not used", () => {
  const cards = makeSimpleCards();
  const engine = makeSimpleEngine();
  const state = makeGeneratorState(cards, {
    requiredCards: ["ward"],
    playable: [cards.byId.strike, cards.byId.squire],
    handSize: 2,
  });

  const attempt = buildPuzzleAttempt(state, cards, engine);

  assert.equal(attempt.puzzle, undefined);
  assert.equal(attempt.rejection, "required_cards");
});

test("buildPuzzleAttempt accepts when required cards are used", () => {
  const cards = makeSimpleCards();
  const engine = makeSimpleEngine();
  const state = makeGeneratorState(cards, {
    requiredCards: ["ward"],
    playable: [cards.byId.ward, cards.byId.strike],
    handSize: 2,
  });

  const attempt = buildPuzzleAttempt(state, cards, engine);

  assert.ok(attempt.puzzle, "expected a generated puzzle");
  assert.ok(attempt.puzzle?.player.hand.includes("ward"));
});

test("buildPuzzleAttempt enforces minHandSize rejection", () => {
  const cards = makeSimpleCards();
  const engine = makeSimpleEngine();
  const state = makeGeneratorState(cards, {
    minHandSize: 3,
    handSize: 2,
  });

  const attempt = buildPuzzleAttempt(state, cards, engine);

  assert.equal(attempt.puzzle, undefined);
  assert.equal(attempt.rejection, "min_hand");
});

test("buildPuzzleAttempt rejects single-type hands", () => {
  const cards = makeSimpleCards();
  const engine = makeSimpleEngine();
  const state = makeGeneratorState(cards, {
    handSize: 2,
    playable: [cards.byId.strike],
  });

  const attempt = buildPuzzleAttempt(state, cards, engine);

  assert.equal(attempt.puzzle, undefined);
  assert.equal(attempt.rejection, "hand_types");
});

test("createSolveState normalizes puzzle into solver state", () => {
  const cards = makeSimpleCards();
  const engine = makeSimpleEngine();
  const puzzle = makePuzzle({
    targetRounds: 2,
    manaPerRound: 1,
    player: { mana: 3, hand: ["strike"], board: [] },
    opponent: { health: 2, board: [] },
  });

  const solver = createSolveState(puzzle, engine, 99, 0);

  assert.equal(solver.puzzle.id, puzzle.id);
  assert.equal(solver.startState.player.mana, 3);
  assert.equal(solver.startState.targetRounds, 2);
  assert.equal(solver.maxNodes, 99);
  assert.equal(solver.maxSeen, Number.POSITIVE_INFINITY);
  assert.equal(solver.stack.length, 1);
  assert.equal(solver.stack[0].depth, 0);
  assert.deepEqual(solver.winPaths, []);
  assert.equal(solver.recordPaths, false);
  void cards;
});

test("stepSolve returns success when at least one win exists", () => {
  const cards = makeSimpleCards();
  const engine = makeSimpleEngine();
  const puzzle = makePuzzle({
    player: { mana: 1, hand: ["strike"], board: [] },
    opponent: { health: 1, board: [] },
  });
  const solver = createSolveState(puzzle, engine, 50);

  const result = stepSolve(solver, cards, engine, {
    iterationLimit: 50,
  });

  assert.equal(result.status, "success");
  assert.equal(solver.wins, 1);
});

test("stepSolve returns exhausted when search ends without wins", () => {
  const cards = makeSimpleCards();
  const engine = makeSimpleEngine();
  const puzzle = makePuzzle({
    player: { mana: 0, hand: [], board: [] },
    opponent: { health: 2, board: [] },
  });
  const solver = createSolveState(puzzle, engine, 50);

  const result = stepSolve(solver, cards, engine, {
    iterationLimit: 50,
  });

  assert.equal(result.status, "exhausted");
  assert.equal(solver.wins, 0);
});

test("stepSolve returns budget when maxNodes is exceeded", () => {
  const cards = makeSimpleCards();
  const engine = makeSimpleEngine();
  const puzzle = makePuzzle({
    player: { mana: 1, hand: ["strike"], board: [] },
    opponent: { health: 2, board: [] },
  });
  const solver = createSolveState(puzzle, engine, 1);

  const result = stepSolve(solver, cards, engine, {
    iterationLimit: 50,
  });

  assert.equal(result.status, "budget");
});

test("stepSolve rejects early wins for multi-round constraints", () => {
  const cards = makeSimpleCards();
  const engine = makeSimpleEngine();
  const puzzle = makePuzzle({
    targetRounds: 3,
    player: { mana: 0, hand: [], board: [] },
    opponent: { health: 0, board: [] },
  });
  const solver = createSolveState(puzzle, engine, 50);

  const result = stepSolve(solver, cards, engine, {
    iterationLimit: 50,
    enforceEarlyWin: true,
    targetRounds: 3,
  });

  assert.equal(result.status, "reject");
  assert.equal(result.reason, "early_win");
});

test("stepSolve rejects when solutions exceed cap", () => {
  const cards = makeSimpleCards();
  const engine = makeSimpleEngine();
  const puzzle = makePuzzle({
    player: { mana: 2, hand: ["strike", "squire"], board: [] },
    opponent: { health: 1, board: [] },
  });
  const solver = createSolveState(puzzle, engine, 50);

  const result = stepSolve(solver, cards, engine, {
    iterationLimit: 50,
    enforceSolutionCap: true,
    maxSolutions: 1,
  });

  assert.equal(result.status, "reject");
  assert.equal(result.reason, "solution_cap");
  assert.ok(solver.wins > 1);
});

test("round helper functions reflect solver round boundaries", () => {
  assert.equal(
    isEarlyWin(
      {
        player: { mana: 0, hand: [], board: [] },
        opponent: { health: 1, board: [] },
        chainCount: 0,
        turn: 1,
        nextUid: 1,
        manaPerRound: 0,
        targetRounds: 3,
      } as GameState,
      3
    ),
    true
  );

  const state = {
    player: { mana: 0, hand: [], board: [] },
    opponent: { health: 1, board: [] },
    chainCount: 0,
    turn: 2,
    nextUid: 1,
    manaPerRound: 0,
    targetRounds: 2,
  } as GameState;

  assert.equal(isFinalRoundForSolver(state), true);
  assert.equal(isPastRoundLimit({ ...state, turn: 3 }), true);
});
