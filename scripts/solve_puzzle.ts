import fs from "fs";
import path from "path";
import { loadCardLibrary } from "../engine/cards";
import { normalizeState } from "../engine/state";
import { Puzzle } from "../engine/types";
import { solve } from "../solver/solver";

const puzzlePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve("puzzles/example.json");

const cardsPath = path.resolve("cards/cards.json");

const rawPuzzle = fs.readFileSync(puzzlePath, "utf8");
const puzzle = JSON.parse(rawPuzzle) as Puzzle;

const cards = loadCardLibrary(cardsPath);

const state = normalizeState({
  player: puzzle.player,
  opponent: puzzle.opponent,
});

const result = solve(state, cards, { maxDepth: 8, maxWins: 3 });

console.log(`Puzzle: ${puzzle.id}`);
console.log(`Difficulty: ${puzzle.difficulty}`);
console.log(`Wins: ${result.wins.length}`);
console.log(`Visited: ${result.visited}`);
console.log(`Expanded: ${result.expanded}`);
if (result.wins.length > 0) {
  console.log("First winning line:");
  console.log(JSON.stringify(result.wins[0], null, 2));
}
