import test from "node:test";
import assert from "node:assert/strict";
import type { Puzzle } from "../../engine/types";
import {
  DEFAULT_META_PROFILE_OPTIONS,
  buildMetaLevelProfile,
  buildMetaLevelSeries,
  type MetaSeriesLevelRequest,
} from "../../generator/meta";
import { SeriesGenerationError } from "../../generator/series";

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

test("buildMetaLevelProfile grows with level and softens with higher stage", () => {
  const start = buildMetaLevelProfile({
    absoluteLevel: 1,
    startLevel: 1,
    stage: 0,
    requestedTargetRounds: 1,
    requestedMinUsedCards: 2,
    baseMinUsedCards: 2,
    options: {
      ...DEFAULT_META_PROFILE_OPTIONS,
      levelsPerTier: 2,
      roundsMax: 8,
      handSizeMax: 10,
      bossMaxMax: 8,
    },
  });
  const lateStrict = buildMetaLevelProfile({
    absoluteLevel: 9,
    startLevel: 1,
    stage: 0,
    requestedTargetRounds: 1,
    requestedMinUsedCards: 2,
    baseMinUsedCards: 2,
    options: {
      ...DEFAULT_META_PROFILE_OPTIONS,
      levelsPerTier: 2,
      roundsMax: 8,
      handSizeMax: 10,
      bossMaxMax: 8,
    },
  });
  const lateRelaxed = buildMetaLevelProfile({
    absoluteLevel: 9,
    startLevel: 1,
    stage: 8,
    requestedTargetRounds: 1,
    requestedMinUsedCards: 2,
    baseMinUsedCards: 2,
    options: {
      ...DEFAULT_META_PROFILE_OPTIONS,
      levelsPerTier: 2,
      roundsMax: 8,
      handSizeMax: 10,
      bossMaxMax: 8,
    },
  });

  assert.ok(lateStrict.handSize >= start.handSize);
  assert.ok(lateStrict.targetRounds >= start.targetRounds);
  assert.ok(lateStrict.bossMax >= start.bossMax);
  assert.ok(lateRelaxed.handSize <= lateStrict.handSize);
  assert.ok(lateRelaxed.targetRounds <= lateStrict.targetRounds);
  assert.ok(lateRelaxed.maxSolutions >= lateStrict.maxSolutions);
});

test("buildMetaLevelProfile scaling is based on absolute level, not run start", () => {
  const profileFromStartOne = buildMetaLevelProfile({
    absoluteLevel: 31,
    startLevel: 1,
    stage: 0,
    requestedTargetRounds: 1,
    requestedMinUsedCards: 2,
    baseMinUsedCards: 2,
    options: DEFAULT_META_PROFILE_OPTIONS,
  });
  const profileFromStartThirtyOne = buildMetaLevelProfile({
    absoluteLevel: 31,
    startLevel: 31,
    stage: 0,
    requestedTargetRounds: 1,
    requestedMinUsedCards: 2,
    baseMinUsedCards: 2,
    options: DEFAULT_META_PROFILE_OPTIONS,
  });

  assert.equal(profileFromStartOne.tier, profileFromStartThirtyOne.tier);
  assert.equal(profileFromStartOne.handSize, profileFromStartThirtyOne.handSize);
  assert.equal(
    profileFromStartOne.targetRounds,
    profileFromStartThirtyOne.targetRounds
  );
  assert.equal(profileFromStartOne.bossMax, profileFromStartThirtyOne.bossMax);
});

test("buildMetaLevelSeries maps absolute levels and profiles", () => {
  const seenRequests: MetaSeriesLevelRequest[] = [];
  const result = buildMetaLevelSeries(
    {
      seed: 41,
      startLevel: 10,
      endLevel: 12,
      coverageCards: ["a", "b"],
      newCardsPerLevel: 1,
      minUsedCards: 1,
      targetRounds: [1],
      maxTargetRounds: 3,
      maxAttemptsPerLevel: 2,
      maxRelaxationStages: 4,
      profile: {
        ...DEFAULT_META_PROFILE_OPTIONS,
        levelsPerTier: 1,
        roundsMax: 4,
        handSizeMax: 6,
        bossMaxMax: 4,
      },
      requireFullCoverage: false,
      relaxUntilSuccess: true,
    },
    {
      generatePuzzle(request) {
        seenRequests.push(request);
        const minCards = Math.max(
          1,
          request.minUsedCards,
          request.profile.minHandSize,
          request.requiredCards.length
        );
        const plays = [...request.requiredCards];
        while (plays.length < minCards) {
          plays.push("filler");
        }
        return makePuzzle(plays);
      },
    }
  );

  assert.equal(result.levels.length, 3);
  assert.deepEqual(
    result.levels.map((level) => level.absoluteLevel),
    [10, 11, 12]
  );
  assert.deepEqual(result.coveredCards, ["a", "b"]);
  assert.equal(seenRequests[0].absoluteLevel, 10);
  assert.ok(seenRequests[0].profile.handSize >= 1);
});

test("buildMetaLevelSeries respects maxRelaxationStages", () => {
  let thrown: unknown;
  try {
    buildMetaLevelSeries(
      {
        seed: 99,
        startLevel: 1,
        endLevel: 1,
        coverageCards: ["spark"],
        newCardsPerLevel: 1,
        minUsedCards: 1,
        targetRounds: [1],
        maxTargetRounds: 3,
        maxAttemptsPerLevel: 2,
        maxRelaxationStages: 2,
        profile: DEFAULT_META_PROFILE_OPTIONS,
        requireFullCoverage: false,
        relaxUntilSuccess: true,
      },
      {
        generatePuzzle() {
          throw new Error("always fail");
        },
      }
    );
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof SeriesGenerationError);
  const failure = thrown as SeriesGenerationError;
  assert.equal(failure.context.lastStage, 1);
  assert.equal(failure.context.attemptStats.attempted, 4);
});

test("buildMetaLevelSeries can disable coverage after an absolute level cutoff", () => {
  const seenRequests: MetaSeriesLevelRequest[] = [];
  const result = buildMetaLevelSeries(
    {
      seed: 77,
      startLevel: 10,
      endLevel: 12,
      coverageUntilLevel: 11,
      coverageCards: ["a", "b", "c"],
      newCardsPerLevel: 1,
      minUsedCards: 1,
      targetRounds: [1],
      maxTargetRounds: 3,
      maxAttemptsPerLevel: 2,
      maxRelaxationStages: 4,
      profile: DEFAULT_META_PROFILE_OPTIONS,
      requireFullCoverage: false,
      relaxUntilSuccess: true,
    },
    {
      generatePuzzle(request) {
        seenRequests.push(request);
        if (request.absoluteLevel === 10) {
          return makePuzzle(["a"]);
        }
        if (request.absoluteLevel === 11) {
          return makePuzzle(["b"]);
        }
        return makePuzzle(["filler"]);
      },
    }
  );

  assert.equal(result.levels.length, 3);
  assert.deepEqual(
    seenRequests.map((request) => request.requiredCards),
    [["a"], ["b"], []]
  );
  assert.deepEqual(result.coveredCards, ["a", "b"]);
  assert.deepEqual(result.uncoveredCards, ["c"]);
});
