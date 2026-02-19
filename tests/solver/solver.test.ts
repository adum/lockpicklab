import test from "node:test";
import assert from "node:assert/strict";
import { solve } from "../../solver/solver";
import { loadCards, makeState } from "../engine/helpers";

test("solve reports budget status when maxNodes is reached", () => {
  const cards = loadCards();
  const state = makeState({
    player: {
      mana: 0,
      hand: [],
      board: [],
    },
    opponent: {
      health: 5,
      board: [],
    },
    targetRounds: 1,
  });

  const result = solve(state, cards, {
    maxWins: 1,
    maxNodes: 1,
    maxSeen: 1,
  });

  assert.equal(result.status, "budget");
  assert.equal(result.visited, 1);
});

test("solve reports max_wins when the first node is already winning", () => {
  const cards = loadCards();
  const state = makeState({
    opponent: {
      health: 0,
      board: [],
    },
    targetRounds: 1,
  });

  const result = solve(state, cards, { maxWins: 1 });

  assert.equal(result.status, "max_wins");
  assert.equal(result.wins.length, 1);
});

test("solve emits progress updates and terminal status", () => {
  const cards = loadCards();
  const state = makeState({
    opponent: {
      health: 0,
      board: [],
    },
    targetRounds: 1,
  });
  const seenStatuses: string[] = [];

  solve(state, cards, {
    maxWins: 1,
    onProgress(progress) {
      seenStatuses.push(progress.status);
    },
  });

  assert.ok(seenStatuses.length >= 1);
  assert.equal(seenStatuses[seenStatuses.length - 1], "max_wins");
});
