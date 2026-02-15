import { cloneState } from "./state.js";
const GUARD = "guard";
const PIERCE = "pierce";
const STORM = "storm";
const SACRIFICE = "sacrifice";
const TESTUDO = "testudo";
const VENOM = "venom";
const BROOD = "brood";
const SCAVENGER = "scavenger";
const REBIRTH = "rebirth";
const RELAY = "relay";
const ORDER = "order";
const SLEEPY = "sleepy";
const BROODLING_ID = "broodling";
const WOODEN_SHIELD_ID = "wooden_shield";
const FLANK_RUNE_ID = "flank_rune";
function hasKeyword(instance, keyword) {
    return instance.keywords.includes(keyword);
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
function hasModEffect(minion, cards, effectType) {
    return (minion.mods ?? []).some((modId) => {
        const def = cards.byId[modId];
        if (!def || def.type !== "mod") {
            return false;
        }
        return def.effects?.some((effect) => effect.type === effectType) ?? false;
    });
}
function sumModEffectAmount(minion, cards, effectType) {
    let total = 0;
    (minion.mods ?? []).forEach((modId) => {
        const def = cards.byId[modId];
        if (!def || def.type !== "mod") {
            return;
        }
        def.effects?.forEach((effect) => {
            if (effect.type === effectType && "amount" in effect) {
                total += effect.amount ?? 0;
            }
        });
    });
    return total;
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
function applyScavengerBuffs(state, cards, deathCount) {
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
function getDeathDamageFromMods(minion, cards) {
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
function getDeathHealFromMods(minion, cards) {
    const mods = Array.isArray(minion.mods) ? minion.mods : [];
    let total = 0;
    mods.forEach((modId) => {
        const def = cards.byId[modId];
        if (!def || def.type !== "mod") {
            return;
        }
        def.effects?.forEach((effect) => {
            if (effect.type === "death_heal_boss") {
                total += effect.amount;
            }
        });
    });
    return total;
}
function getAdjacentCreatureIndexes(board, index, cards) {
    const creatureIndexes = [];
    board.forEach((entry, idx) => {
        if (isCreatureInstance(entry, cards)) {
            creatureIndexes.push(idx);
        }
    });
    const position = creatureIndexes.indexOf(index);
    if (position < 0) {
        return [];
    }
    const neighbors = [];
    if (position > 0) {
        neighbors.push(creatureIndexes[position - 1]);
    }
    if (position < creatureIndexes.length - 1) {
        neighbors.push(creatureIndexes[position + 1]);
    }
    return neighbors;
}
function applyRelayBuff(board, sourceIndex, amount, cards) {
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
function rebuildBoardWithRebirth(state, board, prefix, cards) {
    const nextBoard = [];
    let deaths = 0;
    let deathDamage = 0;
    let deathHeal = 0;
    const deathEnemyDamage = [];
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
        deathHeal += getDeathHealFromMods(minion, cards);
        const def = cards.byId[minion.card];
        const deathSplash = getDeathDamageAllEnemiesFromDef(def);
        if (deathSplash > 0) {
            deathEnemyDamage.push(deathSplash);
        }
        if (hasKeyword(minion, REBIRTH)) {
            if (def && def.type === "creature") {
                const rebirths = (minion.rebirths ?? 0) + 1;
                const basePower = def.stats?.power ?? 1;
                nextBoard.push({
                    uid: allocateUid(state, prefix),
                    card: def.id,
                    power: basePower + rebirths,
                    keywords: def.keywords ? [...def.keywords] : [],
                    mods: [],
                    tired: Boolean(minion.tired),
                    poison: 0,
                    shield: 0,
                    rebirths,
                    borrowed: minion.borrowed ?? false,
                    borrowedMultiplier: minion.borrowedMultiplier ?? 0,
                });
            }
        }
    });
    return { board: nextBoard, deaths, deathDamage, deathHeal, deathEnemyDamage };
}
function handleDeaths(state, cards) {
    const playerResult = rebuildBoardWithRebirth(state, state.player.board, "p", cards);
    const opponentResult = rebuildBoardWithRebirth(state, state.opponent.board, "o", cards);
    const deathCount = playerResult.deaths + opponentResult.deaths;
    if (deathCount <= 0) {
        return;
    }
    state.roundDeaths = (state.roundDeaths ?? 0) + deathCount;
    state.player.board = playerResult.board;
    state.opponent.board = opponentResult.board;
    const deathDamage = playerResult.deathDamage + opponentResult.deathDamage;
    if (deathDamage > 0) {
        applyDamageToOpponent(state, deathDamage);
    }
    const deathHeal = playerResult.deathHeal + opponentResult.deathHeal;
    if (deathHeal > 0) {
        applyHealToOpponent(state, deathHeal);
    }
    const appliedEnemyDamage = applyDeathDamageToEnemyBoard(state, state.opponent.board, "o", playerResult.deathEnemyDamage, cards) ||
        applyDeathDamageToEnemyBoard(state, state.player.board, "p", opponentResult.deathEnemyDamage, cards);
    if (appliedEnemyDamage) {
        handleDeaths(state, cards);
    }
    applyDeathCounters(state, cards, deathCount);
    applyScavengerBuffs(state, cards, deathCount);
    if (applyAnchoredBonuses(state, cards)) {
        handleDeaths(state, cards);
    }
}
function applyDeathCounters(state, cards, deathCount) {
    if (deathCount <= 0) {
        return;
    }
    state.player.board.forEach((unit) => {
        const def = cards.byId[unit.card];
        if (!def || def.type !== "effect") {
            return;
        }
        const amount = def.effects?.reduce((sum, effect) => {
            if (effect.type === "death_counter") {
                return sum + (effect.amount ?? 1);
            }
            return sum;
        }, 0);
        if (!amount) {
            return;
        }
        unit.counter = (unit.counter ?? 0) + amount * deathCount;
    });
}
function applyCastCounters(state, cards, castCount) {
    if (castCount <= 0) {
        return;
    }
    state.player.board.forEach((unit) => {
        const def = cards.byId[unit.card];
        if (!def || def.type !== "effect") {
            return;
        }
        const amount = def.effects?.reduce((sum, effect) => {
            if (effect.type === "cast_counter") {
                return sum + (effect.amount ?? 1);
            }
            return sum;
        }, 0);
        if (!amount) {
            return;
        }
        unit.counter = (unit.counter ?? 0) + amount * castCount;
    });
}
function returnBorrowedCreatures(state) {
    const returning = [];
    const remaining = [];
    state.player.board.forEach((unit) => {
        if (unit.borrowed) {
            returning.push(unit);
        }
        else {
            remaining.push(unit);
        }
    });
    if (returning.length === 0) {
        return;
    }
    state.player.board = remaining;
    returning.forEach((unit) => {
        const multiplier = unit.borrowedMultiplier && unit.borrowedMultiplier > 0 ? unit.borrowedMultiplier : 2;
        unit.power *= multiplier;
        unit.borrowed = false;
        unit.borrowedMultiplier = 0;
        unit.tired = false;
        state.opponent.board.push(unit);
    });
}
function getDeathDamageAllEnemiesFromDef(def) {
    if (!def?.effects) {
        return 0;
    }
    return def.effects.reduce((total, effect) => {
        if (effect.type === "death_damage_all_enemies") {
            return total + effect.amount;
        }
        return total;
    }, 0);
}
function snapshotCreatureUids(board, cards) {
    return board
        .filter((minion) => isCreatureInstance(minion, cards))
        .map((minion) => minion.uid)
        .filter((uid) => Boolean(uid));
}
function findCreatureIndexByUid(board, uid) {
    for (let i = 0; i < board.length; i += 1) {
        if (board[i]?.uid === uid) {
            return i;
        }
    }
    return -1;
}
function applyDeathDamageToEnemyBoard(state, board, prefix, events, cards) {
    if (!events || events.length === 0) {
        return false;
    }
    let applied = false;
    events.forEach((amount) => {
        if (amount <= 0) {
            return;
        }
        const targets = snapshotCreatureUids(board, cards);
        if (targets.length === 0) {
            return;
        }
        applied = true;
        targets.forEach((uid) => {
            const index = findCreatureIndexByUid(board, uid);
            if (index >= 0) {
                applyDamageToMinionWithSpawn(state, board, index, amount, prefix, cards);
            }
        });
    });
    return applied;
}
function applyDamageToMinion(minion, amount) {
    minion.power -= amount;
}
function applyDamageToOpponent(state, amount) {
    state.opponent.health = Math.max(0, state.opponent.health - amount);
}
function applyHealToOpponent(state, amount) {
    state.opponent.health += amount;
}
function applyDamageToMinionWithSpawn(state, board, index, amount, prefix, cards) {
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
    if (amount > 0 &&
        prePower > minion.power &&
        minion.power > 0 &&
        hasKeyword(minion, BROOD)) {
        spawnBroodling(state, board, index, prefix, cards);
    }
}
function spawnBroodling(state, board, index, prefix, cards) {
    const def = cards.byId[BROODLING_ID];
    if (!def || def.type !== "creature") {
        return;
    }
    const insertIndex = findNextCreatureIndex(board, index, cards);
    const instance = {
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
function summonBroodlingAtEnd(state, board, prefix, cards) {
    const def = cards.byId[BROODLING_ID];
    if (!def || def.type !== "creature") {
        return;
    }
    const instance = {
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
    board.push(instance);
}
function findNextCreatureIndex(board, index, cards) {
    for (let i = index + 1; i < board.length; i += 1) {
        if (isCreatureInstance(board[i], cards)) {
            return i;
        }
    }
    return board.length;
}
function applyPoisonToMinion(minion, amount) {
    minion.poison = (minion.poison ?? 0) + amount;
}
function applyPoisonToOpponent(state, amount) {
    state.opponent.poison = (state.opponent.poison ?? 0) + amount;
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
        def.effects?.forEach((effect) => {
            if (effect.type === "aura" && effect.stat === "power" && effect.applies_to === "attack") {
                bonus += effect.amount;
            }
        });
    });
    return bonus;
}
function applyEndBuffs(state, cards) {
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
function applyAnchoredBonuses(state, cards) {
    let deathTriggered = false;
    [state.player.board, state.opponent.board].forEach((board) => {
        const desiredBonuses = new Map();
        board.forEach((minion, index) => {
            if (!isCreatureInstance(minion, cards)) {
                return;
            }
            if (!hasModEffect(minion, cards, "anchored_aura")) {
                return;
            }
            const amount = sumModEffectAmount(minion, cards, "anchored_aura") || 1;
            const left = index - 1;
            const right = index + 1;
            if (left >= 0 && isCreatureInstance(board[left], cards)) {
                desiredBonuses.set(left, (desiredBonuses.get(left) ?? 0) + amount);
            }
            if (right < board.length && isCreatureInstance(board[right], cards)) {
                desiredBonuses.set(right, (desiredBonuses.get(right) ?? 0) + amount);
            }
        });
        board.forEach((minion, index) => {
            if (!isCreatureInstance(minion, cards)) {
                return;
            }
            const nextBonus = desiredBonuses.get(index) ?? 0;
            const prevBonus = minion.anchoredBonus ?? 0;
            if (nextBonus !== prevBonus) {
                minion.power += nextBonus - prevBonus;
                minion.anchoredBonus = nextBonus;
                if (minion.power <= 0) {
                    deathTriggered = true;
                }
            }
        });
    });
    return deathTriggered;
}
function applyEndSelfBuffs(state, cards) {
    let changed = false;
    [state.player.board, state.opponent.board].forEach((board) => {
        board.forEach((minion) => {
            if (!isCreatureInstance(minion, cards)) {
                return;
            }
            const def = cards.byId[minion.card];
            if (!def) {
                return;
            }
            def.effects?.forEach((effect) => {
                if (effect.type === "end_self_buff" && effect.stat === "power") {
                    if (effect.amount !== 0) {
                        minion.power += effect.amount;
                        changed = true;
                    }
                }
            });
        });
    });
    return changed;
}
function applyEndAdjacentBuffs(state, board, cards) {
    const buffs = {};
    board.forEach((minion, index) => {
        if (!isCreatureInstance(minion, cards)) {
            return;
        }
        if (!minion.mods?.includes(FLANK_RUNE_ID)) {
            return;
        }
        const left = index - 1;
        const right = index + 1;
        if (left >= 0 && isCreatureInstance(board[left], cards)) {
            buffs[left] = (buffs[left] ?? 0) + 1;
        }
        if (right < board.length && isCreatureInstance(board[right], cards)) {
            buffs[right] = (buffs[right] ?? 0) + 1;
        }
    });
    Object.entries(buffs).forEach(([index, amount]) => {
        const target = board[Number(index)];
        if (target && isCreatureInstance(target, cards)) {
            target.power += amount;
        }
    });
}
function applyEndMassDeathClones(state, cards) {
    const deaths = state.roundDeaths ?? 0;
    if (deaths <= 0) {
        return;
    }
    const effectCount = state.player.board.reduce((count, unit) => {
        const def = cards.byId[unit.card];
        if (!def || def.type !== "effect") {
            return count;
        }
        const hasTrigger = def.effects?.some((effect) => effect.type === "end_clone_boss_on_mass_death" &&
            deaths >= effect.amount);
        return hasTrigger ? count + 1 : count;
    }, 0);
    if (effectCount <= 0) {
        return;
    }
    const bossCandidates = state.opponent.board.filter((minion) => isCreatureInstance(minion, cards));
    if (bossCandidates.length === 0) {
        return;
    }
    let strongest = bossCandidates[0];
    bossCandidates.slice(1).forEach((minion) => {
        if ((minion.power ?? 0) > (strongest.power ?? 0)) {
            strongest = minion;
        }
    });
    for (let i = 0; i < effectCount; i += 1) {
        const clone = {
            uid: allocateUid(state, "p"),
            card: strongest.card,
            power: strongest.power,
            keywords: strongest.keywords ? [...strongest.keywords] : [],
            mods: strongest.mods ? [...strongest.mods] : [],
            tired: strongest.tired,
            poison: strongest.poison ?? 0,
            shield: strongest.shield ?? 0,
            rebirths: strongest.rebirths ?? 0,
        };
        state.player.board.push(clone);
    }
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
            return applyEnd(next, cards);
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
    const repeatEffect = def.effects?.find((effect) => effect.type === "repeat_last_spell");
    const repeatSurcharge = repeatEffect && repeatEffect.type === "repeat_last_spell"
        ? repeatEffect.surcharge ?? 1
        : 0;
    if (state.player.mana < def.cost) {
        throw new Error(`Not enough mana for ${action.card}`);
    }
    if (repeatSurcharge > 0 && state.player.mana < def.cost + repeatSurcharge) {
        throw new Error("Not enough mana to repeat the last spell");
    }
    if (def.type === "creature") {
        const requiresReadyAlly = def.effects?.some((effect) => effect.type === "requires_ready_ally") ?? false;
        if (requiresReadyAlly) {
            const hasReadyAlly = state.player.board.some((minion) => isCreatureInstance(minion, cards) && !minion.tired);
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
        const devourEffect = def.effects?.find((effect) => effect.type === "devour_ally");
        let devourTargetIndex = -1;
        let devourPower = 0;
        if (devourEffect && devourEffect.type === "devour_ally") {
            if (!action.target) {
                throw new Error("Devour requires a friendly creature target");
            }
            devourTargetIndex = findPlayerIndexByRef(state, action.target);
            if (devourTargetIndex < 0) {
                throw new Error(`Invalid devour target: ${action.target}`);
            }
            const devourTarget = state.player.board[devourTargetIndex];
            if (!isCreatureInstance(devourTarget, cards)) {
                throw new Error("Devour target must be a creature");
            }
            devourPower = devourTarget.power;
        }
        const instance = {
            uid: allocateUid(state, "p"),
            card: def.id,
            power: def.stats.power + devourPower,
            keywords: def.keywords ? [...def.keywords] : [],
            mods: [],
            tired: def.effects?.some((effect) => effect.type === "enter_tired") ?? false,
            poison: 0,
            shield: 0,
            rebirths: 0,
        };
        if (devourTargetIndex >= 0) {
            state.player.board.splice(devourTargetIndex, 0, instance);
            const eaten = state.player.board[devourTargetIndex + 1];
            if (eaten) {
                eaten.power = 0;
            }
            handleDeaths(state, cards);
        }
        else {
            state.player.board.push(instance);
        }
        if (applyAnchoredBonuses(state, cards)) {
            handleDeaths(state, cards);
        }
        if (def.effects?.some((effect) => effect.type === "play_tire_allies")) {
            state.player.board.forEach((minion) => {
                if (isCreatureInstance(minion, cards)) {
                    minion.tired = true;
                }
            });
        }
        const summonEffect = def.effects?.find((effect) => effect.type === "summon_enemy_broodling");
        if (summonEffect && summonEffect.type === "summon_enemy_broodling") {
            const count = Math.max(1, summonEffect.amount ?? 1);
            for (let i = 0; i < count; i += 1) {
                summonBroodlingAtEnd(state, state.opponent.board, "o", cards);
            }
        }
    }
    else if (def.type === "spell") {
        applySpellEffects(state, def.effects ?? [], action.target, cards);
        if (repeatSurcharge > 0) {
            state.player.mana -= repeatSurcharge;
            const repeated = applyRepeatLastSpell(state, repeatEffect ?? { surcharge: repeatSurcharge }, cards);
            state.lastSpell = repeated;
        }
        else {
            state.lastSpell = { cardId: def.id, target: action.target };
        }
        applyCastCounters(state, cards, 1);
    }
    else if (def.type === "effect") {
        const instance = {
            uid: allocateUid(state, "p"),
            card: def.id,
            power: def.stats?.power ?? 0,
            keywords: def.keywords ? [...def.keywords] : [],
            mods: [],
            tired: false,
            poison: 0,
            shield: 0,
            rebirths: 0,
            counter: 0,
        };
        state.player.board.push(instance);
    }
    else if (def.type === "mod") {
        if (!action.target) {
            throw new Error("Mod cards require a target creature");
        }
        const playerIndex = findPlayerIndexByRef(state, action.target);
        const opponentIndex = findOpponentIndexByRef(state, action.target);
        if (playerIndex < 0 && opponentIndex < 0) {
            throw new Error(`Invalid mod target: ${action.target}`);
        }
        const target = playerIndex >= 0
            ? state.player.board[playerIndex]
            : state.opponent.board[opponentIndex];
        if (!isCreatureInstance(target, cards)) {
            throw new Error(`Invalid mod target: ${action.target}`);
        }
        const requiresPositivePower = def.effects?.some((effect) => effect.type === "shield") ?? false;
        if (requiresPositivePower && target.power <= 0) {
            throw new Error("Cannot apply Wooden Shield to a 0-power creature");
        }
        applyModEffects(target, def);
        handleDeaths(state, cards);
        if (applyAnchoredBonuses(state, cards)) {
            handleDeaths(state, cards);
        }
        applyManaOnMod(state, cards);
        applyCastCounters(state, cards, 1);
    }
    state.chainCount += 1;
    return state;
}
function applyModEffects(target, def) {
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
function applySpellEffects(state, effects, target, cards) {
    for (const effect of effects) {
        if (effect.type === "damage") {
            const base = effect.amount;
            const amount = state.chainCount > 0 && effect.chain_amount ? effect.chain_amount : base;
            applySpellDamage(state, amount, target, cards);
        }
        if (effect.type === "damage_all") {
            applySpellDamageAll(state, effect.amount, cards);
        }
        if (effect.type === "poison_allies") {
            applySpellPoisonAllies(state, effect.amount, cards);
        }
        if (effect.type === "purge_mods") {
            applySpellPurgeMods(state, target, cards);
        }
        if (effect.type === "grant_keyword_allies") {
            applySpellGrantKeywordAllies(state, effect.keyword, cards);
        }
        if (effect.type === "borrow_enemy") {
            applySpellBorrowEnemy(state, target, effect, cards);
        }
        if (effect.type === "swap_positions") {
            applySpellSwapPositions(state, target, cards);
        }
        if (effect.type === "execute_threshold") {
            applySpellExecuteThreshold(state, effect, cards);
        }
    }
}
function applyRepeatLastSpell(state, effect, cards) {
    const last = state.lastSpell;
    if (!last) {
        throw new Error("No spell to repeat");
    }
    const def = cards.byId[last.cardId];
    if (!def || def.type !== "spell") {
        throw new Error("Last spell is invalid");
    }
    if (def.effects?.some((entry) => entry.type === "repeat_last_spell")) {
        throw new Error("Cannot repeat Echo Step");
    }
    applySpellEffects(state, def.effects ?? [], last.target, cards);
    return last;
}
function applySpellSwapPositions(state, target, cards) {
    if (!target) {
        throw new Error("Swap spell requires two targets");
    }
    const [firstRef, secondRef] = target.split("|");
    if (!firstRef || !secondRef) {
        throw new Error("Swap spell requires two targets");
    }
    const playerIndexA = findPlayerIndexByRef(state, firstRef);
    const playerIndexB = findPlayerIndexByRef(state, secondRef);
    const opponentIndexA = findOpponentIndexByRef(state, firstRef);
    const opponentIndexB = findOpponentIndexByRef(state, secondRef);
    if (playerIndexA >= 0 && playerIndexB >= 0) {
        swapBoardPositions(state.player.board, playerIndexA, playerIndexB, cards);
        if (applyAnchoredBonuses(state, cards)) {
            handleDeaths(state, cards);
        }
        return;
    }
    if (opponentIndexA >= 0 && opponentIndexB >= 0) {
        swapBoardPositions(state.opponent.board, opponentIndexA, opponentIndexB, cards);
        if (applyAnchoredBonuses(state, cards)) {
            handleDeaths(state, cards);
        }
        return;
    }
    throw new Error("Swap targets must be on the same board");
}
function swapBoardPositions(board, indexA, indexB, cards) {
    if (indexA === indexB) {
        return;
    }
    const first = board[indexA];
    const second = board[indexB];
    if (!first || !second) {
        throw new Error("Swap targets not found");
    }
    if (!isCreatureInstance(first, cards) || !isCreatureInstance(second, cards)) {
        throw new Error("Swap targets must be creatures");
    }
    board[indexA] = second;
    board[indexB] = first;
    first.tired = true;
    second.tired = true;
}
function applySpellBorrowEnemy(state, target, effect, cards) {
    if (!target || !target.startsWith("opponent:slot")) {
        throw new Error("Borrow spell requires an enemy creature target");
    }
    const index = findOpponentIndexByRef(state, target);
    if (index < 0) {
        throw new Error(`Invalid spell target: ${target}`);
    }
    const minion = state.opponent.board[index];
    if (!isCreatureInstance(minion, cards)) {
        throw new Error(`Invalid spell target: ${target}`);
    }
    state.opponent.board.splice(index, 1);
    minion.borrowed = true;
    minion.borrowedMultiplier = effect.return_multiplier ?? 2;
    state.player.board.push(minion);
    if (applyAnchoredBonuses(state, cards)) {
        handleDeaths(state, cards);
    }
}
function applyManaOnMod(state, cards) {
    let total = 0;
    state.player.board.forEach((unit) => {
        const def = cards.byId[unit.card];
        if (!def || def.type !== "effect") {
            return;
        }
        def.effects?.forEach((effect) => {
            if (effect.type === "mana_on_mod") {
                total += effect.amount;
            }
        });
    });
    if (total > 0) {
        state.player.mana += total;
    }
}
function applyEndManaAdjustments(state, cards) {
    let total = 0;
    state.player.board.forEach((unit) => {
        const def = cards.byId[unit.card];
        if (!def || def.type !== "effect") {
            return;
        }
        def.effects?.forEach((effect) => {
            if (effect.type === "end_mana") {
                total += effect.amount;
            }
        });
    });
    if (total !== 0) {
        state.player.mana = Math.max(0, state.player.mana + total);
    }
}
function applyEndBossDamage(state, cards) {
    let total = 0;
    state.player.board.forEach((unit) => {
        const def = cards.byId[unit.card];
        if (!def || def.type !== "effect") {
            return;
        }
        def.effects?.forEach((effect) => {
            if (effect.type === "end_damage_boss") {
                total += effect.amount;
            }
        });
    });
    if (total > 0) {
        applyDamageToOpponent(state, total);
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
        applyDamageToMinionWithSpawn(state, state.opponent.board, index, amount, "o", cards);
        handleDeaths(state, cards);
        return;
    }
    throw new Error(`Unsupported spell target: ${target}`);
}
function applySpellDamageAll(state, amount, cards) {
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
function applySpellPoisonAllies(state, amount, cards) {
    if (amount <= 0) {
        return;
    }
    state.player.board.forEach((minion) => {
        if (isCreatureInstance(minion, cards)) {
            applyPoisonToMinion(minion, amount);
        }
    });
}
function applySpellPurgeMods(state, target, cards) {
    if (!target) {
        throw new Error("Purge mods requires a target");
    }
    const instance = resolveTargetCreature(state, target, cards);
    if (!instance) {
        throw new Error(`Invalid purge target: ${target}`);
    }
    if (!instance.mods || instance.mods.length === 0) {
        return;
    }
    let powerDelta = 0;
    let shieldDelta = 0;
    instance.mods.forEach((modId) => {
        const modDef = cards.byId[modId];
        if (!modDef?.effects) {
            return;
        }
        modDef.effects.forEach((effect) => {
            if (effect.type === "buff" && effect.stat === "power") {
                powerDelta += effect.amount;
            }
            if (effect.type === "shield") {
                shieldDelta += effect.amount ?? 1;
            }
        });
    });
    const def = cards.byId[instance.card];
    if (def && def.type === "creature") {
        instance.keywords = def.keywords ? [...def.keywords] : [];
    }
    instance.mods = [];
    if (powerDelta !== 0) {
        instance.power -= powerDelta;
    }
    if (shieldDelta > 0) {
        instance.shield = Math.max(0, (instance.shield ?? 0) - shieldDelta);
    }
    else {
        instance.shield = instance.shield ?? 0;
    }
    if (applyAnchoredBonuses(state, cards)) {
        handleDeaths(state, cards);
    }
}
function applySpellExecuteThreshold(state, effect, cards) {
    const threshold = effect.threshold ?? 0;
    let killed = 0;
    [state.player.board, state.opponent.board].forEach((board) => {
        board.forEach((unit) => {
            if (!isCreatureInstance(unit, cards)) {
                return;
            }
            if (unit.power >= threshold) {
                unit.power = 0;
                killed += 1;
            }
        });
    });
    handleDeaths(state, cards);
    const manaGain = effect.mana_gain ?? 0;
    if (manaGain > 0 && killed > 0) {
        state.player.mana += manaGain * killed;
    }
}
function resolveTargetCreature(state, target, cards) {
    if (target.startsWith("player:slot")) {
        const index = findPlayerIndexByRef(state, target);
        const unit = state.player.board[index];
        return unit && isCreatureInstance(unit, cards) ? unit : null;
    }
    if (target.startsWith("opponent:slot")) {
        const index = findOpponentIndexByRef(state, target);
        const unit = state.opponent.board[index];
        return unit && isCreatureInstance(unit, cards) ? unit : null;
    }
    const playerUnit = state.player.board.find((unit) => unit.uid === target);
    if (playerUnit && isCreatureInstance(playerUnit, cards)) {
        return playerUnit;
    }
    const opponentUnit = state.opponent.board.find((unit) => unit.uid === target);
    if (opponentUnit && isCreatureInstance(opponentUnit, cards)) {
        return opponentUnit;
    }
    return null;
}
function applySpellGrantKeywordAllies(state, keyword, cards) {
    state.player.board.forEach((minion) => {
        if (isCreatureInstance(minion, cards)) {
            minion.keywords = minion.keywords ?? [];
            if (!minion.keywords.includes(keyword)) {
                minion.keywords.push(keyword);
            }
        }
    });
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
    if (hasModEffect(attacker, cards, "no_attack")) {
        throw new Error(`Source cannot attack: ${action.source}`);
    }
    const guardIndexes = enemyGuardIndexes(state, cards);
    const mustHitGuard = guardIndexes.length > 0;
    const hasEnemyMinions = state.opponent.board.some((minion) => isCreatureInstance(minion, cards));
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
    const damageDealt = defenderShielded || defenderHasShield ? 0 : Math.max(0, attackPower);
    if (!defenderShielded) {
        applyDamageToMinionWithSpawn(state, state.opponent.board, targetIndex, attackPower, "o", cards);
    }
    if (!attackerShielded) {
        applyDamageToMinionWithSpawn(state, state.player.board, sourceIndex, defenderPowerBefore, "p", cards);
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
    if (hasModEffect(attacker, cards, "death_after_attack")) {
        const attackerUid = attacker.uid;
        const attackerIndex = attackerUid
            ? state.player.board.findIndex((minion) => minion.uid === attackerUid)
            : sourceIndex;
        if (attackerIndex >= 0 && state.player.board[attackerIndex]) {
            state.player.board[attackerIndex].power = 0;
            handleDeaths(state, cards);
        }
    }
    return state;
}
function applyActivateDamage(state, source, effect, target, cards) {
    if ((source.counter ?? 0) < effect.threshold) {
        throw new Error("Not enough counters to activate");
    }
    if (!target) {
        throw new Error("Activate damage requires a target");
    }
    if (target === "opponent") {
        applyDamageToOpponent(state, effect.amount);
    }
    else if (target.startsWith("opponent:slot")) {
        const index = findOpponentIndexByRef(state, target);
        if (index < 0) {
            throw new Error(`Invalid activate target: ${target}`);
        }
        applyDamageToMinionWithSpawn(state, state.opponent.board, index, effect.amount, "o", cards);
        handleDeaths(state, cards);
    }
    else if (target.startsWith("player:slot")) {
        const index = findPlayerIndexByRef(state, target);
        if (index < 0) {
            throw new Error(`Invalid activate target: ${target}`);
        }
        applyDamageToMinionWithSpawn(state, state.player.board, index, effect.amount, "p", cards);
        handleDeaths(state, cards);
    }
    else {
        throw new Error(`Invalid activate target: ${target}`);
    }
    source.counter = (source.counter ?? 0) - effect.threshold;
}
function applyActivateMana(state, sourceIndex, source) {
    const counter = source.counter ?? 0;
    if (counter <= 0) {
        throw new Error("Not enough counters to activate");
    }
    state.player.mana += counter;
    state.player.board.splice(sourceIndex, 1);
}
function applyActivate(state, action, cards) {
    const sourceIndex = findPlayerIndexByRef(state, action.source);
    if (sourceIndex < 0) {
        throw new Error(`Invalid activate source: ${action.source}`);
    }
    const source = state.player.board[sourceIndex];
    const def = cards.byId[source.card];
    if (def && def.type === "effect") {
        const activateEffect = def.effects?.find((effect) => effect.type === "activate_damage");
        if (activateEffect && activateEffect.type === "activate_damage") {
            if (!action.target) {
                throw new Error("Activate requires a target");
            }
            applyActivateDamage(state, source, activateEffect, action.target, cards);
            return state;
        }
        const activateMana = def.effects?.find((effect) => effect.type === "activate_mana");
        if (activateMana && activateMana.type === "activate_mana") {
            applyActivateMana(state, sourceIndex, source);
            return state;
        }
    }
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
    const effect = def.effects?.find((candidate) => candidate.type === "buff" && candidate.requires === "sacrifice_self");
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
function applyEnd(state, cards) {
    applyPoisonDamageToBoard(state, state.player.board, "p", cards);
    applyPoisonDamageToBoard(state, state.opponent.board, "o", cards);
    if (state.opponent.poison && state.opponent.poison > 0) {
        applyDamageToOpponent(state, state.opponent.poison);
    }
    handleDeaths(state, cards);
    applyEndBuffs(state, cards);
    applyEndAdjacentBuffs(state, state.player.board, cards);
    applyEndAdjacentBuffs(state, state.opponent.board, cards);
    if (applyEndSelfBuffs(state, cards)) {
        handleDeaths(state, cards);
    }
    applyEndBossDamage(state, cards);
    applyEndMassDeathClones(state, cards);
    returnBorrowedCreatures(state);
    if (applyAnchoredBonuses(state, cards)) {
        handleDeaths(state, cards);
    }
    applyEndManaAdjustments(state, cards);
    state.player.board.forEach((minion) => {
        minion.tired = false;
    });
    state.chainCount = 0;
    state.turn += 1;
    state.player.mana += state.manaPerRound;
    state.roundDeaths = 0;
    state.lastSpell = null;
    return state;
}
function applyPoisonDamageToBoard(state, board, prefix, cards) {
    let index = 0;
    while (index < board.length) {
        const minion = board[index];
        if (minion && minion.poison && minion.poison > 0) {
            applyDamageToMinionWithSpawn(state, board, index, minion.poison, prefix, cards);
        }
        index += 1;
    }
}
export function getLegalActions(state, cards) {
    const actions = [];
    const guardIndexes = enemyGuardIndexes(state, cards);
    const canHitOpponent = state.opponent.board.filter((minion) => isCreatureInstance(minion, cards)).length === 0;
    for (const cardId of state.player.hand) {
        const def = cards.byId[cardId];
        if (!def) {
            continue;
        }
        if (state.player.mana < def.cost) {
            continue;
        }
        if (def.type === "spell") {
            const repeatEffect = def.effects?.find((effect) => effect.type === "repeat_last_spell");
            if (repeatEffect && repeatEffect.type === "repeat_last_spell") {
                if (!state.lastSpell) {
                    continue;
                }
                const surcharge = repeatEffect.surcharge ?? 1;
                if (state.player.mana < def.cost + surcharge) {
                    continue;
                }
            }
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
            const hasPurge = def.effects?.some((effect) => effect.type === "purge_mods") ?? false;
            if (hasPurge) {
                const playerTargets = state.player.board
                    .map((minion, idx) => ({ minion, idx }))
                    .filter((entry) => isCreatureInstance(entry.minion, cards))
                    .map((entry) => `player:slot${entry.idx}`);
                const opponentTargets = state.opponent.board
                    .map((minion, idx) => ({ minion, idx }))
                    .filter((entry) => isCreatureInstance(entry.minion, cards))
                    .map((entry) => `opponent:slot${entry.idx}`);
                if (playerTargets.length === 0 && opponentTargets.length === 0) {
                    continue;
                }
                playerTargets.forEach((target) => actions.push({ type: "play", card: cardId, target }));
                opponentTargets.forEach((target) => actions.push({ type: "play", card: cardId, target }));
                continue;
            }
            const hasBorrow = def.effects?.some((effect) => effect.type === "borrow_enemy") ?? false;
            if (hasBorrow) {
                const opponentTargets = state.opponent.board
                    .map((minion, idx) => ({ minion, idx }))
                    .filter((entry) => isCreatureInstance(entry.minion, cards))
                    .map((entry) => `opponent:slot${entry.idx}`);
                if (opponentTargets.length === 0) {
                    continue;
                }
                opponentTargets.forEach((target) => actions.push({ type: "play", card: cardId, target }));
                continue;
            }
            const hasSwap = def.effects?.some((effect) => effect.type === "swap_positions") ?? false;
            if (hasSwap) {
                const playerSlots = state.player.board
                    .map((minion, idx) => ({ minion, idx }))
                    .filter((entry) => isCreatureInstance(entry.minion, cards))
                    .map((entry) => entry.idx);
                const opponentSlots = state.opponent.board
                    .map((minion, idx) => ({ minion, idx }))
                    .filter((entry) => isCreatureInstance(entry.minion, cards))
                    .map((entry) => entry.idx);
                const addPairs = (slots, prefix) => {
                    for (let i = 0; i < slots.length; i += 1) {
                        for (let j = i + 1; j < slots.length; j += 1) {
                            actions.push({
                                type: "play",
                                card: cardId,
                                target: `${prefix}:slot${slots[i]}|${prefix}:slot${slots[j]}`,
                            });
                        }
                    }
                };
                addPairs(playerSlots, "player");
                addPairs(opponentSlots, "opponent");
                continue;
            }
        }
        if (def.type === "mod") {
            const requiresPositivePower = def.effects?.some((effect) => effect.type === "shield") ?? false;
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
            playerTargets.forEach((target) => actions.push({ type: "play", card: cardId, target }));
            opponentTargets.forEach((target) => actions.push({ type: "play", card: cardId, target }));
            continue;
        }
        if (def.type === "creature") {
            const requiresReadyAlly = def.effects?.some((effect) => effect.type === "requires_ready_ally") ?? false;
            if (requiresReadyAlly) {
                const hasReadyAlly = state.player.board.some((minion) => isCreatureInstance(minion, cards) && !minion.tired);
                if (!hasReadyAlly) {
                    continue;
                }
            }
            const hasDevour = def.effects?.some((effect) => effect.type === "devour_ally") ?? false;
            if (hasDevour) {
                const targets = state.player.board
                    .map((minion, idx) => ({ minion, idx }))
                    .filter((entry) => isCreatureInstance(entry.minion, cards))
                    .map((entry) => `player:slot${entry.idx}`);
                if (targets.length === 0) {
                    continue;
                }
                targets.forEach((target) => actions.push({ type: "play", card: cardId, target }));
                continue;
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
        if (hasModEffect(minion, cards, "no_attack")) {
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
    state.player.board.forEach((unit, idx) => {
        const def = cards.byId[unit.card];
        if (!def || def.type !== "effect") {
            return;
        }
        const activateEffect = def.effects?.find((effect) => effect.type === "activate_damage");
        if (!activateEffect || activateEffect.type !== "activate_damage") {
            // no-op
        }
        else {
            const threshold = activateEffect.threshold ?? 0;
            if ((unit.counter ?? 0) >= threshold) {
                const sourceRef = unit.uid ?? `player:slot${idx}`;
                actions.push({ type: "activate", source: sourceRef, target: "opponent" });
                state.opponent.board.forEach((enemy, enemyIndex) => {
                    if (!isCreatureInstance(enemy, cards)) {
                        return;
                    }
                    actions.push({
                        type: "activate",
                        source: sourceRef,
                        target: `opponent:slot${enemyIndex}`,
                    });
                });
                state.player.board.forEach((ally, allyIndex) => {
                    if (!isCreatureInstance(ally, cards)) {
                        return;
                    }
                    actions.push({
                        type: "activate",
                        source: sourceRef,
                        target: `player:slot${allyIndex}`,
                    });
                });
            }
        }
        const activateMana = def.effects?.find((effect) => effect.type === "activate_mana");
        if (activateMana && activateMana.type === "activate_mana") {
            if ((unit.counter ?? 0) > 0) {
                const sourceRef = unit.uid ?? `player:slot${idx}`;
                actions.push({ type: "activate", source: sourceRef });
            }
        }
    });
    actions.push({ type: "end" });
    return actions;
}
