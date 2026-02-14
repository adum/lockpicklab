import assert from "node:assert/strict";
import path from "path";
import { applyAction, getLegalActions } from "../../engine/engine";
import { loadCardLibrary } from "../../engine/cards";
import { cloneState, normalizeState } from "../../engine/state";
import type {
  Action,
  CardInstance,
  CardLibrary,
  GameState,
  OpponentState,
  SideState,
} from "../../engine/types";

export type UnitOverrides = Partial<
  Omit<CardInstance, "card" | "power" | "keywords" | "mods" | "tired">
> & {
  power?: number;
  keywords?: CardInstance["keywords"];
  mods?: string[];
  tired?: boolean;
};

function cloneUnit(unit: CardInstance): CardInstance {
  return {
    uid: unit.uid,
    card: unit.card,
    power: unit.power,
    keywords: [...(unit.keywords ?? [])],
    mods: [...(unit.mods ?? [])],
    tired: Boolean(unit.tired),
    poison: unit.poison ?? 0,
    shield: unit.shield ?? 0,
    rebirths: unit.rebirths ?? 0,
    counter: unit.counter ?? 0,
    borrowed: unit.borrowed ?? false,
    borrowedMultiplier: unit.borrowedMultiplier ?? 0,
    anchoredBonus: unit.anchoredBonus ?? 0,
  };
}

export function loadCards(): CardLibrary {
  return loadCardLibrary(path.resolve("cards/cards.json"));
}

export function unit(
  cards: CardLibrary,
  cardId: string,
  overrides?: UnitOverrides
): CardInstance {
  const def = cards.byId[cardId];
  if (!def) {
    throw new Error(`Unknown card in helper: ${cardId}`);
  }
  return {
    uid: overrides?.uid,
    card: cardId,
    power: overrides?.power ?? def.stats?.power ?? 0,
    keywords: overrides?.keywords
      ? [...overrides.keywords]
      : def.keywords
        ? [...def.keywords]
        : [],
    mods: overrides?.mods ? [...overrides.mods] : [],
    tired: overrides?.tired ?? false,
    poison: overrides?.poison ?? 0,
    shield: overrides?.shield ?? 0,
    rebirths: overrides?.rebirths ?? 0,
    counter: overrides?.counter ?? 0,
    borrowed: overrides?.borrowed ?? false,
    borrowedMultiplier: overrides?.borrowedMultiplier ?? 0,
    anchoredBonus: overrides?.anchoredBonus ?? 0,
  };
}

export interface StateOptions {
  player?: Partial<SideState>;
  opponent?: Partial<OpponentState>;
  chainCount?: number;
  turn?: number;
  nextUid?: number;
  manaPerRound?: number;
  targetRounds?: number;
  roundDeaths?: number;
  lastSpell?: GameState["lastSpell"];
}

function cloneBoard(board: CardInstance[] | undefined): CardInstance[] {
  return (board ?? []).map(cloneUnit);
}

export function makeState(options?: StateOptions): GameState {
  return normalizeState({
    player: {
      mana: options?.player?.mana ?? 0,
      hand: [...(options?.player?.hand ?? [])],
      board: cloneBoard(options?.player?.board),
      deck: options?.player?.deck ? [...options.player.deck] : undefined,
      graveyard: options?.player?.graveyard
        ? [...options.player.graveyard]
        : undefined,
    },
    opponent: {
      health: options?.opponent?.health ?? 20,
      name: options?.opponent?.name ?? "Boss",
      board: cloneBoard(options?.opponent?.board),
      deck: options?.opponent?.deck ? [...options.opponent.deck] : undefined,
      graveyard: options?.opponent?.graveyard
        ? [...options.opponent.graveyard]
        : undefined,
      poison: options?.opponent?.poison ?? 0,
    },
    chainCount: options?.chainCount ?? 0,
    turn: options?.turn ?? 1,
    nextUid: options?.nextUid ?? 1,
    manaPerRound: options?.manaPerRound ?? 0,
    targetRounds: options?.targetRounds ?? 1,
    roundDeaths: options?.roundDeaths ?? 0,
    lastSpell: options?.lastSpell ?? null,
  });
}

export function applyActions(
  state: GameState,
  actions: Action[],
  cards: CardLibrary
): GameState {
  let current = cloneState(state);
  actions.forEach((action) => {
    current = applyAction(current, action, cards);
  });
  return current;
}

export function expectThrow(
  fn: () => unknown,
  pattern?: RegExp,
  message?: string
): void {
  if (pattern) {
    assert.throws(fn, pattern, message);
    return;
  }
  assert.throws(fn, message);
}

export function findAction(
  state: GameState,
  cards: CardLibrary,
  predicate: (action: Action) => boolean,
  label: string
): Action {
  const found = getLegalActions(state, cards).find(predicate);
  assert.ok(found, `Missing legal action: ${label}`);
  return found as Action;
}

export const refs = {
  player(slot: number): string {
    return `player:slot${slot}`;
  },
  opponent(slot: number): string {
    return `opponent:slot${slot}`;
  },
};
