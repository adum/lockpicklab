import test from "node:test";
import assert from "node:assert/strict";
import type { CardLibrary, GameState } from "../../engine/types";
import {
  createDfsState,
  stepDfsSearch,
  type SolverEngine,
} from "../../solver/core";
import { makeState } from "../engine/helpers";

const dummyCards: CardLibrary = { byId: {} };

function damageEngine(amount = 1): SolverEngine {
  return {
    isWin(state: GameState): boolean {
      return state.opponent.health <= 0;
    },
    getLegalActions(state) {
      if (state.opponent.health <= 0) {
        return [];
      }
      return [{ type: "play", card: "hit" }];
    },
    applyAction(state) {
      return {
        ...state,
        opponent: {
          ...state.opponent,
          health: state.opponent.health - amount,
        },
      };
    },
  };
}

test("stepDfsSearch enforces maxDepth and stops before deeper winning branches", () => {
  const start = makeState({
    opponent: { health: 2 },
    targetRounds: 99,
  });
  const search = createDfsState(start, {
    maxDepth: 1,
    recordPaths: true,
  });

  const result = stepDfsSearch(search, dummyCards, damageEngine(), {
    iterationLimit: 20,
  });

  assert.equal(result.status, "done");
  assert.equal(search.wins, 0);
  assert.equal(search.visited, 2);
  assert.equal(search.expanded, 1);
  assert.equal(search.stack.length, 0);
});

test("stepDfsSearch enforces maxNodes budget", () => {
  const start = makeState({
    opponent: { health: 5 },
    targetRounds: 99,
  });
  const search = createDfsState(start, {
    maxNodes: 1,
  });

  const result = stepDfsSearch(search, dummyCards, damageEngine(), {
    iterationLimit: 20,
  });

  assert.equal(result.status, "budget");
  assert.equal(search.visited, 1);
  assert.equal(search.expanded, 0);
});

test("stepDfsSearch enforces maxSeen budget", () => {
  const start = makeState({
    opponent: { health: 5 },
    targetRounds: 99,
  });
  const search = createDfsState(start, {
    maxSeen: 1,
  });

  const result = stepDfsSearch(search, dummyCards, damageEngine(), {
    iterationLimit: 20,
  });

  assert.equal(result.status, "budget");
  assert.equal(search.visited, 1);
  assert.equal(search.seen.size, 1);
  assert.equal(search.expanded, 0);
});

test("stepDfsSearch respects maxWins and records winning paths", () => {
  const start = makeState({
    opponent: { health: 0 },
    targetRounds: 99,
  });
  const search = createDfsState(start, {
    maxWins: 1,
    recordPaths: true,
  });

  const result = stepDfsSearch(search, dummyCards, damageEngine(), {
    iterationLimit: 20,
  });

  assert.equal(result.status, "max_wins");
  assert.equal(search.wins, 1);
  assert.equal(search.winPaths.length, 1);
  assert.equal(search.winPaths[0].length, 0);
});

test("stepDfsSearch skips end actions on the final round by default", () => {
  let applyCalls = 0;
  const engine: SolverEngine = {
    isWin() {
      return false;
    },
    getLegalActions() {
      return [{ type: "end" }];
    },
    applyAction(state) {
      applyCalls += 1;
      return {
        ...state,
        turn: state.turn + 1,
      };
    },
  };

  const start = makeState({
    turn: 1,
    targetRounds: 1,
  });
  const search = createDfsState(start);
  const result = stepDfsSearch(search, dummyCards, engine, {
    iterationLimit: 20,
  });

  assert.equal(result.status, "done");
  assert.equal(applyCalls, 0);
  assert.equal(search.expanded, 1);
});

test("stepDfsSearch rejects wins via rejectWin callback without incrementing wins", () => {
  const start = makeState({
    opponent: { health: 0 },
    targetRounds: 99,
  });
  const search = createDfsState(start, {
    maxWins: 3,
    recordPaths: true,
  });

  const result = stepDfsSearch(search, dummyCards, damageEngine(), {
    rejectWin: () => "early_win",
  });

  assert.equal(result.status, "reject");
  assert.equal(result.reason, "early_win");
  assert.equal(search.wins, 0);
  assert.equal(search.winPaths.length, 0);
});
