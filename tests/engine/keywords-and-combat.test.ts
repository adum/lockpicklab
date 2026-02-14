import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../../engine/engine";
import { expectThrow, loadCards, makeState, refs, unit } from "./helpers";

const cards = loadCards();

test("guard forces attacks to target guard creatures first", () => {
  const state = makeState({
    player: {
      board: [unit(cards, "lancer")],
    },
    opponent: {
      board: [unit(cards, "ox"), unit(cards, "spider")],
    },
  });

  expectThrow(
    () =>
      applyAction(
        state,
        {
          type: "attack",
          source: refs.player(0),
          target: refs.opponent(1),
        },
        cards
      ),
    /Guard is present/
  );
});

test("attacking opponent directly is blocked while enemy creatures exist", () => {
  const state = makeState({
    player: {
      board: [unit(cards, "lancer")],
    },
    opponent: {
      board: [unit(cards, "spider")],
    },
  });

  expectThrow(
    () =>
      applyAction(
        state,
        {
          type: "attack",
          source: refs.player(0),
          target: "opponent",
        },
        cards
      ),
    /Enemy minions are present/
  );
});

test("pierce deals excess combat damage to opponent", () => {
  const state = makeState({
    player: {
      board: [unit(cards, "lancer", { power: 7 })],
    },
    opponent: {
      health: 10,
      board: [unit(cards, "spider", { power: 2 })],
    },
  });
  const next = applyAction(
    state,
    {
      type: "attack",
      source: refs.player(0),
      target: refs.opponent(0),
    },
    cards
  );

  assert.equal(next.opponent.health, 5, "2 lethal to defender and 5 pierce");
});

test("testudo prevents combat damage while flanked", () => {
  const state = makeState({
    player: {
      board: [unit(cards, "lancer")],
    },
    opponent: {
      board: [
        unit(cards, "spider"),
        unit(cards, "behemoth", { keywords: ["testudo"] }),
        unit(cards, "spider"),
      ],
    },
  });
  const next = applyAction(
    state,
    {
      type: "attack",
      source: refs.player(0),
      target: refs.opponent(1),
    },
    cards
  );

  assert.equal(next.opponent.board[1].power, 11, "defender takes no damage");
  assert.equal(next.player.board.length, 0, "attacker still takes retaliation");
});

test("venom adds poison token to attacked creature", () => {
  const state = makeState({
    player: {
      board: [unit(cards, "spider")],
    },
    opponent: {
      board: [unit(cards, "ox")],
    },
  });
  const next = applyAction(
    state,
    {
      type: "attack",
      source: refs.player(0),
      target: refs.opponent(0),
    },
    cards
  );
  assert.equal(next.opponent.board[0].poison, 1);
});

test("brood spawns broodling when damaged and surviving", () => {
  const state = makeState({
    player: {
      board: [unit(cards, "relay_spearman")],
    },
    opponent: {
      board: [unit(cards, "broodmother")],
    },
  });
  const next = applyAction(
    state,
    {
      type: "attack",
      source: refs.player(0),
      target: refs.opponent(0),
    },
    cards
  );

  assert.equal(next.opponent.board.length, 2);
  assert.equal(next.opponent.board[0].card, "broodmother");
  assert.equal(next.opponent.board[0].power, 1);
  assert.equal(next.opponent.board[1].card, "broodling");
});

test("scavenger gains power whenever another creature dies", () => {
  const state = makeState({
    player: {
      board: [unit(cards, "gravewatcher"), unit(cards, "cultist")],
    },
    opponent: {
      board: [unit(cards, "ox")],
    },
  });
  const next = applyAction(
    state,
    {
      type: "attack",
      source: refs.player(1),
      target: refs.opponent(0),
    },
    cards
  );

  assert.equal(next.player.board[0].card, "gravewatcher");
  assert.equal(next.player.board[0].power, 2);
});

test("rebirth resurrects dead creature with +1 power", () => {
  const state = makeState({
    player: {
      mana: 4,
      hand: ["fireball"],
    },
    opponent: {
      board: [unit(cards, "emberling")],
    },
  });
  const next = applyAction(
    state,
    {
      type: "play",
      card: "fireball",
      target: refs.opponent(0),
    },
    cards
  );

  assert.equal(next.opponent.board.length, 1);
  assert.equal(next.opponent.board[0].card, "emberling");
  assert.equal(next.opponent.board[0].power, 2);
  assert.equal(next.opponent.board[0].rebirths, 1);
});

test("relay buffs adjacent allies by damage dealt", () => {
  const state = makeState({
    player: {
      board: [
        unit(cards, "iron_golem"),
        unit(cards, "relay_spearman"),
        unit(cards, "iron_golem"),
      ],
    },
    opponent: {
      board: [unit(cards, "ox")],
    },
  });
  const next = applyAction(
    state,
    {
      type: "attack",
      source: refs.player(1),
      target: refs.opponent(0),
    },
    cards
  );

  assert.equal(next.player.board.length, 2, "relay attacker dies");
  assert.equal(next.player.board[0].power, 5);
  assert.equal(next.player.board[1].power, 5);
});

test("order creature requires ready ally and tires all allies when played", () => {
  const noAlly = makeState({
    player: {
      mana: 2,
      hand: ["line_captain"],
      board: [],
    },
  });
  expectThrow(
    () => applyAction(noAlly, { type: "play", card: "line_captain" }, cards),
    /Requires an untired creature/
  );

  const withAlly = makeState({
    player: {
      mana: 4,
      hand: ["line_captain"],
      board: [unit(cards, "iron_golem", { tired: false })],
    },
  });
  const next = applyAction(
    withAlly,
    { type: "play", card: "line_captain" },
    cards
  );
  assert.equal(next.player.board.length, 2);
  assert.equal(next.player.board[0].tired, true);
  assert.equal(next.player.board[1].tired, true);
});

test("sleepy creature enters tired", () => {
  const state = makeState({
    player: {
      mana: 1,
      hand: ["drowsy_squire"],
    },
  });
  const next = applyAction(
    state,
    {
      type: "play",
      card: "drowsy_squire",
    },
    cards
  );
  assert.equal(next.player.board[0].tired, true);
});

test("anchored no_attack mod prevents attacking", () => {
  const state = makeState({
    player: {
      board: [unit(cards, "lancer", { mods: ["anchored"] })],
    },
    opponent: {
      board: [unit(cards, "ox")],
    },
  });
  expectThrow(
    () =>
      applyAction(
        state,
        {
          type: "attack",
          source: refs.player(0),
          target: refs.opponent(0),
        },
        cards
      ),
    /cannot attack/
  );
});
