import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { loadCardLibrary } from "../engine/cards";
import { normalizeState } from "../engine/state";
import type { Puzzle } from "../engine/types";
import { solve } from "../solver/solver";
import {
  buildLevelSeries,
  SeriesGenerationError,
  type SeriesBuildResult,
  type SeriesLevelRequest,
  type SeriesProgressEvent,
} from "../generator/series";
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

const EXTREME_RELAXATION = {
  allowTwoSolutionsAtStage: 20,
  allowThreeSolutionsAtStage: 60,
  allowUncappedSolutionsAtStage: 140,
  softenRequiredCardsAtStage: 220,
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
  --bounded-relaxation          Stop after bounded relaxation stages instead of retrying forever
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

function truncateText(raw: string, max = 240): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

function extractRootError(raw: string): string | null {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return null;
  }
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].startsWith("Error:")) {
      return truncateText(lines[i]);
    }
  }
  return truncateText(lines[lines.length - 1]);
}

function summarizeChildFailure(stderr: string, stdout: string): string {
  const stderrRoot = extractRootError(stderr);
  if (stderrRoot) {
    return stderrRoot;
  }
  const stdoutRoot = extractRootError(stdout);
  if (stdoutRoot) {
    return stdoutRoot;
  }
  return "unknown error";
}

function stageMaxSolutions(baseCap: number, stage: number): number {
  if (!Number.isFinite(baseCap) || baseCap <= 0) {
    return 0;
  }
  if (stage >= EXTREME_RELAXATION.allowUncappedSolutionsAtStage) {
    return 0;
  }
  if (stage >= EXTREME_RELAXATION.allowThreeSolutionsAtStage) {
    return Math.max(baseCap, 3);
  }
  if (stage >= EXTREME_RELAXATION.allowTwoSolutionsAtStage) {
    return Math.max(baseCap, 2);
  }
  return Math.max(1, Math.floor(baseCap));
}

function stageForceRequiredCards(stage: number): boolean {
  return stage < EXTREME_RELAXATION.softenRequiredCardsAtStage;
}

function formatSolutionCap(cap: number): string {
  return cap <= 0 ? "any" : String(cap);
}

function formatSeriesGenerationError(error: SeriesGenerationError): string[] {
  const stats = error.context.attemptStats;
  const requiredCards =
    error.context.requiredCards.length > 0
      ? error.context.requiredCards.join(", ")
      : "(none)";
  const request = error.context.lastRequest;
  const attemptsSummary = [
    `${stats.generateErrors} generation error(s)`,
    `${stats.rejectedMinUsedCards} rejected by min-used-cards`,
    `${stats.rejectedCoverage} rejected by coverage`,
    `${stats.rejectedRequiredCards} rejected by required-cards`,
    `${stats.rejectedCustomAccept} rejected by uniqueness check`,
  ].join(", ");

  const lines = [
    `Series generation failed at level ${error.context.level}.`,
    `Context: stage=${error.context.lastStage} (${error.context.lastStageRelaxation}), required cards=${requiredCards}, needed new coverage=${error.context.neededNewCoverage}, stage min-used-cards=${error.context.lastStageMinUsedCards}, stage target-rounds cap=${error.context.lastStageTargetRoundsCap}, attempts tried=${stats.attempted} (max per stage: ${error.context.maxAttempts}).`,
    `Attempt outcomes: ${attemptsSummary}.`,
  ];

  if (request) {
    lines.push(
      `Last request: seed=${request.seed}, rounds=${request.targetRounds}, min-used-cards=${request.minUsedCards}.`
    );
  }
  if (error.context.lastError) {
    lines.push(`Last generator error: ${truncateText(error.context.lastError, 320)}.`);
  }

  if (
    error.context.lastError &&
    error.context.lastError.includes("Failed to generate a valid puzzle")
  ) {
    lines.push(
      "Likely cause: current level constraints are too tight for the puzzle generator."
    );
    lines.push(
      "Try increasing --inner-max-attempts or --max-attempts-per-level, lowering --new-cards-per-level, or lowering --min-used-cards."
    );
  }
  if (error.context.lastStage >= EXTREME_RELAXATION.softenRequiredCardsAtStage) {
    lines.push(
      "Extreme relaxation is active (required-cards softened, relaxed solution cap), so persistent failure usually means this card is rarely useful in easy boards."
    );
  }
  if (
    error.context.lastError &&
    error.context.lastError.includes("spawn failed") &&
    error.context.lastError.includes("EPERM")
  ) {
    lines.push(
      "Likely cause: the current environment blocked child-process execution (spawn EPERM)."
    );
    lines.push(
      "Try running outside restricted sandboxing, or run `npm run build` and execute `node dist/scripts/generate_level_series.js` in your normal shell."
    );
  }

  lines.push("Set SERIES_DEBUG_STACK=1 to print full stack traces.");
  return lines;
}

function reportFatalError(error: unknown): void {
  const proc = (globalThis as {
    process?: {
      env?: Record<string, string | undefined>;
    };
  }).process;
  const debugStacks = proc?.env?.SERIES_DEBUG_STACK === "1";

  if (error instanceof SeriesGenerationError) {
    formatSeriesGenerationError(error).forEach((line) => console.error(line));
    if (debugStacks && error.stack) {
      console.error(error.stack);
    }
    return;
  }

  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
    if (debugStacks && error.stack) {
      console.error(error.stack);
    } else {
      console.error("Set SERIES_DEBUG_STACK=1 to print full stack traces.");
    }
    return;
  }

  console.error(`Error: ${String(error)}`);
  if (!debugStacks) {
    console.error("Set SERIES_DEBUG_STACK=1 to print full stack traces.");
  }
}

function main() {
  const proc = (globalThis as {
    process?: {
      argv?: string[];
      execPath?: string;
      stdout?: { isTTY?: boolean; write?: (value: string) => unknown };
      exitCode?: number;
    };
  }).process;
  const argv = proc?.argv ?? [];
  const stdout = proc?.stdout;
  const supportsInlineProgress =
    Boolean(stdout?.isTTY) && typeof stdout?.write === "function";
  let hasInlineProgress = false;

  function renderInlineProgress(message: string): void {
    if (!supportsInlineProgress || !stdout?.write) {
      return;
    }
    stdout.write(`\r\u001b[2K${message}`);
    hasInlineProgress = true;
  }

  function clearInlineProgress(): void {
    if (!supportsInlineProgress || !stdout?.write || !hasInlineProgress) {
      return;
    }
    stdout.write("\r\u001b[2K");
    stdout.write("\n");
    hasInlineProgress = false;
  }

  function summarizeProgress(event: SeriesProgressEvent): string {
    if (event.type === "level_start") {
      const cards = event.requiredCards.join(", ") || "(none)";
      return `[series] Level ${event.level} stage ${event.stage} (${event.relaxation}) · require ${cards} · need-coverage ${event.neededNewCoverage} · min-used ${event.minUsedCards} · rounds<=${event.targetRoundsCap}`;
    }
    if (event.type === "level_relax") {
      const cards = event.requiredCards.join(", ") || "(none)";
      return `[series] Level ${event.level} stage ${event.stage} (${event.relaxation}) · require ${cards} · need-coverage ${event.neededNewCoverage} · min-used ${event.minUsedCards} · rounds<=${event.targetRoundsCap}`;
    }
    if (event.type === "attempt_start") {
      const cards = event.request.requiredCards.join(", ") || "(none)";
      const solutionCap = stageMaxSolutions(maxSolutions, event.stage);
      const requireMode = stageForceRequiredCards(event.stage) ? "hard" : "soft";
      return `[series] Level ${event.level} stage ${event.stage} attempt ${event.attempt}/${event.maxStageAttempts} (overall ${event.overallAttempt}) · rounds ${event.request.targetRounds} · require ${cards} · sol<=${formatSolutionCap(solutionCap)} · req-${requireMode}`;
    }
    if (event.type === "attempt_error") {
      return `[series] Level ${event.level} stage ${event.stage} attempt ${event.attempt}/${maxAttemptsPerLevel} (overall ${event.overallAttempt}) failed to generate`;
    }
    if (event.type === "attempt_reject") {
      return `[series] Level ${event.level} stage ${event.stage} attempt ${event.attempt}/${maxAttemptsPerLevel} (overall ${event.overallAttempt}) rejected (${event.reason})`;
    }
    const covered = `${event.coveredCount}/${event.totalCoverage}`;
    const gained = event.newlyCovered.length > 0 ? event.newlyCovered.join(", ") : "none";
    return `[series] Level ${event.level} accepted on stage ${event.stage}, attempt ${event.attempt} (overall ${event.overallAttempt}) · new ${gained} · covered ${covered}`;
  }
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
    "bounded-relaxation",
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
  const boundedRelaxation = Boolean(pickFlag(flags, ["bounded-relaxation"]));
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

  let result: SeriesBuildResult;
  try {
    result = buildLevelSeries(
      {
        seed,
        coverageCards,
        newCardsPerLevel,
        minUsedCards,
        targetRounds,
        maxTargetRounds: 3,
        maxAttemptsPerLevel,
        levels,
        requireRequiredCardsUsed: false,
        requireFullCoverage: true,
        relaxUntilSuccess: !boundedRelaxation,
      },
      {
        generatePuzzle(request: SeriesLevelRequest): Puzzle {
          const stagedMaxSolutions = stageMaxSolutions(maxSolutions, request.stage);
          const forceRequiredCards = stageForceRequiredCards(request.stage);
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
            String(stagedMaxSolutions),
            "--max-attempts",
            String(innerMaxAttempts),
          ];
          if (forceRequiredCards && request.requiredCards.length > 0) {
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
            const stdoutText = (run.stdout || "").trim();
            throw new Error(
              `generate_puzzle failed (level ${request.level}, attempt ${request.attempt}): ${
                summarizeChildFailure(stderr, stdoutText)
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
          const stagedMaxSolutions = stageMaxSolutions(maxSolutions, context.request.stage);
          if (stagedMaxSolutions <= 0) {
            const solveResult = solve(normalized, cards, { maxWins: 1 });
            return solveResult.wins.length >= 1;
          }
          const solveResult = solve(normalized, cards, {
            maxWins: stagedMaxSolutions + 1,
          });
          return (
            solveResult.wins.length >= 1 &&
            solveResult.wins.length <= stagedMaxSolutions
          );
        },
        onProgress(event) {
          if (supportsInlineProgress) {
            renderInlineProgress(summarizeProgress(event));
            return;
          }
          if (verbose && event.type === "level_success") {
            const cardsLabel =
              event.newlyCovered.length > 0 ? event.newlyCovered.join(", ") : "none";
            console.log(
              `[series] Level ${event.level} accepted (attempt ${event.attempt}); new coverage: ${cardsLabel}`
            );
          }
        },
      }
    );
  } finally {
    clearInlineProgress();
  }

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
          stage: level.request.stage,
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
      maxTargetRounds: 3,
      relaxUntilSuccess: !boundedRelaxation,
      extremeRelaxation: EXTREME_RELAXATION,
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

try {
  main();
} catch (error) {
  reportFatalError(error);
  const proc = (globalThis as {
    process?: {
      exitCode?: number;
    };
  }).process;
  if (proc) {
    proc.exitCode = 1;
  }
}
