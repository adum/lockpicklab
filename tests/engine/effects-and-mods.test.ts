import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../../engine/engine";
import { expectThrow, loadCards, makeState, refs, unit } from "./helpers";

const cards = loadCards();

test("spark uses chain bonus when chainCount is already positive", () => {
  const base = makeState({
    player: { mana: 1, hand: ["spark"] },
    opponent: { health: 10 },
    chainCount: 0,
  });
  const chained = makeState({
    player: { mana: 1, hand: ["spark"] },
    opponent: { health: 10 },
    chainCount: 1,
  });

  const first = applyAction(
    base,
    { type: "play", card: "spark", target: "opponent" },
    cards
  );
  const second = applyAction(
    chained,
    { type: "play", card: "spark", target: "opponent" },
    cards
  );

  assert.equal(first.opponent.health, 8);
  assert.equal(second.opponent.health, 6);
});

test("grant_keyword mod adds pierce to target creature", () => {
  const state = makeState({
    player: {
      mana: 2,
      hand: ["piercing_rune"],
      board: [unit(cards, "iron_golem")],
    },
  });
  const next = applyAction(
    state,
    {
      type: "play",
      card: "piercing_rune",
      target: refs.player(0),
    },
    cards
  );
  assert.ok(next.player.board[0].keywords.includes("pierce"));
  assert.ok(next.player.board[0].mods.includes("piercing_rune"));
});

test("wooden shield applies -1 power and absorbs next damage", () => {
  const setup = makeState({
    player: {
      mana: 1,
      hand: ["wooden_shield"],
      board: [unit(cards, "ox")],
    },
    opponent: {
      board: [unit(cards, "spider")],
    },
  });
  const shielded = applyAction(
    setup,
    {
      type: "play",
      card: "wooden_shield",
      target: refs.player(0),
    },
    cards
  );
  assert.equal(shielded.player.board[0].power, 4);
  assert.equal(shielded.player.board[0].shield, 1);

  const afterCombat = applyAction(
    shielded,
    {
      type: "attack",
      source: refs.player(0),
      target: refs.opponent(0),
    },
    cards
  );
  assert.equal(afterCombat.player.board[0].power, 4);
  assert.equal(afterCombat.player.board[0].shield, 0);
  assert.ok(!afterCombat.player.board[0].mods.includes("wooden_shield"));
});

test("brittle blessing kills attacker after attack", () => {
  const setup = makeState({
    player: {
      mana: 2,
      hand: ["brittle_blessing"],
      board: [unit(cards, "lancer")],
    },
    opponent: {
      board: [unit(cards, "ox")],
    },
  });
  const buffed = applyAction(
    setup,
    {
      type: "play",
      card: "brittle_blessing",
      target: refs.player(0),
    },
    cards
  );
  const next = applyAction(
    buffed,
    {
      type: "attack",
      source: refs.player(0),
      target: refs.opponent(0),
    },
    cards
  );
  assert.equal(next.player.board.length, 0);
});

test("blood pact heals boss when modded creature dies", () => {
  const setup = makeState({
    opponent: { health: 10, board: [unit(cards, "ox")] },
    player: {
      mana: 2,
      hand: ["blood_pact"],
      board: [unit(cards, "cultist")],
    },
  });
  const buffed = applyAction(
    setup,
    {
      type: "play",
      card: "blood_pact",
      target: refs.player(0),
    },
    cards
  );
  const next = applyAction(
    buffed,
    {
      type: "attack",
      source: refs.player(0),
      target: refs.opponent(0),
    },
    cards
  );
  assert.equal(next.opponent.health, 13);
});

test("requiem rune damages boss when modded creature dies", () => {
  const setup = makeState({
    opponent: { health: 10, board: [unit(cards, "ox")] },
    player: {
      mana: 1,
      hand: ["requiem_rune"],
      board: [unit(cards, "cultist")],
    },
  });
  const runed = applyAction(
    setup,
    {
      type: "play",
      card: "requiem_rune",
      target: refs.player(0),
    },
    cards
  );
  const next = applyAction(
    runed,
    {
      type: "attack",
      source: refs.player(0),
      target: refs.opponent(0),
    },
    cards
  );
  assert.equal(next.opponent.health, 8);
});

test("anchored aura buffs adjacent allies and cleanse removes the aura impact", () => {
  const setup = makeState({
    player: {
      mana: 4,
      hand: ["anchored", "cleanse"],
      board: [unit(cards, "iron_golem"), unit(cards, "ox"), unit(cards, "iron_golem")],
    },
  });
  const anchored = applyAction(
    setup,
    {
      type: "play",
      card: "anchored",
      target: refs.player(1),
    },
    cards
  );
  assert.equal(anchored.player.board[0].power, 4);
  assert.equal(anchored.player.board[2].power, 4);
  assert.ok(anchored.player.board[1].mods.includes("anchored"));

  const cleansed = applyAction(
    anchored,
    {
      type: "play",
      card: "cleanse",
      target: refs.player(1),
    },
    cards
  );
  assert.equal(cleansed.player.board[0].power, 3);
  assert.equal(cleansed.player.board[2].power, 3);
  assert.equal(cleansed.player.board[1].mods.length, 0);
});

test("war banner aura adds +1 attack power", () => {
  const state = makeState({
    player: {
      board: [unit(cards, "war_banner"), unit(cards, "iron_golem")],
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
  assert.equal(next.opponent.board[0].power, 1);
});

test("flank rune applies end-of-round adjacent buffs", () => {
  const setup = makeState({
    player: {
      mana: 2,
      hand: ["flank_rune"],
      board: [unit(cards, "iron_golem"), unit(cards, "lancer"), unit(cards, "iron_golem")],
    },
  });
  const modded = applyAction(
    setup,
    {
      type: "play",
      card: "flank_rune",
      target: refs.player(1),
    },
    cards
  );
  const ended = applyAction(modded, { type: "end" }, cards);
  assert.equal(ended.player.board[0].power, 4);
  assert.equal(ended.player.board[1].power, 5);
  assert.equal(ended.player.board[2].power, 4);
});

test("doomclock triggers end-of-round boss damage and mana loss", () => {
  const setup = makeState({
    opponent: { health: 9 },
    player: {
      mana: 5,
      hand: ["doomclock"],
    },
  });
  const withClock = applyAction(
    setup,
    { type: "play", card: "doomclock" },
    cards
  );
  const ended = applyAction(withClock, { type: "end" }, cards);
  assert.equal(ended.opponent.health, 7);
  assert.equal(ended.player.mana, 2);
});

test("debt ledger grants mana on mod play and drains mana on end", () => {
  const setup = makeState({
    player: {
      mana: 5,
      hand: ["debt_ledger", "piercing_rune"],
      board: [unit(cards, "iron_golem")],
    },
  });
  const withLedger = applyAction(
    setup,
    { type: "play", card: "debt_ledger" },
    cards
  );
  assert.equal(withLedger.player.mana, 4);

  const afterMod = applyAction(
    withLedger,
    {
      type: "play",
      card: "piercing_rune",
      target: refs.player(0),
    },
    cards
  );
  assert.equal(afterMod.player.mana, 3, "cost 2 then gain 1 from ledger");

  const ended = applyAction(afterMod, { type: "end" }, cards);
  assert.equal(ended.player.mana, 1);
});

test("arcane reservoir gains cast counters from spell and mod", () => {
  const setup = makeState({
    player: {
      mana: 5,
      hand: ["spark", "piercing_rune"],
      board: [unit(cards, "arcane_reservoir"), unit(cards, "iron_golem")],
    },
    opponent: { health: 20 },
  });
  const afterSpell = applyAction(
    setup,
    { type: "play", card: "spark", target: "opponent" },
    cards
  );
  const afterMod = applyAction(
    afterSpell,
    { type: "play", card: "piercing_rune", target: refs.player(1) },
    cards
  );
  assert.equal(afterMod.player.board[0].counter, 2);
});

test("death_ward gains counters for each creature death", () => {
  const state = makeState({
    player: {
      board: [unit(cards, "death_ward"), unit(cards, "cultist")],
    },
    opponent: {
      board: [unit(cards, "cultist")],
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
  assert.equal(next.player.board[0].card, "death_ward");
  assert.equal(next.player.board[0].counter, 2);
});

test("vigil banner buffs untired allies at end of round only", () => {
  const state = makeState({
    player: {
      board: [
        unit(cards, "vigil_banner"),
        unit(cards, "iron_golem", { tired: false }),
        unit(cards, "lancer", { tired: true }),
      ],
    },
  });
  const next = applyAction(state, { type: "end" }, cards);
  assert.equal(next.player.board[1].power, 4);
  assert.equal(next.player.board[2].power, 5);
});

test("blightwave deals damage to all creatures and gravecaller death damages enemy board", () => {
  const state = makeState({
    player: {
      mana: 3,
      hand: ["blightwave"],
      board: [unit(cards, "gravecaller")],
    },
    opponent: {
      board: [unit(cards, "ox"), unit(cards, "cultist"), unit(cards, "cultist")],
    },
  });
  const next = applyAction(
    state,
    {
      type: "play",
      card: "blightwave",
    },
    cards
  );
  assert.equal(next.player.board.length, 0, "gravecaller dies to blightwave");
  assert.equal(next.opponent.board.length, 1, "cultists die to gravecaller death splash");
  assert.equal(next.opponent.board[0].card, "ox");
  assert.equal(next.opponent.board[0].power, 1);
});

test("cleanse removes power/keyword/shield changes from mods", () => {
  const setup = makeState({
    player: {
      mana: 3,
      hand: ["wooden_shield", "cleanse"],
      board: [unit(cards, "ox")],
    },
  });
  const modded = applyAction(
    setup,
    {
      type: "play",
      card: "wooden_shield",
      target: refs.player(0),
    },
    cards
  );
  assert.equal(modded.player.board[0].power, 4);
  assert.equal(modded.player.board[0].shield, 1);

  const cleaned = applyAction(
    modded,
    {
      type: "play",
      card: "cleanse",
      target: refs.player(0),
    },
    cards
  );
  assert.equal(cleaned.player.board[0].power, 5);
  assert.equal(cleaned.player.board[0].shield, 0);
  assert.equal(cleaned.player.board[0].mods.length, 0);
  assert.deepEqual(cleaned.player.board[0].keywords, ["guard"]);
});

test("turncoat borrows enemy creature then returns doubled at end", () => {
  const setup = makeState({
    player: {
      mana: 3,
      hand: ["turncoat"],
    },
    opponent: {
      board: [unit(cards, "spider")],
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
  assert.equal(borrowed.player.board.length, 1);
  assert.equal(borrowed.player.board[0].borrowed, true);

  const ended = applyAction(borrowed, { type: "end" }, cards);
  assert.equal(ended.player.board.length, 0);
  assert.equal(ended.opponent.board.length, 1);
  assert.equal(ended.opponent.board[0].power, 4);
  assert.equal(ended.opponent.board[0].borrowed, false);
  assert.equal(ended.opponent.board[0].tired, false);
});

test("swap step swaps same-board creatures and tires both", () => {
  const state = makeState({
    player: {
      mana: 2,
      hand: ["swap_step"],
      board: [unit(cards, "iron_golem"), unit(cards, "lancer")],
    },
  });
  const next = applyAction(
    state,
    {
      type: "play",
      card: "swap_step",
      target: `${refs.player(0)}|${refs.player(1)}`,
    },
    cards
  );
  assert.equal(next.player.board[0].card, "lancer");
  assert.equal(next.player.board[1].card, "iron_golem");
  assert.equal(next.player.board[0].tired, true);
  assert.equal(next.player.board[1].tired, true);
});

test("swap step rejects targets across different boards", () => {
  const state = makeState({
    player: {
      mana: 2,
      hand: ["swap_step"],
      board: [unit(cards, "iron_golem")],
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
          type: "play",
          card: "swap_step",
          target: `${refs.player(0)}|${refs.opponent(0)}`,
        },
        cards
      ),
    /same board/
  );
});

test("echo step repeats last spell and cannot repeat echo itself", () => {
  const setup = makeState({
    player: {
      mana: 3,
      hand: ["spark", "echo_step"],
    },
    opponent: {
      health: 12,
    },
  });
  const afterSpark = applyAction(
    setup,
    { type: "play", card: "spark", target: "opponent" },
    cards
  );
  const afterEcho = applyAction(
    afterSpark,
    { type: "play", card: "echo_step" },
    cards
  );
  assert.equal(afterEcho.opponent.health, 6);
  assert.equal(afterEcho.lastSpell?.cardId, "spark");

  const bad = makeState({
    player: {
      mana: 2,
      hand: ["echo_step"],
    },
    lastSpell: { cardId: "echo_step" },
  });
  expectThrow(
    () => applyAction(bad, { type: "play", card: "echo_step" }, cards),
    /Cannot repeat Echo Step/
  );
});

test("colossus bane executes 15+ power creatures and refunds mana per kill", () => {
  const state = makeState({
    player: {
      mana: 3,
      hand: ["colossus_bane"],
      board: [unit(cards, "behemoth", { power: 16 }), unit(cards, "iron_golem")],
    },
    opponent: {
      board: [unit(cards, "behemoth", { power: 15 }), unit(cards, "ox")],
    },
  });
  const next = applyAction(
    state,
    { type: "play", card: "colossus_bane" },
    cards
  );
  assert.equal(next.player.mana, 6);
  assert.equal(
    next.player.board.some((entry) => entry.card === "behemoth"),
    false
  );
  assert.equal(
    next.opponent.board.some((entry) => entry.card === "behemoth"),
    false
  );
  assert.equal(next.player.board.some((entry) => entry.card === "iron_golem"), true);
  assert.equal(next.opponent.board.some((entry) => entry.card === "ox"), true);
});

test("toxic mist grants venom keyword to all allied creatures", () => {
  const state = makeState({
    player: {
      mana: 2,
      hand: ["toxic_mist"],
      board: [unit(cards, "iron_golem"), unit(cards, "lancer")],
    },
  });
  const next = applyAction(state, { type: "play", card: "toxic_mist" }, cards);
  assert.ok(next.player.board[0].keywords.includes("venom"));
  assert.ok(next.player.board[1].keywords.includes("venom"));
});

test("brood herald summons broodling for opponent on play", () => {
  const state = makeState({
    player: {
      mana: 2,
      hand: ["brood_herald"],
    },
  });
  const next = applyAction(
    state,
    {
      type: "play",
      card: "brood_herald",
    },
    cards
  );
  assert.equal(next.player.board[0].card, "brood_herald");
  assert.equal(next.opponent.board.length, 1);
  assert.equal(next.opponent.board[0].card, "broodling");
});

test("devourer consumes ally power, enters tired, and decays each end step", () => {
  const setup = makeState({
    player: {
      mana: 3,
      hand: ["devourer"],
      board: [unit(cards, "iron_golem")],
    },
  });
  const devoured = applyAction(
    setup,
    {
      type: "play",
      card: "devourer",
      target: refs.player(0),
    },
    cards
  );
  assert.equal(devoured.player.board.length, 1);
  assert.equal(devoured.player.board[0].card, "devourer");
  assert.equal(devoured.player.board[0].power, 5);
  assert.equal(devoured.player.board[0].tired, true);

  const ended = applyAction(devoured, { type: "end" }, cards);
  assert.equal(ended.player.board[0].power, 4);
});

test("bone requiem clones strongest boss creature after 4+ deaths in round", () => {
  const setup = makeState({
    player: {
      mana: 3,
      hand: ["blightwave"],
      board: [unit(cards, "bone_requiem"), unit(cards, "cultist"), unit(cards, "cultist")],
    },
    opponent: {
      board: [unit(cards, "behemoth"), unit(cards, "cultist"), unit(cards, "cultist")],
    },
  });
  const afterWave = applyAction(
    setup,
    {
      type: "play",
      card: "blightwave",
    },
    cards
  );
  const ended = applyAction(afterWave, { type: "end" }, cards);
  const clones = ended.player.board.filter((entry) => entry.card === "behemoth");

  assert.equal(clones.length, 1);
  assert.equal(clones[0].power, 9);
});
