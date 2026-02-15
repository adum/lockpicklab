import fs from "fs";
import path from "path";
import { loadCardLibrary } from "../engine/cards";
import { normalizeState } from "../engine/state";
import { Puzzle } from "../engine/types";
import { solve } from "../solver/solver";
import { parseArgs } from "./cli";

const USAGE = `
Usage:
  node dist/scripts/solve_puzzle.js [path/to/puzzle.json] [options]

Options:
  --max-wins <n>        Maximum solutions to find (0 = unlimited, default: 3)
  --help, -h            Show this help message
`.trim();

const proc = (globalThis as {
  process?: { argv?: string[] };
}).process;
const argv = proc?.argv ?? [];

function main() {
  const { flags, positional } = parseArgs(argv.slice(2), {
    shortBooleanFlags: ["h"],
  });
  if (flags.help || flags.h) {
    console.log(USAGE);
    return;
  }

  const puzzlePath = positional[0]
    ? path.resolve(positional[0])
    : path.resolve("puzzles/example.json");

  const cardsPath = path.resolve("cards/cards.json");

  const rawPuzzle = fs.readFileSync(puzzlePath, "utf8");
  const puzzle = JSON.parse(rawPuzzle) as Puzzle;

  const cards = loadCardLibrary(cardsPath);

  const state = normalizeState({
    player: puzzle.player,
    opponent: puzzle.opponent,
    manaPerRound: puzzle.manaPerRound,
    targetRounds: puzzle.targetRounds,
  });

  const maxWinsRaw = flags["max-wins"];
  const parsedMaxWins =
    typeof maxWinsRaw === "string" ? Number(maxWinsRaw) : 3;
  const maxWins = Number.isFinite(parsedMaxWins) ? parsedMaxWins : 3;
  const result = solve(state, cards, { maxWins });

  console.log(`Puzzle: ${puzzle.id}`);
  console.log(`Difficulty: ${puzzle.difficulty}`);
  console.log(`Wins: ${result.wins.length}`);
  console.log(`Visited: ${result.visited}`);
  console.log(`Expanded: ${result.expanded}`);
  if (result.wins.length > 0) {
    console.log("First winning line:");
    console.log(JSON.stringify(result.wins[0], null, 2));
  }
}

main();
