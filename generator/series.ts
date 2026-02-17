import type { Puzzle } from "../engine/types";

export interface SeriesLevelRequest {
  level: number;
  attempt: number;
  stage: number;
  seed: number;
  targetRounds: number;
  requiredCards: string[];
  minUsedCards: number;
}

export interface SeriesLevelRecord {
  level: number;
  attemptCount: number;
  request: SeriesLevelRequest;
  puzzle: Puzzle;
  playedSequence: string[];
  playedCards: string[];
  newlyCovered: string[];
  coveredCards: string[];
}

export interface SeriesBuildOptions {
  seed: number;
  coverageCards: string[];
  newCardsPerLevel: number;
  minUsedCards: number;
  targetRounds: number[];
  maxTargetRounds?: number;
  maxAttemptsPerLevel: number;
  levels?: number;
  requireRequiredCardsUsed?: boolean;
  requireFullCoverage?: boolean;
  relaxUntilSuccess?: boolean;
}

export interface SeriesBuildDeps {
  generatePuzzle: (request: SeriesLevelRequest) => Puzzle;
  acceptPuzzle?: (
    puzzle: Puzzle,
    context: {
      request: SeriesLevelRequest;
      playedSequence: string[];
      playedCards: string[];
    }
  ) => boolean;
  onProgress?: (event: SeriesProgressEvent) => void;
}

export interface SeriesBuildResult {
  levels: SeriesLevelRecord[];
  coverageOrder: string[];
  coveredCards: string[];
  uncoveredCards: string[];
}

export interface SeriesLevelFailureContext {
  level: number;
  maxAttempts: number;
  lastStage: number;
  lastStageRelaxation: SeriesStageRelaxation;
  lastStageMinUsedCards: number;
  lastStageTargetRoundsCap: number;
  requiredCards: string[];
  neededNewCoverage: number;
  lastError?: string;
  lastRequest?: SeriesLevelRequest;
  attemptStats: {
    attempted: number;
    generateErrors: number;
    rejectedMinUsedCards: number;
    rejectedCoverage: number;
    rejectedRequiredCards: number;
    rejectedCustomAccept: number;
  };
}

export class SeriesGenerationError extends Error {
  readonly context: SeriesLevelFailureContext;

  constructor(message: string, context: SeriesLevelFailureContext) {
    super(message);
    this.name = "SeriesGenerationError";
    this.context = context;
  }
}

export type SeriesStageRelaxation =
  | "strict_start"
  | "lower_required_cards"
  | "lower_min_used_cards"
  | "increase_target_rounds"
  | "min_constraints_retry";

export type SeriesProgressEvent =
  | {
      type: "level_start";
      level: number;
      stage: number;
      relaxation: SeriesStageRelaxation;
      requiredCards: string[];
      requiredCardCount: number;
      neededNewCoverage: number;
      minUsedCards: number;
      targetRoundsCap: number;
      maxAttempts: number;
    }
  | {
      type: "level_relax";
      level: number;
      stage: number;
      relaxation: SeriesStageRelaxation;
      requiredCards: string[];
      requiredCardCount: number;
      neededNewCoverage: number;
      minUsedCards: number;
      targetRoundsCap: number;
      maxAttempts: number;
    }
  | {
      type: "attempt_start";
      level: number;
      attempt: number;
      overallAttempt: number;
      stage: number;
      maxStageAttempts: number;
      request: SeriesLevelRequest;
      neededNewCoverage: number;
    }
  | {
      type: "attempt_error";
      level: number;
      attempt: number;
      overallAttempt: number;
      stage: number;
      message: string;
    }
  | {
      type: "attempt_reject";
      level: number;
      attempt: number;
      overallAttempt: number;
      stage: number;
      reason:
        | "min_used_cards"
        | "coverage"
        | "required_cards"
        | "custom_accept";
    }
  | {
      type: "level_success";
      level: number;
      attempt: number;
      overallAttempt: number;
      stage: number;
      newlyCovered: string[];
      coveredCount: number;
      totalCoverage: number;
    };

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  values.forEach((raw) => {
    const value = raw.trim();
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    unique.push(value);
  });
  return unique;
}

function nextRequiredCards(
  coverageOrder: string[],
  covered: Set<string>,
  count: number
): string[] {
  const required: string[] = [];
  for (const cardId of coverageOrder) {
    if (covered.has(cardId)) {
      continue;
    }
    required.push(cardId);
    if (required.length >= count) {
      break;
    }
  }
  return required;
}

function levelSeed(baseSeed: number, level: number, attempt: number): number {
  return (baseSeed + level * 100003 + attempt * 101) >>> 0;
}

export function extractPlayedSequence(puzzle: Puzzle): string[] {
  const actions = Array.isArray(puzzle.solution) ? puzzle.solution : [];
  return actions
    .filter((action) => action.type === "play")
    .map((action) => action.card);
}

export function extractPlayedCards(puzzle: Puzzle): string[] {
  const seen = new Set<string>();
  const cards: string[] = [];
  extractPlayedSequence(puzzle).forEach((cardId) => {
    if (!cardId || seen.has(cardId)) {
      return;
    }
    seen.add(cardId);
    cards.push(cardId);
  });
  return cards;
}

export function buildLevelSeries(
  options: SeriesBuildOptions,
  deps: SeriesBuildDeps
): SeriesBuildResult {
  const coverageOrder = uniqueNonEmpty(options.coverageCards ?? []);
  const targetRounds = (options.targetRounds ?? []).filter(
    (value) => Number.isFinite(value) && value >= 1
  );
  if (coverageOrder.length === 0) {
    throw new Error("Coverage card list is empty.");
  }
  if (!Number.isFinite(options.newCardsPerLevel) || options.newCardsPerLevel < 1) {
    throw new Error("newCardsPerLevel must be >= 1.");
  }
  if (!Number.isFinite(options.maxAttemptsPerLevel) || options.maxAttemptsPerLevel < 1) {
    throw new Error("maxAttemptsPerLevel must be >= 1.");
  }
  if (targetRounds.length === 0) {
    throw new Error("At least one targetRounds value is required.");
  }
  if (!deps.generatePuzzle) {
    throw new Error("generatePuzzle dependency is required.");
  }
  const maxTargetRounds =
    typeof options.maxTargetRounds === "number" &&
    Number.isFinite(options.maxTargetRounds)
      ? Math.max(1, Math.floor(options.maxTargetRounds))
      : 3;
  const normalizedTargetRounds = uniqueNonEmpty(
    targetRounds.map((round) => String(Math.min(maxTargetRounds, Math.max(1, round))))
  ).map((value) => Number(value));

  const covered = new Set<string>();
  const levels: SeriesLevelRecord[] = [];
  const requiredPerLevel = Math.max(1, Math.floor(options.newCardsPerLevel));
  const requireRequiredCardsUsed = options.requireRequiredCardsUsed ?? false;
  const requireFullCoverage = options.requireFullCoverage ?? true;
  const relaxUntilSuccess = options.relaxUntilSuccess ?? false;
  const minUsedCards = Math.max(0, Math.floor(options.minUsedCards));
  const explicitLevels =
    typeof options.levels === "number" && Number.isFinite(options.levels)
      ? Math.max(1, Math.floor(options.levels))
      : null;
  const levelLimit = explicitLevels ?? coverageOrder.length;

  for (let level = 1; level <= levelLimit; level += 1) {
    const uncoveredAtLevelStart = coverageOrder.filter((cardId) => !covered.has(cardId));
    const strictRequiredCount = Math.min(requiredPerLevel, uncoveredAtLevelStart.length);
    const minRequiredCount = uncoveredAtLevelStart.length > 0 ? 1 : 0;
    const minNeededCoverage = uncoveredAtLevelStart.length > 0 ? 1 : 0;
    let accepted: SeriesLevelRecord | null = null;
    let lastError: string | null = null;
    let lastRequest: SeriesLevelRequest | undefined;
    let lastRequiredCards: string[] = [];
    let lastNeededNewCoverage = Math.min(
      strictRequiredCount,
      uncoveredAtLevelStart.length
    );
    let lastStage = 0;
    let lastStageRelaxation: SeriesStageRelaxation = "strict_start";
    let lastStageMinUsedCards = Math.max(minUsedCards, strictRequiredCount);
    let lastStageTargetRoundsCap =
      normalizedTargetRounds.length > 0
        ? Math.max(...normalizedTargetRounds)
        : 1;
    const attemptStats = {
      attempted: 0,
      generateErrors: 0,
      rejectedMinUsedCards: 0,
      rejectedCoverage: 0,
      rejectedRequiredCards: 0,
      rejectedCustomAccept: 0,
    };
    let stage = 0;
    let requiredCount = strictRequiredCount;
    let stageMinUsedCards = Math.max(minUsedCards, strictRequiredCount);
    let stageTargetRoundsCap = lastStageTargetRoundsCap;
    let stageRelaxation: SeriesStageRelaxation = "strict_start";

    while (!accepted) {
      const neededNewCoverage = Math.min(requiredCount, uncoveredAtLevelStart.length);
      const requiredCards = nextRequiredCards(coverageOrder, covered, requiredCount);
      const stageRequestMinUsed = Math.max(stageMinUsedCards, neededNewCoverage);
      lastRequiredCards = requiredCards;
      lastNeededNewCoverage = neededNewCoverage;
      lastStage = stage;
      lastStageRelaxation = stageRelaxation;
      lastStageMinUsedCards = stageRequestMinUsed;
      lastStageTargetRoundsCap = stageTargetRoundsCap;
      deps.onProgress?.({
        type: stage === 0 ? "level_start" : "level_relax",
        level,
        stage,
        relaxation: stageRelaxation,
        requiredCards,
        requiredCardCount: requiredCount,
        neededNewCoverage,
        minUsedCards: stageRequestMinUsed,
        targetRoundsCap: stageTargetRoundsCap,
        maxAttempts: options.maxAttemptsPerLevel,
      });

      for (
        let stageAttempt = 1;
        stageAttempt <= options.maxAttemptsPerLevel;
        stageAttempt += 1
      ) {
        const stageRoundChoices: number[] = [];
        normalizedTargetRounds
          .filter((round) => round <= stageTargetRoundsCap)
          .forEach((round) => {
            if (!stageRoundChoices.includes(round)) {
              stageRoundChoices.push(round);
            }
          });
        for (let round = 1; round <= stageTargetRoundsCap; round += 1) {
          if (!stageRoundChoices.includes(round)) {
            stageRoundChoices.push(round);
          }
        }
        const roundIndex = (level - 1 + stageAttempt - 1 + stage) % stageRoundChoices.length;
        const roundChoice = stageRoundChoices[roundIndex];
        const overallAttempt = attemptStats.attempted + 1;
        const request: SeriesLevelRequest = {
          level,
          attempt: overallAttempt,
          stage,
          seed: levelSeed(options.seed, level, overallAttempt),
          targetRounds: roundChoice,
          requiredCards,
          minUsedCards: stageRequestMinUsed,
        };
        lastRequest = request;
        attemptStats.attempted += 1;
        deps.onProgress?.({
          type: "attempt_start",
          level,
          attempt: stageAttempt,
          overallAttempt,
          stage,
          maxStageAttempts: options.maxAttemptsPerLevel,
          request,
          neededNewCoverage,
        });
        let puzzle: Puzzle;
        try {
          puzzle = deps.generatePuzzle(request);
        } catch (error) {
          const detail =
            error instanceof Error ? error.message : "unknown generation error";
          lastError = detail;
          attemptStats.generateErrors += 1;
          deps.onProgress?.({
            type: "attempt_error",
            level,
            attempt: stageAttempt,
            overallAttempt,
            stage,
            message: detail,
          });
          continue;
        }
        const playedSequence = extractPlayedSequence(puzzle);
        if (playedSequence.length < request.minUsedCards) {
          attemptStats.rejectedMinUsedCards += 1;
          deps.onProgress?.({
            type: "attempt_reject",
            level,
            attempt: stageAttempt,
            overallAttempt,
            stage,
            reason: "min_used_cards",
          });
          continue;
        }
        const playedCards = extractPlayedCards(puzzle);
        const newlyCovered = playedCards.filter(
          (cardId) => coverageOrder.includes(cardId) && !covered.has(cardId)
        );
        if (newlyCovered.length < neededNewCoverage) {
          attemptStats.rejectedCoverage += 1;
          deps.onProgress?.({
            type: "attempt_reject",
            level,
            attempt: stageAttempt,
            overallAttempt,
            stage,
            reason: "coverage",
          });
          continue;
        }
        if (
          requireRequiredCardsUsed &&
          requiredCards.some((cardId) => !playedCards.includes(cardId))
        ) {
          attemptStats.rejectedRequiredCards += 1;
          deps.onProgress?.({
            type: "attempt_reject",
            level,
            attempt: stageAttempt,
            overallAttempt,
            stage,
            reason: "required_cards",
          });
          continue;
        }
        if (
          deps.acceptPuzzle &&
          !deps.acceptPuzzle(puzzle, { request, playedSequence, playedCards })
        ) {
          attemptStats.rejectedCustomAccept += 1;
          deps.onProgress?.({
            type: "attempt_reject",
            level,
            attempt: stageAttempt,
            overallAttempt,
            stage,
            reason: "custom_accept",
          });
          continue;
        }

        newlyCovered.forEach((cardId) => covered.add(cardId));
        deps.onProgress?.({
          type: "level_success",
          level,
          stage,
          attempt: stageAttempt,
          overallAttempt,
          newlyCovered,
          coveredCount: covered.size,
          totalCoverage: coverageOrder.length,
        });
        accepted = {
          level,
          attemptCount: overallAttempt,
          request,
          puzzle,
          playedSequence,
          playedCards,
          newlyCovered,
          coveredCards: coverageOrder.filter((cardId) => covered.has(cardId)),
        };
        break;
      }

      if (accepted) {
        break;
      }
      if (requiredCount > minRequiredCount) {
        requiredCount -= 1;
        stage += 1;
        stageRelaxation = "lower_required_cards";
        continue;
      }
      if (relaxUntilSuccess && stageMinUsedCards > minNeededCoverage) {
        stageMinUsedCards -= 1;
        stage += 1;
        stageRelaxation = "lower_min_used_cards";
        continue;
      }
      if (relaxUntilSuccess && stageTargetRoundsCap < maxTargetRounds) {
        stageTargetRoundsCap += 1;
        stage += 1;
        stageRelaxation = "increase_target_rounds";
        continue;
      }
      if (relaxUntilSuccess) {
        stage += 1;
        stageRelaxation = "min_constraints_retry";
        continue;
      }
      break;
    }

    if (!accepted) {
      const missing =
        lastRequiredCards.length > 0 ? lastRequiredCards.join(", ") : "(none)";
      const suffix = lastError ? ` Last error: ${lastError}` : "";
      throw new SeriesGenerationError(
        `Failed to generate level ${level} after ${attemptStats.attempted} total attempts (${options.maxAttemptsPerLevel} per stage). Required cards: ${missing}. Needed new coverage: ${lastNeededNewCoverage}.${suffix}`,
        {
          level,
          maxAttempts: options.maxAttemptsPerLevel,
          lastStage,
          lastStageRelaxation,
          lastStageMinUsedCards,
          lastStageTargetRoundsCap,
          requiredCards: lastRequiredCards,
          neededNewCoverage: lastNeededNewCoverage,
          lastError: lastError ?? undefined,
          lastRequest,
          attemptStats,
        }
      );
    }
    levels.push(accepted);
    if (explicitLevels === null && coverageOrder.every((cardId) => covered.has(cardId))) {
      break;
    }
  }

  const uncoveredCards = coverageOrder.filter((cardId) => !covered.has(cardId));
  if (requireFullCoverage && uncoveredCards.length > 0) {
    throw new Error(
      `Series completed without full coverage. Uncovered cards: ${uncoveredCards.join(", ")}`
    );
  }

  return {
    levels,
    coverageOrder,
    coveredCards: coverageOrder.filter((cardId) => covered.has(cardId)),
    uncoveredCards,
  };
}
