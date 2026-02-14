import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../../engine/engine";
import { expectThrow, loadCards, makeState, refs, unit } from "./helpers";

const cards = loadCards();

test("ending a round clears lastSpell so echo step cannot replay old spells", () => {
  const setup = makeState({
    player: {
      mana: 2,
      hand: ["echo_step"],
    },
    lastSpell: { cardId: "spark", target: "opponent" },
  });
  const ended = applyAction(setup, { type: "end" }, cards);

  expectThrow(
    () => applyAction(ended, { type: "play", card: "echo_step" }, cards),
    /No spell to repeat/
  );
});

test("multiple bone requiem effects clone strongest boss creature multiple times", () => {
  const setup = makeState({
    player: {
      mana: 3,
      hand: ["blightwave"],
      board: [
        unit(cards, "bone_requiem"),
        unit(cards, "bone_requiem"),
        unit(cards, "cultist"),
        unit(cards, "cultist"),
      ],
    },
    opponent: {
      board: [unit(cards, "behemoth"), unit(cards, "cultist"), unit(cards, "cultist")],
    },
  });
  const afterWave = applyAction(setup, { type: "play", card: "blightwave" }, cards);
  const ended = applyAction(afterWave, { type: "end" }, cards);

  const clones = ended.player.board.filter((entry) => entry.card === "behemoth");
  assert.equal(clones.length, 2);
  assert.equal(clones[0].power, 9);
  assert.equal(clones[1].power, 9);
});

test("gravecaller death splash and scavenger buffs resolve in one death pass", () => {
  const state = makeState({
    player: {
      board: [unit(cards, "gravewatcher"), unit(cards, "gravecaller")],
    },
    opponent: {
      board: [unit(cards, "ox"), unit(cards, "cultist"), unit(cards, "cultist")],
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

  assert.equal(next.player.board.length, 1);
  assert.equal(next.player.board[0].card, "gravewatcher");
  assert.equal(next.player.board[0].power, 4);
  assert.equal(next.opponent.board.length, 1);
  assert.equal(next.opponent.board[0].card, "ox");
  assert.equal(next.opponent.board[0].power, 1);
});

test("turncoat return preserves creature mods while doubling power", () => {
  const setup = makeState({
    player: {
      mana: 3,
      hand: ["turncoat"],
    },
    opponent: {
      board: [unit(cards, "spider", { mods: ["blood_pact"], power: 2 })],
    },
  });
  const borrowed = applyAction(
    setup,
    {
      type: "play",
      card: "turncoat",
      target: refs.opponent(0),
    },
    cards
  );
  const ended = applyAction(borrowed, { type: "end" }, cards);

  assert.equal(ended.opponent.board.length, 1);
  assert.equal(ended.opponent.board[0].power, 4);
  assert.deepEqual(ended.opponent.board[0].mods, ["blood_pact"]);
});
