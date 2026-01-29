export class Rng {
    constructor(seed) {
        this.state = seed >>> 0;
    }
    next() {
        let t = (this.state += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    int(max) {
        if (max <= 0) {
            return 0;
        }
        return Math.floor(this.next() * max);
    }
    pick(items) {
        return items[this.int(items.length)];
    }
}
export function ghostWalk(state, cards, engine, options) {
    const rng = options?.rng ?? new Rng(Date.now());
    const excludeEnd = options?.excludeEnd ?? false;
    const stopOnWin = options?.stopOnWin ?? false;
    const roundsRaw = options?.targetRounds ?? state.targetRounds;
    const maxActions = options?.maxActions ?? 200;
    const rounds = typeof roundsRaw === "number" && Number.isFinite(roundsRaw)
        ? roundsRaw
        : Number(roundsRaw) || 1;
    const clone = engine.cloneState ??
        ((input) => typeof structuredClone === "function"
            ? structuredClone(input)
            : JSON.parse(JSON.stringify(input)));
    const startState = clone(state);
    let current = clone(state);
    const trace = [];
    const seen = new Set();
    while (true) {
        const key = JSON.stringify(current);
        if (seen.has(key)) {
            break;
        }
        seen.add(key);
        let actions = engine.getLegalActions(current, cards);
        if (excludeEnd) {
            actions = actions.filter((action) => action.type !== "end");
        }
        const nonEnd = actions.filter((action) => action.type !== "end");
        let choices = [];
        if (excludeEnd) {
            choices = actions;
        }
        else if (rounds <= 1 || current.turn >= rounds) {
            choices = nonEnd;
        }
        else if (nonEnd.length > 0) {
            choices = nonEnd;
        }
        else {
            choices = actions.filter((action) => action.type === "end");
        }
        if (choices.length === 0) {
            break;
        }
        let options = [];
        for (const action of choices) {
            try {
                const next = engine.applyAction(current, action, cards);
                const nextKey = JSON.stringify(next);
                if (nextKey === key || seen.has(nextKey)) {
                    continue;
                }
                options.push({ action, next });
            }
            catch {
                continue;
            }
        }
        if (options.length === 0 &&
            !excludeEnd &&
            rounds > 1 &&
            current.turn < rounds) {
            const endActions = actions.filter((action) => action.type === "end");
            for (const action of endActions) {
                try {
                    const next = engine.applyAction(current, action, cards);
                    const nextKey = JSON.stringify(next);
                    if (nextKey === key || seen.has(nextKey)) {
                        continue;
                    }
                    options.push({ action, next });
                }
                catch {
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
            return { trace, startState, endState: current, aborted: true };
        }
        if (stopOnWin && engine.isWin(current)) {
            break;
        }
    }
    return { trace, startState, endState: current };
}
export function materialize(ghost, cards, options) {
    const usedCards = ghost.trace
        .filter((action) => action.type === "play")
        .map((action) => action.card);
    const manaSpent = usedCards.reduce((sum, cardId) => {
        const def = cards.byId[cardId];
        return sum + (def?.cost ?? 0);
    }, 0);
    const startingMana = ghost.startState?.player?.mana ?? manaSpent;
    const actionCount = ghost.trace.length;
    const damage = ghost.startState.opponent.health - ghost.endState.opponent.health;
    if (damage <= 0) {
        throw new Error("Ghost walk did not deal damage; cannot materialize puzzle.");
    }
    const tags = new Set();
    usedCards.forEach((cardId) => {
        const def = cards.byId[cardId];
        def?.keywords?.forEach((kw) => tags.add(kw));
    });
    const difficulty = options?.difficulty ??
        (actionCount >= 5 ? "hard" : actionCount >= 3 ? "medium" : "easy");
    return {
        id: `puzzle_${options?.seed ?? Date.now()}`,
        difficulty,
        seed: options?.seed,
        tags: Array.from(tags),
        targetRounds: options?.targetRounds ?? 1,
        manaPerRound: options?.manaPerRound ?? 0,
        player: {
            mana: startingMana,
            hand: usedCards,
            board: [],
        },
        opponent: {
            name: ghost.startState.opponent.name ?? "Boss",
            health: Math.max(1, damage),
            board: ghost.startState.opponent.board ?? [],
        },
        solution: ghost.trace,
    };
}
export function obfuscate(puzzle, cards, options) {
    const rng = options?.rng ?? new Rng(Date.now());
    const hand = [...puzzle.player.hand];
    const pool = Object.values(cards.byId).filter((card) => card.type === "creature" ||
        card.type === "spell" ||
        card.type === "effect" ||
        card.type === "mod");
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
export function addDecoys(puzzle, rng, pool, extra) {
    const hand = [...puzzle.player.hand];
    for (let i = 0; i < extra; i += 1) {
        const pick = rng.pick(pool);
        hand.push(pick.id);
    }
    return {
        ...puzzle,
        player: {
            ...puzzle.player,
            hand,
        },
    };
}
export function isBossModAllowed(card) {
    if (!card || card.type !== "mod") {
        return false;
    }
    return !(card.effects ?? []).some((effect) => {
        if (effect.type === "death_damage_boss") {
            return true;
        }
        if (effect.type === "grant_keyword" && effect.keyword === "pierce") {
            return true;
        }
        return false;
    });
}
export function buildGeneratorPools(cards, options) {
    const playableFilter = options?.playableFilter ??
        ((card) => card.type === "creature" ||
            card.type === "spell" ||
            card.type === "effect" ||
            card.type === "mod");
    const bossModFilter = options?.bossModFilter ?? isBossModAllowed;
    const allCards = Object.values(cards.byId);
    const playable = allCards.filter(playableFilter);
    const creaturePool = allCards.filter((card) => card.type === "creature");
    const bossModPool = allCards
        .filter((card) => card.type === "mod")
        .filter((card) => bossModFilter(card))
        .map((card) => card.id);
    return { playable, creaturePool, bossModPool };
}
export function buildPuzzleAttempt(state, cards, engine) {
    const hand = pickHand(state.rng, state.playable, state.handSize);
    const handLabel = hand
        .map((cardId) => cards.byId[cardId]?.name ?? cardId)
        .join(", ");
    const handTypes = new Set(hand
        .map((cardId) => cards.byId[cardId]?.type)
        .filter((type) => Boolean(type)));
    if (handTypes.size <= 1) {
        return {
            hand,
            handLabel,
            actionCount: 0,
            aborted: false,
            rejection: "hand_types",
        };
    }
    const bossBoard = buildBossBoard(state.rng, state.creaturePool, state.bossMin, state.bossMax, state.bossModPool, state.bossModsMax, cards);
    if (!bossBoard) {
        return {
            hand,
            handLabel,
            actionCount: 0,
            aborted: false,
            rejection: "boss_board",
        };
    }
    const startState = engine.normalizeState({
        player: {
            mana: state.manaCap,
            hand,
            board: [],
        },
        opponent: {
            name: state.bossName,
            health: 30,
            board: bossBoard,
        },
        manaPerRound: state.manaPerRound,
        targetRounds: state.targetRounds,
    });
    const ghost = ghostWalk(startState, cards, engine, {
        rng: state.rng,
        targetRounds: state.targetRounds,
        maxActions: state.actionBudget,
    });
    const actionCount = ghost.trace.length;
    if (ghost.aborted) {
        return {
            hand,
            handLabel,
            actionCount,
            aborted: true,
            rejection: "action_budget",
        };
    }
    if (actionCount === 0) {
        return {
            hand,
            handLabel,
            actionCount,
            aborted: false,
            rejection: "no_actions",
        };
    }
    try {
        const base = materialize(ghost, cards, {
            seed: state.seed,
            targetRounds: state.targetRounds,
            manaPerRound: state.manaPerRound,
        });
        if (state.targetRounds > 1) {
            const baseCost = base.player.hand.reduce((sum, cardId) => {
                const def = cards.byId[cardId];
                return sum + (def?.cost ?? 0);
            }, 0);
            if (baseCost <= base.player.mana) {
                return {
                    hand,
                    handLabel,
                    actionCount,
                    aborted: false,
                    rejection: "early_mana",
                };
            }
        }
        const puzzle = state.decoys > 0 ? addDecoys(base, state.rng, state.playable, state.decoys) : base;
        const puzzleTypes = new Set(puzzle.player.hand
            .map((cardId) => cards.byId[cardId]?.type)
            .filter((type) => Boolean(type)));
        if (puzzleTypes.size <= 1) {
            return {
                hand,
                handLabel,
                actionCount,
                aborted: false,
                rejection: "hand_types",
            };
        }
        return {
            puzzle,
            hand,
            handLabel,
            actionCount,
            aborted: false,
        };
    }
    catch {
        return {
            hand,
            handLabel,
            actionCount,
            aborted: false,
            rejection: "materialize",
        };
    }
}
export function createSolveState(puzzle, engine, maxNodes) {
    const startState = engine.normalizeState({
        player: puzzle.player,
        opponent: puzzle.opponent,
        manaPerRound: puzzle.manaPerRound ?? 0,
        targetRounds: puzzle.targetRounds,
    });
    return {
        puzzle,
        startState,
        wins: 0,
        visited: 0,
        maxNodes,
        seen: new Map(),
        stack: [{ state: startState, depth: 0 }],
    };
}
export function stepSolve(solver, cards, engine, options) {
    const iterationsLimit = options?.iterationLimit ?? 250;
    let iterations = 0;
    while (solver.stack.length > 0 && iterations < iterationsLimit) {
        const node = solver.stack.pop();
        if (!node) {
            break;
        }
        solver.visited += 1;
        if (Number.isFinite(solver.maxNodes) &&
            solver.maxNodes !== Number.POSITIVE_INFINITY &&
            solver.visited >= solver.maxNodes) {
            return { status: "budget" };
        }
        if (engine.isWin(node.state)) {
            if (options?.enforceEarlyWin && isEarlyWin(node.state, options?.targetRounds)) {
                return { status: "reject", reason: "early_win" };
            }
            solver.wins += 1;
            if (options?.enforceSolutionCap &&
                solver.wins > (options?.maxSolutions ?? 0)) {
                return { status: "reject", reason: "solution_cap" };
            }
            iterations += 1;
            continue;
        }
        if (isPastRoundLimit(node.state)) {
            iterations += 1;
            continue;
        }
        const key = JSON.stringify(node.state);
        const prevDepth = solver.seen.get(key);
        if (prevDepth !== undefined && prevDepth <= node.depth) {
            iterations += 1;
            continue;
        }
        solver.seen.set(key, node.depth);
        const actions = engine.getLegalActions(node.state, cards);
        for (let i = actions.length - 1; i >= 0; i -= 1) {
            const action = actions[i];
            if (action.type === "end" && isFinalRoundForSolver(node.state)) {
                continue;
            }
            try {
                const next = engine.applyAction(node.state, action, cards);
                solver.stack.push({
                    state: next,
                    depth: node.depth + 1,
                });
            }
            catch {
                continue;
            }
        }
        iterations += 1;
    }
    if (solver.stack.length === 0) {
        if (solver.wins > 0 && (!options?.enforceSolutionCap || solver.wins <= (options?.maxSolutions ?? 0))) {
            return { status: "success" };
        }
        return { status: "exhausted" };
    }
    return { status: "continue" };
}
export function isEarlyWin(state, targetRounds) {
    const rounds = typeof targetRounds === "number" ? targetRounds : Number(targetRounds ?? 0);
    if (!Number.isFinite(rounds) || rounds <= 1) {
        return false;
    }
    return state.turn < rounds;
}
export function isFinalRoundForSolver(state) {
    const totalRounds = typeof state.targetRounds === "number"
        ? state.targetRounds
        : Number(state.targetRounds);
    if (!Number.isFinite(totalRounds)) {
        return false;
    }
    return totalRounds - (state.turn - 1) === 1;
}
export function isPastRoundLimit(state) {
    const totalRounds = typeof state.targetRounds === "number"
        ? state.targetRounds
        : Number(state.targetRounds);
    if (!Number.isFinite(totalRounds)) {
        return false;
    }
    return state.turn > totalRounds;
}
function pickHand(rng, pool, count) {
    const hand = [];
    for (let i = 0; i < count; i += 1) {
        const pick = rng.pick(pool);
        hand.push(pick.id);
    }
    return hand;
}
function buildBossBoard(rng, pool, minCount, maxCount, modPool, modsMax, cards) {
    const min = Math.max(0, minCount ?? 0);
    const max = Math.max(min, maxCount ?? 0);
    if (!Array.isArray(pool) || pool.length === 0) {
        return min > 0 ? null : [];
    }
    if (max <= 0) {
        return min > 0 ? null : [];
    }
    const range = max - min;
    const count = min + rng.int(range + 1);
    const board = [];
    for (let i = 0; i < count; i += 1) {
        const pick = rng.pick(pool);
        if (!pick?.stats) {
            continue;
        }
        const instance = {
            uid: "",
            card: pick.id,
            power: pick.stats.power,
            keywords: pick.keywords ? [...pick.keywords] : [],
            mods: [],
            tired: false,
            poison: 0,
            shield: 0,
            rebirths: 0,
        };
        applyBossMods(instance, rng, modPool, modsMax, cards);
        board.push(instance);
    }
    return board;
}
function applyBossMods(instance, rng, modPool, modsMax, cards) {
    const maxMods = Math.max(0, modsMax ?? 0);
    if (!Array.isArray(modPool) || modPool.length === 0 || maxMods <= 0) {
        return;
    }
    const cap = Math.min(maxMods, modPool.length);
    const count = rng.int(cap + 1);
    if (count <= 0) {
        return;
    }
    const available = [...modPool];
    for (let i = 0; i < count; i += 1) {
        if (available.length === 0) {
            break;
        }
        const pick = rng.pick(available);
        const index = available.indexOf(pick);
        if (index >= 0) {
            available.splice(index, 1);
        }
        const def = cards.byId?.[pick];
        if (!def || def.type !== "mod") {
            continue;
        }
        applyModEffects(instance, def);
    }
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
