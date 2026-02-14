import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, isWin } from "../../engine/engine";
import {
  applyActions,
  expectThrow,
  loadCards,
  makeState,
  refs,
  unit,
} from "./helpers";

const cards = loadCards();

test("play creature spends mana, removes hand card, and summons unit", () => {
  const state = makeState({
    player: {
      mana: 4,
      hand: ["iron_golem"],
      board: [],
    },
  });
  const next = applyAction(state, { type: "play", card: "iron_golem" }, cards);

  assert.equal(state.player.hand.length, 1, "source state should stay immutable");
  assert.equal(next.player.mana, 2);
  assert.deepEqual(next.player.hand, []);
  assert.equal(next.player.board.length, 1);
  assert.equal(next.player.board[0].card, "iron_golem");
  assert.equal(next.player.board[0].power, 3);
  assert.equal(next.player.board[0].tired, false);
  assert.equal(next.chainCount, 1);
});

test("invalid play fails when card is not in hand", () => {
  const state = makeState({
    player: {
      mana: 10,
      hand: ["fireball"],
    },
  });
  expectThrow(
    () => applyAction(state, { type: "play", card: "iron_golem" }, cards),
    /Card not in hand/
  );
});

test("invalid play fails when mana is insufficient", () => {
  const state = makeState({
    player: {
      mana: 0,
      hand: ["spark"],
    },
  });
  expectThrow(
    () => applyAction(state, { type: "play", card: "spark" }, cards),
    /Not enough mana/
  );
});

test("activate sacrifice consumes source and buffs target", () => {
  const state = makeState({
    player: {
      board: [unit(cards, "cultist"), unit(cards, "iron_golem")],
    },
  });
  const next = applyAction(
    state,
    {
      type: "activate",
      source: refs.player(0),
      target: refs.player(1),
    },
    cards
  );

  assert.equal(next.player.board.length, 1);
  assert.equal(next.player.board[0].card, "iron_golem");
  assert.equal(next.player.board[0].power, 7);
});

test("activate_mana grants mana and destroys arcane reservoir", () => {
  const state = makeState({
    player: {
      mana: 2,
      board: [unit(cards, "arcane_reservoir", { counter: 3 })],
    },
  });
  const next = applyAction(
    state,
    {
      type: "activate",
      source: refs.player(0),
    },
    cards
  );
  assert.equal(next.player.mana, 5);
  assert.equal(next.player.board.length, 0);
});

test("activate_damage spends counters and damages chosen target", () => {
  const state = makeState({
    opponent: { health: 9, board: [unit(cards, "ox")] },
    player: {
      board: [unit(cards, "death_ward", { counter: 5 })],
    },
  });
  const next = applyAction(
    state,
    {
      type: "activate",
      source: refs.player(0),
      target: refs.opponent(0),
    },
    cards
  );
  assert.equal(next.opponent.board[0].power, 2);
  assert.equal(next.player.board[0].counter, 0);
});

test("activate_damage rejects activation below threshold", () => {
  const state = makeState({
    player: {
      board: [unit(cards, "death_ward", { counter: 4 })],
    },
  });
  expectThrow(
    () =>
      applyAction(
        state,
        {
          type: "activate",
          source: refs.player(0),
          target: "opponent",
        },
        cards
      ),
    /Not enough counters/
  );
});

test("end action resets round state, untires creatures, and adds mana per round", () => {
  const state = makeState({
    player: {
      mana: 1,
      board: [unit(cards, "iron_golem", { tired: true })],
    },
    opponent: { poison: 0 },
    chainCount: 3,
    turn: 1,
    manaPerRound: 2,
    roundDeaths: 2,
    lastSpell: { cardId: "spark", target: "opponent" },
  });
  const next = applyAction(state, { type: "end" }, cards);

  assert.equal(next.turn, 2);
  assert.equal(next.player.mana, 3);
  assert.equal(next.player.board[0].tired, false);
  assert.equal(next.chainCount, 0);
  assert.equal(next.roundDeaths, 0);
  assert.equal(next.lastSpell, null);
});

test("win predicate is true only when opponent health <= 0", () => {
  const living = makeState({
    opponent: {
      health: 1,
    },
  });
  const dead = makeState({
    opponent: {
      health: 0,
    },
  });
  assert.equal(isWin(living), false);
  assert.equal(isWin(dead), true);
});

test("multi-action sequence from puzzle example reaches lethal", () => {
  const state = makeState({
    player: {
      mana: 5,
      hand: ["cultist", "lancer"],
    },
    opponent: {
      health: 6,
      board: [unit(cards, "iron_golem")],
    },
  });
  const next = applyActions(
    state,
    [
      { type: "play", card: "cultist" },
      { type: "play", card: "lancer" },
      { type: "activate", source: refs.player(0), target: refs.player(1) },
      { type: "attack", source: refs.player(0), target: refs.opponent(0) },
    ],
    cards
  );
  assert.equal(next.opponent.health, 0);
});
