import fs from "fs";
import path from "path";
import { loadCardLibrary } from "../engine/cards";
import { normalizeState } from "../engine/state";
import { CardDefinition } from "../engine/types";
import { ghostWalk, materialize, obfuscate, Rng } from "../generator/generator";

const seedArg = process.argv[2];
const stepsArg = process.argv[3];
const handArg = process.argv[4];
const manaArg = process.argv[5];
const outputArg = process.argv[6];

const seed = seedArg ? Number(seedArg) : Date.now();
const steps = stepsArg ? Number(stepsArg) : 4;
const handSize = handArg ? Number(handArg) : 4;
const manaCap = manaArg ? Number(manaArg) : 10;

const cardsPath = path.resolve("cards/cards.json");
const cards = loadCardLibrary(cardsPath);
const rng = new Rng(seed);
const bossPool = ["Toad Bureaucrat", "Clockwork King"];
const bossRng = new Rng(seed ^ 0x9e3779b9);
const bossName = bossPool.length > 0 ? bossRng.pick(bossPool) : "Toad Bureaucrat";

const playable = Object.values(cards.byId).filter(
  (card) =>
    card.type === "creature" || card.type === "spell" || card.type === "effect"
);

function pickHand(count: number): string[] {
  const hand: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const pick = rng.pick(playable as CardDefinition[]);
    hand.push(pick.id);
  }
  return hand;
}

function buildState(hand: string[]) {
  return normalizeState({
    player: {
      mana: manaCap,
      hand,
      board: [],
    },
    opponent: {
      name: bossName,
      health: 30,
      board: [],
    },
    manaPerRound: 0,
    targetRounds: 1,
  });
}

let puzzle = null as ReturnType<typeof materialize> | null;
let attempts = 0;
const maxAttempts = 50;

while (!puzzle && attempts < maxAttempts) {
  attempts += 1;
  const hand = pickHand(handSize);
  const startState = buildState(hand);
  const ghost = ghostWalk(startState, cards, steps, {
    rng,
    excludeEnd: true,
    stopOnWin: false,
  });
  if (ghost.trace.length === 0) {
    continue;
  }
  try {
    const base = materialize(ghost, cards, {
      seed,
      difficulty: steps >= 5 ? "hard" : steps >= 3 ? "medium" : "easy",
      targetRounds: 1,
      manaPerRound: 0,
    });
    puzzle = obfuscate(base, cards, { rng, extraCards: 0 });
  } catch {
    puzzle = null;
  }
}

if (!puzzle) {
  throw new Error("Failed to generate a valid puzzle.");
}

const json = JSON.stringify(puzzle, null, 2);
if (outputArg) {
  fs.writeFileSync(path.resolve(outputArg), json);
} else {
  console.log(json);
}
