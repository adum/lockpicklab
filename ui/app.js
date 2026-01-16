import {
  applyAction,
  buildCardLibrary,
  getLegalActions,
  isWin,
  normalizeState,
} from "./engine.js";

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
      keywords: ["pierce", "rush"],
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
  tags: ["guard", "pierce", "sacrifice"],
  player: {
    mana: 5,
    hand: ["cultist", "lancer", "fireball", "spark"],
    board: [],
  },
  opponent: {
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

const elements = {
  puzzleId: document.getElementById("puzzle-id"),
  puzzleDifficulty: document.getElementById("puzzle-difficulty"),
  puzzleTags: document.getElementById("puzzle-tags"),
  opponentHealth: document.getElementById("opponent-health"),
  playerMana: document.getElementById("player-mana"),
  opponentBoard: document.getElementById("opponent-board"),
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
};

let cardLibrary = buildCardLibrary(fallbackCards);
let currentPuzzle = structuredClone(defaultPuzzle);
let initialState = normalizeState({
  player: currentPuzzle.player,
  opponent: currentPuzzle.opponent,
});
let currentState = initialState;
let snapshots = [initialState];
let actions = [];
let solutionIndex = 0;
let autoplayTimer = null;
let cachedLegalActions = [];

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
  });
  currentState = initialState;
  snapshots = [initialState];
  actions = [];
  solutionIndex = 0;
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
  stopAutoplay();
  render();
});

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
    const next = applyAction(currentState, action, cardLibrary);
    currentState = next;
    snapshots.push(next);
    actions.push(action);
    if (isSolutionStep) {
      solutionIndex += 1;
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

  elements.puzzleId.textContent = puzzle.id ?? "—";
  elements.puzzleDifficulty.textContent = puzzle.difficulty ?? "—";
  elements.puzzleTags.textContent = Array.isArray(puzzle.tags)
    ? puzzle.tags.join(", ")
    : "—";

  elements.opponentHealth.textContent = currentState.opponent?.health ?? 0;
  elements.playerMana.textContent = currentState.player?.mana ?? 0;

  renderBoard(elements.opponentBoard, currentState.opponent?.board ?? []);
  renderBoard(elements.playerBoard, currentState.player?.board ?? []);
  cachedLegalActions = getLegalActions(currentState, cardLibrary);
  renderHand(elements.playerHand, currentState.player?.hand ?? []);
  renderActions();
  renderLog();
}

function renderActions() {
  const list = elements.actionList;
  list.innerHTML = "";
  if (cachedLegalActions.length === 0) {
    list.innerHTML = '<div class="placeholder">No legal actions.</div>';
    return;
  }
  cachedLegalActions.forEach((action) => {
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
      return "End turn";
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

function renderBoard(container, list) {
  container.innerHTML = "";
  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML =
      '<div class="placeholder">No creatures on board.</div>';
    return;
  }

  list.forEach((unit) => {
    const card = document.createElement("div");
    card.className = "card";

    const def = cardLibrary.byId?.[unit.card];
    const nameText = def?.name ?? unit.card ?? "unknown";
    const costText = def?.cost ?? "?";
    const powerValue = unit.power ?? def?.stats?.power ?? 0;

    const badges = document.createElement("div");
    badges.className = "card-badges";

    const powerBadge = document.createElement("div");
    powerBadge.className = `badge ${def?.type === "creature" ? "power" : "spacer"}`;
    powerBadge.textContent = def?.type === "creature" ? String(powerValue) : "";

    const manaBadge = document.createElement("div");
    manaBadge.className = "badge mana";
    manaBadge.textContent = String(costText);

    badges.appendChild(powerBadge);
    badges.appendChild(manaBadge);

    const name = document.createElement("div");
    name.className = "card-name-line";
    name.textContent = nameText;

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
        keywords.appendChild(tag);
      });
    } else {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "vanilla";
      keywords.appendChild(tag);
    }

    card.appendChild(badges);
    card.appendChild(name);
    card.appendChild(keywords);
    container.appendChild(card);
  });
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
    const def = cardLibrary.byId?.[cardId];
    const name = def?.name ?? cardId;
    const cost = def?.cost ?? "?";
    const power = def?.stats?.power ?? null;

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

    const playActions = cachedLegalActions.filter(
      (action) => action.type === "play" && action.card === cardId
    );
    chip.disabled = playActions.length === 0;
    chip.addEventListener("click", () => {
      if (playActions.length === 0) {
        setStatus(`Cannot play ${cardId} right now.`, "warn");
        return;
      }
      if (playActions.length === 1) {
        applyAndRender(playActions[0]);
        return;
      }
      const preferOpponent = playActions.find(
        (action) => action.target === "opponent"
      );
      applyAndRender(preferOpponent ?? playActions[0]);
    });
    container.appendChild(chip);
  });
}

loadCardLibrary().then(() => {
  render();
});
