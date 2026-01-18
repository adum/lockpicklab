import {
  applyAction,
  buildCardLibrary,
  getLegalActions,
  isWin,
  normalizeState,
} from "./engine.js";
import { initTooltips } from "./tooltip.js";

const fallbackCards = {
  cards: [
    {
      id: "spark",
      name: "Spark",
      type: "spell",
      cost: 1,
      keywords: ["chain"],
      effects: [{ type: "damage", amount: 2, chain_amount: 4 }],
    },
    {
      id: "piercing_rune",
      name: "Piercing Rune",
      type: "mod",
      cost: 2,
      effects: [{ type: "grant_keyword", keyword: "pierce" }],
    },
    {
      id: "war_banner",
      name: "War Banner",
      type: "effect",
      cost: 2,
      effects: [{ type: "aura", stat: "power", amount: 1, applies_to: "attack" }],
    },
    {
      id: "cultist",
      name: "Cultist",
      type: "creature",
      cost: 1,
      stats: { power: 1 },
      keywords: ["sacrifice"],
      effects: [
        { type: "buff", stat: "power", amount: 4, requires: "sacrifice_self" },
      ],
    },
    {
      id: "ox",
      name: "Ox",
      type: "creature",
      cost: 3,
      stats: { power: 5 },
      keywords: ["guard"],
    },
    {
      id: "lancer",
      name: "Lancer",
      type: "creature",
      cost: 4,
      stats: { power: 5 },
      keywords: ["pierce"],
    },
    {
      id: "fireball",
      name: "Fireball",
      type: "spell",
      cost: 4,
      effects: [{ type: "damage", amount: 6 }],
    },
    {
      id: "iron_golem",
      name: "Iron Golem",
      type: "creature",
      cost: 2,
      stats: { power: 3 },
      keywords: ["guard"],
    },
  ],
};

const defaultPuzzle = {
  id: "puzzle_0001",
  difficulty: "hard",
  seed: 8842,
  tags: ["guard", "pierce", "sacrifice", "effect"],
  targetRounds: 2,
  manaPerRound: 2,
  player: {
    mana: 5,
    hand: ["cultist", "piercing_rune", "war_banner", "lancer", "fireball", "spark"],
    board: [],
  },
  opponent: {
    name: "Toad Bureaucrat",
    health: 6,
    board: [
      {
        card: "iron_golem",
        power: 3,
        keywords: ["guard"],
        tired: false,
      },
    ],
  },
  solution: [
    { type: "play", card: "cultist" },
    { type: "play", card: "lancer" },
    { type: "activate", source: "cultist", target: "lancer" },
    { type: "attack", source: "lancer", target: "opponent:slot0" },
  ],
  metadata: {
    version: 1,
    description:
      "Cultist buffs Lancer to 9 power; piercing a 3 power guard deals 6 to face.",
  },
};

const clockworkPuzzle = {
  ...structuredClone(defaultPuzzle),
  id: "puzzle_0002",
  seed: 9124,
  opponent: {
    ...defaultPuzzle.opponent,
    name: "Clockwork King",
  },
  metadata: {
    version: 1,
    description:
      "Clockwork King oversees the same opening, but brings a new machine aesthetic.",
  },
};

const elements = {
  puzzleSelect: document.getElementById("puzzle-select"),
  puzzleDifficulty: document.getElementById("puzzle-difficulty"),
  puzzleTags: document.getElementById("puzzle-tags"),
  opponentHealth: document.getElementById("opponent-health"),
  bossName: document.getElementById("boss-name"),
  bossArt: document.getElementById("boss-art"),
  playerMana: document.getElementById("player-mana"),
  opponentEffectsSection: document.getElementById("opponent-effects-section"),
  opponentEffects: document.getElementById("opponent-effects"),
  opponentBoard: document.getElementById("opponent-board"),
  playerEffectsSection: document.getElementById("player-effects-section"),
  playerEffects: document.getElementById("player-effects"),
  playerBoard: document.getElementById("player-board"),
  playerHand: document.getElementById("player-hand"),
  loadExample: document.getElementById("load-example"),
  fileInput: document.getElementById("file-input"),
  parseJson: document.getElementById("parse-json"),
  puzzleJson: document.getElementById("puzzle-json"),
  status: document.getElementById("status"),
  actionList: document.getElementById("action-list"),
  actionLog: document.getElementById("action-log"),
  resetState: document.getElementById("reset-state"),
  undoAction: document.getElementById("undo-action"),
  stepSolution: document.getElementById("step-solution"),
  playSolution: document.getElementById("play-solution"),
  roundsLeft: document.getElementById("rounds-left"),
  manaPerRoundWrap: document.getElementById("mana-per-round-wrap"),
  manaPerRound: document.getElementById("mana-per-round"),
  endRound: document.getElementById("end-round"),
  panel: document.getElementById("puzzle-panel"),
  panelToggle: document.getElementById("panel-toggle"),
  genSeed: document.getElementById("gen-seed"),
  genSeedRandom: document.getElementById("gen-seed-random"),
  genSteps: document.getElementById("gen-steps"),
  genHand: document.getElementById("gen-hand"),
  genMana: document.getElementById("gen-mana"),
  genDecoys: document.getElementById("gen-decoys"),
  genRounds: document.getElementById("gen-rounds"),
  genManaRound: document.getElementById("gen-mana-round"),
  genBoss: document.getElementById("gen-boss"),
  genRun: document.getElementById("gen-run"),
};

const PUZZLE_LIBRARY = [
  {
    id: "puzzle_0001",
    label: "Puzzle 1 — Lancer Strike",
    data: defaultPuzzle,
  },
  {
    id: "puzzle_0002",
    label: "Puzzle 2 — Clockwork King",
    data: clockworkPuzzle,
  },
];

const BOSS_ART = {
  "Toad Bureaucrat": "./assets/boss/toad_dark.jpg",
  "Clockwork King": "./assets/boss/clockwork.jpg",
};

const CREATURE_ART = {
  cultist: "./assets/creatures/cultist.jpg",
  lancer: "./assets/creatures/lancer.jpg",
  iron_golem: "./assets/creatures/iron_golem.jpg",
};

const CREATURE_PLACEHOLDER = "./assets/creatures/placeholder.jpg";

const EFFECT_ART = {
  war_banner: "./assets/effects/placeholder.jpg",
};

const EFFECT_PLACEHOLDER = "./assets/effects/placeholder.jpg";

const MOD_ART = {
  piercing_rune: "./assets/mods/placeholder.jpg",
};

const MOD_PLACEHOLDER = "./assets/mods/placeholder.jpg";

const SPELL_ART = {
  fireball: "./assets/spells/fireball.jpg",
  spark: "./assets/spells/spark.jpg",
};

class Rng {
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

let cardLibrary = buildCardLibrary(fallbackCards);
let currentPuzzle = structuredClone(defaultPuzzle);
let initialState = normalizeState({
  player: currentPuzzle.player,
  opponent: currentPuzzle.opponent,
  manaPerRound: currentPuzzle.manaPerRound ?? 0,
  targetRounds: currentPuzzle.targetRounds,
});
let currentState = initialState;
let snapshots = [initialState];
let actions = [];
let solutionIndex = 0;
let autoplayTimer = null;
let cachedLegalActions = [];
let pendingAction = null;
let damageFlash = { creatures: new Set(), boss: false };
let failureState = false;
const KEYWORD_TOOLTIPS = {
  guard: "Guard: must be attacked before non-Guard targets.",
  storm: "Storm: can attack any target immediately.",
  pierce: "Pierce: excess power hits the boss.",
  chain: "Chain: bonus effect if a card was already played this round.",
  sacrifice: "Sacrifice: destroy this creature to give a friendly creature +4 power.",
  tired: "Tired: this creature already attacked this round.",
  vanilla: "No special abilities.",
};

async function loadCardLibrary() {
  try {
    const response = await fetch("../cards/cards.json");
    if (!response.ok) {
      throw new Error("Card library not found");
    }
    const data = await response.json();
    cardLibrary = buildCardLibrary(data);
    setStatus("Loaded card library.");
  } catch {
    setStatus("Using fallback card library.", "warn");
  }
}

function resetState() {
  initialState = normalizeState({
    player: currentPuzzle.player,
    opponent: currentPuzzle.opponent,
    manaPerRound: currentPuzzle.manaPerRound ?? 0,
    targetRounds: currentPuzzle.targetRounds,
  });
  currentState = initialState;
  snapshots = [initialState];
  actions = [];
  solutionIndex = 0;
  pendingAction = null;
  damageFlash = { creatures: new Set(), boss: false };
  failureState = false;
  stopAutoplay();
  render();
  setStatus("State reset.");
}

function stopAutoplay() {
  if (autoplayTimer !== null) {
    window.clearInterval(autoplayTimer);
    autoplayTimer = null;
  }
}

elements.loadExample.addEventListener("click", () => {
  currentPuzzle = structuredClone(defaultPuzzle);
  elements.puzzleJson.value = JSON.stringify(currentPuzzle, null, 2);
  resetState();
  setStatus("Loaded example puzzle.");
});

elements.parseJson.addEventListener("click", () => {
  const text = elements.puzzleJson.value.trim();
  if (!text) {
    setStatus("Paste puzzle JSON first.", "warn");
    return;
  }
  try {
    currentPuzzle = JSON.parse(text);
    resetState();
    setStatus("Parsed puzzle JSON.");
  } catch (err) {
    setStatus(`Parse error: ${err.message}`, "warn");
  }
});

elements.fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result?.toString() ?? "";
    elements.puzzleJson.value = text;
    elements.parseJson.click();
  };
  reader.readAsText(file);
});

elements.resetState.addEventListener("click", () => {
  resetState();
});

elements.undoAction.addEventListener("click", () => {
  if (actions.length === 0) {
    setStatus("Nothing to undo.");
    return;
  }
  actions.pop();
  snapshots.pop();
  currentState = snapshots[snapshots.length - 1];
  if (solutionIndex > actions.length) {
    solutionIndex = actions.length;
  }
  failureState = false;
  stopAutoplay();
  render();
});

elements.endRound.addEventListener("click", () => {
  applyAndRender({ type: "end" });
});

elements.panelToggle.addEventListener("click", () => {
  const panel = elements.panel;
  if (!panel) {
    return;
  }
  panel.classList.toggle("collapsed");
  const expanded = !panel.classList.contains("collapsed");
  elements.panelToggle.setAttribute("aria-expanded", String(expanded));
});

elements.genRun.addEventListener("click", () => {
  generatePuzzleFromInputs();
});

document.addEventListener("pointerdown", (event) => {
  if (!pendingAction || pendingAction.type !== "play") {
    return;
  }
  const target = event.target;
  if (target?.closest?.(".target-icon")) {
    return;
  }
  if (target?.closest?.(".targetable")) {
    return;
  }
  const handCard = target?.closest?.(".hand-card");
  if (handCard && handCard.dataset.cardId === pendingAction.card) {
    return;
  }
  pendingAction = null;
  render();
});

elements.genSeedRandom.addEventListener("change", () => {
  const useRandom = elements.genSeedRandom.checked;
  elements.genSeed.disabled = useRandom;
  if (useRandom) {
    elements.genSeed.value = "";
  }
});

elements.puzzleSelect.addEventListener("change", () => {
  const value = elements.puzzleSelect.value;
  if (!value || value === "custom") {
    return;
  }
  const entry = PUZZLE_LIBRARY.find((item) => item.id === value);
  if (!entry) {
    return;
  }
  currentPuzzle = structuredClone(entry.data);
  elements.puzzleJson.value = JSON.stringify(currentPuzzle, null, 2);
  resetState();
  setStatus(`Loaded ${entry.label}.`);
});

function syncPuzzleSelect() {
  const select = elements.puzzleSelect;
  if (!select) {
    return;
  }
  const currentId = currentPuzzle?.id ?? "custom";
  const existing = Array.from(select.options).find(
    (option) => option.value === currentId
  );
  if (!existing && currentId !== "custom") {
    const customOption =
      Array.from(select.options).find((option) => option.value === "custom") ??
      null;
    if (customOption) {
      customOption.textContent = `Custom — ${currentId}`;
    } else {
      const option = document.createElement("option");
      option.value = "custom";
      option.textContent = `Custom — ${currentId}`;
      select.appendChild(option);
    }
  }
  const hasEntry = PUZZLE_LIBRARY.some((item) => item.id === currentId);
  select.value = hasEntry ? currentId : "custom";
}

function populatePuzzleSelect() {
  const select = elements.puzzleSelect;
  if (!select) {
    return;
  }
  select.innerHTML = "";
  PUZZLE_LIBRARY.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.label;
    select.appendChild(option);
  });
  const customOption = document.createElement("option");
  customOption.value = "custom";
  customOption.textContent = "Custom";
  select.appendChild(customOption);
  syncPuzzleSelect();
}

function generatePuzzleFromInputs() {
  const useRandom = elements.genSeedRandom.checked;
  const seedValue = Number(elements.genSeed.value);
  const seed = useRandom
    ? Date.now()
    : Number.isFinite(seedValue)
      ? seedValue
      : Date.now();
  if (!useRandom) {
    elements.genSeed.value = String(seed);
  }
  const steps = parseNumber(elements.genSteps.value, 4, 1, 8);
  const handSize = parseNumber(elements.genHand.value, 4, 1, 8);
  const manaCap = parseNumber(elements.genMana.value, 10, 1, 20);
  const decoys = parseNumber(elements.genDecoys.value, 0, 0, 6);
  const targetRounds = parseNumber(elements.genRounds.value, 1, 1, 6);
  const manaPerRound = parseNumber(elements.genManaRound.value, 0, 0, 10);
  const bossMax = parseNumber(elements.genBoss?.value ?? 0, 0, 0, 6);

  const rng = new Rng(seed);
  const bossNames = Object.keys(BOSS_ART);
  const bossRng = new Rng(seed ^ 0x9e3779b9);
  const bossName =
    bossNames.length > 0
      ? bossRng.pick(bossNames)
      : currentPuzzle.opponent?.name ?? "Toad Bureaucrat";
  const playable = Object.values(cardLibrary.byId).filter(
    (card) =>
      card.type === "creature" ||
      card.type === "spell" ||
      card.type === "effect" ||
      card.type === "mod"
  );
  const creaturePool = Object.values(cardLibrary.byId).filter(
    (card) => card.type === "creature"
  );

  let puzzle = null;
  for (let attempt = 0; attempt < 50 && !puzzle; attempt += 1) {
    const hand = pickHand(rng, playable, handSize);
    const bossBoard = buildBossBoard(rng, creaturePool, bossMax);
    const startState = normalizeState({
      player: {
        mana: manaCap,
        hand,
        board: [],
      },
      opponent: {
        name: bossName,
        health: 30,
        board: bossBoard,
      },
      manaPerRound,
      targetRounds,
    });

    const ghost = ghostWalk(startState, rng, steps);
    if (ghost.trace.length === 0) {
      continue;
    }
    try {
      const base = materializeGhost(
        ghost,
        seed,
        steps,
        targetRounds,
        manaPerRound
      );
      puzzle = decoys > 0 ? addDecoys(base, rng, playable, decoys) : base;
    } catch {
      puzzle = null;
    }
  }

  if (!puzzle) {
    setStatus("Generator failed to produce a puzzle.", "warn");
    return;
  }

  currentPuzzle = puzzle;
  elements.puzzleJson.value = JSON.stringify(currentPuzzle, null, 2);
  resetState();
  setStatus(`Generated ${puzzle.id}.`);
}

function parseNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function pickHand(rng, pool, count) {
  const hand = [];
  for (let i = 0; i < count; i += 1) {
    const pick = rng.pick(pool);
    hand.push(pick.id);
  }
  return hand;
}

function buildBossBoard(rng, pool, maxCount) {
  if (!Array.isArray(pool) || pool.length === 0 || maxCount <= 0) {
    return [];
  }
  const count = rng.int(maxCount + 1);
  const board = [];
  for (let i = 0; i < count; i += 1) {
    const pick = rng.pick(pool);
    if (!pick?.stats) {
      continue;
    }
    board.push({
      card: pick.id,
      power: pick.stats.power,
      keywords: pick.keywords ? [...pick.keywords] : [],
      mods: [],
      tired: false,
    });
  }
  return board;
}

function ghostWalk(startState, rng, steps) {
  let current = structuredClone(startState);
  const trace = [];

  for (let step = 0; step < steps; step += 1) {
    let actions = getLegalActions(current, cardLibrary);
    actions = actions.filter((action) => action.type !== "end");
    if (actions.length === 0) {
      break;
    }
    const action = rng.pick(actions);
    current = applyAction(current, action, cardLibrary);
    trace.push(action);
  }

  return { trace, startState, endState: current };
}

function materializeGhost(ghost, seed, steps, targetRounds, manaPerRound) {
  const usedCards = ghost.trace
    .filter((action) => action.type === "play")
    .map((action) => action.card);
  const manaSpent = usedCards.reduce((sum, cardId) => {
    const def = cardLibrary.byId[cardId];
    return sum + (def?.cost ?? 0);
  }, 0);

  const damage = ghost.startState.opponent.health - ghost.endState.opponent.health;
  if (damage <= 0) {
    throw new Error("No damage dealt.");
  }

  const tags = new Set();
  usedCards.forEach((cardId) => {
    const def = cardLibrary.byId[cardId];
    def?.keywords?.forEach((kw) => tags.add(kw));
  });

  return {
    id: `puzzle_${seed}`,
    difficulty: steps >= 5 ? "hard" : steps >= 3 ? "medium" : "easy",
    seed,
    tags: Array.from(tags),
    targetRounds,
    manaPerRound,
    player: {
      mana: manaSpent,
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

function addDecoys(puzzle, rng, pool, extra) {
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

elements.stepSolution.addEventListener("click", () => {
  stepSolution();
});

elements.playSolution.addEventListener("click", () => {
  if (!Array.isArray(currentPuzzle.solution) || currentPuzzle.solution.length === 0) {
    setStatus("No solution trace in puzzle.", "warn");
    return;
  }
  if (autoplayTimer !== null) {
    stopAutoplay();
    setStatus("Autoplay stopped.");
    return;
  }
  autoplayTimer = window.setInterval(() => {
    const progressed = stepSolution();
    if (!progressed) {
      stopAutoplay();
    }
  }, 650);
  setStatus("Autoplay started.");
});

function stepSolution() {
  const solution = currentPuzzle.solution ?? [];
  if (!Array.isArray(solution) || solution.length === 0) {
    setStatus("No solution trace in puzzle.", "warn");
    return false;
  }
  if (solutionIndex >= solution.length) {
    setStatus("Solution already complete.");
    return false;
  }
  const action = solution[solutionIndex];
  return applyAndRender(action, true);
}

function applyAndRender(action, isSolutionStep = false) {
  try {
    const prev = currentState;
    const wasFinalRound = isFinalRound(prev);
    const next = applyAction(currentState, action, cardLibrary);
    damageFlash = computeDamageFlash(prev, next);
    currentState = next;
    snapshots.push(next);
    actions.push(action);
    pendingAction = null;
    if (isSolutionStep) {
      solutionIndex += 1;
    }
    if (action.type === "end" && wasFinalRound && !isWin(next)) {
      failureState = true;
      setStatus("Final round ended. Puzzle failed.", "warn");
      stopAutoplay();
    }
    render();
    if (isWin(currentState)) {
      setStatus("Boss defeated.");
      stopAutoplay();
    }
    return true;
  } catch (err) {
    setStatus(`Action failed: ${err.message}`, "warn");
    stopAutoplay();
    return false;
  }
}

function setStatus(message, tone = "ok") {
  elements.status.textContent = message;
  elements.status.style.color =
    tone === "warn" ? "#9b3f21" : "var(--muted)";
}

function render() {
  const puzzle = currentPuzzle ?? {};

  syncPuzzleSelect();
  elements.puzzleDifficulty.textContent = puzzle.difficulty ?? "—";
  elements.puzzleTags.textContent = Array.isArray(puzzle.tags)
    ? puzzle.tags.join(", ")
    : "—";

  elements.opponentHealth.textContent = currentState.opponent?.health ?? 0;
  elements.playerMana.textContent = currentState.player?.mana ?? 0;

  const bossName = currentPuzzle.opponent?.name ?? "Boss";
  if (elements.bossName) {
    elements.bossName.textContent = bossName;
  }
  if (elements.bossArt) {
    elements.bossArt.src = BOSS_ART[bossName] ?? "./assets/boss/toad.png";
    elements.bossArt.alt = bossName;
  }

  const totalRoundsRaw = currentState.targetRounds ?? currentPuzzle.targetRounds;
  const totalRounds =
    typeof totalRoundsRaw === "number" ? totalRoundsRaw : Number(totalRoundsRaw);
  if (Number.isFinite(totalRounds)) {
    const roundsLeft = Math.max(
      Number(totalRounds) - (currentState.turn - 1),
      0
    );
    elements.roundsLeft.textContent =
      roundsLeft === 1 ? "Final round" : String(roundsLeft);
  } else {
    elements.roundsLeft.textContent = "—";
  }
  if (elements.manaPerRoundWrap) {
    const hideManaPerRound =
      Number.isFinite(totalRounds) && Number(totalRounds) <= 1;
    elements.manaPerRoundWrap.classList.toggle("hidden", hideManaPerRound);
  }

  const perRoundRaw =
    currentState.manaPerRound ?? currentPuzzle.manaPerRound ?? null;
  const perRound =
    typeof perRoundRaw === "number" ? perRoundRaw : Number(perRoundRaw);
  elements.manaPerRound.textContent =
    perRoundRaw === null || Number.isNaN(perRound) ? "—" : `+${perRound}`;

  cachedLegalActions = getLegalActions(currentState, cardLibrary);
  if (
    pendingAction &&
    !cachedLegalActions.some((action) => {
      if (pendingAction.type === "play") {
        return action.type === "play" && action.card === pendingAction.card;
      }
      return (
        action.type === pendingAction.type &&
        action.source === pendingAction.source
      );
    })
  ) {
    pendingAction = null;
  }

  const opponentSplit = splitBoardByType(currentState.opponent?.board ?? []);
  const playerSplit = splitBoardByType(currentState.player?.board ?? []);

  const pendingPlayTargets = getPendingPlayTargets();

  renderBoard(elements.opponentBoard, opponentSplit.creatures, "opponent", {
    pendingTargets: pendingPlayTargets,
  });
  renderBoard(elements.opponentEffects, opponentSplit.effects, "opponent", {
    emptyText: "No effects in play.",
  });
  if (elements.opponentEffectsSection) {
    elements.opponentEffectsSection.classList.toggle(
      "hidden",
      opponentSplit.effects.length === 0
    );
  }

  renderBoard(elements.playerBoard, playerSplit.creatures, "player", {
    pendingTargets: pendingPlayTargets,
  });
  renderBoard(elements.playerEffects, playerSplit.effects, "player", {
    emptyText: "No effects in play.",
  });
  if (elements.playerEffectsSection) {
    elements.playerEffectsSection.classList.toggle(
      "hidden",
      playerSplit.effects.length === 0
    );
  }
  renderHand(elements.playerHand, currentState.player?.hand ?? []);
  renderActions();
  renderLog();

  if (damageFlash.boss) {
    triggerBossFlash();
  }
  damageFlash = { creatures: new Set(), boss: false };

  const victoryBanner = document.getElementById("boss-victory");
  if (victoryBanner) {
    victoryBanner.classList.toggle("visible", isWin(currentState));
  }
  const failureBanner = document.getElementById("boss-failure");
  if (failureBanner) {
    failureBanner.classList.toggle(
      "visible",
      failureState && !isWin(currentState)
    );
  }

  updateBossTarget(pendingPlayTargets);
}

function isFinalRound(state) {
  const totalRoundsRaw = state.targetRounds ?? currentPuzzle.targetRounds;
  const totalRounds =
    typeof totalRoundsRaw === "number" ? totalRoundsRaw : Number(totalRoundsRaw);
  if (!Number.isFinite(totalRounds)) {
    return false;
  }
  return totalRounds - (state.turn - 1) === 1;
}

function getPendingPlayTargets() {
  if (!pendingAction || pendingAction.type !== "play") {
    return null;
  }
  const actions = cachedLegalActions.filter(
    (action) => action.type === "play" && action.card === pendingAction.card
  );
  const targetActions = actions.filter((action) => action.target);
  if (targetActions.length === 0) {
    return null;
  }
  const map = new Map();
  targetActions.forEach((action) => {
    if (action.target) {
      map.set(action.target, action);
    }
  });
  return map;
}

function updateBossTarget(pendingTargets) {
  const bossWrap = elements.bossArt?.closest(".boss-art");
  if (!bossWrap) {
    return;
  }
  const hasTarget = Boolean(pendingTargets?.has("opponent"));
  bossWrap.classList.toggle("targetable", hasTarget);
  const existing = bossWrap.querySelector(".target-icon");
  if (!hasTarget) {
    if (existing) {
      existing.remove();
    }
    bossWrap.onclick = null;
    return;
  }
  if (existing) {
    bossWrap.onclick = () => {
      const action = pendingTargets.get("opponent");
      if (action) {
        applyAndRender(action);
      }
    };
    return;
  }
  const action = pendingTargets.get("opponent");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "target-icon";
  button.title = "Cast on boss";
  button.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a1 1 0 0 1 1 1v2.1a6 6 0 0 1 5.9 5.9H21a1 1 0 1 1 0 2h-2.1a6 6 0 0 1-5.9 5.9V20a1 1 0 1 1-2 0v-2.1a6 6 0 0 1-5.9-5.9H3a1 1 0 1 1 0-2h2.1a6 6 0 0 1 5.9-5.9V4a1 1 0 0 1 1-1zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" fill="currentColor"/></svg>';
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    applyAndRender(action);
  });
  bossWrap.appendChild(button);
  bossWrap.onclick = () => {
    applyAndRender(action);
  };
}

function renderActions() {
  const list = elements.actionList;
  list.innerHTML = "";
  const visibleActions = cachedLegalActions.filter(
    (action) => action.type !== "end"
  );
  if (visibleActions.length === 0) {
    list.innerHTML = '<div class="placeholder">No legal actions.</div>';
    return;
  }
  visibleActions.forEach((action) => {
    const row = document.createElement("div");
    row.className = "action-item";

    const button = document.createElement("button");
    button.className = "btn ghost";
    button.textContent = "Apply";
    button.addEventListener("click", () => {
      applyAndRender(action);
    });

    const label = document.createElement("div");
    label.textContent = formatAction(action, currentState);

    row.appendChild(button);
    row.appendChild(label);
    list.appendChild(row);
  });
}

function renderLog() {
  const log = elements.actionLog;
  log.innerHTML = "";
  if (actions.length === 0) {
    log.innerHTML = '<div class="placeholder">No actions taken yet.</div>';
    return;
  }
  actions.forEach((action, index) => {
    const line = document.createElement("div");
    line.className = "log-line";
    line.textContent = `${index + 1}. ${formatAction(action, snapshots[index])}`;
    log.appendChild(line);
  });
}

function formatAction(action, state) {
  switch (action.type) {
    case "play":
      return `Play ${action.card}${action.target ? " -> " + describeRef(action.target, state) : ""}`;
    case "attack":
      return `Attack ${describeRef(action.source, state)} -> ${describeRef(action.target, state)}`;
    case "activate":
      return `Activate ${describeRef(action.source, state)} -> ${describeRef(action.target, state)}`;
    case "end":
      return "End round";
    default:
      return "Unknown action";
  }
}

function describeRef(ref, state) {
  if (!ref || typeof ref !== "string") {
    return "?";
  }
  if (ref === "opponent") {
    return "boss";
  }
  if (ref.startsWith("player:slot")) {
    const idx = Number.parseInt(ref.slice("player:slot".length), 10);
    const card = state.player.board[idx];
    return card ? `${card.card}` : ref;
  }
  if (ref.startsWith("opponent:slot")) {
    const idx = Number.parseInt(ref.slice("opponent:slot".length), 10);
    const card = state.opponent.board[idx];
    return card ? `${card.card}` : ref;
  }
  const player = state.player.board.find((m) => m.uid === ref || m.card === ref);
  if (player) {
    return player.card;
  }
  const enemy = state.opponent.board.find((m) => m.uid === ref || m.card === ref);
  if (enemy) {
    return enemy.card;
  }
  return ref;
}

function renderBoard(container, list, side, options = {}) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  if (!Array.isArray(list) || list.length === 0) {
    if (options.showEmpty !== false) {
      const emptyText = options.emptyText ?? "No creatures on board.";
      container.innerHTML = `<div class="placeholder">${emptyText}</div>`;
    }
    return;
  }

  list.forEach((entry, index) => {
    const unit = entry?.unit ?? entry;
    const boardIndex = entry?.index ?? index;
    const card = document.createElement("div");
    card.className = "card";
    if (unit.uid && damageFlash.creatures.has(unit.uid)) {
      card.classList.add("damage-flash");
    }

    const def = cardLibrary.byId?.[unit.card];
    if (def?.type) {
      card.classList.add(`type-${def.type}`);
    }
    const nameText = def?.name ?? unit.card ?? "unknown";
    const costText = def?.cost ?? "?";
    const powerValue = unit.power ?? def?.stats?.power ?? 0;
    const isCreature = def?.type === "creature";
    const hasSacrifice = def?.keywords?.includes("sacrifice") ?? false;
    const pendingTargets = options.pendingTargets ?? null;
    const uidRef = unit.uid ?? null;
    const sidePrefix = side === "player" ? "player" : "opponent";
    const slotRef = `${sidePrefix}:slot${boardIndex}`;
    const listRef = `${sidePrefix}:slot${index}`;
    const targetAction = pendingTargets
      ? pendingTargets.get(uidRef ?? "") ??
        pendingTargets.get(slotRef) ??
        pendingTargets.get(listRef)
      : null;

    const badges = document.createElement("div");
    badges.className = "card-badges";

    const powerBadge = document.createElement("div");
    powerBadge.className = `badge ${isCreature ? "power" : "spacer"}`;
    powerBadge.textContent = isCreature ? String(powerValue) : "";
    if (side === "opponent" && isCreature) {
      powerBadge.dataset.tooltip = "Boss creature power (damage and resilience).";
    }

    const manaBadge = document.createElement("div");
    manaBadge.className = "badge mana";
    manaBadge.textContent = String(costText);

    badges.appendChild(powerBadge);
    badges.appendChild(manaBadge);

    if (
      isCreature ||
      def?.type === "spell" ||
      def?.type === "effect" ||
      def?.type === "mod"
    ) {
      let artMap = CREATURE_ART;
      let fallback = def?.type === "creature" ? CREATURE_PLACEHOLDER : null;
      if (def?.type === "spell") {
        artMap = SPELL_ART;
        fallback = null;
      } else if (def?.type === "effect") {
        artMap = EFFECT_ART;
        fallback = EFFECT_PLACEHOLDER;
      } else if (def?.type === "mod") {
        artMap = MOD_ART;
        fallback = MOD_PLACEHOLDER;
      }
      const artSrc =
        artMap[def?.id ?? unit.card] ?? fallback;
      if (artSrc) {
        const artWrap = document.createElement("div");
        artWrap.className = "card-art";
        const artImg = document.createElement("img");
        artImg.src = artSrc;
        artImg.alt = `${nameText} art`;
        artWrap.appendChild(artImg);
        if (Array.isArray(unit.mods) && unit.mods.length > 0) {
          const modsWrap = document.createElement("div");
          modsWrap.className = "mod-icons";
          unit.mods.forEach((modId) => {
            const modDef = cardLibrary.byId?.[modId];
            const modIcon = document.createElement("span");
            modIcon.className = "mod-icon";
            modIcon.textContent = modDef?.name?.[0]?.toUpperCase() ?? "M";
            const desc = modDef ? formatCardDescription(modDef) : "";
            if (modDef?.name || desc) {
              modIcon.dataset.tooltip = `${modDef?.name ?? "Mod"}${desc ? `: ${desc}` : ""}`;
            }
            modsWrap.appendChild(modIcon);
          });
          artWrap.appendChild(modsWrap);
        }
        card.appendChild(artWrap);
      }
    }

    const name = document.createElement("div");
    name.className = "card-name-line";
    name.textContent = nameText;

    let desc = null;
    if (def?.type === "spell" || def?.type === "effect" || def?.type === "mod") {
      const descText = formatCardDescription(def);
      if (descText) {
        desc = document.createElement("div");
        desc.className = "card-desc";
        desc.textContent = descText;
      }
    }

    const keywords = document.createElement("div");
    keywords.className = "card-keywords";
    const tags = Array.isArray(unit.keywords) ? [...unit.keywords] : [];
    if (unit.tired) {
      tags.push("tired");
    }
    if (tags.length > 0) {
      tags.forEach((kw) => {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = kw;
        const tooltip = KEYWORD_TOOLTIPS[kw];
        if (tooltip) {
          tag.dataset.tooltip = tooltip;
        }
        keywords.appendChild(tag);
      });
    } else if (isCreature) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "vanilla";
      tag.dataset.tooltip = KEYWORD_TOOLTIPS.vanilla;
      keywords.appendChild(tag);
    }

    card.appendChild(badges);
    card.appendChild(name);
    if (desc) {
      card.appendChild(desc);
    }
    if (keywords.childElementCount > 0) {
      card.appendChild(keywords);
    }

    if (side === "player" && isCreature) {
      const sourceRef = unit.uid ?? `player:slot${boardIndex}`;
      const attackActions = cachedLegalActions.filter(
        (action) => action.type === "attack" && action.source === sourceRef
      );
      const activateActions = cachedLegalActions.filter(
        (action) => action.type === "activate" && action.source === sourceRef
      );

      if (attackActions.length > 0 || activateActions.length > 0 || hasSacrifice) {
        const actionsRow = document.createElement("div");
        actionsRow.className = "card-actions";

        const attackButton = document.createElement("button");
        attackButton.className = "attack-button";
        attackButton.title = "Attack";
        attackButton.disabled = attackActions.length === 0;
        attackButton.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.4 3.6l6 6-2.1 2.1-1.4-1.4-4.4 4.4 1.4 1.4-2.1 2.1-1.4-1.4-6 6-1.9-1.9 6-6-1.4-1.4 2.1-2.1 1.4 1.4 4.4-4.4-1.4-1.4 2.1-2.1z" fill="currentColor"/></svg>';
        attackButton.addEventListener("click", (event) => {
          event.stopPropagation();
          if (attackActions.length === 0) {
            setStatus("No legal attacks for that creature.", "warn");
            return;
          }
          if (attackActions.length === 1) {
            applyAndRender(attackActions[0]);
            return;
          }
          if (
            pendingAction &&
            pendingAction.type === "attack" &&
            pendingAction.source === sourceRef
          ) {
            pendingAction = null;
          } else {
            pendingAction = { type: "attack", source: sourceRef };
          }
          render();
        });

        actionsRow.appendChild(attackButton);

        if (hasSacrifice) {
          const sacrificeButton = document.createElement("button");
          sacrificeButton.className = "sacrifice-button";
          sacrificeButton.title = "Sacrifice";
          sacrificeButton.disabled = activateActions.length === 0;
          sacrificeButton.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c2.8 0 5 2.2 5 5 0 2-1.1 3.6-2.7 4.4.3.7.7 1.6.7 2.6 0 2.8-1.9 5-3 6-1.1-1-3-3.2-3-6 0-1 .4-1.9.7-2.6C8.1 10.6 7 9 7 7c0-2.8 2.2-5 5-5zm-2.2 6.2c.7 0 1.3-.6 1.3-1.3S10.5 5.6 9.8 5.6s-1.3.6-1.3 1.3.6 1.3 1.3 1.3zm4.4 0c.7 0 1.3-.6 1.3-1.3s-.6-1.3-1.3-1.3-1.3.6-1.3 1.3.6 1.3 1.3 1.3z" fill="currentColor"/></svg>';
          sacrificeButton.addEventListener("click", (event) => {
            event.stopPropagation();
            if (activateActions.length === 0) {
              setStatus("No sacrifice targets for that creature.", "warn");
              return;
            }
            if (activateActions.length === 1) {
              applyAndRender(activateActions[0]);
              return;
            }
            if (
              pendingAction &&
              pendingAction.type === "activate" &&
              pendingAction.source === sourceRef
            ) {
              pendingAction = null;
            } else {
              pendingAction = { type: "activate", source: sourceRef };
            }
            render();
          });

          actionsRow.appendChild(sacrificeButton);
        }
        card.appendChild(actionsRow);

        if (
          pendingAction &&
          pendingAction.source === sourceRef &&
          pendingAction.type === "attack" &&
          attackActions.length > 1
        ) {
          const targetsRow = document.createElement("div");
          targetsRow.className = "attack-targets";
          attackActions.forEach((action) => {
            const targetBtn = document.createElement("button");
            targetBtn.className = "target-button";
            targetBtn.textContent = describeRef(action.target, currentState);
            targetBtn.addEventListener("click", (event) => {
              event.stopPropagation();
              applyAndRender(action);
            });
            targetsRow.appendChild(targetBtn);
          });
          card.appendChild(targetsRow);
        }

        if (
          pendingAction &&
          pendingAction.source === sourceRef &&
          pendingAction.type === "activate" &&
          activateActions.length > 1
        ) {
          const targetsRow = document.createElement("div");
          targetsRow.className = "attack-targets";
          activateActions.forEach((action) => {
            const targetBtn = document.createElement("button");
            targetBtn.className = "target-button";
            targetBtn.textContent = describeRef(action.target, currentState);
            targetBtn.addEventListener("click", (event) => {
              event.stopPropagation();
              applyAndRender(action);
            });
            targetsRow.appendChild(targetBtn);
          });
          card.appendChild(targetsRow);
        }
      }
    }

    if (targetAction) {
      card.classList.add("targetable");
      const targetButton = document.createElement("button");
      targetButton.type = "button";
      targetButton.className = "target-icon";
      targetButton.title = "Cast here";
      targetButton.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a1 1 0 0 1 1 1v2.1a6 6 0 0 1 5.9 5.9H21a1 1 0 1 1 0 2h-2.1a6 6 0 0 1-5.9 5.9V20a1 1 0 1 1-2 0v-2.1a6 6 0 0 1-5.9-5.9H3a1 1 0 1 1 0-2h2.1a6 6 0 0 1 5.9-5.9V4a1 1 0 0 1 1-1zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" fill="currentColor"/></svg>';
      targetButton.addEventListener("click", (event) => {
        event.stopPropagation();
        applyAndRender(targetAction);
      });
      card.appendChild(targetButton);
      card.addEventListener("click", () => {
        applyAndRender(targetAction);
      });
    }

    container.appendChild(card);
  });
}

function splitBoardByType(list) {
  const creatures = [];
  const effects = [];
  (list ?? []).forEach((unit, index) => {
    const entry = { unit, index };
    const def = cardLibrary.byId?.[unit.card];
    if (def?.type === "effect") {
      effects.push(entry);
      return;
    }
    creatures.push(entry);
  });
  return { creatures, effects };
}

function renderHand(container, hand) {
  container.innerHTML = "";
  if (!Array.isArray(hand) || hand.length === 0) {
    container.innerHTML = '<div class="placeholder">Hand is empty.</div>';
    return;
  }

  hand.forEach((cardId) => {
    const chip = document.createElement("button");
    chip.className = "hand-card";
    chip.dataset.cardId = cardId;
    const def = cardLibrary.byId?.[cardId];
    if (def?.type) {
      chip.classList.add(`type-${def.type}`);
    }
    const name = def?.name ?? cardId;
    const cost = def?.cost ?? "?";
    const power = def?.stats?.power ?? null;

    if (
      def?.type === "creature" ||
      def?.type === "spell" ||
      def?.type === "effect" ||
      def?.type === "mod"
    ) {
      let artMap = CREATURE_ART;
      let fallback = def?.type === "creature" ? CREATURE_PLACEHOLDER : null;
      if (def?.type === "spell") {
        artMap = SPELL_ART;
        fallback = null;
      } else if (def?.type === "effect") {
        artMap = EFFECT_ART;
        fallback = EFFECT_PLACEHOLDER;
      } else if (def?.type === "mod") {
        artMap = MOD_ART;
        fallback = MOD_PLACEHOLDER;
      }
      const artSrc =
        artMap[def?.id ?? cardId] ?? fallback;
      if (artSrc) {
        const artWrap = document.createElement("div");
        artWrap.className = "hand-art";
        const artImg = document.createElement("img");
        artImg.src = artSrc;
        artImg.alt = `${name} art`;
        artWrap.appendChild(artImg);
        chip.appendChild(artWrap);
      }
    }

    const topRow = document.createElement("div");
    topRow.className = "hand-card-top";

    const powerEl = document.createElement("span");
    powerEl.className = `hand-badge ${def?.type === "creature" ? "power" : "spacer"}`;
    powerEl.textContent = def?.type === "creature" ? String(power ?? 0) : "";

    const costEl = document.createElement("span");
    costEl.className = "hand-badge mana";
    costEl.textContent = String(cost);

    topRow.appendChild(powerEl);
    topRow.appendChild(costEl);

    const nameEl = document.createElement("span");
    nameEl.className = "hand-name";
    nameEl.textContent = name;

    chip.appendChild(topRow);
    chip.appendChild(nameEl);

    if (def?.type === "spell" || def?.type === "effect" || def?.type === "mod") {
      const descText = formatCardDescription(def);
      if (descText) {
        const descEl = document.createElement("div");
        descEl.className = "hand-desc";
        descEl.textContent = descText;
        chip.appendChild(descEl);
      }
    }

    if (def?.type === "creature" && Array.isArray(def.keywords) && def.keywords.length > 0) {
      const keywords = document.createElement("div");
      keywords.className = "hand-keywords";
      def.keywords.forEach((kw) => {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = kw;
        const tooltip = KEYWORD_TOOLTIPS[kw];
        if (tooltip) {
          tag.dataset.tooltip = tooltip;
        }
        keywords.appendChild(tag);
      });
      chip.appendChild(keywords);
    }

    const playActions = cachedLegalActions.filter(
      (action) => action.type === "play" && action.card === cardId
    );
    chip.disabled = playActions.length === 0;
    chip.addEventListener("click", () => {
      if (playActions.length === 0) {
        setStatus(`Cannot play ${cardId} right now.`, "warn");
        return;
      }
      const targetedActions = playActions.filter((action) => action.target);
      if (targetedActions.length <= 1) {
        applyAndRender(targetedActions[0] ?? playActions[0]);
        return;
      }
      if (
        pendingAction &&
        pendingAction.type === "play" &&
        pendingAction.card === cardId
      ) {
        pendingAction = null;
      } else {
        pendingAction = { type: "play", card: cardId };
      }
      render();
    });
    container.appendChild(chip);
  });
}

function computeDamageFlash(prev, next) {
  const creatures = new Set();
  const prevMap = collectPowerMap(prev);
  const nextMap = collectPowerMap(next);

  nextMap.forEach((power, uid) => {
    const prevPower = prevMap.get(uid);
    if (prevPower !== undefined && power < prevPower) {
      creatures.add(uid);
    }
  });

  const boss = next.opponent.health < prev.opponent.health;
  return { creatures, boss };
}

function collectPowerMap(state) {
  const map = new Map();
  state.player.board.forEach((unit) => {
    if (unit.uid) {
      map.set(unit.uid, unit.power);
    }
  });
  state.opponent.board.forEach((unit) => {
    if (unit.uid) {
      map.set(unit.uid, unit.power);
    }
  });
  return map;
}

function triggerBossFlash() {
  const badge = elements.opponentHealth.closest(".boss-stat");
  if (!badge) {
    return;
  }
  badge.classList.remove("boss-flash");
  void badge.offsetWidth;
  badge.classList.add("boss-flash");
}

function formatCardDescription(def) {
  if (!def?.effects || def.effects.length === 0) {
    return "";
  }
  const parts = [];
  def.effects.forEach((effect) => {
    if (effect.type === "damage") {
      const chain = effect.chain_amount ? ` (Chain ${effect.chain_amount})` : "";
      parts.push(`Deal ${effect.amount} dmg${chain}`);
      return;
    }
    if (effect.type === "buff") {
      parts.push(`Give +${effect.amount} power`);
      return;
    }
    if (effect.type === "aura") {
      if (effect.stat === "power" && effect.applies_to === "attack") {
        parts.push(`Your creatures get +${effect.amount} power on attack`);
      } else {
        parts.push(`Aura: +${effect.amount} ${effect.stat}`);
      }
      return;
    }
    if (effect.type === "grant_keyword") {
      parts.push(`Grant ${formatKeyword(effect.keyword)}`);
    }
  });
  return parts.join("; ");
}

function formatKeyword(keyword) {
  if (!keyword) {
    return "";
  }
  return `${keyword.charAt(0).toUpperCase()}${keyword.slice(1)}`;
}

initTooltips();
loadCardLibrary().then(() => {
  populatePuzzleSelect();
  elements.genSeedRandom.checked = true;
  elements.genSeed.disabled = true;
  render();
});
