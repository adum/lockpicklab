import type { Puzzle } from "../engine/types";
import {
  buildLevelSeries,
  type SeriesBuildResult,
  type SeriesLevelRecord,
  type SeriesLevelRequest,
  type SeriesProgressEvent,
} from "./series";

export interface MetaProfileOptions {
  levelsPerTier: number;
  relaxTierEveryStages: number;
  roundsStart: number;
  roundsMax: number;
  handSizeStart: number;
  handSizeMax: number;
  decoysStart: number;
  decoysMax: number;
  bossMinStart: number;
  bossMinMax: number;
  bossMaxStart: number;
  bossMaxMax: number;
  bossModsStart: number;
  bossModsMax: number;
  minHandSizeStepEveryTiers: number;
  minHandSizeMax: number;
  loosenedSolutionCap: number;
  tightenSolutionsAtTier: number;
  actionBudgetStart: number;
  actionBudgetStep: number;
  solverBudgetStart: number;
  solverBudgetStep: number;
}

export const DEFAULT_META_PROFILE_OPTIONS: MetaProfileOptions = {
  levelsPerTier: 4,
  relaxTierEveryStages: 4,
  roundsStart: 1,
  roundsMax: 6,
  handSizeStart: 4,
  handSizeMax: 8,
  decoysStart: 0,
  decoysMax: 4,
  bossMinStart: 0,
  bossMinMax: 3,
  bossMaxStart: 0,
  bossMaxMax: 6,
  bossModsStart: 0,
  bossModsMax: 2,
  minHandSizeStepEveryTiers: 2,
  minHandSizeMax: 6,
  loosenedSolutionCap: 2,
  tightenSolutionsAtTier: 2,
  actionBudgetStart: 220,
  actionBudgetStep: 60,
  solverBudgetStart: 25000,
  solverBudgetStep: 2500,
};

export interface MetaLevelProfile {
  tier: number;
  effectiveTier: number;
  handSize: number;
  minHandSize: number;
  decoys: number;
  bossMin: number;
  bossMax: number;
  bossMods: number;
  targetRounds: number;
  maxSolutions: number;
  actionBudget: number;
  solverBudget: number;
}

export interface BuildMetaProfileInput {
  absoluteLevel: number;
  startLevel: number;
  stage: number;
  requestedTargetRounds: number;
  requestedMinUsedCards: number;
  baseMinUsedCards: number;
  options: MetaProfileOptions;
}

export interface MetaSeriesLevelRequest extends SeriesLevelRequest {
  absoluteLevel: number;
  profile: MetaLevelProfile;
}

export interface MetaSeriesLevelRecord extends SeriesLevelRecord {
  absoluteLevel: number;
  profile: MetaLevelProfile;
}

export interface MetaSeriesBuildOptions {
  seed: number;
  startLevel: number;
  endLevel: number;
  coverageUntilLevel?: number;
  coverageCards: string[];
  newCardsPerLevel: number;
  minUsedCards: number;
  targetRounds: number[];
  maxTargetRounds: number;
  maxAttemptsPerLevel: number;
  maxRelaxationStages: number;
  profile: MetaProfileOptions;
  requireRequiredCardsUsed?: boolean;
  requireFullCoverage?: boolean;
  relaxUntilSuccess?: boolean;
}

export interface MetaSeriesBuildDeps {
  generatePuzzle: (request: MetaSeriesLevelRequest) => Puzzle;
  acceptPuzzle?: (
    puzzle: Puzzle,
    context: {
      request: MetaSeriesLevelRequest;
      playedSequence: string[];
      playedCards: string[];
    }
  ) => boolean;
  onProgress?: (
    event: SeriesProgressEvent,
    context: {
      absoluteLevel: number;
    }
  ) => void;
}

export interface MetaSeriesBuildResult
  extends Omit<SeriesBuildResult, "levels"> {
  startLevel: number;
  endLevel: number;
  levels: MetaSeriesLevelRecord[];
}

function clampInt(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  const normalized = Number.isFinite(value) ? Math.floor(value) : min;
  return Math.max(min, Math.min(max, normalized));
}

function absoluteLevelFor(startLevel: number, relativeLevel: number): number {
  return startLevel + relativeLevel - 1;
}

export function buildMetaLevelProfile(
  input: BuildMetaProfileInput
): MetaLevelProfile {
  const options = input.options;
  const levelsPerTier = Math.max(1, clampInt(options.levelsPerTier, 1, Number.MAX_SAFE_INTEGER));
  const relaxTierEveryStages = Math.max(
    1,
    clampInt(options.relaxTierEveryStages, 1, Number.MAX_SAFE_INTEGER)
  );
  // Difficulty progression is anchored to absolute level numbers so separate runs
  // continue the same curve (e.g. level 31 stays "level 31 difficulty").
  const relativeLevel = Math.max(0, input.absoluteLevel - 1);
  const tier = Math.floor(relativeLevel / levelsPerTier);
  const effectiveTier = Math.max(0, tier - Math.floor(Math.max(0, input.stage) / relaxTierEveryStages));

  const handSize = clampInt(
    options.handSizeStart + effectiveTier,
    1,
    Math.max(1, options.handSizeMax)
  );
  const roundsBase = clampInt(
    options.roundsStart + Math.floor(effectiveTier / 2),
    1,
    Math.max(1, options.roundsMax)
  );
  const targetRounds = clampInt(
    Math.max(input.requestedTargetRounds, roundsBase),
    1,
    Math.max(1, options.roundsMax)
  );
  const decoys = clampInt(
    options.decoysStart + Math.floor(effectiveTier / 2),
    0,
    Math.max(0, options.decoysMax)
  );
  const bossMax = clampInt(
    options.bossMaxStart + Math.floor(effectiveTier / 2),
    0,
    Math.max(0, options.bossMaxMax)
  );
  const bossMinCap = Math.min(Math.max(0, options.bossMinMax), bossMax);
  const bossMin = clampInt(
    options.bossMinStart + Math.floor(effectiveTier / 3),
    0,
    bossMinCap
  );
  const bossMods = clampInt(
    options.bossModsStart + Math.floor(effectiveTier / 3),
    0,
    Math.max(0, options.bossModsMax)
  );
  const minHandBase =
    input.baseMinUsedCards +
    Math.floor(effectiveTier / Math.max(1, options.minHandSizeStepEveryTiers));
  const minHandSize = clampInt(
    Math.max(input.requestedMinUsedCards, minHandBase),
    0,
    Math.min(handSize, Math.max(0, options.minHandSizeMax))
  );
  const looseCap = Math.max(1, clampInt(options.loosenedSolutionCap, 1, Number.MAX_SAFE_INTEGER));
  const tightenAtTier = Math.max(0, clampInt(options.tightenSolutionsAtTier, 0, Number.MAX_SAFE_INTEGER));
  const maxSolutions = effectiveTier >= tightenAtTier ? 1 : looseCap;
  const actionBudget = Math.max(
    0,
    Math.floor(options.actionBudgetStart + effectiveTier * options.actionBudgetStep)
  );
  const solverBudget = Math.max(
    0,
    Math.floor(options.solverBudgetStart + effectiveTier * options.solverBudgetStep)
  );

  return {
    tier,
    effectiveTier,
    handSize,
    minHandSize,
    decoys,
    bossMin,
    bossMax,
    bossMods,
    targetRounds,
    maxSolutions,
    actionBudget,
    solverBudget,
  };
}

function buildMetaRequest(
  options: MetaSeriesBuildOptions,
  request: SeriesLevelRequest
): MetaSeriesLevelRequest {
  const absoluteLevel = absoluteLevelFor(options.startLevel, request.level);
  const profile = buildMetaLevelProfile({
    absoluteLevel,
    startLevel: options.startLevel,
    stage: request.stage,
    requestedTargetRounds: request.targetRounds,
    requestedMinUsedCards: request.minUsedCards,
    baseMinUsedCards: options.minUsedCards,
    options: options.profile,
  });
  return {
    ...request,
    absoluteLevel,
    profile,
  };
}

export function buildMetaLevelSeries(
  options: MetaSeriesBuildOptions,
  deps: MetaSeriesBuildDeps
): MetaSeriesBuildResult {
  if (!deps.generatePuzzle) {
    throw new Error("generatePuzzle dependency is required.");
  }
  if (!Number.isFinite(options.startLevel) || !Number.isFinite(options.endLevel)) {
    throw new Error("startLevel and endLevel must be finite numbers.");
  }
  const startLevel = Math.max(1, Math.floor(options.startLevel));
  const endLevel = Math.max(startLevel, Math.floor(options.endLevel));
  const levelCount = endLevel - startLevel + 1;
  const normalizedOptions: MetaSeriesBuildOptions = {
    ...options,
    startLevel,
    endLevel,
  };
  const coverageUntilLevel =
    typeof normalizedOptions.coverageUntilLevel === "number" &&
    Number.isFinite(normalizedOptions.coverageUntilLevel)
      ? Math.max(0, Math.floor(normalizedOptions.coverageUntilLevel - startLevel + 1))
      : undefined;

  const baseResult = buildLevelSeries(
    {
      seed: normalizedOptions.seed,
      coverageCards: normalizedOptions.coverageCards,
      newCardsPerLevel: normalizedOptions.newCardsPerLevel,
      minUsedCards: normalizedOptions.minUsedCards,
      targetRounds: normalizedOptions.targetRounds,
      maxTargetRounds: normalizedOptions.maxTargetRounds,
      maxAttemptsPerLevel: normalizedOptions.maxAttemptsPerLevel,
      maxRelaxationStages: normalizedOptions.maxRelaxationStages,
      coverageUntilLevel,
      levels: levelCount,
      requireRequiredCardsUsed: normalizedOptions.requireRequiredCardsUsed ?? false,
      requireFullCoverage: normalizedOptions.requireFullCoverage ?? false,
      relaxUntilSuccess: normalizedOptions.relaxUntilSuccess ?? true,
    },
    {
      generatePuzzle(request): Puzzle {
        return deps.generatePuzzle(buildMetaRequest(normalizedOptions, request));
      },
      acceptPuzzle: deps.acceptPuzzle
        ? (puzzle, context) => {
            return deps.acceptPuzzle!(puzzle, {
              request: buildMetaRequest(normalizedOptions, context.request),
              playedSequence: context.playedSequence,
              playedCards: context.playedCards,
            });
          }
        : undefined,
      onProgress: deps.onProgress
        ? (event) => {
            deps.onProgress!(event, {
              absoluteLevel: absoluteLevelFor(startLevel, event.level),
            });
          }
        : undefined,
    }
  );

  const levels: MetaSeriesLevelRecord[] = baseResult.levels.map((record) => {
    const request = buildMetaRequest(normalizedOptions, record.request);
    return {
      ...record,
      absoluteLevel: request.absoluteLevel,
      profile: request.profile,
      request,
    };
  });

  return {
    startLevel,
    endLevel,
    levels,
    coverageOrder: baseResult.coverageOrder,
    coveredCards: baseResult.coveredCards,
    uncoveredCards: baseResult.uncoveredCards,
  };
}
