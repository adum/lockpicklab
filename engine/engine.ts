import {
  Action,
  AttackAction,
  CardDefinition,
  CardInstance,
  CardLibrary,
  GameState,
  PlayAction,
  ActivateAction,
  EffectDefinition,
  Keyword,
} from "./types";
import { cloneState } from "./state";

const GUARD: Keyword = "guard";
const PIERCE: Keyword = "pierce";
const STORM: Keyword = "storm";
const SACRIFICE: Keyword = "sacrifice";
const TESTUDO: Keyword = "testudo";
const VENOM: Keyword = "venom";
const BROOD: Keyword = "brood";
const SCAVENGER: Keyword = "scavenger";
const REBIRTH: Keyword = "rebirth";
const RELAY: Keyword = "relay";
const ORDER: Keyword = "order";
const SLEEPY: Keyword = "sleepy";
const BROODLING_ID = "broodling";
const WOODEN_SHIELD_ID = "wooden_shield";

function hasKeyword(instance: CardInstance, keyword: Keyword): boolean {
  return instance.keywords.includes(keyword);
}

function hasTestudoCover(
  board: CardInstance[],
  index: number,
  cards: CardLibrary
): boolean {
  const minion = board[index];
  if (!minion || !isCreatureInstance(minion, cards) || !hasKeyword(minion, TESTUDO)) {
    return false;
  }
  const creatureIndexes: number[] = [];
  board.forEach((entry, idx) => {
    if (isCreatureInstance(entry, cards)) {
      creatureIndexes.push(idx);
    }
  });
  const position = creatureIndexes.indexOf(index);
  if (position <= 0 || position >= creatureIndexes.length - 1) {
    return false;
  }
  return true;
}

function hasKeywordDef(def: CardDefinition | undefined, keyword: Keyword): boolean {
  return def?.keywords?.includes(keyword) ?? false;
}

function allocateUid(state: GameState, prefix: "p" | "o"): string {
  const uid = `${prefix}${state.nextUid}`;
  state.nextUid += 1;
  return uid;
}

function findPlayerIndexByRef(state: GameState, ref: string): number {
  if (ref.startsWith("player:slot")) {
    const raw = ref.slice("player:slot".length);
    const idx = Number.parseInt(raw, 10);
    return Number.isNaN(idx) ? -1 : idx;
  }
  const byUid = state.player.board.findIndex((m) => m.uid === ref);
  if (byUid >= 0) {
    return byUid;
  }
  return state.player.board.findIndex((m) => m.card === ref);
}

function findOpponentIndexByRef(state: GameState, ref: string): number {
  if (ref.startsWith("opponent:slot")) {
    const raw = ref.slice("opponent:slot".length);
    const idx = Number.parseInt(raw, 10);
    return Number.isNaN(idx) ? -1 : idx;
  }
  const byUid = state.opponent.board.findIndex((m) => m.uid === ref);
  if (byUid >= 0) {
    return byUid;
  }
  return state.opponent.board.findIndex((m) => m.card === ref);
}

function isCreatureInstance(instance: CardInstance, cards: CardLibrary): boolean {
  return cards.byId[instance.card]?.type === "creature";
}

function enemyGuardIndexes(state: GameState, cards: CardLibrary): number[] {
  const indexes: number[] = [];
  state.opponent.board.forEach((minion, idx) => {
    if (!isCreatureInstance(minion, cards)) {
      return;
    }
    if (hasKeyword(minion, GUARD)) {
      indexes.push(idx);
    }
  });
  return indexes;
}

function removeDead(board: CardInstance[], cards: CardLibrary): CardInstance[] {
  return board.filter((minion) => {
    if (!isCreatureInstance(minion, cards)) {
      return true;
    }
    return minion.power > 0;
  });
}

function applyScavengerBuffs(
  state: GameState,
  cards: CardLibrary,
  deathCount: number
): void {
  if (deathCount <= 0) {
    return;
  }
  [state.player.board, state.opponent.board].forEach((board) => {
    board.forEach((minion) => {
      if (isCreatureInstance(minion, cards) && hasKeyword(minion, SCAVENGER)) {
        minion.power += deathCount;
      }
    });
  });
}

function getDeathDamageFromMods(minion: CardInstance, cards: CardLibrary): number {
  const mods = Array.isArray(minion.mods) ? minion.mods : [];
  let total = 0;
  mods.forEach((modId) => {
    const def = cards.byId[modId];
    if (!def || def.type !== "mod") {
      return;
    }
    def.effects?.forEach((effect) => {
      if (effect.type === "death_damage_boss") {
        total += effect.amount ?? 0;
      }
    });
  });
  return total;
}

function getAdjacentCreatureIndexes(
  board: CardInstance[],
  index: number,
  cards: CardLibrary
): number[] {
  const creatureIndexes: number[] = [];
  board.forEach((entry, idx) => {
    if (isCreatureInstance(entry, cards)) {
      creatureIndexes.push(idx);
    }
  });
  const position = creatureIndexes.indexOf(index);
  if (position < 0) {
    return [];
  }
  const neighbors: number[] = [];
  if (position > 0) {
    neighbors.push(creatureIndexes[position - 1]);
  }
  if (position < creatureIndexes.length - 1) {
    neighbors.push(creatureIndexes[position + 1]);
  }
  return neighbors;
}

function applyRelayBuff(
  board: CardInstance[],
  sourceIndex: number,
  amount: number,
  cards: CardLibrary
): void {
  if (amount <= 0) {
    return;
  }
  const neighbors = getAdjacentCreatureIndexes(board, sourceIndex, cards);
  neighbors.forEach((idx) => {
    const minion = board[idx];
    if (minion && isCreatureInstance(minion, cards)) {
      minion.power += amount;
    }
  });
}

function rebuildBoardWithRebirth(
  state: GameState,
  board: CardInstance[],
  prefix: "p" | "o",
  cards: CardLibrary
): { board: CardInstance[]; deaths: number; deathDamage: number } {
  const nextBoard: CardInstance[] = [];
  let deaths = 0;
  let deathDamage = 0;
  board.forEach((minion) => {
    if (!isCreatureInstance(minion, cards)) {
      nextBoard.push(minion);
      return;
    }
    if (minion.power > 0) {
      nextBoard.push(minion);
      return;
    }
    deaths += 1;
    deathDamage += getDeathDamageFromMods(minion, cards);
    if (hasKeyword(minion, REBIRTH)) {
      const def = cards.byId[minion.card];
      if (def && def.type === "creature") {
        const rebirths = (minion.rebirths ?? 0) + 1;
        const basePower = def.stats?.power ?? 1;
        nextBoard.push({
          uid: allocateUid(state, prefix),
          card: def.id,
          power: basePower + rebirths,
          keywords: def.keywords ? [...def.keywords] : [],
          mods: [],
          tired: false,
          poison: 0,
          shield: 0,
          rebirths,
        });
      }
    }
  });
  return { board: nextBoard, deaths, deathDamage };
}

function handleDeaths(state: GameState, cards: CardLibrary): void {
  const playerResult = rebuildBoardWithRebirth(
    state,
    state.player.board,
    "p",
    cards
  );
  const opponentResult = rebuildBoardWithRebirth(
    state,
    state.opponent.board,
    "o",
    cards
  );
  const deathCount = playerResult.deaths + opponentResult.deaths;
  if (deathCount <= 0) {
    return;
  }
  state.player.board = playerResult.board;
  state.opponent.board = opponentResult.board;
  const deathDamage = playerResult.deathDamage + opponentResult.deathDamage;
  if (deathDamage > 0) {
    applyDamageToOpponent(state, deathDamage);
  }
  applyScavengerBuffs(state, cards, deathCount);
}

function applyDamageToMinion(minion: CardInstance, amount: number): void {
  minion.power -= amount;
}

function applyDamageToOpponent(state: GameState, amount: number): void {
  state.opponent.health = Math.max(0, state.opponent.health - amount);
}

function applyDamageToMinionWithSpawn(
  state: GameState,
  board: CardInstance[],
  index: number,
  amount: number,
  prefix: "p" | "o",
  cards: CardLibrary
): void {
  const minion = board[index];
  if (!minion || !isCreatureInstance(minion, cards)) {
    return;
  }
  if (amount <= 0) {
    return;
  }
  if (minion.shield && minion.shield > 0) {
    minion.shield = Math.max(0, minion.shield - 1);
    if (Array.isArray(minion.mods)) {
      const shieldIndex = minion.mods.indexOf(WOODEN_SHIELD_ID);
      if (shieldIndex >= 0) {
        minion.mods.splice(shieldIndex, 1);
      }
    }
    return;
  }
  const prePower = minion.power;
  applyDamageToMinion(minion, amount);
  if (
    amount > 0 &&
    prePower > minion.power &&
    minion.power > 0 &&
    hasKeyword(minion, BROOD)
  ) {
    spawnBroodling(state, board, index, prefix, cards);
  }
}

function spawnBroodling(
  state: GameState,
  board: CardInstance[],
  index: number,
  prefix: "p" | "o",
  cards: CardLibrary
): void {
  const def = cards.byId[BROODLING_ID];
  if (!def || def.type !== "creature") {
    return;
  }
  const insertIndex = findNextCreatureIndex(board, index, cards);
  const instance: CardInstance = {
    uid: allocateUid(state, prefix),
    card: def.id,
    power: def.stats?.power ?? 1,
    keywords: def.keywords ? [...def.keywords] : [],
    mods: [],
    tired: false,
    poison: 0,
    shield: 0,
    rebirths: 0,
  };
  board.splice(insertIndex, 0, instance);
}

function findNextCreatureIndex(
  board: CardInstance[],
  index: number,
  cards: CardLibrary
): number {
  for (let i = index + 1; i < board.length; i += 1) {
    if (isCreatureInstance(board[i], cards)) {
      return i;
    }
  }
  return board.length;
}

function applyPoisonToMinion(minion: CardInstance, amount: number): void {
  minion.poison = (minion.poison ?? 0) + amount;
}

function applyPoisonToOpponent(state: GameState, amount: number): void {
  state.opponent.poison = (state.opponent.poison ?? 0) + amount;
}

function getCardDef(cards: CardLibrary, cardId: string): CardDefinition {
  const def = cards.byId[cardId];
  if (!def) {
    throw new Error(`Unknown card: ${cardId}`);
  }
  return def;
}

function getPlayerAttackAuraBonus(state: GameState, cards: CardLibrary): number {
  let bonus = 0;
  state.player.board.forEach((instance) => {
    const def = cards.byId[instance.card];
    if (!def || def.type !== "effect") {
      return;
    }
    def.effects?.forEach((effect) => {
      if (effect.type === "aura" && effect.stat === "power" && effect.applies_to === "attack") {
        bonus += effect.amount;
      }
    });
  });
  return bonus;
}

function applyEndBuffs(state: GameState, cards: CardLibrary): void {
  let bonus = 0;
  state.player.board.forEach((instance) => {
    const def = cards.byId[instance.card];
    if (!def || def.type !== "effect") {
      return;
    }
    def.effects?.forEach((effect) => {
      if (effect.type === "end_buff" && effect.stat === "power" && effect.applies_to === "untired") {
        bonus += effect.amount;
      }
    });
  });
  if (bonus <= 0) {
    return;
  }
  state.player.board.forEach((minion) => {
    if (isCreatureInstance(minion, cards) && !minion.tired) {
      minion.power += bonus;
    }
  });
}

export function isWin(state: GameState): boolean {
  return state.opponent.health <= 0;
}

export function applyAction(
  state: GameState,
  action: Action,
  cards: CardLibrary
): GameState {
  const next = cloneState(state);

  switch (action.type) {
    case "play":
      return applyPlay(next, action, cards);
    case "attack":
      return applyAttack(next, action, cards);
    case "activate":
      return applyActivate(next, action, cards);
    case "end":
      return applyEnd(next, cards);
    default:
      throw new Error(`Unknown action type: ${(action as Action).type}`);
  }
}

function applyPlay(state: GameState, action: PlayAction, cards: CardLibrary): GameState {
  const def = getCardDef(cards, action.card);
  const handIndex = state.player.hand.indexOf(action.card);
  if (handIndex < 0) {
    throw new Error(`Card not in hand: ${action.card}`);
  }
  if (state.player.mana < def.cost) {
    throw new Error(`Not enough mana for ${action.card}`);
  }
  if (def.type === "creature") {
    const requiresReadyAlly =
      def.effects?.some((effect) => effect.type === "requires_ready_ally") ?? false;
    if (requiresReadyAlly) {
      const hasReadyAlly = state.player.board.some(
        (minion) => isCreatureInstance(minion, cards) && !minion.tired
      );
      if (!hasReadyAlly) {
        throw new Error("Requires an untired creature already on your board");
      }
    }
  }

  state.player.hand.splice(handIndex, 1);
  state.player.mana -= def.cost;

  if (def.type === "creature") {
    if (!def.stats) {
      throw new Error(`Creature missing stats: ${def.id}`);
    }
    const instance: CardInstance = {
      uid: allocateUid(state, "p"),
      card: def.id,
      power: def.stats.power,
      keywords: def.keywords ? [...def.keywords] : [],
      mods: [],
      tired: def.effects?.some((effect) => effect.type === "enter_tired") ?? false,
      poison: 0,
      shield: 0,
      rebirths: 0,
    };
    state.player.board.push(instance);
    if (def.effects?.some((effect) => effect.type === "play_tire_allies")) {
      state.player.board.forEach((minion) => {
        if (isCreatureInstance(minion, cards)) {
          minion.tired = true;
        }
      });
    }
  } else if (def.type === "spell") {
    applySpellEffects(state, def.effects ?? [], action.target, cards);
  } else if (def.type === "effect") {
    const instance: CardInstance = {
      uid: allocateUid(state, "p"),
      card: def.id,
      power: def.stats?.power ?? 0,
      keywords: def.keywords ? [...def.keywords] : [],
      mods: [],
      tired: false,
      poison: 0,
      shield: 0,
      rebirths: 0,
    };
    state.player.board.push(instance);
  } else if (def.type === "mod") {
    if (!action.target) {
      throw new Error("Mod cards require a target creature");
    }
    const playerIndex = findPlayerIndexByRef(state, action.target);
    const opponentIndex = findOpponentIndexByRef(state, action.target);
    if (playerIndex < 0 && opponentIndex < 0) {
      throw new Error(`Invalid mod target: ${action.target}`);
    }
    const target =
      playerIndex >= 0
        ? state.player.board[playerIndex]
        : state.opponent.board[opponentIndex];
    if (!isCreatureInstance(target, cards)) {
      throw new Error(`Invalid mod target: ${action.target}`);
    }
    const requiresPositivePower =
      def.effects?.some((effect) => effect.type === "shield") ?? false;
    if (requiresPositivePower && target.power <= 0) {
      throw new Error("Cannot apply Wooden Shield to a 0-power creature");
    }
    applyModEffects(target, def);
    handleDeaths(state, cards);
  }

  state.chainCount += 1;
  return state;
}

function applyModEffects(target: CardInstance, def: CardDefinition): void {
  const effects = def.effects ?? [];
  effects.forEach((effect) => {
    if (effect.type === "buff") {
      if (effect.stat === "power") {
        target.power += effect.amount;
      }
    }
    if (effect.type === "shield") {
      target.shield = (target.shield ?? 0) + (effect.amount ?? 1);
    }
    if (effect.type === "grant_keyword") {
      if (!target.keywords.includes(effect.keyword)) {
        target.keywords.push(effect.keyword);
      }
    }
  });
  target.mods = target.mods ?? [];
  target.mods.push(def.id);
}

function applySpellEffects(
  state: GameState,
  effects: EffectDefinition[],
  target: string | undefined,
  cards: CardLibrary
): void {
  for (const effect of effects) {
    if (effect.type === "damage") {
      const base = effect.amount;
      const amount = state.chainCount > 0 && effect.chain_amount ? effect.chain_amount : base;
      applySpellDamage(state, amount, target, cards);
    }
    if (effect.type === "damage_all") {
      applySpellDamageAll(state, effect.amount, cards);
    }
  }
}

function applySpellDamage(
  state: GameState,
  amount: number,
  target: string | undefined,
  cards: CardLibrary
): void {
  if (!target || target === "opponent") {
    applyDamageToOpponent(state, amount);
    return;
  }

  if (target.startsWith("opponent:slot")) {
    const index = findOpponentIndexByRef(state, target);
    if (index < 0) {
      throw new Error(`Invalid spell target: ${target}`);
    }
    const defender = state.opponent.board[index];
    if (!isCreatureInstance(defender, cards)) {
      throw new Error(`Invalid spell target: ${target}`);
    }
    applyDamageToMinionWithSpawn(state, state.opponent.board, index, amount, "o", cards);
    handleDeaths(state, cards);
    return;
  }

  throw new Error(`Unsupported spell target: ${target}`);
}

function applySpellDamageAll(
  state: GameState,
  amount: number,
  cards: CardLibrary
): void {
  if (amount <= 0) {
    return;
  }
  for (let index = 0; index < state.player.board.length; index += 1) {
    applyDamageToMinionWithSpawn(state, state.player.board, index, amount, "p", cards);
  }
  for (let index = 0; index < state.opponent.board.length; index += 1) {
    applyDamageToMinionWithSpawn(state, state.opponent.board, index, amount, "o", cards);
  }
  handleDeaths(state, cards);
}

function applyAttack(state: GameState, action: AttackAction, cards: CardLibrary): GameState {
  const sourceIndex = findPlayerIndexByRef(state, action.source);
  if (sourceIndex < 0) {
    throw new Error(`Invalid attack source: ${action.source}`);
  }
  const attacker = state.player.board[sourceIndex];
  if (!isCreatureInstance(attacker, cards)) {
    throw new Error(`Source is not a creature: ${action.source}`);
  }
  if (attacker.tired) {
    throw new Error(`Source is tired: ${action.source}`);
  }

  const guardIndexes = enemyGuardIndexes(state, cards);
  const mustHitGuard = guardIndexes.length > 0;
  const hasEnemyMinions = state.opponent.board.some((minion) =>
    isCreatureInstance(minion, cards)
  );
  const attackBonus = getPlayerAttackAuraBonus(state, cards);
  const attackPower = attacker.power + attackBonus;

  if (action.target === "opponent") {
    if (hasEnemyMinions) {
      throw new Error("Enemy minions are present; cannot attack opponent");
    }
    applyDamageToOpponent(state, attackPower);
    if (hasKeyword(attacker, VENOM)) {
      applyPoisonToOpponent(state, 1);
    }
    attacker.tired = true;
    return state;
  }

  const targetIndex = findOpponentIndexByRef(state, action.target);
  if (targetIndex < 0) {
    throw new Error(`Invalid attack target: ${action.target}`);
  }
  if (mustHitGuard && !guardIndexes.includes(targetIndex)) {
    throw new Error("Guard is present; target must be a guard");
  }

  const defender = state.opponent.board[targetIndex];
  if (!isCreatureInstance(defender, cards)) {
    throw new Error(`Invalid attack target: ${action.target}`);
  }
  const attackerShielded = hasTestudoCover(state.player.board, sourceIndex, cards);
  const defenderShielded = hasTestudoCover(state.opponent.board, targetIndex, cards);
  const defenderHasShield = (defender.shield ?? 0) > 0;
  const defenderPowerBefore = defender.power;
  const damageDealt =
    defenderShielded || defenderHasShield ? 0 : Math.max(0, attackPower);
  if (!defenderShielded) {
    applyDamageToMinionWithSpawn(
      state,
      state.opponent.board,
      targetIndex,
      attackPower,
      "o",
      cards
    );
  }
  if (!attackerShielded) {
    applyDamageToMinionWithSpawn(
      state,
      state.player.board,
      sourceIndex,
      defenderPowerBefore,
      "p",
      cards
    );
  }
  if (hasKeyword(attacker, VENOM)) {
    applyPoisonToMinion(defender, 1);
  }

  if (hasKeyword(attacker, PIERCE) && attackPower > defenderPowerBefore) {
    const excess = attackPower - defenderPowerBefore;
    if (excess > 0) {
      applyDamageToOpponent(state, excess);
    }
  }
  if (hasKeyword(attacker, RELAY) && damageDealt > 0) {
    applyRelayBuff(state.player.board, sourceIndex, damageDealt, cards);
  }

  attacker.tired = true;
  handleDeaths(state, cards);

  return state;
}

function applyActivate(
  state: GameState,
  action: ActivateAction,
  cards: CardLibrary
): GameState {
  const sourceIndex = findPlayerIndexByRef(state, action.source);
  if (sourceIndex < 0) {
    throw new Error(`Invalid activate source: ${action.source}`);
  }
  const source = state.player.board[sourceIndex];
  const def = cards.byId[source.card];
  if (!def || def.type !== "creature" || !hasKeyword(source, SACRIFICE)) {
    throw new Error("Source has no sacrificial ability");
  }
  if (!action.target) {
    throw new Error("Activate requires a target");
  }
  const targetIndex = findPlayerIndexByRef(state, action.target);
  if (targetIndex < 0) {
    throw new Error(`Invalid activate target: ${action.target}`);
  }
  if (targetIndex === sourceIndex) {
    throw new Error("Cannot target self for sacrifice buff");
  }

  const target = state.player.board[targetIndex];
  const effect = def.effects?.find(
    (candidate) =>
      candidate.type === "buff" && candidate.requires === "sacrifice_self"
  );
  if (!effect || effect.type !== "buff") {
    throw new Error("No sacrifice buff effect defined");
  }

  source.power = 0;
  handleDeaths(state, cards);
  if (effect.stat === "power") {
    target.power += effect.amount;
  }

  return state;
}

function applyEnd(state: GameState, cards: CardLibrary): GameState {
  applyPoisonDamageToBoard(state, state.player.board, "p", cards);
  applyPoisonDamageToBoard(state, state.opponent.board, "o", cards);
  if (state.opponent.poison && state.opponent.poison > 0) {
    applyDamageToOpponent(state, state.opponent.poison);
  }
  handleDeaths(state, cards);
  applyEndBuffs(state, cards);
  state.player.board.forEach((minion) => {
    minion.tired = false;
  });
  state.chainCount = 0;
  state.turn += 1;
  state.player.mana += state.manaPerRound;
  return state;
}

function applyPoisonDamageToBoard(
  state: GameState,
  board: CardInstance[],
  prefix: "p" | "o",
  cards: CardLibrary
): void {
  let index = 0;
  while (index < board.length) {
    const minion = board[index];
    if (minion && minion.poison && minion.poison > 0) {
      applyDamageToMinionWithSpawn(
        state,
        board,
        index,
        minion.poison,
        prefix,
        cards
      );
    }
    index += 1;
  }
}

export function getLegalActions(state: GameState, cards: CardLibrary): Action[] {
  const actions: Action[] = [];
  const guardIndexes = enemyGuardIndexes(state, cards);
  const canHitOpponent =
    state.opponent.board.filter((minion) => isCreatureInstance(minion, cards)).length === 0;

  for (const cardId of state.player.hand) {
    const def = cards.byId[cardId];
    if (!def) {
      continue;
    }
    if (state.player.mana < def.cost) {
      continue;
    }

    if (def.type === "spell") {
      const hasDamage = def.effects?.some((effect) => effect.type === "damage") ?? false;
      if (hasDamage) {
        actions.push({ type: "play", card: cardId, target: "opponent" });
        state.opponent.board.forEach((enemy, idx) => {
          if (!isCreatureInstance(enemy, cards)) {
            return;
          }
          actions.push({ type: "play", card: cardId, target: `opponent:slot${idx}` });
        });
        continue;
      }
    }

    if (def.type === "mod") {
      const requiresPositivePower =
        def.effects?.some((effect) => effect.type === "shield") ?? false;
      const playerTargets = state.player.board
        .map((minion, idx) => ({ minion, idx }))
        .filter((entry) => {
          if (!isCreatureInstance(entry.minion, cards)) {
            return false;
          }
          if (requiresPositivePower && entry.minion.power <= 0) {
            return false;
          }
          return true;
        })
        .map((entry) => `player:slot${entry.idx}`);
      const opponentTargets = state.opponent.board
        .map((minion, idx) => ({ minion, idx }))
        .filter((entry) => {
          if (!isCreatureInstance(entry.minion, cards)) {
            return false;
          }
          if (requiresPositivePower && entry.minion.power <= 0) {
            return false;
          }
          return true;
        })
        .map((entry) => `opponent:slot${entry.idx}`);
      if (playerTargets.length === 0 && opponentTargets.length === 0) {
        continue;
      }
      playerTargets.forEach((target) =>
        actions.push({ type: "play", card: cardId, target })
      );
      opponentTargets.forEach((target) =>
        actions.push({ type: "play", card: cardId, target })
      );
      continue;
    }

    if (def.type === "creature") {
      const requiresReadyAlly =
        def.effects?.some((effect) => effect.type === "requires_ready_ally") ?? false;
      if (requiresReadyAlly) {
        const hasReadyAlly = state.player.board.some(
          (minion) => isCreatureInstance(minion, cards) && !minion.tired
        );
        if (!hasReadyAlly) {
          continue;
        }
      }
    }

    actions.push({ type: "play", card: cardId });
  }

  state.player.board.forEach((minion, idx) => {
    if (!isCreatureInstance(minion, cards)) {
      return;
    }
    if (minion.tired) {
      return;
    }
    const sourceRef = minion.uid ?? `player:slot${idx}`;

    if (canHitOpponent) {
      actions.push({ type: "attack", source: sourceRef, target: "opponent" });
    }

    state.opponent.board.forEach((enemy, enemyIndex) => {
      if (!isCreatureInstance(enemy, cards)) {
        return;
      }
      if (guardIndexes.length > 0 && !guardIndexes.includes(enemyIndex)) {
        return;
      }
      const targetRef = enemy.uid ?? `opponent:slot${enemyIndex}`;
      actions.push({ type: "attack", source: sourceRef, target: targetRef });
    });

    if (hasKeyword(minion, SACRIFICE)) {
      state.player.board.forEach((other, otherIndex) => {
        if (otherIndex === idx) {
          return;
        }
        const targetRef = other.uid ?? `player:slot${otherIndex}`;
        actions.push({ type: "activate", source: sourceRef, target: targetRef });
      });
    }
  });

  actions.push({ type: "end" });
  return actions;
}
