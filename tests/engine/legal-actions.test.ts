import test from "node:test";
import assert from "node:assert/strict";
import { getLegalActions } from "../../engine/engine";
import type { Action } from "../../engine/types";
import { loadCards, makeState, refs, unit } from "./helpers";

const cards = loadCards();

function hasAction(actions: Action[], predicate: (action: Action) => boolean): boolean {
  return actions.some(predicate);
}

test("legal actions always include end", () => {
  const state = makeState();
  const actions = getLegalActions(state, cards);
  assert.ok(hasAction(actions, (entry) => entry.type === "end"));
});

test("damage spells produce opponent and creature targets", () => {
  const state = makeState({
    player: {
      mana: 4,
      hand: ["fireball"],
    },
    opponent: {
      board: [unit(cards, "ox"), unit(cards, "spider")],
    },
  });
  const actions = getLegalActions(state, cards);

  assert.ok(
    hasAction(
      actions,
      (entry) =>
        entry.type === "play" &&
        entry.card === "fireball" &&
        entry.target === "opponent"
    )
  );
  assert.ok(
    hasAction(
      actions,
      (entry) =>
        entry.type === "play" &&
        entry.card === "fireball" &&
        entry.target === refs.opponent(0)
    )
  );
  assert.ok(
    hasAction(
      actions,
      (entry) =>
        entry.type === "play" &&
        entry.card === "fireball" &&
        entry.target === refs.opponent(1)
    )
  );
});

test("cleanse targets creatures on both boards", () => {
  const state = makeState({
    player: {
      mana: 2,
      hand: ["cleanse"],
      board: [unit(cards, "iron_golem"), unit(cards, "war_banner")],
    },
    opponent: {
      board: [unit(cards, "ox"), unit(cards, "bone_requiem")],
    },
  });
  const actions = getLegalActions(state, cards).filter(
    (entry) => entry.type === "play" && entry.card === "cleanse"
  );
  const targets = actions.map((entry) =>
    entry.type === "play" ? entry.target : undefined
  );

  assert.ok(targets.includes(refs.player(0)));
  assert.ok(targets.includes(refs.opponent(0)));
  assert.ok(!targets.includes(refs.player(1)), "effect cards are not valid cleanse targets");
  assert.ok(
    !targets.includes(refs.opponent(1)),
    "opponent effect cards are not valid cleanse targets"
  );
});

test("turncoat has no legal play when no enemy creatures exist", () => {
  const empty = makeState({
    player: {
      mana: 3,
      hand: ["turncoat"],
    },
    opponent: {
      board: [],
    },
  });
  const filled = makeState({
    player: {
      mana: 3,
      hand: ["turncoat"],
    },
    opponent: {
      board: [unit(cards, "ox"), unit(cards, "spider")],
    },
  });

  const emptyActions = getLegalActions(empty, cards);
  const filledActions = getLegalActions(filled, cards);

  assert.equal(
    hasAction(
      emptyActions,
      (entry) => entry.type === "play" && entry.card === "turncoat"
    ),
    false
  );
  assert.ok(
    hasAction(
      filledActions,
      (entry) =>
        entry.type === "play" &&
        entry.card === "turncoat" &&
        entry.target === refs.opponent(0)
    )
  );
  assert.ok(
    hasAction(
      filledActions,
      (entry) =>
        entry.type === "play" &&
        entry.card === "turncoat" &&
        entry.target === refs.opponent(1)
    )
  );
});

test("swap step generates same-board target pairs only", () => {
  const state = makeState({
    player: {
      mana: 2,
      hand: ["swap_step"],
      board: [unit(cards, "iron_golem"), unit(cards, "lancer"), unit(cards, "spider")],
    },
    opponent: {
      board: [unit(cards, "ox"), unit(cards, "spider")],
    },
  });
  const actions = getLegalActions(state, cards).filter(
    (entry) => entry.type === "play" && entry.card === "swap_step"
  );
  const targets = actions.map((entry) =>
    entry.type === "play" ? entry.target : undefined
  );

  assert.ok(targets.includes(`${refs.player(0)}|${refs.player(1)}`));
  assert.ok(targets.includes(`${refs.player(0)}|${refs.player(2)}`));
  assert.ok(targets.includes(`${refs.player(1)}|${refs.player(2)}`));
  assert.ok(targets.includes(`${refs.opponent(0)}|${refs.opponent(1)}`));
  assert.equal(
    targets.includes(`${refs.player(0)}|${refs.opponent(0)}`),
    false
  );
});

test("wooden shield targets only positive-power creatures", () => {
  const state = makeState({
    player: {
      mana: 1,
      hand: ["wooden_shield"],
      board: [unit(cards, "iron_golem", { power: 0 }), unit(cards, "spider", { power: 2 })],
    },
    opponent: {
      board: [unit(cards, "ox", { power: 0 }), unit(cards, "spider", { power: 2 })],
    },
  });
  const actions = getLegalActions(state, cards).filter(
    (entry) => entry.type === "play" && entry.card === "wooden_shield"
  );
  const targets = actions.map((entry) =>
    entry.type === "play" ? entry.target : undefined
  );

  assert.ok(targets.includes(refs.player(1)));
  assert.ok(targets.includes(refs.opponent(1)));
  assert.equal(targets.includes(refs.player(0)), false);
  assert.equal(targets.includes(refs.opponent(0)), false);
});

test("line captain appears only when ready ally exists", () => {
  const noAlly = makeState({
    player: {
      mana: 2,
      hand: ["line_captain"],
      board: [],
    },
  });
  const withAlly = makeState({
    player: {
      mana: 2,
      hand: ["line_captain"],
      board: [unit(cards, "iron_golem", { tired: false })],
    },
  });

  const noActions = getLegalActions(noAlly, cards);
  const yesActions = getLegalActions(withAlly, cards);

  assert.equal(
    hasAction(
      noActions,
      (entry) => entry.type === "play" && entry.card === "line_captain"
    ),
    false
  );
  assert.ok(
    hasAction(
      yesActions,
      (entry) => entry.type === "play" && entry.card === "line_captain"
    )
  );
});

test("devourer requires a friendly creature target", () => {
  const noTarget = makeState({
    player: {
      mana: 3,
      hand: ["devourer"],
      board: [],
    },
  });
  const withTarget = makeState({
    player: {
      mana: 3,
      hand: ["devourer"],
      board: [unit(cards, "spider"), unit(cards, "ox")],
    },
  });

  const noActions = getLegalActions(noTarget, cards);
  const yesActions = getLegalActions(withTarget, cards);

  assert.equal(
    hasAction(noActions, (entry) => entry.type === "play" && entry.card === "devourer"),
    false
  );
  assert.ok(
    hasAction(
      yesActions,
      (entry) =>
        entry.type === "play" &&
        entry.card === "devourer" &&
        entry.target === refs.player(0)
    )
  );
  assert.ok(
    hasAction(
      yesActions,
      (entry) =>
        entry.type === "play" &&
        entry.card === "devourer" &&
        entry.target === refs.player(1)
    )
  );
});

test("attack legality respects guard, tired, and no-attack modifiers", () => {
  const state = makeState({
    player: {
      board: [
        unit(cards, "lancer", { tired: true }),
        unit(cards, "lancer", { mods: ["anchored"] }),
        unit(cards, "lancer"),
      ],
    },
    opponent: {
      board: [unit(cards, "ox"), unit(cards, "spider")],
    },
  });
  const tiredSource = state.player.board[0].uid as string;
  const noAttackSource = state.player.board[1].uid as string;
  const readySource = state.player.board[2].uid as string;
  const guardTarget = state.opponent.board[0].uid as string;
  const nonGuardTarget = state.opponent.board[1].uid as string;
  const actions = getLegalActions(state, cards).filter((entry) => entry.type === "attack");

  assert.equal(
    hasAction(actions, (entry) => entry.type === "attack" && entry.source === tiredSource),
    false,
    "tired source should not be legal"
  );
  assert.equal(
    hasAction(actions, (entry) => entry.type === "attack" && entry.source === noAttackSource),
    false,
    "no-attack source should not be legal"
  );
  assert.ok(
    hasAction(
      actions,
      (entry) =>
        entry.type === "attack" &&
        entry.source === readySource &&
        entry.target === guardTarget
    )
  );
  assert.equal(
    hasAction(
      actions,
      (entry) =>
        entry.type === "attack" &&
        entry.source === readySource &&
        entry.target === nonGuardTarget
    ),
    false,
    "guard blocks non-guard targets"
  );
});

test("effect activations appear only when counters satisfy thresholds", () => {
  const low = makeState({
    player: {
      board: [unit(cards, "death_ward", { counter: 4 }), unit(cards, "arcane_reservoir", { counter: 0 })],
    },
    opponent: {
      board: [unit(cards, "ox")],
    },
  });
  const high = makeState({
    player: {
      board: [unit(cards, "death_ward", { counter: 5 }), unit(cards, "arcane_reservoir", { counter: 2 })],
    },
    opponent: {
      board: [unit(cards, "ox")],
    },
  });
  const lowWard = low.player.board[0].uid as string;
  const lowReservoir = low.player.board[1].uid as string;
  const highWard = high.player.board[0].uid as string;
  const highReservoir = high.player.board[1].uid as string;

  const lowActions = getLegalActions(low, cards);
  const highActions = getLegalActions(high, cards);

  assert.equal(
    hasAction(lowActions, (entry) => entry.type === "activate" && entry.source === lowWard),
    false
  );
  assert.equal(
    hasAction(lowActions, (entry) => entry.type === "activate" && entry.source === lowReservoir),
    false
  );

  assert.ok(
    hasAction(
      highActions,
      (entry) =>
        entry.type === "activate" &&
        entry.source === highWard &&
        entry.target === "opponent"
    )
  );
  assert.ok(
    hasAction(
      highActions,
      (entry) =>
        entry.type === "activate" &&
        entry.source === highWard &&
        entry.target === refs.opponent(0)
    )
  );
  assert.ok(
    hasAction(
      highActions,
      (entry) => entry.type === "activate" && entry.source === highReservoir
    )
  );
});
