import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { loadCardLibrary } from "../engine/cards";
import { normalizeState } from "../engine/state";
import type { Puzzle } from "../engine/types";
import { solve } from "../solver/solver";
import { buildLevelSeries, type SeriesLevelRequest } from "../generator/series";
import { parseArgs } from "./cli";

const DEFAULTS = {
  seed: Date.now(),
  newCardsPerLevel: 3,
  minUsedCards: 3,
  targetRounds: "1,2",
  handSize: 4,
  decoys: 0,
  bossMin: 0,
  bossMax: 0,
  bossMods: 0,
  actionBudget: 200,
  solverBudget: 0,
  maxSolutions: 1,
  innerMaxAttempts: 300,
  maxAttemptsPerLevel: 25,
  output: "puzzles/series.json",
} as const;

const USAGE = `
Usage:
  node dist/scripts/generate_level_series.js [--options]

Options:
  --seed <n>                    Base seed (default: now)
  --new-cards-per-level <n>     New required cards introduced per level (default: ${DEFAULTS.newCardsPerLevel})
  --min-used-cards <n>          Minimum played cards per solution (default: ${DEFAULTS.minUsedCards})
  --levels <n>                  Fixed level count (default: auto from coverage/new-cards-per-level)
  --target-rounds <list>        Comma-separated round choices per level (default: ${DEFAULTS.targetRounds})
  --coverage-cards <ids>        Comma-separated card IDs to cover (default: all playable cards)
  --exclude-cards <ids>         Comma-separated card IDs to remove from coverage
  --hand-size <n>               Passed through to generate_puzzle (default: ${DEFAULTS.handSize})
  --decoys <n>                  Passed through to generate_puzzle (default: ${DEFAULTS.decoys})
  --boss-min <n>                Passed through to generate_puzzle (default: ${DEFAULTS.bossMin})
  --boss-max <n>                Passed through to generate_puzzle (default: ${DEFAULTS.bossMax})
  --boss-mods <n>               Passed through to generate_puzzle (default: ${DEFAULTS.bossMods})
  --action-budget <n>           Passed through to generate_puzzle (default: ${DEFAULTS.actionBudget})
  --solver-budget <n>           Passed through to generate_puzzle (default: ${DEFAULTS.solverBudget})
  --max-solutions <n>           Passed through to generate_puzzle (default: ${DEFAULTS.maxSolutions})
  --inner-max-attempts <n>      Per-call generate_puzzle attempts (default: ${DEFAULTS.innerMaxAttempts})
  --max-attempts-per-level <n>  Series retries per level (default: ${DEFAULTS.maxAttemptsPerLevel})
  --output <path>               Write combined series JSON (default: ${DEFAULTS.output})
  --output-dir <path>           Also write one JSON file per level
  --verbose                     Print generation progress
  --help, -h                    Show this help message
`.trim();

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
  return min === undefined ? parsed : Math.max(min, parsed);
}

function parseListValue(
  raw: string | boolean | undefined,
  label: string
): string[] {
  if (raw === undefined) {
    return [];
  }
  if (typeof raw === "boolean") {
    throw new Error(`Missing value for --${label}`);
  }
  const seen = new Set<string>();
  raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .forEach((item) => seen.add(item));
  return Array.from(seen);
}

function parseRoundsValue(raw: string | boolean | undefined): number[] {
  const source =
    raw === undefined ? DEFAULTS.targetRounds : typeof raw === "string" ? raw : "";
  if (!source) {
    throw new Error("Missing value for --target-rounds");
  }
  const rounds = source
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isFinite(value) && value >= 1)
    .map((value) => Math.floor(value));
  if (rounds.length === 0) {
    throw new Error("Invalid value for --target-rounds");
  }
  return rounds;
}

function pickFlag(
  flags: Record<string, string | boolean>,
  keys: string[]
): string | boolean | undefined {
  for (const key of keys) {
    if (key in flags) {
      return flags[key];
    }
  }
  return undefined;
}

function parseGeneratedPuzzle(raw: string): Puzzle {
  const text = raw.trim();
  if (!text) {
    throw new Error("generate_puzzle produced empty output.");
  }
  const start = text.indexOf("{");
  if (start < 0) {
    throw new Error("generate_puzzle output did not contain JSON.");
  }
  return JSON.parse(text.slice(start)) as Puzzle;
}

function main() {
  const proc = (globalThis as {
    process?: { argv?: string[]; execPath?: string };
  }).process;
  const argv = proc?.argv ?? [];
  const { flags, positional } = parseArgs(argv.slice(2), {
    shortBooleanFlags: ["h", "v"],
  });
  if (flags.help || flags.h) {
    console.log(USAGE);
    return;
  }
  if (positional.length > 0) {
    throw new Error("Positional arguments are not supported. Use named flags only.");
  }

  const allowedFlags = new Set([
    "seed",
    "new-cards-per-level",
    "min-used-cards",
    "levels",
    "target-rounds",
    "coverage-cards",
    "exclude-cards",
    "hand-size",
    "decoys",
    "boss-min",
    "boss-max",
    "boss-mods",
    "action-budget",
    "solver-budget",
    "max-solutions",
    "inner-max-attempts",
    "max-attempts-per-level",
    "output",
    "output-dir",
    "verbose",
    "v",
    "help",
    "h",
  ]);
  const unknown = Object.keys(flags).filter((key) => !allowedFlags.has(key));
  if (unknown.length > 0) {
    throw new Error(`Unknown option(s): ${unknown.map((item) => `--${item}`).join(", ")}`);
  }

  const verbose = Boolean(flags.verbose || flags.v);
  const seed = parseNumberValue(pickFlag(flags, ["seed"]), DEFAULTS.seed, "seed", 0);
  const newCardsPerLevel = parseNumberValue(
    pickFlag(flags, ["new-cards-per-level"]),
    DEFAULTS.newCardsPerLevel,
    "new-cards-per-level",
    1
  );
  const minUsedCardsRaw = parseNumberValue(
    pickFlag(flags, ["min-used-cards"]),
    DEFAULTS.minUsedCards,
    "min-used-cards",
    0
  );
  const levelsRaw = pickFlag(flags, ["levels"]);
  const levels =
    levelsRaw === undefined
      ? undefined
      : parseNumberValue(levelsRaw, 0, "levels", 1);
  const targetRounds = parseRoundsValue(pickFlag(flags, ["target-rounds"]));
  const handSize = parseNumberValue(
    pickFlag(flags, ["hand-size"]),
    DEFAULTS.handSize,
    "hand-size",
    1
  );
  const decoys = parseNumberValue(pickFlag(flags, ["decoys"]), DEFAULTS.decoys, "decoys", 0);
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
  const bossMods = parseNumberValue(
    pickFlag(flags, ["boss-mods"]),
    DEFAULTS.bossMods,
    "boss-mods",
    0
  );
  const actionBudget = parseNumberValue(
    pickFlag(flags, ["action-budget"]),
    DEFAULTS.actionBudget,
    "action-budget",
    0
  );
  const solverBudget = parseNumberValue(
    pickFlag(flags, ["solver-budget"]),
    DEFAULTS.solverBudget,
    "solver-budget",
    0
  );
  const maxSolutions = parseNumberValue(
    pickFlag(flags, ["max-solutions"]),
    DEFAULTS.maxSolutions,
    "max-solutions",
    1
  );
  const innerMaxAttempts = parseNumberValue(
    pickFlag(flags, ["inner-max-attempts"]),
    DEFAULTS.innerMaxAttempts,
    "inner-max-attempts",
    1
  );
  const maxAttemptsPerLevel = parseNumberValue(
    pickFlag(flags, ["max-attempts-per-level"]),
    DEFAULTS.maxAttemptsPerLevel,
    "max-attempts-per-level",
    1
  );
  const outputPathRaw = pickFlag(flags, ["output"]);
  const outputPath =
    typeof outputPathRaw === "string" && outputPathRaw.trim().length > 0
      ? outputPathRaw.trim()
      : DEFAULTS.output;
  const outputDirRaw = pickFlag(flags, ["output-dir"]);
  const outputDir =
    typeof outputDirRaw === "string" && outputDirRaw.trim().length > 0
      ? outputDirRaw.trim()
      : "";

  const coverageCardsInput = parseListValue(
    pickFlag(flags, ["coverage-cards"]),
    "coverage-cards"
  );
  const excludeCards = new Set(
    parseListValue(pickFlag(flags, ["exclude-cards"]), "exclude-cards")
  );

  const cardsPath = path.resolve("cards/cards.json");
  const cards = loadCardLibrary(cardsPath);
  const defaultCoverage = Object.values(cards.byId)
    .filter(
      (card) =>
        card.type === "creature" ||
        card.type === "spell" ||
        card.type === "effect" ||
        card.type === "mod"
    )
    .map((card) => card.id)
    .sort();
  const coverageCardsRaw =
    coverageCardsInput.length > 0 ? coverageCardsInput : defaultCoverage;
  const coverageCards = coverageCardsRaw.filter((cardId) => !excludeCards.has(cardId));
  if (coverageCards.length === 0) {
    throw new Error("Coverage card list is empty after filters.");
  }
  const unknownCoverage = coverageCards.filter((cardId) => !cards.byId[cardId]);
  if (unknownCoverage.length > 0) {
    throw new Error(`Unknown coverage card ID(s): ${unknownCoverage.join(", ")}`);
  }

  const generatorScriptPath = path.resolve("dist/scripts/generate_puzzle.js");
  if (!fs.existsSync(generatorScriptPath)) {
    throw new Error(
      `Missing ${generatorScriptPath}. Run \`npm run build\` before generating a series.`
    );
  }
  const nodeExec = proc?.execPath ?? "node";
  const minUsedCards = Math.max(minUsedCardsRaw, newCardsPerLevel);

  const result = buildLevelSeries(
    {
      seed,
      coverageCards,
      newCardsPerLevel,
      minUsedCards,
      targetRounds,
      maxAttemptsPerLevel,
      levels,
      requireRequiredCardsUsed: false,
      requireFullCoverage: true,
    },
    {
      generatePuzzle(request: SeriesLevelRequest): Puzzle {
        const args = [
          generatorScriptPath,
          "--seed",
          String(request.seed),
          "--hand-size",
          String(handSize),
          "--min-hand-size",
          String(request.minUsedCards),
          "--decoys",
          String(decoys),
          "--target-rounds",
          String(request.targetRounds),
          "--boss-min",
          String(bossMin),
          "--boss-max",
          String(bossMax),
          "--boss-mods",
          String(bossMods),
          "--action-budget",
          String(actionBudget),
          "--solver-budget",
          String(solverBudget),
          "--max-solutions",
          String(maxSolutions),
          "--max-attempts",
          String(innerMaxAttempts),
        ];
        if (request.requiredCards.length > 0) {
          args.push("--require-cards", request.requiredCards.join(","));
        }
        const run = spawnSync(nodeExec, args, {
          encoding: "utf8",
        });
        if (run.error) {
          throw new Error(
            `generate_puzzle spawn failed (level ${request.level}, attempt ${request.attempt}): ${run.error.message}`
          );
        }
        if (run.status !== 0) {
          const stderr = (run.stderr || "").trim();
          const stdout = (run.stdout || "").trim();
          throw new Error(
            `generate_puzzle failed (level ${request.level}, attempt ${request.attempt}): ${
              stderr || stdout || "unknown error"
            }`
          );
        }
        return parseGeneratedPuzzle(run.stdout || "");
      },
      acceptPuzzle(puzzle, context): boolean {
        const normalized = normalizeState({
          player: puzzle.player,
          opponent: puzzle.opponent,
          manaPerRound: puzzle.manaPerRound ?? 0,
          targetRounds: puzzle.targetRounds ?? context.request.targetRounds,
        });
        const solveResult = solve(normalized, cards, { maxWins: 2 });
        return solveResult.wins.length === 1;
      },
    }
  );

  const levelsOut = result.levels.map((level, index) => {
    const levelId = `level_${String(index + 1).padStart(3, "0")}`;
    return {
      ...level.puzzle,
      id: levelId,
      metadata: {
        ...(level.puzzle.metadata ?? {}),
        series: {
          level: index + 1,
          seed: level.request.seed,
          targetRounds: level.request.targetRounds,
          requiredCards: level.request.requiredCards,
          playedCards: level.playedCards,
          playedSequence: level.playedSequence,
          newlyCovered: level.newlyCovered,
          coveredCards: level.coveredCards,
          attemptCount: level.attemptCount,
        },
      },
    } as Puzzle;
  });

  const payload = {
    id: `series_${seed}`,
    generatedAt: new Date().toISOString(),
    criteria: {
      seed,
      newCardsPerLevel,
      minUsedCards,
      targetRounds,
      levels: levels ?? levelsOut.length,
      handSize,
      decoys,
      bossMin,
      bossMax,
      bossMods,
      actionBudget,
      solverBudget,
      maxSolutions,
      innerMaxAttempts,
      maxAttemptsPerLevel,
      coverageCards,
      excludeCards: Array.from(excludeCards),
    },
    coverageOrder: result.coverageOrder,
    coveredCards: result.coveredCards,
    uncoveredCards: result.uncoveredCards,
    levels: levelsOut,
  };

  const json = JSON.stringify(payload, null, 2);
  const resolvedOutput = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, json, "utf8");

  if (outputDir) {
    const resolvedDir = path.resolve(outputDir);
    fs.mkdirSync(resolvedDir, { recursive: true });
    levelsOut.forEach((level, index) => {
      const filename = `${String(index + 1).padStart(3, "0")}_${level.id}.json`;
      fs.writeFileSync(
        path.join(resolvedDir, filename),
        JSON.stringify(level, null, 2),
        "utf8"
      );
    });
  }

  if (verbose) {
    console.log(
      `Generated ${levelsOut.length} levels with ${result.coveredCards.length}/${result.coverageOrder.length} covered cards.`
    );
  }
  console.log(json);
}

main();
