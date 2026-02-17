import test from "node:test";
import assert from "node:assert/strict";
import type { Puzzle } from "../../engine/types";
import {
  buildLevelSeries,
  extractPlayedCards,
  extractPlayedSequence,
  SeriesGenerationError,
  type SeriesLevelRequest,
} from "../../generator/series";

function makePuzzle(plays: string[]): Puzzle {
  return {
    id: "p",
    difficulty: "easy",
    targetRounds: 1,
    manaPerRound: 0,
    player: {
      mana: 3,
      hand: [...plays],
      board: [],
    },
    opponent: {
      name: "Boss",
      health: 3,
      board: [],
    },
    solution: [
      ...plays.map((card) => ({ type: "play", card } as const)),
      { type: "end" } as const,
    ],
  };
}

function asSeriesGenerationError(error: unknown): SeriesGenerationError {
  if (!(error instanceof SeriesGenerationError)) {
    assert.fail("Expected SeriesGenerationError");
  }
  return error as SeriesGenerationError;
}

test("extractPlayedSequence and extractPlayedCards read solution plays", () => {
  const puzzle = makePuzzle(["spark", "spark", "cleanse"]);
  assert.deepEqual(extractPlayedSequence(puzzle), ["spark", "spark", "cleanse"]);
  assert.deepEqual(extractPlayedCards(puzzle), ["spark", "cleanse"]);
});

test("buildLevelSeries covers cards in required batches", () => {
  const seenRequests: SeriesLevelRequest[] = [];
  const result = buildLevelSeries(
    {
      seed: 42,
      coverageCards: ["a", "b", "c", "d", "e"],
      newCardsPerLevel: 2,
      minUsedCards: 2,
      targetRounds: [1, 2],
      maxAttemptsPerLevel: 3,
    },
    {
      generatePuzzle(request) {
        seenRequests.push(request);
        const plays =
          request.requiredCards.length >= 2
            ? request.requiredCards
            : [...request.requiredCards, "filler"];
        return makePuzzle(plays);
      },
      acceptPuzzle() {
        return true;
      },
    }
  );

  assert.equal(result.levels.length, 3);
  assert.deepEqual(result.uncoveredCards, []);
  assert.deepEqual(result.coveredCards, ["a", "b", "c", "d", "e"]);
  assert.deepEqual(
    result.levels.map((level) => level.request.requiredCards),
    [["a", "b"], ["c", "d"], ["e"]]
  );
  assert.equal(seenRequests.length, 3);
});

test("buildLevelSeries retries when required cards are not played", () => {
  const attemptsByLevel = new Map<number, number>();

  const result = buildLevelSeries(
    {
      seed: 1,
      coverageCards: ["x", "y"],
      newCardsPerLevel: 2,
      minUsedCards: 1,
      targetRounds: [1],
      maxAttemptsPerLevel: 4,
    },
    {
      generatePuzzle(request) {
        const current = (attemptsByLevel.get(request.level) ?? 0) + 1;
        attemptsByLevel.set(request.level, current);
        if (current === 1) {
          return makePuzzle(["x"]);
        }
        return makePuzzle(request.requiredCards);
      },
      acceptPuzzle() {
        return true;
      },
    }
  );

  assert.equal(result.levels.length, 1);
  assert.equal(result.levels[0].attemptCount, 2);
  assert.deepEqual(result.coveredCards, ["x", "y"]);
});

test("buildLevelSeries treats generation errors as retryable attempts", () => {
  let calls = 0;
  const result = buildLevelSeries(
    {
      seed: 9,
      coverageCards: ["spark"],
      newCardsPerLevel: 1,
      minUsedCards: 1,
      targetRounds: [1],
      maxAttemptsPerLevel: 3,
    },
    {
      generatePuzzle(request) {
        calls += 1;
        if (calls === 1) {
          throw new Error("transient failure");
        }
        return makePuzzle(request.requiredCards);
      },
      acceptPuzzle() {
        return true;
      },
    }
  );

  assert.equal(calls, 2);
  assert.equal(result.levels.length, 1);
  assert.equal(result.levels[0].attemptCount, 2);
});

test("buildLevelSeries emits progress events", () => {
  const events: string[] = [];
  buildLevelSeries(
    {
      seed: 3,
      coverageCards: ["spark"],
      newCardsPerLevel: 1,
      minUsedCards: 1,
      targetRounds: [1],
      maxAttemptsPerLevel: 2,
    },
    {
      generatePuzzle(request) {
        return makePuzzle(request.requiredCards);
      },
      onProgress(event) {
        events.push(event.type);
      },
    }
  );

  assert.ok(events.includes("level_start"));
  assert.ok(events.includes("attempt_start"));
  assert.ok(events.includes("level_success"));
});

test("buildLevelSeries throws when level cannot be generated", () => {
  let thrown: unknown;
  try {
    buildLevelSeries(
      {
        seed: 7,
        coverageCards: ["spark", "cleanse"],
        newCardsPerLevel: 2,
        minUsedCards: 2,
        targetRounds: [1, 2],
        maxAttemptsPerLevel: 2,
      },
      {
        generatePuzzle() {
          return makePuzzle(["spark"]);
        },
        acceptPuzzle() {
          return true;
        },
      }
    );
  } catch (error) {
    thrown = error;
  }

  const failure = asSeriesGenerationError(thrown);
  assert.match(failure.message, /Failed to generate level 1/);
  assert.equal(failure.context.level, 1);
  assert.equal(failure.context.maxAttempts, 2);
  assert.deepEqual(failure.context.requiredCards, ["spark"]);
  assert.equal(failure.context.neededNewCoverage, 1);
  assert.equal(failure.context.lastRequest?.level, 1);
  assert.equal(failure.context.lastRequest?.attempt, 4);
  assert.equal(failure.context.lastRequest?.stage, 1);
  assert.equal(failure.context.lastRequest?.minUsedCards, 2);
  assert.equal(failure.context.lastStage, 1);
  assert.equal(failure.context.lastStageRelaxation, "lower_required_cards");
  assert.equal(failure.context.lastStageMinUsedCards, 2);
  assert.equal(failure.context.lastStageTargetRoundsCap, 2);
  assert.deepEqual(failure.context.attemptStats, {
    attempted: 4,
    generateErrors: 0,
    rejectedMinUsedCards: 4,
    rejectedCoverage: 0,
    rejectedRequiredCards: 0,
    rejectedCustomAccept: 0,
  });
});

test("buildLevelSeries tracks generation errors in failure context", () => {
  let thrown: unknown;
  try {
    buildLevelSeries(
      {
        seed: 11,
        coverageCards: ["spark"],
        newCardsPerLevel: 1,
        minUsedCards: 1,
        targetRounds: [1],
        maxAttemptsPerLevel: 2,
      },
      {
        generatePuzzle() {
          throw new Error("transient failure");
        },
      }
    );
  } catch (error) {
    thrown = error;
  }

  const failure = asSeriesGenerationError(thrown);
  assert.equal(failure.context.attemptStats.attempted, 2);
  assert.equal(failure.context.attemptStats.generateErrors, 2);
  assert.equal(failure.context.lastError, "transient failure");
  assert.equal(failure.context.lastStage, 0);
  assert.equal(failure.context.lastStageRelaxation, "strict_start");
  assert.equal(failure.context.lastStageMinUsedCards, 1);
  assert.equal(failure.context.lastStageTargetRoundsCap, 1);
  assert.equal(failure.context.lastRequest?.attempt, 2);
  assert.equal(failure.context.lastRequest?.stage, 0);
  assert.equal(failure.context.lastRequest?.requiredCards.length, 1);
  assert.equal(failure.context.neededNewCoverage, 1);
  assert.deepEqual(failure.context.requiredCards, ["spark"]);
  assert.match(
    failure.message,
    /Required cards: spark\. Needed new coverage: 1\. Last error: transient failure/
  );
});

test("buildLevelSeries can relax until success in unbounded mode", () => {
  const requests: SeriesLevelRequest[] = [];
  let calls = 0;
  const result = buildLevelSeries(
    {
      seed: 21,
      coverageCards: ["spark"],
      newCardsPerLevel: 1,
      minUsedCards: 3,
      targetRounds: [1],
      maxAttemptsPerLevel: 2,
      relaxUntilSuccess: true,
    },
    {
      generatePuzzle(request) {
        calls += 1;
        requests.push(request);
        if (request.minUsedCards > 1) {
          return makePuzzle(["spark"]);
        }
        return makePuzzle(["spark", "filler"]);
      },
    }
  );

  assert.equal(calls, 5);
  assert.equal(result.levels.length, 1);
  assert.equal(result.levels[0].attemptCount, 5);
  assert.equal(result.levels[0].request.stage, 2);
  assert.equal(result.levels[0].request.minUsedCards, 1);
  assert.deepEqual(
    requests.map((request) => request.stage),
    [0, 0, 1, 1, 2]
  );
});

test("buildLevelSeries increases target rounds when other relaxations are exhausted", () => {
  const requests: SeriesLevelRequest[] = [];
  const result = buildLevelSeries(
    {
      seed: 29,
      coverageCards: ["spark"],
      newCardsPerLevel: 1,
      minUsedCards: 1,
      targetRounds: [1],
      maxAttemptsPerLevel: 2,
      relaxUntilSuccess: true,
    },
    {
      generatePuzzle(request) {
        requests.push(request);
        if (request.targetRounds >= 3) {
          return makePuzzle(["spark"]);
        }
        throw new Error("need more rounds");
      },
    }
  );

  assert.equal(result.levels.length, 1);
  assert.equal(result.levels[0].attemptCount, 5);
  assert.equal(Math.max(...requests.map((request) => request.targetRounds)), 3);
  assert.ok(requests.every((request) => request.targetRounds <= 3));
  assert.ok(requests.some((request) => request.targetRounds === 2));
  assert.equal(requests[requests.length - 1].targetRounds, 3);
  assert.deepEqual(
    requests.map((request) => request.stage),
    [0, 0, 1, 1, 2]
  );
});
