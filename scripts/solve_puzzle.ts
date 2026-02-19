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
  --max-wins <n>          Maximum solutions to find (0 = unlimited, default: 3)
  --progress-every <n>    Progress update frequency in visited nodes (default: 2000)
  --no-progress           Disable inline progress output
  --help, -h              Show this help message
`.trim();

const proc = (globalThis as {
  process?: {
    argv?: string[];
    stdout?: { isTTY?: boolean; write?: (value: string) => unknown };
  };
}).process;
const argv = proc?.argv ?? [];

function parseNumberValue(
  raw: string | boolean | undefined,
  fallback: number,
  label: string,
  min?: number
): number {
  if (raw === undefined) {
    return fallback;
  }
  if (typeof raw === "boolean") {
    throw new Error(`Missing value for --${label}`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid value for --${label}`);
  }
  return min === undefined ? parsed : Math.max(min, parsed);
}

function main() {
  const { flags, positional } = parseArgs(argv.slice(2), {
    shortBooleanFlags: ["h"],
  });
  if (flags.help || flags.h) {
    console.log(USAGE);
    return;
  }
  const allowedFlags = new Set([
    "max-wins",
    "progress-every",
    "no-progress",
    "help",
    "h",
  ]);
  const unknown = Object.keys(flags).filter((key) => !allowedFlags.has(key));
  if (unknown.length > 0) {
    throw new Error(`Unknown option(s): ${unknown.map((item) => `--${item}`).join(", ")}`);
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

  const maxWins = parseNumberValue(flags["max-wins"], 3, "max-wins", 0);
  const progressEvery = parseNumberValue(
    flags["progress-every"],
    2000,
    "progress-every",
    1
  );
  const progressEnabled = !Boolean(flags["no-progress"]);
  const stdout = proc?.stdout;
  const supportsInlineProgress =
    progressEnabled && Boolean(stdout?.isTTY) && typeof stdout?.write === "function";
  let hasInlineProgress = false;
  let lastRender = 0;
  const startedAt = Date.now();

  function formatSeconds(ms: number): string {
    const seconds = ms / 1000;
    if (seconds >= 10) {
      return `${seconds.toFixed(0)}s`;
    }
    return `${seconds.toFixed(1)}s`;
  }

  function renderInlineProgress(
    status: "searching" | "done" | "budget" | "max_wins",
    visited: number,
    expanded: number,
    wins: number
  ): void {
    if (!supportsInlineProgress || !stdout?.write) {
      return;
    }
    const elapsed = formatSeconds(Date.now() - startedAt);
    const message = `[solver] ${status} · visited ${visited} · expanded ${expanded} · wins ${wins} · ${elapsed}`;
    stdout.write(`\r\u001b[2K${message}`);
    hasInlineProgress = true;
  }

  function clearInlineProgress(): void {
    if (!supportsInlineProgress || !stdout?.write || !hasInlineProgress) {
      return;
    }
    stdout.write("\r\u001b[2K");
    stdout.write("\n");
    hasInlineProgress = false;
  }

  const result = solve(state, cards, {
    maxWins,
    progressEvery: progressEnabled ? progressEvery : 0,
    onProgress: progressEnabled
      ? (progress) => {
          if (!supportsInlineProgress) {
            return;
          }
          const now = Date.now();
          const isTerminal = progress.status !== "continue";
          if (!isTerminal && now - lastRender < 120) {
            return;
          }
          lastRender = now;
          const status =
            progress.status === "continue" ? "searching" : progress.status;
          renderInlineProgress(status, progress.visited, progress.expanded, progress.wins);
        }
      : undefined,
  });

  clearInlineProgress();

  console.log(`Puzzle: ${puzzle.id}`);
  console.log(`Difficulty: ${puzzle.difficulty}`);
  console.log(`Status: ${result.status}`);
  console.log(`Wins: ${result.wins.length}`);
  console.log(`Visited: ${result.visited}`);
  console.log(`Expanded: ${result.expanded}`);
  if (result.wins.length > 0) {
    console.log("First winning line:");
    console.log(JSON.stringify(result.wins[0], null, 2));
  }
}

main();
