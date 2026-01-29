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
import type { Puzzle } from "../engine/types";

const DEFAULTS = {
  seed: Date.now(),
  handSize: 4,
  manaCap: 10,
  decoys: 0,
  targetRounds: 1,
  manaPerRound: 0,
  bossMin: 0,
  bossMax: 0,
  bossModsMax: 0,
  actionBudget: 200,
  solverBudget: 75000,
  maxSolutions: 1,
  maxAttempts: 50,
} as const;

const USAGE = `
Usage:
  node dist/scripts/generate_puzzle.js [--options]

Options:
  --seed <n>                RNG seed (default: now)
  --hand-size <n>           Hand size (default: ${DEFAULTS.handSize})
  --mana <n>                Starting mana (default: ${DEFAULTS.manaCap})
  --decoys <n>              Extra decoy cards added to the hand (default: ${DEFAULTS.decoys})
  --target-rounds <n>       Target rounds to solve (default: ${DEFAULTS.targetRounds})
  --mana-per-round <n>      Mana gained at end of each round (default: ${DEFAULTS.manaPerRound})
  --boss-min <n>            Minimum boss creatures (default: ${DEFAULTS.bossMin})
  --boss-max <n>            Maximum boss creatures (default: ${DEFAULTS.bossMax})
  --boss-mods <n>           Max mods per boss creature (default: ${DEFAULTS.bossModsMax})
  --boss-name <name>        Force boss name (default: random)
  --action-budget <n>       Max ghost actions per attempt (0 = infinite; default: ${DEFAULTS.actionBudget})
  --solver-budget <n>       Max solver nodes (0 = infinite; default: ${DEFAULTS.solverBudget})
  --max-solutions <n>       Reject if more than N solutions (0 = no cap; default: ${DEFAULTS.maxSolutions})
  --max-attempts <n>        Attempts before giving up (default: ${DEFAULTS.maxAttempts})
  --verbose                 Print attempt/rejection reasons
`.trim();

function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex !== -1) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        flags[key] = value;
        continue;
      }
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
      continue;
    }
    positional.push(arg);
  }
  return { flags, positional };
}

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

function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    console.log(USAGE);
    return;
  }
  const allowedFlags = new Set([
    "seed",
    "hand-size",
    "mana",
    "decoys",
    "target-rounds",
    "mana-per-round",
    "boss-min",
    "boss-max",
    "boss-mods",
    "boss-name",
    "action-budget",
    "solver-budget",
    "max-solutions",
    "max-attempts",
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
  const manaCap = parseNumberValue(
    pickFlag(flags, ["mana"]),
    DEFAULTS.manaCap,
    "mana",
    1
  );

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
  const manaPerRound = parseNumberValue(
    pickFlag(flags, ["mana-per-round"]),
    DEFAULTS.manaPerRound,
    "mana-per-round",
    0
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
  const maxAttempts = parseNumberValue(
    pickFlag(flags, ["max-attempts"]),
    DEFAULTS.maxAttempts,
    "max-attempts",
    1
  );
  const bossNameRaw = pickFlag(flags, ["boss-name"]);
  const bossNameOverride =
    typeof bossNameRaw === "string" ? bossNameRaw.trim() : "";

  const cardsPath = path.resolve("cards/cards.json");
  const cards = loadCardLibrary(cardsPath);
  const rng = new Rng(seed);
  const bossPool = ["Toad Bureaucrat", "Clockwork King"];
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
    manaCap,
    decoys,
    targetRounds,
    manaPerRound,
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
        };
        const label = rejectionLabels[attempt.rejection] ?? attempt.rejection;
        console.log(`Rejected attempt #${attempts} (${label}).`);
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

  const json = JSON.stringify(puzzle, null, 2);
  console.log(json);
}

main();
