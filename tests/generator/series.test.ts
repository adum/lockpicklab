import test from "node:test";
import assert from "node:assert/strict";
import type { Puzzle } from "../../engine/types";
import {
  buildLevelSeries,
  extractPlayedCards,
  extractPlayedSequence,
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

test("buildLevelSeries throws when level cannot be generated", () => {
  assert.throws(
    () =>
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
      ),
    /Failed to generate level 1/
  );
});
