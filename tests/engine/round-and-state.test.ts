import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../../engine/engine";
import { cloneState, normalizeState } from "../../engine/state";
import { loadCards, makeState, refs, unit } from "./helpers";

const cards = loadCards();

test("normalizeState assigns UIDs and default instance fields", () => {
  const state = normalizeState({
    player: {
      mana: 0,
      hand: [],
      board: [
        {
          card: "cultist",
          power: 1,
          keywords: ["sacrifice"],
          mods: [],
          tired: false,
        },
      ],
    },
    opponent: {
      health: 10,
      board: [],
    },
  });

  assert.ok(state.player.board[0].uid);
  assert.equal(state.player.board[0].shield, 0);
  assert.equal(state.player.board[0].poison, 0);
  assert.equal(state.player.board[0].counter, 0);
  assert.equal(state.opponent.poison, 0);
});

test("cloneState is deep and does not mutate source", () => {
  const state = makeState({
    player: {
      mana: 2,
      hand: ["spark"],
      board: [unit(cards, "iron_golem")],
    },
  });
  const cloned = cloneState(state);
  cloned.player.mana = 99;
  cloned.player.hand.push("fireball");
  cloned.player.board[0].power = 42;

  assert.equal(state.player.mana, 2);
  assert.deepEqual(state.player.hand, ["spark"]);
  assert.equal(state.player.board[0].power, 3);
});

test("end applies poison damage to units and opponent", () => {
  const state = makeState({
    player: {
      board: [unit(cards, "iron_golem", { poison: 1 })],
    },
    opponent: {
      health: 12,
      poison: 2,
      board: [unit(cards, "ox", { poison: 2 })],
    },
  });
  const next = applyAction(state, { type: "end" }, cards);

  assert.equal(next.player.board[0].power, 2);
  assert.equal(next.opponent.board[0].power, 3);
  assert.equal(next.opponent.health, 10);
});

test("borrowed creatures return to opponent at end with default x2 multiplier", () => {
  const state = makeState({
    player: {
      board: [unit(cards, "spider", { borrowed: true, borrowedMultiplier: 0, power: 2 })],
    },
    opponent: {
      board: [],
    },
  });
  const next = applyAction(state, { type: "end" }, cards);

  assert.equal(next.player.board.length, 0);
  assert.equal(next.opponent.board.length, 1);
  assert.equal(next.opponent.board[0].card, "spider");
  assert.equal(next.opponent.board[0].power, 4);
  assert.equal(next.opponent.board[0].borrowed, false);
});

test("roundDeaths increments on deaths and resets at end", () => {
  const setup = makeState({
    player: {
      mana: 4,
      hand: ["fireball"],
    },
    opponent: {
      board: [unit(cards, "cultist")],
    },
  });
  const afterKill = applyAction(
    setup,
    {
      type: "play",
      card: "fireball",
      target: refs.opponent(0),
    },
    cards
  );
  assert.equal(afterKill.roundDeaths, 1);

  const ended = applyAction(afterKill, { type: "end" }, cards);
  assert.equal(ended.roundDeaths, 0);
});

test("end_mana effects apply before manaPerRound refill", () => {
  const state = makeState({
    player: {
      mana: 5,
      board: [unit(cards, "debt_ledger")],
    },
    manaPerRound: 2,
  });
  const next = applyAction(state, { type: "end" }, cards);
  assert.equal(next.player.mana, 5, "5 - 2 from ledger + 2 refill");
});

test("end untires all player board entries after processing", () => {
  const state = makeState({
    player: {
      board: [unit(cards, "iron_golem", { tired: true }), unit(cards, "war_banner", { tired: true })],
    },
  });
  const next = applyAction(state, { type: "end" }, cards);
  assert.equal(next.player.board[0].tired, false);
  assert.equal(next.player.board[1].tired, false);
});
