import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { loadCardLibrary } from "../engine/cards";
import { normalizeState } from "../engine/state";
import type { Puzzle } from "../engine/types";
import { solve } from "../solver/solver";
import {
  DEFAULT_META_PROFILE_OPTIONS,
  buildMetaLevelProfile,
  buildMetaLevelSeries,
  type MetaProfileOptions,
} from "../generator/meta";
import { SeriesGenerationError, type SeriesProgressEvent } from "../generator/series";
import { parseArgs } from "./cli";

const DEFAULTS = {
  seed: Date.now(),
  startLevel: 1,
  endLevel: 24,
  newCardsPerLevel: 3,
  minUsedCards: 3,
  targetRounds: "1,2",
  maxTargetRounds: 6,
  coverageUntilLevel: 0,
  innerMaxAttempts: 300,
  maxAttemptsPerLevel: 25,
  maxRelaxationStages: 60,
  acceptSolverBudget: 50000,
  outputDir: "puzzles/meta_levels",
  outputManifest: "puzzles/meta_levels/index.json",
} as const;
let activeMaxRelaxationStages: number = DEFAULTS.maxRelaxationStages;

const USAGE = `
Usage:
  node dist/scripts/generate_meta_series.js [--options]

Options:
  --seed <n>                        Base seed (default: now)
  --start-level <n>                 First absolute level number (default: ${DEFAULTS.startLevel})
  --end-level <n>                   Last absolute level number, inclusive (default: ${DEFAULTS.endLevel})
  --new-cards-per-level <n>         New coverage cards introduced per level (default: ${DEFAULTS.newCardsPerLevel})
  --min-used-cards <n>              Minimum played cards per accepted solution (default: ${DEFAULTS.minUsedCards})
  --target-rounds <list>            Comma-separated preferred rounds (default: ${DEFAULTS.targetRounds})
  --max-target-rounds <n>           Hard round cap during relaxation/profile growth (default: ${DEFAULTS.maxTargetRounds})
  --coverage-until-level <n>        Enforce coverage only through this absolute level (0 = no cutoff; default: ${DEFAULTS.coverageUntilLevel})
  --coverage-cards <ids>            Comma-separated card IDs to cover (default: all playable cards)
  --exclude-cards <ids>             Comma-separated card IDs to remove from coverage
  --allow-partial-coverage          Do not fail if final coverage is incomplete
  --levels-per-tier <n>             Levels per difficulty tier (default: ${DEFAULT_META_PROFILE_OPTIONS.levelsPerTier})
  --relax-tier-every-stages <n>     Relax one tier every N failed stages (default: ${DEFAULT_META_PROFILE_OPTIONS.relaxTierEveryStages})
  --hand-size-start <n>             Tier-0 hand size (default: ${DEFAULT_META_PROFILE_OPTIONS.handSizeStart})
  --hand-size-max <n>               Max hand size (default: ${DEFAULT_META_PROFILE_OPTIONS.handSizeMax})
  --decoys-start <n>                Tier-0 decoys (default: ${DEFAULT_META_PROFILE_OPTIONS.decoysStart})
  --decoys-max <n>                  Max decoys (default: ${DEFAULT_META_PROFILE_OPTIONS.decoysMax})
  --boss-min-start <n>              Tier-0 minimum boss units (default: ${DEFAULT_META_PROFILE_OPTIONS.bossMinStart})
  --boss-min-max <n>                Max minimum boss units (default: ${DEFAULT_META_PROFILE_OPTIONS.bossMinMax})
  --boss-max-start <n>              Tier-0 maximum boss units (default: ${DEFAULT_META_PROFILE_OPTIONS.bossMaxStart})
  --boss-max <n>                    Max boss units (default: ${DEFAULT_META_PROFILE_OPTIONS.bossMaxMax})
  --boss-mods-start <n>             Tier-0 max mods per boss unit (default: ${DEFAULT_META_PROFILE_OPTIONS.bossModsStart})
  --boss-mods-max <n>               Max mods per boss unit (default: ${DEFAULT_META_PROFILE_OPTIONS.bossModsMax})
  --min-hand-size-max <n>           Upper cap for min-hand-size progression (default: ${DEFAULT_META_PROFILE_OPTIONS.minHandSizeMax})
  --loosened-solution-cap <n>       Allowed solutions in easy tiers (default: ${DEFAULT_META_PROFILE_OPTIONS.loosenedSolutionCap})
  --tighten-solutions-at-tier <n>   Tier where max-solutions tightens to 1 (default: ${DEFAULT_META_PROFILE_OPTIONS.tightenSolutionsAtTier})
  --action-budget-start <n>         Tier-0 action budget for generate_puzzle (default: ${DEFAULT_META_PROFILE_OPTIONS.actionBudgetStart})
  --action-budget-step <n>          Action budget increase per tier (default: ${DEFAULT_META_PROFILE_OPTIONS.actionBudgetStep})
  --solver-budget-start <n>         Tier-0 solver budget for generate_puzzle (default: ${DEFAULT_META_PROFILE_OPTIONS.solverBudgetStart})
  --solver-budget-step <n>          Solver budget increase per tier (default: ${DEFAULT_META_PROFILE_OPTIONS.solverBudgetStep})
  --inner-max-attempts <n>          generate_puzzle attempts per attempt call (default: ${DEFAULTS.innerMaxAttempts})
  --max-attempts-per-level <n>      Attempts per stage (default: ${DEFAULTS.maxAttemptsPerLevel})
  --max-relaxation-stages <n>       Stage cap per level (default: ${DEFAULTS.maxRelaxationStages})
  --accept-solver-budget <n>        Max nodes for post-generation uniqueness check (0 = no cap; default: ${DEFAULTS.acceptSolverBudget})
  --output-dir <path>               Per-level output directory (default: ${DEFAULTS.outputDir})
  --output-manifest <path>          Manifest output path (default: ${DEFAULTS.outputManifest})
  --verbose                         Print summary updates
  --help, -h                        Show this help message
`.trim();

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

function formatSeriesGenerationError(
  error: SeriesGenerationError,
  maxRelaxationStages: number
): string[] {
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
    `Meta series generation failed at relative level ${error.context.level}.`,
    `Context: stage=${error.context.lastStage} (${error.context.lastStageRelaxation}), required cards=${requiredCards}, needed new coverage=${error.context.neededNewCoverage}, stage min-used-cards=${error.context.lastStageMinUsedCards}, stage target-rounds cap=${error.context.lastStageTargetRoundsCap}.`,
    `Attempts: ${stats.attempted} total (max per stage: ${error.context.maxAttempts}); outcomes: ${attemptsSummary}.`,
  ];

  if (request) {
    lines.push(
      `Last request: seed=${request.seed}, rounds=${request.targetRounds}, min-used-cards=${request.minUsedCards}.`
    );
  }
  if (error.context.lastError) {
    lines.push(`Last generator error: ${truncateText(error.context.lastError, 320)}.`);
  }
  if (error.context.lastStage + 1 >= maxRelaxationStages) {
    lines.push(
      `Relaxation cap reached (--max-relaxation-stages=${maxRelaxationStages}). Increase it to allow broader fallback stages.`
    );
  }
  if (
    error.context.lastError &&
    error.context.lastError.includes("Failed to generate a valid puzzle")
  ) {
    lines.push(
      "Likely cause: current constraints are too tight for available cards at this tier."
    );
    lines.push(
      "Try raising --inner-max-attempts or --max-attempts-per-level, lowering growth caps, or increasing --max-relaxation-stages."
    );
  }
  lines.push("Set META_DEBUG_STACK=1 to print full stack traces.");
  return lines;
}

function reportFatalError(error: unknown, maxRelaxationStages: number): void {
  const proc = (globalThis as {
    process?: {
      env?: Record<string, string | undefined>;
    };
  }).process;
  const debugStacks = proc?.env?.META_DEBUG_STACK === "1";

  if (error instanceof SeriesGenerationError) {
    formatSeriesGenerationError(error, maxRelaxationStages).forEach((line) =>
      console.error(line)
    );
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
      console.error("Set META_DEBUG_STACK=1 to print full stack traces.");
    }
    return;
  }

  console.error(`Error: ${String(error)}`);
  if (!debugStacks) {
    console.error("Set META_DEBUG_STACK=1 to print full stack traces.");
  }
}

function summarizeProgress(
  event: SeriesProgressEvent,
  absoluteLevel: number,
  startLevel: number,
  minUsedCards: number,
  profileOptions: MetaProfileOptions
): string {
  if (event.type === "attempt_start") {
    const profile = buildMetaLevelProfile({
      absoluteLevel,
      startLevel,
      stage: event.stage,
      requestedTargetRounds: event.request.targetRounds,
      requestedMinUsedCards: event.request.minUsedCards,
      baseMinUsedCards: minUsedCards,
      options: profileOptions,
    });
    const cardsLabel =
      event.request.requiredCards.length > 0
        ? event.request.requiredCards.join(", ")
        : "(none)";
    return `[meta] L${absoluteLevel} stage ${event.stage} attempt ${event.attempt}/${event.maxStageAttempts} (overall ${event.overallAttempt}) · rounds ${profile.targetRounds} · hand ${profile.handSize} · boss ${profile.bossMin}-${profile.bossMax} · mods<=${profile.bossMods} · sol<=${profile.maxSolutions} · require ${cardsLabel}`;
  }
  if (event.type === "attempt_error") {
    return `[meta] L${absoluteLevel} stage ${event.stage} attempt ${event.attempt} failed`;
  }
  if (event.type === "attempt_reject") {
    return `[meta] L${absoluteLevel} stage ${event.stage} attempt ${event.attempt} rejected (${event.reason})`;
  }
  if (event.type === "level_success") {
    const gained = event.newlyCovered.length > 0 ? event.newlyCovered.join(", ") : "none";
    return `[meta] L${absoluteLevel} accepted on stage ${event.stage}, attempt ${event.attempt} · new ${gained} · covered ${event.coveredCount}/${event.totalCoverage}`;
  }
  const cardsLabel =
    event.requiredCards.length > 0 ? event.requiredCards.join(", ") : "(none)";
  const profile = buildMetaLevelProfile({
    absoluteLevel,
    startLevel,
    stage: event.stage,
    requestedTargetRounds: event.targetRoundsCap,
    requestedMinUsedCards: event.minUsedCards,
    baseMinUsedCards: minUsedCards,
    options: profileOptions,
  });
  return `[meta] L${absoluteLevel} stage ${event.stage} (${event.relaxation}) · require ${cardsLabel} · need-coverage ${event.neededNewCoverage} · rounds ${profile.targetRounds} · hand ${profile.handSize}`;
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
    "start-level",
    "end-level",
    "new-cards-per-level",
    "min-used-cards",
    "target-rounds",
    "max-target-rounds",
    "coverage-until-level",
    "coverage-cards",
    "exclude-cards",
    "allow-partial-coverage",
    "levels-per-tier",
    "relax-tier-every-stages",
    "hand-size-start",
    "hand-size-max",
    "decoys-start",
    "decoys-max",
    "boss-min-start",
    "boss-min-max",
    "boss-max-start",
    "boss-max",
    "boss-mods-start",
    "boss-mods-max",
    "min-hand-size-max",
    "loosened-solution-cap",
    "tighten-solutions-at-tier",
    "action-budget-start",
    "action-budget-step",
    "solver-budget-start",
    "solver-budget-step",
    "inner-max-attempts",
    "max-attempts-per-level",
    "max-relaxation-stages",
    "accept-solver-budget",
    "output-dir",
    "output-manifest",
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
  const startLevel = parseNumberValue(
    pickFlag(flags, ["start-level"]),
    DEFAULTS.startLevel,
    "start-level",
    1
  );
  const endLevelRaw = parseNumberValue(
    pickFlag(flags, ["end-level"]),
    DEFAULTS.endLevel,
    "end-level",
    1
  );
  const endLevel = Math.max(startLevel, endLevelRaw);
  const levelCount = endLevel - startLevel + 1;

  const newCardsPerLevel = parseNumberValue(
    pickFlag(flags, ["new-cards-per-level"]),
    DEFAULTS.newCardsPerLevel,
    "new-cards-per-level",
    1
  );
  const minUsedCards = parseNumberValue(
    pickFlag(flags, ["min-used-cards"]),
    DEFAULTS.minUsedCards,
    "min-used-cards",
    0
  );
  const targetRounds = parseRoundsValue(pickFlag(flags, ["target-rounds"]));
  const maxTargetRoundsRaw = parseNumberValue(
    pickFlag(flags, ["max-target-rounds"]),
    DEFAULTS.maxTargetRounds,
    "max-target-rounds",
    1
  );
  const maxTargetRounds = Math.max(maxTargetRoundsRaw, ...targetRounds);
  const coverageUntilLevelRaw = parseNumberValue(
    pickFlag(flags, ["coverage-until-level"]),
    DEFAULTS.coverageUntilLevel,
    "coverage-until-level",
    0
  );
  const coverageUntilLevel =
    coverageUntilLevelRaw > 0 ? Math.floor(coverageUntilLevelRaw) : undefined;
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
  const maxRelaxationStages = parseNumberValue(
    pickFlag(flags, ["max-relaxation-stages"]),
    DEFAULTS.maxRelaxationStages,
    "max-relaxation-stages",
    1
  );
  activeMaxRelaxationStages = maxRelaxationStages;
  const acceptSolverBudget = parseNumberValue(
    pickFlag(flags, ["accept-solver-budget"]),
    DEFAULTS.acceptSolverBudget,
    "accept-solver-budget",
    0
  );
  const allowPartialCoverage = Boolean(pickFlag(flags, ["allow-partial-coverage"]));

  const outputDirRaw = pickFlag(flags, ["output-dir"]);
  const outputDir =
    typeof outputDirRaw === "string" && outputDirRaw.trim().length > 0
      ? outputDirRaw.trim()
      : DEFAULTS.outputDir;
  const outputManifestRaw = pickFlag(flags, ["output-manifest"]);
  const outputManifest =
    typeof outputManifestRaw === "string" && outputManifestRaw.trim().length > 0
      ? outputManifestRaw.trim()
      : DEFAULTS.outputManifest;

  const profileOptions: MetaProfileOptions = {
    levelsPerTier: parseNumberValue(
      pickFlag(flags, ["levels-per-tier"]),
      DEFAULT_META_PROFILE_OPTIONS.levelsPerTier,
      "levels-per-tier",
      1
    ),
    relaxTierEveryStages: parseNumberValue(
      pickFlag(flags, ["relax-tier-every-stages"]),
      DEFAULT_META_PROFILE_OPTIONS.relaxTierEveryStages,
      "relax-tier-every-stages",
      1
    ),
    roundsStart: Math.min(maxTargetRounds, Math.max(1, Math.min(...targetRounds))),
    roundsMax: maxTargetRounds,
    handSizeStart: parseNumberValue(
      pickFlag(flags, ["hand-size-start"]),
      DEFAULT_META_PROFILE_OPTIONS.handSizeStart,
      "hand-size-start",
      1
    ),
    handSizeMax: parseNumberValue(
      pickFlag(flags, ["hand-size-max"]),
      DEFAULT_META_PROFILE_OPTIONS.handSizeMax,
      "hand-size-max",
      1
    ),
    decoysStart: parseNumberValue(
      pickFlag(flags, ["decoys-start"]),
      DEFAULT_META_PROFILE_OPTIONS.decoysStart,
      "decoys-start",
      0
    ),
    decoysMax: parseNumberValue(
      pickFlag(flags, ["decoys-max"]),
      DEFAULT_META_PROFILE_OPTIONS.decoysMax,
      "decoys-max",
      0
    ),
    bossMinStart: parseNumberValue(
      pickFlag(flags, ["boss-min-start"]),
      DEFAULT_META_PROFILE_OPTIONS.bossMinStart,
      "boss-min-start",
      0
    ),
    bossMinMax: parseNumberValue(
      pickFlag(flags, ["boss-min-max"]),
      DEFAULT_META_PROFILE_OPTIONS.bossMinMax,
      "boss-min-max",
      0
    ),
    bossMaxStart: parseNumberValue(
      pickFlag(flags, ["boss-max-start"]),
      DEFAULT_META_PROFILE_OPTIONS.bossMaxStart,
      "boss-max-start",
      0
    ),
    bossMaxMax: parseNumberValue(
      pickFlag(flags, ["boss-max"]),
      DEFAULT_META_PROFILE_OPTIONS.bossMaxMax,
      "boss-max",
      0
    ),
    bossModsStart: parseNumberValue(
      pickFlag(flags, ["boss-mods-start"]),
      DEFAULT_META_PROFILE_OPTIONS.bossModsStart,
      "boss-mods-start",
      0
    ),
    bossModsMax: parseNumberValue(
      pickFlag(flags, ["boss-mods-max"]),
      DEFAULT_META_PROFILE_OPTIONS.bossModsMax,
      "boss-mods-max",
      0
    ),
    minHandSizeStepEveryTiers: DEFAULT_META_PROFILE_OPTIONS.minHandSizeStepEveryTiers,
    minHandSizeMax: parseNumberValue(
      pickFlag(flags, ["min-hand-size-max"]),
      DEFAULT_META_PROFILE_OPTIONS.minHandSizeMax,
      "min-hand-size-max",
      0
    ),
    loosenedSolutionCap: parseNumberValue(
      pickFlag(flags, ["loosened-solution-cap"]),
      DEFAULT_META_PROFILE_OPTIONS.loosenedSolutionCap,
      "loosened-solution-cap",
      1
    ),
    tightenSolutionsAtTier: parseNumberValue(
      pickFlag(flags, ["tighten-solutions-at-tier"]),
      DEFAULT_META_PROFILE_OPTIONS.tightenSolutionsAtTier,
      "tighten-solutions-at-tier",
      0
    ),
    actionBudgetStart: parseNumberValue(
      pickFlag(flags, ["action-budget-start"]),
      DEFAULT_META_PROFILE_OPTIONS.actionBudgetStart,
      "action-budget-start",
      0
    ),
    actionBudgetStep: parseNumberValue(
      pickFlag(flags, ["action-budget-step"]),
      DEFAULT_META_PROFILE_OPTIONS.actionBudgetStep,
      "action-budget-step",
      0
    ),
    solverBudgetStart: parseNumberValue(
      pickFlag(flags, ["solver-budget-start"]),
      DEFAULT_META_PROFILE_OPTIONS.solverBudgetStart,
      "solver-budget-start",
      0
    ),
    solverBudgetStep: parseNumberValue(
      pickFlag(flags, ["solver-budget-step"]),
      DEFAULT_META_PROFILE_OPTIONS.solverBudgetStep,
      "solver-budget-step",
      0
    ),
  };

  if (profileOptions.handSizeMax < profileOptions.handSizeStart) {
    profileOptions.handSizeMax = profileOptions.handSizeStart;
  }
  if (profileOptions.bossMaxMax < profileOptions.bossMaxStart) {
    profileOptions.bossMaxMax = profileOptions.bossMaxStart;
  }
  if (profileOptions.bossMinMax > profileOptions.bossMaxMax) {
    profileOptions.bossMinMax = profileOptions.bossMaxMax;
  }
  if (profileOptions.decoysMax < profileOptions.decoysStart) {
    profileOptions.decoysMax = profileOptions.decoysStart;
  }

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

  const coverageLevelBudget =
    coverageUntilLevel === undefined
      ? levelCount
      : Math.max(0, Math.min(endLevel, coverageUntilLevel) - startLevel + 1);
  const minCoverageLevels = Math.ceil(coverageCards.length / newCardsPerLevel);
  if (!allowPartialCoverage && coverageLevelBudget < minCoverageLevels) {
    throw new Error(
      `Coverage window has ${coverageLevelBudget} levels, but full coverage needs at least ${minCoverageLevels} levels at --new-cards-per-level=${newCardsPerLevel}. Increase --coverage-until-level/--end-level, or pass --allow-partial-coverage.`
    );
  }

  const generatorScriptPath = path.resolve("dist/scripts/generate_puzzle.js");
  if (!fs.existsSync(generatorScriptPath)) {
    throw new Error(
      `Missing ${generatorScriptPath}. Run \`npm run build\` before generating a meta series.`
    );
  }
  const nodeExec = proc?.execPath ?? "node";

  let result;
  try {
    result = buildMetaLevelSeries(
      {
        seed,
        startLevel,
        endLevel,
        coverageUntilLevel,
        coverageCards,
        newCardsPerLevel,
        minUsedCards: Math.max(minUsedCards, newCardsPerLevel),
        targetRounds,
        maxTargetRounds,
        maxAttemptsPerLevel,
        maxRelaxationStages,
        profile: profileOptions,
        requireRequiredCardsUsed: false,
        requireFullCoverage: !allowPartialCoverage,
        relaxUntilSuccess: true,
      },
      {
        generatePuzzle(request) {
          const args = [
            generatorScriptPath,
            "--seed",
            String(request.seed),
            "--hand-size",
            String(request.profile.handSize),
            "--min-hand-size",
            String(request.profile.minHandSize),
            "--decoys",
            String(request.profile.decoys),
            "--target-rounds",
            String(request.profile.targetRounds),
            "--boss-min",
            String(request.profile.bossMin),
            "--boss-max",
            String(Math.max(request.profile.bossMin, request.profile.bossMax)),
            "--boss-mods",
            String(request.profile.bossMods),
            "--action-budget",
            String(request.profile.actionBudget),
            "--solver-budget",
            String(request.profile.solverBudget),
            "--max-solutions",
            String(request.profile.maxSolutions),
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
              `generate_puzzle spawn failed (level ${request.absoluteLevel}, attempt ${request.attempt}): ${run.error.message}`
            );
          }
          if (run.status !== 0) {
            const stderr = (run.stderr || "").trim();
            const stdoutText = (run.stdout || "").trim();
            throw new Error(
              `generate_puzzle failed (level ${request.absoluteLevel}, attempt ${request.attempt}): ${
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
            targetRounds:
              puzzle.targetRounds ?? context.request.profile.targetRounds,
          });
          const maxSolutions = Math.max(1, context.request.profile.maxSolutions);
          const configuredBudget =
            acceptSolverBudget > 0
              ? acceptSolverBudget
              : context.request.profile.solverBudget;
          const budget = configuredBudget > 0 ? configuredBudget : undefined;
          const solveResult = solve(normalized, cards, {
            maxWins: maxSolutions + 1,
            maxNodes: budget,
            maxSeen: budget,
          });
          if (solveResult.status === "budget") {
            return solveResult.wins.length >= 1;
          }
          return (
            solveResult.wins.length >= 1 &&
            solveResult.wins.length <= maxSolutions
          );
        },
        onProgress(event, progressContext) {
          const summary = summarizeProgress(
            event,
            progressContext.absoluteLevel,
            startLevel,
            minUsedCards,
            profileOptions
          );
          if (supportsInlineProgress) {
            renderInlineProgress(summary);
            return;
          }
          if (verbose && event.type === "level_success") {
            console.log(summary);
          }
        },
      }
    );
  } finally {
    clearInlineProgress();
  }

  const levelsOut = result.levels.map((level) => {
    const levelId = `level_${String(level.absoluteLevel).padStart(3, "0")}`;
    return {
      ...level.puzzle,
      id: levelId,
      metadata: {
        ...(level.puzzle.metadata ?? {}),
        metaSeries: {
          level: level.absoluteLevel,
          relativeLevel: level.level,
          seed: level.request.seed,
          stage: level.request.stage,
          targetRounds: level.profile.targetRounds,
          requiredCards: level.request.requiredCards,
          playedCards: level.playedCards,
          playedSequence: level.playedSequence,
          newlyCovered: level.newlyCovered,
          coveredCards: level.coveredCards,
          attemptCount: level.attemptCount,
          profile: level.profile,
        },
      },
    } as Puzzle;
  });

  const resolvedOutputDir = path.resolve(outputDir);
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
  levelsOut.forEach((level, index) => {
    const absoluteLevel = startLevel + index;
    fs.writeFileSync(
      path.join(resolvedOutputDir, `${absoluteLevel}.json`),
      JSON.stringify(level, null, 2),
      "utf8"
    );
  });

  const manifest = {
    id: `meta_series_${seed}_${startLevel}_${endLevel}`,
    generatedAt: new Date().toISOString(),
    criteria: {
      seed,
      startLevel,
      endLevel,
      levelCount,
      newCardsPerLevel,
      minUsedCards: Math.max(minUsedCards, newCardsPerLevel),
      targetRounds,
      maxTargetRounds,
      coverageUntilLevel: coverageUntilLevel ?? 0,
      coverageLevelBudget,
      innerMaxAttempts,
      maxAttemptsPerLevel,
      maxRelaxationStages,
      acceptSolverBudget,
      allowPartialCoverage,
      profile: profileOptions,
      coverageCards,
      excludeCards: Array.from(excludeCards),
    },
    coverageOrder: result.coverageOrder,
    coveredCards: result.coveredCards,
    uncoveredCards: result.uncoveredCards,
    levels: levelsOut.map((level, index) => ({
      level: startLevel + index,
      id: level.id,
      file: `${startLevel + index}.json`,
    })),
  };

  if (outputManifest.trim().length > 0) {
    const resolvedManifest = path.resolve(outputManifest);
    fs.mkdirSync(path.dirname(resolvedManifest), { recursive: true });
    fs.writeFileSync(resolvedManifest, JSON.stringify(manifest, null, 2), "utf8");
  }

  if (verbose) {
    console.log(
      `Generated ${levelsOut.length} levels. Coverage: ${result.coveredCards.length}/${result.coverageOrder.length}.`
    );
  }
  console.log(JSON.stringify(manifest, null, 2));
}

try {
  main();
} catch (error) {
  reportFatalError(error, activeMaxRelaxationStages);
  const proc = (globalThis as {
    process?: {
      exitCode?: number;
    };
  }).process;
  if (proc) {
    proc.exitCode = 1;
  }
}
