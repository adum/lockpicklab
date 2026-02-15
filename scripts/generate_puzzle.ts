import fs from "fs";
import path from "path";
import { loadCardLibrary } from "../engine/cards";
import { cloneState, normalizeState } from "../engine/state";
import {
  buildGeneratorPools,
  buildPuzzleAttempt,
  createSolveState,
  isBossModAllowed,
  obfuscate,
  Rng,
  stepSolve,
} from "../generator/generator";
import { applyAction, getLegalActions, isWin } from "../engine/engine";
import type { CardInstance, Puzzle } from "../engine/types";
import { parseArgs } from "./cli";

const DEFAULTS = {
  seed: Date.now(),
  handSize: 4,
  minHandSize: 0,
  decoys: 0,
  targetRounds: 1,
  bossMin: 0,
  bossMax: 0,
  bossModsMax: 0,
  actionBudget: 200,
  solverBudget: 0,
  maxSolutions: 1,
  maxAttempts: 0,
} as const;

const USAGE = `
Usage:
  node dist/scripts/generate_puzzle.js [--options]

Options:
  --seed <n>                RNG seed (default: now)
  --hand-size <n>           Hand size (default: ${DEFAULTS.handSize})
  --min-hand-size <n>       Minimum used cards in solution (default: ${DEFAULTS.minHandSize})
  --decoys <n>              Extra decoy cards added to the hand (default: ${DEFAULTS.decoys})
  --target-rounds <n>       Target rounds to solve (default: ${DEFAULTS.targetRounds})
  --boss-min <n>            Minimum boss creatures (default: ${DEFAULTS.bossMin})
  --boss-max <n>            Maximum boss creatures (default: ${DEFAULTS.bossMax})
  --boss-mods <n>           Max mods per boss creature (default: ${DEFAULTS.bossModsMax})
  --boss-name <name>        Force boss name (default: random)
  --require-cards <ids>     Comma-separated card IDs required in final player hand
  --action-budget <n>       Max ghost actions per attempt (0 = infinite; default: ${DEFAULTS.actionBudget})
  --solver-budget <n>       Max solver nodes (0 = infinite; default: ${DEFAULTS.solverBudget})
  --max-solutions <n>       Reject if more than N solutions (0 = no cap; default: ${DEFAULTS.maxSolutions})
  --max-attempts <n>        Attempts before giving up (0 = infinite; default: ${DEFAULTS.maxAttempts})
  --output <path>           Also write puzzle JSON to this path
  --verbose                 Print attempt/rejection reasons
`.trim();

function pickFlag(flags: Record<string, string | boolean>, keys: string[]) {
  for (const key of keys) {
    if (key in flags) {
      return flags[key];
    }
  }
  return undefined;
}

function parseNumberValue(
  raw: string | boolean | undefined,
  fallback: number,
  label: string,
  min?: number
): number {
  if (raw === undefined) {
    return fallback;
  }
  if (typeof raw === "boolean") {
    throw new Error(`Missing value for --${label}`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid value for --${label}`);
  }
  if (min !== undefined) {
    return Math.max(min, parsed);
  }
  return parsed;
}

function parseCardListValue(
  raw: string | boolean | undefined,
  label: string
): string[] {
  if (raw === undefined) {
    return [];
  }
  if (typeof raw === "boolean") {
    throw new Error(`Missing value for --${label}`);
  }
  const unique = new Set<string>();
  raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .forEach((item) => unique.add(item));
  return Array.from(unique);
}

function loadBossNames(): string[] {
  const fallback = ["Toad Bureaucrat"];
  const bossesPath = path.resolve("data/bosses.json");
  if (!fs.existsSync(bossesPath)) {
    return fallback;
  }
  try {
    const raw = fs.readFileSync(bossesPath, "utf8");
    const parsed = JSON.parse(raw) as {
      bosses?: Array<{ name?: string }>;
    };
    const names = (parsed.bosses ?? [])
      .map((entry) => entry?.name?.trim() ?? "")
      .filter((name) => name.length > 0);
    return names.length > 0 ? names : fallback;
  } catch {
    return fallback;
  }
}

function stripBossDefaults(puzzle: Puzzle): Puzzle {
  const opponent = puzzle.opponent;
  const board = Array.isArray(opponent?.board) ? opponent.board : [];
  const trimmed = board.map((unit) => {
    const next: CardInstance = {
      uid: unit.uid,
      card: unit.card,
      power: unit.power,
      keywords: Array.isArray(unit.keywords) ? unit.keywords : [],
      mods: Array.isArray(unit.mods) ? unit.mods : [],
      tired: Boolean(unit.tired),
      poison: unit.poison ?? 0,
      shield: unit.shield ?? 0,
      rebirths: unit.rebirths ?? 0,
      counter: unit.counter ?? 0,
      borrowed: unit.borrowed ?? false,
      borrowedMultiplier: unit.borrowedMultiplier ?? 0,
      anchoredBonus: unit.anchoredBonus ?? 0,
    };
    const mutable = next as Partial<CardInstance>;
    if (!next.uid) {
      delete mutable.uid;
    }
    if (!next.keywords.length) {
      delete mutable.keywords;
    }
    if (!next.mods.length) {
      delete mutable.mods;
    }
    if (!next.tired) {
      delete mutable.tired;
    }
    if (!next.poison) {
      delete mutable.poison;
    }
    if (!next.shield) {
      delete mutable.shield;
    }
    if (!next.rebirths) {
      delete mutable.rebirths;
    }
    if (!next.counter) {
      delete mutable.counter;
    }
    if (!next.borrowed) {
      delete mutable.borrowed;
    }
    if (!next.borrowedMultiplier) {
      delete mutable.borrowedMultiplier;
    }
    if (!next.anchoredBonus) {
      delete mutable.anchoredBonus;
    }
    return next;
  });
  return {
    ...puzzle,
    opponent: {
      ...opponent,
      board: trimmed,
    },
  };
}

function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2), {
    shortBooleanFlags: ["h", "v"],
  });
  if (flags.help || flags.h) {
    console.log(USAGE);
    return;
  }
  const allowedFlags = new Set([
    "seed",
    "hand-size",
    "min-hand-size",
    "decoys",
    "target-rounds",
    "boss-min",
    "boss-max",
    "boss-mods",
    "boss-name",
    "require-cards",
    "action-budget",
    "solver-budget",
    "max-solutions",
    "max-attempts",
    "output",
    "verbose",
    "v",
    "help",
    "h",
  ]);
  const unknown = Object.keys(flags).filter((key) => !allowedFlags.has(key));
  if (unknown.length > 0) {
    throw new Error(`Unknown option(s): ${unknown.map((item) => `--${item}`).join(", ")}`);
  }
  if (positional.length > 0) {
    throw new Error("Positional arguments are not supported. Use named flags only.");
  }

  const verbose = Boolean(flags.verbose || flags.v);

  const seed = parseNumberValue(
    pickFlag(flags, ["seed"]),
    DEFAULTS.seed,
    "seed",
    0
  );
  const handSize = parseNumberValue(
    pickFlag(flags, ["hand-size"]),
    DEFAULTS.handSize,
    "hand-size",
    1
  );
  const minHandSize = parseNumberValue(
    pickFlag(flags, ["min-hand-size"]),
    DEFAULTS.minHandSize,
    "min-hand-size",
    0
  );
  if (minHandSize > handSize) {
    throw new Error("--min-hand-size cannot exceed --hand-size.");
  }
  const decoys = parseNumberValue(
    pickFlag(flags, ["decoys"]),
    DEFAULTS.decoys,
    "decoys",
    0
  );
  const targetRounds = parseNumberValue(
    pickFlag(flags, ["target-rounds"]),
    DEFAULTS.targetRounds,
    "target-rounds",
    1
  );
  const bossMin = parseNumberValue(
    pickFlag(flags, ["boss-min"]),
    DEFAULTS.bossMin,
    "boss-min",
    0
  );
  const bossMaxRaw = parseNumberValue(
    pickFlag(flags, ["boss-max"]),
    DEFAULTS.bossMax,
    "boss-max",
    0
  );
  const bossMax = Math.max(bossMin, bossMaxRaw);
  const bossModsMax = parseNumberValue(
    pickFlag(flags, ["boss-mods"]),
    DEFAULTS.bossModsMax,
    "boss-mods",
    0
  );
  const actionBudget = parseNumberValue(
    pickFlag(flags, ["action-budget"]),
    DEFAULTS.actionBudget,
    "action-budget",
    0
  );
  const actionBudgetValue =
    actionBudget === 0 ? Number.POSITIVE_INFINITY : actionBudget;
  const solverBudgetRaw = parseNumberValue(
    pickFlag(flags, ["solver-budget"]),
    DEFAULTS.solverBudget,
    "solver-budget",
    0
  );
  const solverBudget =
    solverBudgetRaw === 0 ? Number.POSITIVE_INFINITY : solverBudgetRaw;
  const maxSolutionsRaw = parseNumberValue(
    pickFlag(flags, ["max-solutions"]),
    DEFAULTS.maxSolutions,
    "max-solutions",
    0
  );
  const maxSolutions =
    maxSolutionsRaw === 0 ? Number.POSITIVE_INFINITY : maxSolutionsRaw;
  const maxAttemptsRaw = parseNumberValue(
    pickFlag(flags, ["max-attempts"]),
    DEFAULTS.maxAttempts,
    "max-attempts",
    0
  );
  const maxAttempts =
    maxAttemptsRaw === 0 ? Number.POSITIVE_INFINITY : maxAttemptsRaw;
  const bossNameRaw = pickFlag(flags, ["boss-name"]);
  const bossNameOverride =
    typeof bossNameRaw === "string" ? bossNameRaw.trim() : "";
  const outputPathRaw = pickFlag(flags, ["output"]);
  const outputPath =
    typeof outputPathRaw === "string" && outputPathRaw.trim().length > 0
      ? outputPathRaw.trim()
      : "";
  const requiredCards = parseCardListValue(
    pickFlag(flags, ["require-cards"]),
    "require-cards"
  );

  const cardsPath = path.resolve("cards/cards.json");
  const cards = loadCardLibrary(cardsPath);
  const unknownRequiredCards = requiredCards.filter((cardId) => !cards.byId[cardId]);
  if (unknownRequiredCards.length > 0) {
    throw new Error(
      `Unknown card ID(s) in --require-cards: ${unknownRequiredCards.join(", ")}`
    );
  }
  const rng = new Rng(seed);
  const bossPool = loadBossNames();
  const bossRng = new Rng(seed ^ 0x9e3779b9);
  const bossName =
    bossNameOverride ||
    (bossPool.length > 0 ? bossRng.pick(bossPool) : "Toad Bureaucrat");

  const pools = buildGeneratorPools(cards, { bossModFilter: isBossModAllowed });
  const generatorEngine = {
    applyAction,
    getLegalActions,
    isWin,
    normalizeState,
    cloneState,
  };
  const generatorState = {
    seed,
    rng,
    handSize,
    minHandSize,
    requiredCards,
    decoys,
    targetRounds,
    bossMin,
    bossMax,
    bossModsMax,
    bossModPool: pools.bossModPool,
    bossName,
    actionBudget: actionBudgetValue,
    playable: pools.playable,
    creaturePool: pools.creaturePool,
  };

  let puzzle: Puzzle | null = null;
  let attempts = 0;
  const enforceSolutionCap = Number.isFinite(maxSolutions);
  const enforceEarlyWin = targetRounds > 1;
  const shouldSolve = enforceSolutionCap || enforceEarlyWin;
  const rejectionCounts: Record<string, number> = {};

  while (!puzzle && attempts < maxAttempts) {
    attempts += 1;
    const attempt = buildPuzzleAttempt(generatorState, cards, generatorEngine);
    if (verbose) {
      const suffix =
        attempt.actionCount > 0 || attempt.aborted
          ? attempt.aborted
            ? ` (actions: ${attempt.actionCount}, budget)`
            : ` (actions: ${attempt.actionCount})`
          : "";
      console.log(`Attempt #${attempts}: ${attempt.handLabel}${suffix}`);
    }
    if (!attempt.puzzle) {
      if (verbose && attempt.rejection) {
        const rejectionLabels: Record<string, string> = {
          hand_types: "hand had a single card type",
          boss_board: "boss board generation failed",
          action_budget: "action budget exceeded",
          no_actions: "no legal actions",
          materialize: "materialize failed",
          early_mana: "hand is affordable too early",
          min_hand: "used hand smaller than minimum",
        };
        const label = rejectionLabels[attempt.rejection] ?? attempt.rejection;
        console.log(`Rejected attempt #${attempts} (${label}).`);
      }
      if (attempt.rejection) {
        rejectionCounts[attempt.rejection] =
          (rejectionCounts[attempt.rejection] ?? 0) + 1;
      }
      continue;
    }
    if (!shouldSolve) {
      puzzle = obfuscate(attempt.puzzle, cards, { rng, extraCards: 0 });
      if (verbose) {
        console.log(`Accepted attempt #${attempts} (solver skipped).`);
      }
      break;
    }
    const solver = createSolveState(attempt.puzzle, generatorEngine, solverBudget);
    while (true) {
      const result = stepSolve(solver, cards, generatorEngine, {
        iterationLimit: 2000,
        enforceEarlyWin,
        targetRounds,
        enforceSolutionCap,
        maxSolutions:
          Number.isFinite(maxSolutions) && maxSolutions > 0
            ? maxSolutions
            : 0,
      });
      if (result.status === "continue") {
        continue;
      }
      if (result.status === "budget" || result.status === "success") {
        puzzle = obfuscate(attempt.puzzle, cards, { rng, extraCards: 0 });
        if (verbose) {
          const note =
            result.status === "budget"
              ? `solver budget hit at ${solver.visited} steps`
              : `${solver.wins} solution${solver.wins === 1 ? "" : "s"}`;
          console.log(`Accepted attempt #${attempts} (${note}).`);
        }
        break;
      }
      // Reject (early win / too many solutions) or exhausted (no solution)
      if (verbose) {
        if (result.status === "reject") {
          const label =
            result.reason === "early_win"
              ? "early win"
              : `${solver.wins} solutions`;
          console.log(`Rejected attempt #${attempts} (${label}).`);
        } else if (result.status === "exhausted") {
          console.log(`Rejected attempt #${attempts} (no solutions).`);
        }
      }
      if (result.status === "reject") {
        const key = result.reason === "early_win" ? "early_win" : "solution_cap";
        rejectionCounts[key] = (rejectionCounts[key] ?? 0) + 1;
      } else if (result.status === "exhausted") {
        rejectionCounts.no_solutions = (rejectionCounts.no_solutions ?? 0) + 1;
      }
      break;
    }
  }

  if (!puzzle) {
    if (verbose) {
      console.log(
        `Failed to generate a valid puzzle after ${attempts} attempt${
          attempts === 1 ? "" : "s"
        }.`
      );
    }
    throw new Error("Failed to generate a valid puzzle.");
  }

  if (verbose) {
    const summaryLabels: Record<string, string> = {
      hand_types: "Hand had a single card type",
      boss_board: "Boss board generation failed",
      action_budget: "Action budget exceeded",
      no_actions: "No legal actions",
      materialize: "Materialize failed",
      early_mana: "Hand is affordable too early",
      min_hand: "Used hand smaller than minimum",
      early_win: "Early win",
      solution_cap: "Too many solutions",
      no_solutions: "No solutions",
    };
    const entries = Object.entries(rejectionCounts);
    if (entries.length > 0) {
      console.log("Rejection summary:");
      entries.forEach(([key, count]) => {
        if (!count) {
          return;
        }
        const label = summaryLabels[key] ?? key;
        console.log(`- ${label}: ${count}`);
      });
    }
  }
  const json = JSON.stringify(stripBossDefaults(puzzle), null, 2);
  if (outputPath) {
    fs.writeFileSync(path.resolve(outputPath), json, "utf8");
  }
  console.log(json);
}

main();
