const GUARD = "guard";
const PIERCE = "pierce";
const STORM = "storm";
const SACRIFICE = "sacrifice";
const TESTUDO = "testudo";

export function buildCardLibrary(data) {
  const byId = {};
  (data.cards ?? []).forEach((card) => {
    byId[card.id] = card;
  });
  return { byId };
}

export function cloneState(state) {
  return {
    player: cloneSide(state.player),
    opponent: cloneOpponent(state.opponent),
    chainCount: state.chainCount,
    turn: state.turn,
    nextUid: state.nextUid,
    manaPerRound: state.manaPerRound,
    targetRounds: state.targetRounds,
  };
}

function cloneSide(side) {
  return {
    mana: side.mana,
    hand: [...side.hand],
    board: side.board.map(cloneInstance),
    deck: side.deck ? [...side.deck] : undefined,
    graveyard: side.graveyard ? [...side.graveyard] : undefined,
  };
}

function cloneOpponent(side) {
  return {
    health: side.health,
    name: side.name,
    board: side.board.map(cloneInstance),
    deck: side.deck ? [...side.deck] : undefined,
    graveyard: side.graveyard ? [...side.graveyard] : undefined,
  };
}

function cloneInstance(instance) {
  return {
    uid: instance.uid,
    card: instance.card,
    power: instance.power,
    keywords: [...(instance.keywords ?? [])],
    mods: [...(instance.mods ?? [])],
    tired: Boolean(instance.tired),
  };
}

function assignMissingUids(board, prefix, nextUid) {
  board.forEach((instance) => {
    if (!instance.uid || instance.uid.length === 0) {
      instance.uid = `${prefix}${nextUid.value}`;
      nextUid.value += 1;
    }
  });
}

export function normalizeState(input) {
  const nextUidRef = { value: input.nextUid ?? 1 };
  const player = cloneSide(input.player);
  const opponent = cloneOpponent(input.opponent);

  assignMissingUids(player.board, "p", nextUidRef);
  assignMissingUids(opponent.board, "o", nextUidRef);

  return {
    player,
    opponent,
    chainCount: input.chainCount ?? 0,
    turn: input.turn ?? 1,
    nextUid: nextUidRef.value,
    manaPerRound: input.manaPerRound ?? 0,
    targetRounds: input.targetRounds,
  };
}

function hasKeyword(instance, keyword) {
  return (instance.keywords ?? []).includes(keyword);
}

function hasTestudoCover(board, index, cards) {
  const minion = board[index];
  if (!minion || !isCreatureInstance(minion, cards) || !hasKeyword(minion, TESTUDO)) {
    return false;
  }
  const creatureIndexes = [];
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

function hasKeywordDef(def, keyword) {
  return def?.keywords?.includes(keyword) ?? false;
}

function allocateUid(state, prefix) {
  const uid = `${prefix}${state.nextUid}`;
  state.nextUid += 1;
  return uid;
}

function findPlayerIndexByRef(state, ref) {
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

function findOpponentIndexByRef(state, ref) {
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

function isCreatureInstance(instance, cards) {
  return cards.byId[instance.card]?.type === "creature";
}

function enemyGuardIndexes(state, cards) {
  const indexes = [];
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

function removeDead(board, cards) {
  return board.filter((minion) => {
    if (!isCreatureInstance(minion, cards)) {
      return true;
    }
    return minion.power > 0;
  });
}

function applyDamageToMinion(minion, amount) {
  minion.power -= amount;
}

function applyDamageToOpponent(state, amount) {
  state.opponent.health = Math.max(0, state.opponent.health - amount);
}

function getCardDef(cards, cardId) {
  const def = cards.byId[cardId];
  if (!def) {
    throw new Error(`Unknown card: ${cardId}`);
  }
  return def;
}

function getPlayerAttackAuraBonus(state, cards) {
  let bonus = 0;
  state.player.board.forEach((instance) => {
    const def = cards.byId[instance.card];
    if (!def || def.type !== "effect") {
      return;
    }
    (def.effects ?? []).forEach((effect) => {
      if (effect.type === "aura" && effect.stat === "power" && effect.applies_to === "attack") {
        bonus += effect.amount;
      }
    });
  });
  return bonus;
}

export function isWin(state) {
  return state.opponent.health <= 0;
}

export function applyAction(state, action, cards) {
  const next = cloneState(state);

  switch (action.type) {
    case "play":
      return applyPlay(next, action, cards);
    case "attack":
      return applyAttack(next, action, cards);
    case "activate":
      return applyActivate(next, action, cards);
    case "end":
      return applyEnd(next);
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

function applyPlay(state, action, cards) {
  const def = getCardDef(cards, action.card);
  const handIndex = state.player.hand.indexOf(action.card);
  if (handIndex < 0) {
    throw new Error(`Card not in hand: ${action.card}`);
  }
  if (state.player.mana < def.cost) {
    throw new Error(`Not enough mana for ${action.card}`);
  }

  state.player.hand.splice(handIndex, 1);
  state.player.mana -= def.cost;

  if (def.type === "creature") {
    if (!def.stats) {
      throw new Error(`Creature missing stats: ${def.id}`);
    }
    const instance = {
      uid: allocateUid(state, "p"),
      card: def.id,
      power: def.stats.power,
      keywords: def.keywords ? [...def.keywords] : [],
      mods: [],
      tired: false,
    };
    state.player.board.push(instance);
  } else if (def.type === "spell") {
    applySpellEffects(state, def.effects ?? [], action.target, cards);
  } else if (def.type === "effect") {
    const instance = {
      uid: allocateUid(state, "p"),
      card: def.id,
      power: def.stats?.power ?? 0,
      keywords: def.keywords ? [...def.keywords] : [],
      mods: [],
      tired: false,
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
    applyModEffects(target, def);
  }

  state.chainCount += 1;
  return state;
}

function applyModEffects(target, def) {
  const effects = def.effects ?? [];
  effects.forEach((effect) => {
    if (effect.type === "grant_keyword") {
      if (!target.keywords.includes(effect.keyword)) {
        target.keywords.push(effect.keyword);
      }
    }
  });
  target.mods = target.mods ?? [];
  target.mods.push(def.id);
}

function applySpellEffects(state, effects, target, cards) {
  for (const effect of effects) {
    if (effect.type === "damage") {
      const base = effect.amount;
      const amount = state.chainCount > 0 && effect.chain_amount ? effect.chain_amount : base;
      applySpellDamage(state, amount, target, cards);
    }
  }
}

function applySpellDamage(state, amount, target, cards) {
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
    applyDamageToMinion(defender, amount);
    state.opponent.board = removeDead(state.opponent.board, cards);
    return;
  }

  throw new Error(`Unsupported spell target: ${target}`);
}

function applyAttack(state, action, cards) {
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
  const defenderPowerBefore = defender.power;
  if (!defenderShielded) {
    applyDamageToMinion(defender, attackPower);
  }
  if (!attackerShielded) {
    applyDamageToMinion(attacker, defenderPowerBefore);
  }

  if (hasKeyword(attacker, PIERCE) && attackPower > defenderPowerBefore) {
    const excess = attackPower - defenderPowerBefore;
    if (excess > 0) {
      applyDamageToOpponent(state, excess);
    }
  }

  attacker.tired = true;
  state.player.board = removeDead(state.player.board, cards);
  state.opponent.board = removeDead(state.opponent.board, cards);

  return state;
}

function applyActivate(state, action, cards) {
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

  state.player.board.splice(sourceIndex, 1);
  if (effect.stat === "power") {
    target.power += effect.amount;
  }

  return state;
}

function applyEnd(state) {
  state.player.board.forEach((minion) => {
    minion.tired = false;
  });
  state.chainCount = 0;
  state.turn += 1;
  state.player.mana += state.manaPerRound;
  return state;
}

export function getLegalActions(state, cards) {
  const actions = [];
  const guardIndexes = enemyGuardIndexes(state, cards);
  const canHitOpponent =
    state.opponent.board.filter((minion) => isCreatureInstance(minion, cards)).length === 0;

  state.player.hand.forEach((cardId) => {
    const def = cards.byId[cardId];
    if (!def) {
      return;
    }
    if (state.player.mana < def.cost) {
      return;
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
        return;
      }
    }

    if (def.type === "mod") {
      const playerTargets = state.player.board
        .map((minion, idx) => ({ minion, idx }))
        .filter((entry) => isCreatureInstance(entry.minion, cards))
        .map((entry) => `player:slot${entry.idx}`);
      const opponentTargets = state.opponent.board
        .map((minion, idx) => ({ minion, idx }))
        .filter((entry) => isCreatureInstance(entry.minion, cards))
        .map((entry) => `opponent:slot${entry.idx}`);
      if (playerTargets.length === 0 && opponentTargets.length === 0) {
        return;
      }
      playerTargets.forEach((target) =>
        actions.push({ type: "play", card: cardId, target })
      );
      opponentTargets.forEach((target) =>
        actions.push({ type: "play", card: cardId, target })
      );
      return;
    }

    actions.push({ type: "play", card: cardId });
  });

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
