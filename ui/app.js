import {
  applyAction,
  buildCardLibrary,
  getLegalActions,
  isWin,
  normalizeState,
} from "./engine.js";
import { initTooltips } from "./tooltip.js";
import { KEYWORD_TOOLTIPS, formatKeyword } from "./keywords.js";

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
      id: "testudo_rune",
      name: "Testudo Rune",
      type: "mod",
      cost: 1,
      effects: [{ type: "grant_keyword", keyword: "testudo" }],
    },
    {
      id: "wooden_shield",
      name: "Wooden Shield",
      type: "mod",
      cost: 1,
      effects: [
        { type: "buff", stat: "power", amount: -1 },
        { type: "shield", amount: 1 },
      ],
    },
    {
      id: "requiem_rune",
      name: "Requiem Rune",
      type: "mod",
      cost: 1,
      effects: [{ type: "death_damage_boss", amount: 2 }],
    },
    {
      id: "flank_rune",
      name: "Flank Rune",
      type: "mod",
      cost: 2,
      effects: [{ type: "end_adjacent_buff", stat: "power", amount: 1 }],
    },
    {
      id: "war_banner",
      name: "War Banner",
      type: "effect",
      cost: 2,
      effects: [{ type: "aura", stat: "power", amount: 1, applies_to: "attack" }],
    },
    {
      id: "vigil_banner",
      name: "Vigil Banner",
      type: "effect",
      cost: 2,
      effects: [{ type: "end_buff", stat: "power", amount: 1, applies_to: "untired" }],
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
      id: "behemoth",
      name: "Behemoth",
      type: "creature",
      cost: 9,
      stats: { power: 11 },
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
      id: "blightwave",
      name: "Blightwave",
      type: "spell",
      cost: 3,
      effects: [{ type: "damage_all", amount: 2 }],
    },
    {
      id: "toxic_mist",
      name: "Toxic Mist",
      type: "spell",
      cost: 2,
      effects: [{ type: "grant_keyword_allies", keyword: "venom" }],
    },
    {
      id: "iron_golem",
      name: "Iron Golem",
      type: "creature",
      cost: 2,
      stats: { power: 3 },
      keywords: ["guard"],
    },
    {
      id: "spider",
      name: "Spider",
      type: "creature",
      cost: 2,
      stats: { power: 2 },
      keywords: ["venom"],
    },
    {
      id: "gravewatcher",
      name: "Gravewatcher",
      type: "creature",
      cost: 2,
      stats: { power: 1 },
      keywords: ["scavenger"],
    },
    {
      id: "emberling",
      name: "Emberling",
      type: "creature",
      cost: 2,
      stats: { power: 1 },
      keywords: ["rebirth"],
    },
    {
      id: "relay_spearman",
      name: "Relay Spearman",
      type: "creature",
      cost: 2,
      stats: { power: 2 },
      keywords: ["relay"],
    },
    {
      id: "line_captain",
      name: "Line Captain",
      type: "creature",
      cost: 2,
      stats: { power: 5 },
      keywords: ["order"],
      effects: [{ type: "requires_ready_ally" }, { type: "play_tire_allies" }],
    },
    {
      id: "drowsy_squire",
      name: "Drowsy Squire",
      type: "creature",
      cost: 1,
      stats: { power: 2 },
      keywords: ["sleepy"],
      effects: [{ type: "enter_tired" }],
    },
    {
      id: "broodmother",
      name: "Broodmother",
      type: "creature",
      cost: 3,
      stats: { power: 3 },
      keywords: ["brood"],
    },
    {
      id: "broodling",
      name: "Broodling",
      type: "creature",
      cost: 0,
      stats: { power: 1 },
      keywords: [],
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
    hand: [
      "cultist",
      "lancer",
      "broodmother",
      "flank_rune",
      "relay_spearman",
      "behemoth",
    ],
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
  playboard: document.getElementById("playboard"),
  opponentHealth: document.getElementById("opponent-health"),
  opponentPoison: document.getElementById("opponent-poison"),
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
  solveWinsMax: document.getElementById("solve-wins-max"),
  solveRun: document.getElementById("solve-run"),
  solveStop: document.getElementById("solve-stop"),
  solveWins: document.getElementById("solve-wins"),
  solveVisited: document.getElementById("solve-visited"),
  solveExpanded: document.getElementById("solve-expanded"),
  solveNote: document.getElementById("solve-note"),
  solveResults: document.getElementById("solve-results"),
  editMode: document.getElementById("edit-mode"),
  editClear: document.getElementById("edit-clear"),
  editCardList: document.getElementById("edit-card-list"),
  roundsLeft: document.getElementById("rounds-left"),
  manaPerRoundWrap: document.getElementById("mana-per-round-wrap"),
  manaPerRound: document.getElementById("mana-per-round"),
  endRound: document.getElementById("end-round"),
  panel: document.getElementById("puzzle-panel"),
  panelToggle: document.getElementById("panel-toggle"),
  genSeed: document.getElementById("gen-seed"),
  genSeedRandom: document.getElementById("gen-seed-random"),
  genHand: document.getElementById("gen-hand"),
  genMana: document.getElementById("gen-mana"),
  genDecoys: document.getElementById("gen-decoys"),
  genRounds: document.getElementById("gen-rounds"),
  genManaRound: document.getElementById("gen-mana-round"),
  genBossMin: document.getElementById("gen-boss-min"),
  genBossMax: document.getElementById("gen-boss-max"),
  genMaxSolutions: document.getElementById("gen-max-solutions"),
  genActionBudget: document.getElementById("gen-action-budget"),
  genSolverBudget: document.getElementById("gen-solver-budget"),
  genRun: document.getElementById("gen-run"),
  genStop: document.getElementById("gen-stop"),
  genAttempts: document.getElementById("gen-attempts"),
  genNote: document.getElementById("gen-note"),
  genAttemptLine: document.getElementById("gen-attempt-line"),
  genReject: document.getElementById("gen-reject"),
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
  vigil_banner: "./assets/effects/placeholder.jpg",
};

const EFFECT_PLACEHOLDER = "./assets/effects/placeholder.jpg";

const MOD_ART = {
  piercing_rune: "./assets/mods/placeholder.jpg",
  testudo_rune: "./assets/mods/placeholder.jpg",
  wooden_shield: "./assets/mods/placeholder.jpg",
  requiem_rune: "./assets/mods/placeholder.jpg",
  flank_rune: "./assets/mods/placeholder.jpg",
};

const MOD_PLACEHOLDER = "./assets/mods/placeholder.jpg";

const SPELL_ART = {
  fireball: "./assets/spells/fireball.jpg",
  spark: "./assets/spells/spark.jpg",
  blightwave: "./assets/spells/placeholder.jpg",
  toxic_mist: "./assets/spells/placeholder.jpg",
};

const SPELL_PLACEHOLDER = "./assets/spells/placeholder.jpg";

const GENERATOR_PREFS_KEY = "lockpick.generatorPrefs";
const GENERATOR_MAX_GHOST_ACTIONS = 200;
const GENERATOR_MAX_SOLVER_NODES = 75000;

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
let solverState = null;
let solverCancel = false;
let lastSolverResults = { wins: [], startState: null };
let generatorState = null;
let generatorCancel = false;
let generatorRunId = 0;

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
  stopGenerator();
  stopSolver();
  stopAutoplay();
  resetSolverResults();
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
  startGenerator();
});

elements.genStop?.addEventListener("click", () => {
  stopGenerator();
});

elements.solveRun.addEventListener("click", () => {
  startSolver();
});

elements.solveStop.addEventListener("click", () => {
  stopSolver();
});

elements.editMode?.addEventListener("change", () => {
  if (elements.editMode.checked) {
    pendingAction = null;
  }
  render();
});

elements.editClear?.addEventListener("click", () => {
  if (elements.editMode && !elements.editMode.checked) {
    elements.editMode.checked = true;
  }
  currentState.player.hand = [];
  currentState.player.board = [];
  currentState.player.mana = 5;
  currentState.opponent.board = [];
  currentState.opponent.health = 12;
  currentState.opponent.poison = 0;
  currentState.manaPerRound = 2;
  currentState.targetRounds = 1;
  currentState.turn = 1;
  currentState.chainCount = 0;
  commitEdit();
  render();
  setStatus("Puzzle cleared.");
});

elements.roundsLeft?.addEventListener("click", () => {
  if (!isEditMode()) {
    return;
  }
  const totalRoundsRaw = currentState.targetRounds ?? currentPuzzle.targetRounds;
  const totalRounds =
    typeof totalRoundsRaw === "number" ? totalRoundsRaw : Number(totalRoundsRaw);
  const currentLeft = Number.isFinite(totalRounds)
    ? Math.max(Number(totalRounds) - (currentState.turn - 1), 1)
    : 1;
  const nextLeft = promptNumber("Rounds left", currentLeft, 1, 12);
  if (nextLeft === null) {
    return;
  }
  const newTarget = Math.max(currentState.turn, nextLeft + (currentState.turn - 1));
  currentState.targetRounds = newTarget;
  commitEdit();
  render();
});

elements.opponentHealth?.addEventListener("click", () => {
  if (!isEditMode()) {
    return;
  }
  const nextHealth = promptNumber(
    "Boss health",
    currentState.opponent?.health ?? 0,
    0,
    999
  );
  if (nextHealth === null) {
    return;
  }
  currentState.opponent.health = nextHealth;
  commitEdit();
  render();
});

elements.playerMana?.addEventListener("click", () => {
  if (!isEditMode()) {
    return;
  }
  const nextMana = promptNumber(
    "Player mana",
    currentState.player?.mana ?? 0,
    0,
    999
  );
  if (nextMana === null) {
    return;
  }
  currentState.player.mana = nextMana;
  commitEdit();
  render();
});

elements.manaPerRound?.addEventListener("click", () => {
  if (!isEditMode()) {
    return;
  }
  const nextMana = promptNumber(
    "Mana per round",
    currentState.manaPerRound ?? 0,
    0,
    99
  );
  if (nextMana === null) {
    return;
  }
  currentState.manaPerRound = nextMana;
  commitEdit();
  render();
});

document.addEventListener("pointerdown", (event) => {
  if (!pendingAction) {
    return;
  }
  const target = event.target;
  if (target?.closest?.(".target-icon")) {
    return;
  }
  if (target?.closest?.(".targetable")) {
    return;
  }
  if (target?.closest?.(".target-button")) {
    return;
  }
  if (target?.closest?.(".attack-button")) {
    return;
  }
  if (pendingAction.type === "play") {
    const handCard = target?.closest?.(".hand-card");
    if (handCard && handCard.dataset.cardId === pendingAction.card) {
      return;
    }
  }
  pendingAction = null;
  render();
});

elements.genSeedRandom.addEventListener("change", () => {
  updateGeneratorSeedInput();
  saveGeneratorPrefs();
});

[
  elements.genSeed,
  elements.genHand,
  elements.genMana,
  elements.genDecoys,
  elements.genRounds,
  elements.genManaRound,
  elements.genBossMin,
  elements.genBossMax,
  elements.genMaxSolutions,
  elements.genActionBudget,
  elements.genSolverBudget,
].forEach((input) => {
  if (!input) {
    return;
  }
  input.addEventListener("input", () => {
    saveGeneratorPrefs();
  });
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

function startGenerator() {
  if (generatorState) {
    stopGenerator();
  }
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
  saveGeneratorPrefs();
  const handSize = parseNumber(elements.genHand.value, 4, 1, 8);
  const manaCap = parseNumber(elements.genMana.value, 10, 1, 20);
  const decoys = parseNumber(elements.genDecoys.value, 0, 0, 6);
  const targetRounds = parseNumber(elements.genRounds.value, 1, 1, 6);
  const manaPerRound = parseNumber(elements.genManaRound.value, 0, 0, 10);
  const bossMin = parseNumber(elements.genBossMin?.value ?? 0, 0, 0, 6);
  const bossMax = parseNumber(elements.genBossMax?.value ?? 0, 0, 0, 6);
  const actionBudget = parseNumber(
    elements.genActionBudget?.value ?? GENERATOR_MAX_GHOST_ACTIONS,
    GENERATOR_MAX_GHOST_ACTIONS,
    25,
    1000
  );
  const solverBudgetRaw = parseNumber(
    elements.genSolverBudget?.value ?? GENERATOR_MAX_SOLVER_NODES,
    GENERATOR_MAX_SOLVER_NODES,
    0,
    500000
  );
  const solverBudget =
    solverBudgetRaw === 0 ? Number.POSITIVE_INFINITY : solverBudgetRaw;
  const bossMinClamped = Math.max(0, bossMin);
  const bossMaxClamped = Math.max(bossMax, bossMinClamped);
  const maxSolutionsValue = Number(elements.genMaxSolutions?.value ?? 1);
  const maxSolutions = Number.isFinite(maxSolutionsValue) ? maxSolutionsValue : 1;
  const enforceSolutionCap = maxSolutions > 0;
  const enforceEarlyWin = targetRounds > 1;
  const solverStepsLabel =
    solverBudget === Number.POSITIVE_INFINITY ? "∞" : String(solverBudget);

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

  generatorCancel = false;
  generatorRunId += 1;
  const runId = generatorRunId;
  generatorState = {
    runId,
    seed,
    rng,
    handSize,
    manaCap,
    decoys,
    targetRounds,
    manaPerRound,
    bossMin: bossMinClamped,
    bossMax: bossMaxClamped,
    bossName,
    actionBudget,
    solverBudget,
    playable,
    creaturePool,
    maxSolutions,
    enforceSolutionCap,
    enforceEarlyWin,
    attempts: 0,
    solveState: null,
  };

  updateGeneratorUI({ running: true });
  setStatus("Generating puzzle…");
  setGeneratorNote(`Generating candidates… (solver: 0/${solverStepsLabel})`);
  setGeneratorAttemptLine("Latest attempt: —");
  setGeneratorReject("—");
  stepGenerator(runId);
}

function stopGenerator() {
  if (!generatorState) {
    return;
  }
  generatorCancel = true;
  finalizeGenerator(true);
}

function stepGenerator(runId = generatorState?.runId) {
  if (!generatorState || generatorState.runId !== runId) {
    return;
  }
  if (generatorCancel) {
    finalizeGenerator(true);
    return;
  }

  if (generatorState.solveState) {
    stepGeneratorSolve(runId);
    return;
  }

  let iterations = 0;
  while (iterations < 2) {
    if (generatorCancel) {
      finalizeGenerator(true);
      return;
    }
    setGeneratorNote("Generating candidates…");
    const attemptNumber = generatorState.attempts + 1;
    const puzzle = buildPuzzleAttempt(generatorState, attemptNumber);
    generatorState.attempts += 1;
    updateGeneratorUI({ running: true });
    if (!puzzle) {
      iterations += 1;
      continue;
    }
    const shouldSolve =
      generatorState.enforceSolutionCap || generatorState.enforceEarlyWin;
    if (!shouldSolve) {
      finalizeGenerator(false, puzzle, null);
      return;
    }
    startGeneratorSolve(puzzle);
    window.setTimeout(() => stepGeneratorSolve(runId), 0);
    return;
  }

  window.setTimeout(() => stepGenerator(runId), 0);
}

function buildPuzzleAttempt(state, attemptNumber) {
  const hand = pickHand(state.rng, state.playable, state.handSize);
  const handLabel = hand
    .map((cardId) => cardLibrary.byId[cardId]?.name ?? cardId)
    .join(", ");
  setGeneratorAttemptLine(
    `Attempt #${attemptNumber}: ${handLabel}`
  );
  const handTypes = new Set(
    hand
      .map((cardId) => cardLibrary.byId[cardId]?.type)
      .filter((type) => Boolean(type))
  );
  if (handTypes.size <= 1) {
    return null;
  }
  const bossBoard = buildBossBoard(
    state.rng,
    state.creaturePool,
    state.bossMin,
    state.bossMax
  );
  if (!bossBoard) {
    return null;
  }
  const startState = normalizeState({
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

  const ghost = ghostWalk(
    startState,
    state.rng,
    state.targetRounds,
    state.actionBudget
  );
  const actionCount = ghost.trace.length;
  const actionSuffix = ghost.aborted
    ? ` (actions: ${actionCount}, budget)`
    : ` (actions: ${actionCount})`;
  setGeneratorAttemptLine(
    `Attempt #${attemptNumber}: ${handLabel}${actionSuffix}`
  );
  if (ghost.aborted) {
    setGeneratorReject(
      `Rejected attempt #${attemptNumber} (action budget exceeded).`
    );
    return null;
  }
  if (ghost.trace.length === 0) {
    return null;
  }
  try {
    const base = materializeGhost(
      ghost,
      state.seed,
      state.targetRounds,
      state.manaPerRound
    );
    if (state.targetRounds > 1) {
      const baseCost = base.player.hand.reduce((sum, cardId) => {
        const def = cardLibrary.byId[cardId];
        return sum + (def?.cost ?? 0);
      }, 0);
      if (baseCost <= base.player.mana) {
        return null;
      }
    }
    const puzzle =
      state.decoys > 0
        ? addDecoys(base, state.rng, state.playable, state.decoys)
        : base;
    const handTypes = new Set(
      puzzle.player.hand
        .map((cardId) => cardLibrary.byId[cardId]?.type)
        .filter((type) => Boolean(type))
    );
    if (handTypes.size <= 1) {
      return null;
    }
    return puzzle;
  } catch {
    return null;
  }
}

function startGeneratorSolve(puzzle) {
  if (!generatorState) {
    return;
  }
  const startState = normalizeState({
    player: puzzle.player,
    opponent: puzzle.opponent,
    manaPerRound: puzzle.manaPerRound ?? 0,
    targetRounds: puzzle.targetRounds,
  });
  generatorState.solveState = {
    puzzle,
    startState,
    wins: 0,
    visited: 0,
    maxNodes: generatorState.solverBudget ?? GENERATOR_MAX_SOLVER_NODES,
    seen: new Map(),
    stack: [{ state: startState, depth: 0 }],
  };
  const attempt = generatorState.attempts;
  const nodeLimitLabel =
    generatorState.solveState.maxNodes === Number.POSITIVE_INFINITY
      ? "∞"
      : String(generatorState.solveState.maxNodes);
  setGeneratorNote(
    `Checking solutions for attempt #${attempt}… (0/${nodeLimitLabel})`
  );
}

function stepGeneratorSolve(runId = generatorState?.runId) {
  if (!generatorState?.solveState || generatorState.runId !== runId) {
    return;
  }
  const solver = generatorState.solveState;
  let iterations = 0;

  while (solver.stack.length > 0 && iterations < 250) {
    if (generatorCancel) {
      finalizeGenerator(true);
      return;
    }

    const node = solver.stack.pop();
    solver.visited += 1;
    if (
      solver.maxNodes !== Number.POSITIVE_INFINITY &&
      solver.visited >= solver.maxNodes
    ) {
      finalizeGenerator(
        false,
        solver.puzzle,
        solver.wins,
        `solver budget hit at ${solver.visited} steps`
      );
      return;
    }

    if (isWin(node.state)) {
      if (
        generatorState.enforceEarlyWin &&
        isEarlyWin(node.state, generatorState.targetRounds)
      ) {
        setGeneratorReject(
          `Rejected attempt #${generatorState.attempts} (early win).`
        );
        generatorState.solveState = null;
        window.setTimeout(() => stepGenerator(runId), 0);
        return;
      }
      solver.wins += 1;
      if (
        generatorState.enforceSolutionCap &&
        solver.wins > generatorState.maxSolutions
      ) {
        setGeneratorReject(
          `Rejected attempt #${generatorState.attempts} (${solver.wins} solutions).`
        );
        generatorState.solveState = null;
        window.setTimeout(() => stepGenerator(runId), 0);
        return;
      }
      iterations += 1;
      continue;
    }

    if (isPastRoundLimit(node.state)) {
      iterations += 1;
      continue;
    }

    if (node.depth >= solver.maxDepth) {
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

    const actions = getLegalActions(node.state, cardLibrary);
    for (let i = actions.length - 1; i >= 0; i -= 1) {
      const action = actions[i];
      if (action.type === "end" && isFinalRoundForSolver(node.state)) {
        continue;
      }
      try {
        const next = applyAction(node.state, action, cardLibrary);
        solver.stack.push({
          state: next,
          depth: node.depth + 1,
        });
      } catch {
        continue;
      }
    }

    iterations += 1;
  }

  if (solver.stack.length === 0) {
    if (
      solver.wins > 0 &&
      (!generatorState.enforceSolutionCap ||
        solver.wins <= generatorState.maxSolutions)
    ) {
      finalizeGenerator(false, solver.puzzle, solver.wins);
      return;
    }
    generatorState.solveState = null;
    window.setTimeout(() => stepGenerator(runId), 0);
    return;
  }

  const nodeLimitLabel =
    solver.maxNodes === Number.POSITIVE_INFINITY ? "∞" : String(solver.maxNodes);
  setGeneratorNote(
    `Checking solutions for attempt #${generatorState.attempts}… (${solver.visited}/${nodeLimitLabel})`
  );
  window.setTimeout(() => stepGeneratorSolve(runId), 0);
}

function finalizeGenerator(cancelled, puzzle, solutionsCount, noteSuffix) {
  if (!generatorState) {
    return;
  }
  const attempts = generatorState.attempts;
  updateGeneratorUI({ running: false });
  generatorState = null;
  generatorCancel = false;

  if (cancelled) {
    setGeneratorNote(
      `Generator stopped after ${attempts} attempt${attempts === 1 ? "" : "s"}.`
    );
    setStatus(`Generator stopped after ${attempts} attempt${attempts === 1 ? "" : "s"}.`, "warn");
    return;
  }

  if (!puzzle) {
    setGeneratorNote("Generator failed to produce a puzzle.");
    setStatus("Generator failed to produce a puzzle.", "warn");
    return;
  }

  currentPuzzle = puzzle;
  elements.puzzleJson.value = JSON.stringify(currentPuzzle, null, 2);
  resetState();
  const solutionLabel =
    solutionsCount === null || solutionsCount === undefined
      ? "solutions unchecked"
      : `${solutionsCount} solution${solutionsCount === 1 ? "" : "s"}`;
  const extraNote = noteSuffix ? ` (${noteSuffix})` : "";
  setGeneratorNote(
    `Generated ${puzzle.id} after ${attempts} attempt${attempts === 1 ? "" : "s"} (${solutionLabel})${extraNote}.`
  );
  setStatus(
    `Generated ${puzzle.id} after ${attempts} attempt${attempts === 1 ? "" : "s"} (${solutionLabel})${extraNote}.`
  );
}

function updateGeneratorUI(state) {
  if (elements.genAttempts) {
    elements.genAttempts.textContent = String(generatorState?.attempts ?? 0);
  }
  if (elements.genRun && elements.genStop) {
    const running = Boolean(state?.running);
    elements.genRun.disabled = running;
    elements.genStop.disabled = !running;
  }
}

loadGeneratorPrefs();

function setGeneratorNote(message) {
  if (!elements.genNote) {
    return;
  }
  elements.genNote.textContent = message;
}

function setGeneratorAttemptLine(message) {
  if (!elements.genAttemptLine) {
    return;
  }
  elements.genAttemptLine.textContent = message;
}

function setGeneratorReject(message) {
  if (!elements.genReject) {
    return;
  }
  elements.genReject.textContent = message;
}

function isEarlyWin(state, targetRounds) {
  const rounds =
    typeof targetRounds === "number"
      ? targetRounds
      : Number(targetRounds ?? 0);
  if (!Number.isFinite(rounds) || rounds <= 1) {
    return false;
  }
  return state.turn < rounds;
}


function estimateMaxDepth(state) {
  const roundsRaw = state.targetRounds;
  const rounds =
    typeof roundsRaw === "number" && Number.isFinite(roundsRaw)
      ? roundsRaw
      : Number(roundsRaw) || 1;
  const handSize = state.player?.hand?.length ?? 0;
  const baseBoardCount = state.player?.board?.length ?? 0;
  const maxCreatures = baseBoardCount + handSize;
  const plays = handSize;
  const attacks = maxCreatures * rounds;
  const activates = maxCreatures;
  const ends = Math.max(0, rounds - 1);
  return Math.max(1, plays + attacks + activates + ends);
}

function parseNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function isEditMode() {
  return Boolean(elements.editMode?.checked);
}

function promptNumber(label, currentValue, min, max) {
  const value = window.prompt(`${label}:`, String(currentValue ?? ""));
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    setStatus(`Invalid number for ${label}.`, "warn");
    return null;
  }
  const clamped = Math.min(max ?? parsed, Math.max(min ?? parsed, parsed));
  return clamped;
}

function commitEdit() {
  syncPuzzleFromState();
  const normalized = normalizeState(currentState);
  currentState = normalized;
  snapshots = [normalized];
  initialState = normalized;
  actions = [];
  solutionIndex = 0;
  pendingAction = null;
  failureState = false;
  stopAutoplay();
}

function syncPuzzleFromState() {
  if (!currentPuzzle) {
    return;
  }
  currentPuzzle.solution = [];
  currentPuzzle.player = {
    mana: currentState.player?.mana ?? 0,
    hand: [...(currentState.player?.hand ?? [])],
    board: (currentState.player?.board ?? []).map((unit) => {
      const entry = {
        card: unit.card,
        power: unit.power ?? 0,
        keywords: unit.keywords ? [...unit.keywords] : [],
        tired: Boolean(unit.tired),
      };
      if (Array.isArray(unit.mods) && unit.mods.length > 0) {
        entry.mods = [...unit.mods];
      }
      if (unit.poison && unit.poison > 0) {
        entry.poison = unit.poison;
      }
      if (unit.shield && unit.shield > 0) {
        entry.shield = unit.shield;
      }
      if (unit.rebirths && unit.rebirths > 0) {
        entry.rebirths = unit.rebirths;
      }
      return entry;
    }),
  };
  currentPuzzle.opponent = {
    name: currentPuzzle.opponent?.name ?? currentState.opponent?.name,
    health: currentState.opponent?.health ?? 0,
    board: (currentState.opponent?.board ?? []).map((unit) => {
      const entry = {
        card: unit.card,
        power: unit.power ?? 0,
        keywords: unit.keywords ? [...unit.keywords] : [],
        tired: Boolean(unit.tired),
      };
      if (Array.isArray(unit.mods) && unit.mods.length > 0) {
        entry.mods = [...unit.mods];
      }
      if (unit.poison && unit.poison > 0) {
        entry.poison = unit.poison;
      }
      if (unit.shield && unit.shield > 0) {
        entry.shield = unit.shield;
      }
      if (unit.rebirths && unit.rebirths > 0) {
        entry.rebirths = unit.rebirths;
      }
      return entry;
    }),
  };
  if (currentState.opponent?.poison && currentState.opponent.poison > 0) {
    currentPuzzle.opponent.poison = currentState.opponent.poison;
  } else {
    delete currentPuzzle.opponent.poison;
  }
  currentPuzzle.manaPerRound = currentState.manaPerRound ?? 0;
  currentPuzzle.targetRounds = currentState.targetRounds ?? currentPuzzle.targetRounds;
  elements.puzzleJson.value = JSON.stringify(currentPuzzle, null, 2);
}

function createInstanceFromCard(cardId, prefix) {
  const def = cardLibrary.byId?.[cardId];
  if (!def || def.type !== "creature") {
    return null;
  }
  const uid = `${prefix}${currentState.nextUid ?? 1}`;
  currentState.nextUid = (currentState.nextUid ?? 1) + 1;
  return {
    uid,
    card: cardId,
    power: def.stats?.power ?? 0,
    keywords: def.keywords ? [...def.keywords] : [],
    mods: [],
    tired: false,
    poison: 0,
    shield: 0,
    rebirths: 0,
  };
}

function renderEditCardList() {
  const container = elements.editCardList;
  if (!container) {
    return;
  }
  container.innerHTML = "";
  const cards = Object.values(cardLibrary.byId ?? {}).slice();
  cards.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
  if (cards.length === 0) {
    container.innerHTML = '<div class="placeholder">No cards loaded.</div>';
    return;
  }
  cards.forEach((card) => {
    const item = document.createElement("div");
    item.className = "edit-card-item";
    item.textContent = card.name ?? card.id;
    item.dataset.cardId = card.id;
    item.addEventListener("click", () => {
      if (!isEditMode()) {
        setStatus("Enable Edit Mode to modify the puzzle.", "warn");
        return;
      }
      currentState.player.hand.push(card.id);
      commitEdit();
      render();
    });
    item.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (!isEditMode()) {
        setStatus("Enable Edit Mode to modify the puzzle.", "warn");
        return;
      }
      if (card.type !== "creature") {
        setStatus("Only creatures can be added to the boss board.", "warn");
        return;
      }
      const instance = createInstanceFromCard(card.id, "o");
      if (!instance) {
        return;
      }
      currentState.opponent.board.push(instance);
      commitEdit();
      render();
    });
    container.appendChild(item);
  });
}

function updateGeneratorSeedInput() {
  if (!elements.genSeedRandom || !elements.genSeed) {
    return;
  }
  const useRandom = elements.genSeedRandom.checked;
  elements.genSeed.disabled = useRandom;
  if (useRandom) {
    elements.genSeed.value = "";
  }
}

function saveGeneratorPrefs() {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  const prefs = {
    seedRandom: elements.genSeedRandom?.checked ?? true,
    seed: elements.genSeed?.value ?? "",
    hand: elements.genHand?.value ?? "",
    mana: elements.genMana?.value ?? "",
    decoys: elements.genDecoys?.value ?? "",
    rounds: elements.genRounds?.value ?? "",
    manaRound: elements.genManaRound?.value ?? "",
    bossMin: elements.genBossMin?.value ?? "",
    bossMax: elements.genBossMax?.value ?? "",
    maxSolutions: elements.genMaxSolutions?.value ?? "",
    actionBudget: elements.genActionBudget?.value ?? "",
    solverBudget: elements.genSolverBudget?.value ?? "",
  };
  try {
    window.localStorage.setItem(GENERATOR_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors (e.g., quota or privacy mode).
  }
}

function loadGeneratorPrefs() {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  let prefs = null;
  try {
    const raw = window.localStorage.getItem(GENERATOR_PREFS_KEY);
    if (!raw) {
      return;
    }
    prefs = JSON.parse(raw);
  } catch {
    return;
  }
  if (!prefs || typeof prefs !== "object") {
    return;
  }
  if (elements.genSeedRandom && typeof prefs.seedRandom === "boolean") {
    elements.genSeedRandom.checked = prefs.seedRandom;
  }
  if (elements.genSeed && typeof prefs.seed === "string") {
    elements.genSeed.value = prefs.seed;
  }
  if (elements.genHand && typeof prefs.hand === "string") {
    elements.genHand.value = prefs.hand;
  }
  if (elements.genMana && typeof prefs.mana === "string") {
    elements.genMana.value = prefs.mana;
  }
  if (elements.genDecoys && typeof prefs.decoys === "string") {
    elements.genDecoys.value = prefs.decoys;
  }
  if (elements.genRounds && typeof prefs.rounds === "string") {
    elements.genRounds.value = prefs.rounds;
  }
  if (elements.genManaRound && typeof prefs.manaRound === "string") {
    elements.genManaRound.value = prefs.manaRound;
  }
  if (elements.genBossMin && typeof prefs.bossMin === "string") {
    elements.genBossMin.value = prefs.bossMin;
  }
  if (elements.genBossMax && typeof prefs.bossMax === "string") {
    elements.genBossMax.value = prefs.bossMax;
  }
  if (elements.genMaxSolutions && typeof prefs.maxSolutions === "string") {
    elements.genMaxSolutions.value = prefs.maxSolutions;
  }
  if (elements.genActionBudget && typeof prefs.actionBudget === "string") {
    elements.genActionBudget.value = prefs.actionBudget;
  }
  if (elements.genSolverBudget && typeof prefs.solverBudget === "string") {
    elements.genSolverBudget.value = prefs.solverBudget;
  }
  updateGeneratorSeedInput();
}

function pickHand(rng, pool, count) {
  const hand = [];
  for (let i = 0; i < count; i += 1) {
    const pick = rng.pick(pool);
    hand.push(pick.id);
  }
  return hand;
}

function buildBossBoard(rng, pool, minCount, maxCount) {
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

function ghostWalk(startState, rng, targetRounds, maxActions) {
  let current = structuredClone(startState);
  const trace = [];
  const roundsRaw = targetRounds ?? startState.targetRounds;
  const rounds =
    typeof roundsRaw === "number" && Number.isFinite(roundsRaw)
      ? roundsRaw
      : Number(roundsRaw) || 1;
  const seen = new Set();
  const actionLimit =
    Number.isFinite(maxActions) && maxActions > 0
      ? maxActions
      : GENERATOR_MAX_GHOST_ACTIONS;

  while (true) {
    const key = JSON.stringify(current);
    if (seen.has(key)) {
      break;
    }
    seen.add(key);

    const actions = getLegalActions(current, cardLibrary);
    const nonEnd = actions.filter((action) => action.type !== "end");
    const endActions = actions.filter((action) => action.type === "end");
    let allowed = [];

    if (rounds <= 1 || current.turn >= rounds) {
      allowed = nonEnd;
    } else if (nonEnd.length > 0) {
      allowed = nonEnd;
    } else {
      allowed = endActions;
    }

    if (allowed.length === 0) {
      break;
    }

    let options = [];
    for (const action of allowed) {
      try {
        const next = applyAction(current, action, cardLibrary);
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
      allowed !== endActions &&
      rounds > 1 &&
      current.turn < rounds &&
      endActions.length > 0
    ) {
      for (const action of endActions) {
        try {
          const next = applyAction(current, action, cardLibrary);
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
    if (trace.length >= actionLimit) {
      return { trace, startState, endState: current, aborted: true };
    }
  }

  return { trace, startState, endState: current };
}

function materializeGhost(ghost, seed, targetRounds, manaPerRound) {
  const usedCards = ghost.trace
    .filter((action) => action.type === "play")
    .map((action) => action.card);
  const manaSpent = usedCards.reduce((sum, cardId) => {
    const def = cardLibrary.byId[cardId];
    return sum + (def?.cost ?? 0);
  }, 0);
  const startingMana =
    ghost.startState?.player?.mana ?? manaSpent;
  const actionCount = ghost.trace.length;

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
    difficulty: actionCount >= 5 ? "hard" : actionCount >= 3 ? "medium" : "easy",
    seed,
    tags: Array.from(tags),
    targetRounds,
    manaPerRound,
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
  if (elements.playboard) {
    elements.playboard.classList.toggle("edit-mode", isEditMode());
  }
  elements.puzzleDifficulty.textContent = puzzle.difficulty ?? "—";
  elements.puzzleTags.textContent = Array.isArray(puzzle.tags)
    ? puzzle.tags.join(", ")
    : "—";

  elements.opponentHealth.textContent = currentState.opponent?.health ?? 0;
  if (elements.opponentPoison) {
    const poison = currentState.opponent?.poison ?? 0;
    if (poison > 0) {
      elements.opponentPoison.textContent = `Poison ${poison}`;
      elements.opponentPoison.classList.add("visible");
    } else {
      elements.opponentPoison.textContent = "";
      elements.opponentPoison.classList.remove("visible");
    }
  }
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

  const pendingTargets = getPendingTargets();

  renderBoard(elements.opponentBoard, opponentSplit.creatures, "opponent", {
    pendingTargets,
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
    pendingTargets,
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

  updateBossTarget(pendingTargets);
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

function isFinalRoundForSolver(state) {
  const totalRounds =
    typeof state.targetRounds === "number"
      ? state.targetRounds
      : Number(state.targetRounds);
  if (!Number.isFinite(totalRounds)) {
    return false;
  }
  return totalRounds - (state.turn - 1) === 1;
}

function isPastRoundLimit(state) {
  const totalRounds =
    typeof state.targetRounds === "number"
      ? state.targetRounds
      : Number(state.targetRounds);
  if (!Number.isFinite(totalRounds)) {
    return false;
  }
  return state.turn > totalRounds;
}

function startSolver() {
  if (solverState) {
    stopSolver();
  }
  const maxWinsRaw = parseNumber(elements.solveWinsMax?.value ?? 0, 0, 0, 50);
  const maxWins = maxWinsRaw === 0 ? Number.POSITIVE_INFINITY : maxWinsRaw;
  const maxDepth = estimateMaxDepth(currentState);

  solverCancel = false;
  pendingAction = null;
  render();

  const startState = structuredClone(currentState);
  solverState = {
    maxDepth,
    maxWins,
    wins: [],
    visited: 0,
    expanded: 0,
    seen: new Map(),
    startState,
    stack: [{ state: startState, depth: 0, path: [] }],
  };
  lastSolverResults = { wins: solverState.wins, startState };

  updateSolverUI({ running: true });
  stepSolver();
}

function stopSolver() {
  if (!solverState) {
    return;
  }
  solverCancel = true;
}

function stepSolver() {
  if (!solverState) {
    return;
  }
  const { maxDepth, maxWins, wins, seen, stack } = solverState;
  let iterations = 0;

  while (stack.length > 0 && iterations < 250) {
    if (solverCancel) {
      finalizeSolver(true);
      return;
    }

    const node = stack.pop();
    solverState.visited += 1;

    if (isWin(node.state)) {
      wins.push(node.path);
      if (wins.length >= maxWins) {
        finalizeSolver(false);
        return;
      }
      iterations += 1;
      continue;
    }

    if (isPastRoundLimit(node.state)) {
      iterations += 1;
      continue;
    }

    if (node.depth >= maxDepth) {
      iterations += 1;
      continue;
    }

    const key = JSON.stringify(node.state);
    const prevDepth = seen.get(key);
    if (prevDepth !== undefined && prevDepth <= node.depth) {
      iterations += 1;
      continue;
    }
    seen.set(key, node.depth);

    const actions = getLegalActions(node.state, cardLibrary);
    solverState.expanded += 1;

    for (let i = actions.length - 1; i >= 0; i -= 1) {
      const action = actions[i];
      if (action.type === "end" && isFinalRoundForSolver(node.state)) {
        continue;
      }
      try {
        const next = applyAction(node.state, action, cardLibrary);
        stack.push({
          state: next,
          depth: node.depth + 1,
          path: [...node.path, action],
        });
      } catch {
        continue;
      }
    }

    iterations += 1;
  }

  updateSolverUI({ running: true });

  if (stack.length === 0 || wins.length >= maxWins) {
    finalizeSolver(false);
    return;
  }

  window.setTimeout(stepSolver, 0);
}

function finalizeSolver(cancelled) {
  if (!solverState) {
    return;
  }
  lastSolverResults = {
    wins: solverState.wins,
    startState: solverState.startState ?? lastSolverResults.startState,
  };
  updateSolverUI({
    running: false,
    cancelled,
  });
  solverState = null;
  solverCancel = false;
}

function resetSolverResults() {
  lastSolverResults = { wins: [], startState: null };
  if (elements.solveWins) {
    elements.solveWins.textContent = "0";
  }
  if (elements.solveVisited) {
    elements.solveVisited.textContent = "0";
  }
  if (elements.solveExpanded) {
    elements.solveExpanded.textContent = "0";
  }
  if (elements.solveNote) {
    elements.solveNote.textContent = "Idle.";
  }
  renderSolverResults();
}

function updateSolverUI(state) {
  if (!elements.solveWins || !elements.solveVisited || !elements.solveExpanded) {
    return;
  }
  if (solverState) {
    lastSolverResults = {
      wins: solverState.wins,
      startState: solverState.startState ?? lastSolverResults.startState,
    };
  }
  const wins = solverState?.wins?.length ?? lastSolverResults.wins.length ?? 0;
  const visited = solverState?.visited ?? 0;
  const expanded = solverState?.expanded ?? 0;

  elements.solveWins.textContent = String(wins);
  elements.solveVisited.textContent = String(visited);
  elements.solveExpanded.textContent = String(expanded);

  if (elements.solveRun && elements.solveStop) {
    const running = Boolean(state?.running);
    elements.solveRun.disabled = running;
    elements.solveStop.disabled = !running;
  }
  if (elements.solveNote) {
    if (state?.running) {
      elements.solveNote.textContent = "Solving from current state…";
    } else if (state?.cancelled) {
      elements.solveNote.textContent = "Solver stopped.";
    } else {
      elements.solveNote.textContent = `Solver complete. ${wins} solution${
        wins === 1 ? "" : "s"
      } found.`;
    }
  }
  renderSolverResults();
}

function renderSolverResults() {
  const container = elements.solveResults;
  if (!container) {
    return;
  }
  const wins = solverState?.wins ?? lastSolverResults.wins;
  const startState = solverState?.startState ?? lastSolverResults.startState;
  const displayLimit = 10;
  const totalWins = wins?.length ?? 0;
  container.innerHTML = "";
  if (!wins || wins.length === 0 || !startState) {
    container.innerHTML = '<div class="placeholder">No solutions yet.</div>';
    return;
  }
  wins.slice(0, displayLimit).forEach((path, index) => {
    const card = document.createElement("div");
    card.className = "solver-solution";

    const title = document.createElement("div");
    title.className = "solver-solution-title";
    title.textContent = `Solution ${index + 1} · ${path.length} step${
      path.length === 1 ? "" : "s"
    }`;

    const list = document.createElement("ol");
    list.className = "solver-solution-steps";
    let cursor = structuredClone(startState);
    path.forEach((action) => {
      const item = document.createElement("li");
      let label = "Unknown action";
      try {
        label = formatAction(action, cursor);
        cursor = applyAction(cursor, action, cardLibrary);
      } catch {
        label = formatAction(action, cursor);
      }
      item.textContent = label;
      list.appendChild(item);
    });

    card.appendChild(title);
    card.appendChild(list);
    container.appendChild(card);
  });

  if (totalWins > displayLimit) {
    const note = document.createElement("div");
    note.className = "solver-solution-note";
    note.textContent = `Showing ${displayLimit} of ${totalWins} solutions.`;
    container.appendChild(note);
  }
}

function getPendingTargets() {
  if (!pendingAction) {
    return null;
  }
  let actions = [];
  if (pendingAction.type === "play") {
    actions = cachedLegalActions.filter(
      (action) => action.type === "play" && action.card === pendingAction.card
    );
  } else if (pendingAction.type === "attack") {
    actions = cachedLegalActions.filter(
      (action) =>
        action.type === "attack" && action.source === pendingAction.source
    );
  } else {
    return null;
  }
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
  const action = hasTarget ? pendingTargets.get("opponent") : null;
  if (!hasTarget) {
    if (existing) {
      existing.remove();
    }
    bossWrap.onclick = null;
    return;
  }
  if (existing) {
    existing.title = action?.type === "attack" ? "Attack boss" : "Cast on boss";
    bossWrap.onclick = () => {
      const action = pendingTargets.get("opponent");
      if (action) {
        applyAndRender(action);
      }
    };
    return;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "target-icon";
  button.title = action?.type === "attack" ? "Attack boss" : "Cast on boss";
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
        fallback = SPELL_PLACEHOLDER;
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
    }
    if (unit.poison && unit.poison > 0) {
      const poisonTag = document.createElement("span");
      poisonTag.className = "tag";
      poisonTag.textContent = `poison ${unit.poison}`;
      poisonTag.dataset.tooltip = KEYWORD_TOOLTIPS.poison;
      keywords.appendChild(poisonTag);
    }

    card.appendChild(badges);
    card.appendChild(name);
    if (desc) {
      card.appendChild(desc);
    }
    if (keywords.childElementCount > 0) {
      card.appendChild(keywords);
    }

    if (isEditMode()) {
      card.classList.add("edit-removable");
      card.addEventListener("click", (event) => {
        event.stopPropagation();
        if (side === "player") {
          currentState.player.board.splice(boardIndex, 1);
        } else {
          currentState.opponent.board.splice(boardIndex, 1);
        }
        pendingAction = null;
        commitEdit();
        render();
      });
      container.appendChild(card);
      return;
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
          const enemyCreatureCount = currentState.opponent.board.filter(
            (enemy) => cardLibrary.byId?.[enemy.card]?.type === "creature"
          ).length;
          if (attackActions.length === 1 && enemyCreatureCount <= 1) {
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
      targetButton.title = targetAction.type === "attack" ? "Attack here" : "Cast here";
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

  hand.forEach((cardId, handIndex) => {
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
        fallback = SPELL_PLACEHOLDER;
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
    chip.disabled = isEditMode() ? false : playActions.length === 0;
    chip.addEventListener("click", () => {
      if (isEditMode()) {
        currentState.player.hand.splice(handIndex, 1);
        pendingAction = null;
        commitEdit();
        render();
        return;
      }
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

  const bossArtWrap = elements.bossArt?.closest(".boss-art");
  if (bossArtWrap) {
    bossArtWrap.classList.remove("boss-flash");
    void bossArtWrap.offsetWidth;
    bossArtWrap.classList.add("boss-flash");
  }
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
    if (effect.type === "damage_all") {
      parts.push(`Deal ${effect.amount} dmg to all creatures`);
      return;
    }
    if (effect.type === "grant_keyword_allies") {
      parts.push(`Give your creatures ${formatKeyword(effect.keyword)}`);
      return;
    }
    if (effect.type === "poison_allies") {
      parts.push(`Give your creatures ${effect.amount} poison`);
      return;
    }
    if (effect.type === "death_damage_boss") {
      parts.push(`On death: deal ${effect.amount} dmg to boss`);
      return;
    }
    if (effect.type === "buff") {
      if (effect.amount < 0) {
        parts.push(`Lose ${Math.abs(effect.amount)} power`);
      } else {
        parts.push(`Give +${effect.amount} power`);
      }
      return;
    }
    if (effect.type === "shield") {
      parts.push(`Shield ${effect.amount} (blocks next damage)`);
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
    if (effect.type === "end_buff") {
      if (effect.stat === "power" && effect.applies_to === "untired") {
        parts.push(`End of round: untired creatures gain +${effect.amount} power`);
      } else {
        parts.push(`End of round: +${effect.amount} ${effect.stat}`);
      }
      return;
    }
    if (effect.type === "end_adjacent_buff") {
      parts.push(`End of round: adjacent allies gain +${effect.amount} power`);
      return;
    }
    if (effect.type === "grant_keyword") {
      parts.push(`Grant ${formatKeyword(effect.keyword)}`);
    }
  });
  return parts.join("; ");
}

initTooltips();
loadCardLibrary().then(() => {
  populatePuzzleSelect();
  elements.genSeedRandom.checked = true;
  elements.genSeed.disabled = true;
  renderEditCardList();
  render();
});
