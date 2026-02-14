import fs from "fs";
import path from "path";
import { loadCardLibrary } from "../engine/cards";
import { CardInstance, Puzzle } from "../engine/types";

const DEFAULT_PUZZLE_PATH = path.resolve("puzzles/example.json");
const CARDS_PATH = path.resolve("cards/cards.json");

const proc = (globalThis as {
  process?: { argv?: string[]; stdout?: { isTTY?: boolean }; env?: Record<string, string> };
}).process;
const argv = proc?.argv ?? [];
const supportsColor = Boolean(proc?.stdout?.isTTY) && !proc?.env?.NO_COLOR;

const color = {
  wrap(code: string, value: string) {
    return supportsColor ? `\u001b[${code}m${value}\u001b[0m` : value;
  },
  bold(value: string) {
    return this.wrap("1", value);
  },
  dim(value: string) {
    return this.wrap("2", value);
  },
  red(value: string) {
    return this.wrap("31", value);
  },
  green(value: string) {
    return this.wrap("32", value);
  },
  yellow(value: string) {
    return this.wrap("33", value);
  },
  blue(value: string) {
    return this.wrap("34", value);
  },
  magenta(value: string) {
    return this.wrap("35", value);
  },
  cyan(value: string) {
    return this.wrap("36", value);
  },
  gray(value: string) {
    return this.wrap("90", value);
  },
};

function readPuzzle(filePath: string): Puzzle {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as Puzzle;
}

function formatKeywords(instance: CardInstance | undefined): string {
  const keywords = Array.isArray(instance?.keywords) ? instance?.keywords : [];
  if (!keywords || keywords.length === 0) {
    return "";
  }
  return ` (${keywords.join(", ")})`;
}

function formatMods(instance: CardInstance | undefined): string {
  const mods = Array.isArray(instance?.mods) ? instance?.mods : [];
  if (!mods || mods.length === 0) {
    return "";
  }
  return ` ${color.gray(`[mods: ${mods.join(", ")}]`)}`;
}

function formatTired(instance: CardInstance | undefined): string {
  return instance?.tired ? ` ${color.yellow("[tired]")}` : "";
}

function formatCardName(
  id: string,
  cardsById: Record<string, { name?: string; type?: string; cost?: number }>,
  options?: { includeCost?: boolean }
): string {
  const def = cardsById[id];
  if (!def) {
    return id;
  }
  const name = def.name ?? id;
  const type = def.type ?? "card";
  const cost =
    options?.includeCost && typeof def.cost === "number" ? def.cost : null;
  const costLabel = cost !== null ? ` ${color.blue(`{${cost}}`)}` : "";
  return `${name}${costLabel} ${color.gray(`[${type}]`)}`;
}

function formatBoardLine(
  slot: number,
  instance: CardInstance,
  cardsById: Record<string, { name?: string; type?: string; cost?: number }>,
  options?: { includeCost?: boolean }
): string {
  const name = formatCardName(instance.card, cardsById, options);
  const power =
    typeof instance.power === "number"
      ? color.red(`P${instance.power}`)
      : color.red("P?");
  const keywords = formatKeywords(instance);
  const mods = formatMods(instance);
  const tired = formatTired(instance);
  return `  [${slot}] ${name} ${power}${keywords}${mods}${tired}`;
}

function renderPuzzle(puzzle: Puzzle): void {
  const cards = loadCardLibrary(CARDS_PATH);
  const cardsById = cards.byId;

  const targetRounds = puzzle.targetRounds ?? 1;
  const manaPerRound = puzzle.manaPerRound ?? 0;

  console.log(color.bold(`Puzzle ${puzzle.id}`));
  console.log(
    `${color.gray("Rounds")} ${targetRounds}  ${color.gray(
      "Mana/round"
    )} ${manaPerRound}`
  );
  console.log("");

  console.log(
    color.magenta(
      `Boss: ${puzzle.opponent?.name ?? "Boss"}`
    )
  );
  console.log(
    `  Health: ${color.red(String(puzzle.opponent?.health ?? 0))}`
  );
  const bossBoard = Array.isArray(puzzle.opponent?.board)
    ? puzzle.opponent.board
    : [];
  console.log(`  Board (${bossBoard.length}):`);
  if (bossBoard.length === 0) {
    console.log(`  ${color.gray("(empty)")}`);
  } else {
    bossBoard.forEach((instance, index) => {
      console.log(formatBoardLine(index, instance, cardsById));
    });
  }

  console.log("");
  console.log(color.cyan("Player"));
  console.log(
    `  Mana: ${color.blue(String(puzzle.player.mana ?? 0))}`
  );
  const hand = Array.isArray(puzzle.player.hand) ? puzzle.player.hand : [];
  console.log(`  Hand (${hand.length}):`);
  hand.forEach((cardId, index) => {
    const label = formatCardName(cardId, cardsById, { includeCost: true });
    console.log(`    ${color.gray(String(index + 1).padStart(2, "0"))}. ${label}`);
  });

  const playerBoard = Array.isArray(puzzle.player.board)
    ? puzzle.player.board
    : [];
  if (playerBoard.length > 0) {
    console.log(`  Board (${playerBoard.length}):`);
    playerBoard.forEach((instance, index) => {
      console.log(
        formatBoardLine(index, instance, cardsById, { includeCost: true })
      );
    });
  }
}

function main() {
  const input = argv[2];
  const puzzlePath = input ? path.resolve(input) : DEFAULT_PUZZLE_PATH;
  if (!fs.existsSync(puzzlePath)) {
    throw new Error(`Puzzle not found: ${puzzlePath}`);
  }
  renderPuzzle(readPuzzle(puzzlePath));
}

main();
