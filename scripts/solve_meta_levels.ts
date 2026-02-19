import fs from "fs";
import path from "path";
import { loadCardLibrary } from "../engine/cards";
import { normalizeState } from "../engine/state";
import type { Puzzle } from "../engine/types";
import { solve } from "../solver/solver";
import {
  compareLevelFilenames,
  looksLikePuzzlePayload,
} from "../solver/meta_levels";
import { parseArgs } from "./cli";

const DEFAULTS = {
  dir: "puzzles/meta_levels",
  progressEvery: 2000,
} as const;

const USAGE = `
Usage:
  node dist/scripts/solve_meta_levels.js [path/to/levels-dir] [options]

Options:
  --dir <path>              Levels directory (default: ${DEFAULTS.dir})
  --progress-every <n>      Progress update frequency in visited nodes (default: ${DEFAULTS.progressEvery})
  --no-progress             Disable inline progress output
  --help, -h                Show this help message
`.trim();

const proc = (globalThis as {
  process?: {
    argv?: string[];
    stdout?: { isTTY?: boolean; write?: (value: string) => unknown };
    exitCode?: number;
  };
}).process;
const argv = proc?.argv ?? [];

interface SolveEntry {
  file: string;
  id: string;
  solved: boolean;
  status: "done" | "budget" | "max_wins";
  visited: number;
  expanded: number;
}

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

function formatSeconds(ms: number): string {
  const seconds = ms / 1000;
  if (seconds >= 10) {
    return `${seconds.toFixed(0)}s`;
  }
  return `${seconds.toFixed(1)}s`;
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
    "dir",
    "progress-every",
    "no-progress",
    "help",
    "h",
  ]);
  const unknown = Object.keys(flags).filter((key) => !allowedFlags.has(key));
  if (unknown.length > 0) {
    throw new Error(`Unknown option(s): ${unknown.map((item) => `--${item}`).join(", ")}`);
  }
  if (positional.length > 1) {
    throw new Error("Only one positional argument is allowed: levels directory.");
  }

  const dirFlag = flags.dir;
  const dirFromFlag =
    typeof dirFlag === "string" && dirFlag.trim().length > 0 ? dirFlag.trim() : "";
  const levelsDir = path.resolve(
    positional[0] ? positional[0] : dirFromFlag || DEFAULTS.dir
  );
  const progressEvery = parseNumberValue(
    flags["progress-every"],
    DEFAULTS.progressEvery,
    "progress-every",
    1
  );
  const progressEnabled = !Boolean(flags["no-progress"]);

  if (!fs.existsSync(levelsDir)) {
    throw new Error(`Directory does not exist: ${levelsDir}`);
  }
  if (!fs.statSync(levelsDir).isDirectory()) {
    throw new Error(`Not a directory: ${levelsDir}`);
  }

  const files = fs
    .readdirSync(levelsDir, { encoding: "utf8" })
    .filter((name: string) => name.toLowerCase().endsWith(".json"))
    .sort(compareLevelFilenames);
  if (files.length === 0) {
    throw new Error(`No .json files found in ${levelsDir}`);
  }

  const cards = loadCardLibrary(path.resolve("cards/cards.json"));
  const stdout = proc?.stdout;
  const supportsInlineProgress =
    progressEnabled && Boolean(stdout?.isTTY) && typeof stdout?.write === "function";
  let hasInlineProgress = false;
  let lastInlineRender = 0;
  const startedAt = Date.now();
  let skipped = 0;
  const entries: SolveEntry[] = [];

  function renderInlineProgress(
    index: number,
    total: number,
    file: string,
    status: "loading" | "searching" | "done" | "budget" | "max_wins",
    visited: number,
    expanded: number,
    solvedCount: number
  ): void {
    if (!supportsInlineProgress || !stdout?.write) {
      return;
    }
    const elapsed = formatSeconds(Date.now() - startedAt);
    const line =
      `[meta-solver] ${index}/${total} ${file} · ${status} · visited ${visited} · expanded ${expanded}` +
      ` · solved ${solvedCount} · ${elapsed}`;
    stdout.write(`\r\u001b[2K${line}`);
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

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const filePath = path.join(levelsDir, file);
    const index = i + 1;
    const solvedCount = entries.filter((entry) => entry.solved).length;
    renderInlineProgress(index, files.length, file, "loading", 0, 0, solvedCount);

    let raw: string;
    let parsed: unknown;
    try {
      raw = fs.readFileSync(filePath, "utf8");
      parsed = JSON.parse(raw);
    } catch (error) {
      clearInlineProgress();
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[meta-solver] ${file} skipped (invalid JSON: ${detail})`);
      skipped += 1;
      continue;
    }
    if (!looksLikePuzzlePayload(parsed)) {
      clearInlineProgress();
      console.error(`[meta-solver] ${file} skipped (not a puzzle payload)`);
      skipped += 1;
      continue;
    }
    const puzzle = parsed as Puzzle;
    const state = normalizeState({
      player: puzzle.player,
      opponent: puzzle.opponent,
      manaPerRound: puzzle.manaPerRound,
      targetRounds: puzzle.targetRounds,
    });

    const result = solve(state, cards, {
      maxWins: 1,
      progressEvery: progressEnabled ? progressEvery : 0,
      onProgress: progressEnabled
        ? (progress) => {
            if (!supportsInlineProgress) {
              return;
            }
            const now = Date.now();
            const isTerminal = progress.status !== "continue";
            if (!isTerminal && now - lastInlineRender < 120) {
              return;
            }
            lastInlineRender = now;
            const status =
              progress.status === "continue" ? "searching" : progress.status;
            renderInlineProgress(
              index,
              files.length,
              file,
              status,
              progress.visited,
              progress.expanded,
              entries.filter((entry) => entry.solved).length
            );
          }
        : undefined,
    });

    const solved = result.wins.length > 0;
    entries.push({
      file,
      id: puzzle.id ?? file,
      solved,
      status: result.status,
      visited: result.visited,
      expanded: result.expanded,
    });

    if (!supportsInlineProgress) {
      const label = solved ? "solved" : "unsolved";
      console.log(
        `[meta-solver] ${index}/${files.length} ${file} ${label} · status ${result.status} · visited ${result.visited} · expanded ${result.expanded}`
      );
    }
  }

  clearInlineProgress();

  const solvedCount = entries.filter((entry) => entry.solved).length;
  const unsolved = entries.filter((entry) => !entry.solved);
  console.log(`Directory: ${levelsDir}`);
  console.log(`Solved: ${solvedCount}/${entries.length}`);
  console.log(`Skipped: ${skipped}`);
  if (unsolved.length > 0) {
    console.log("Unsolved files:");
    unsolved.forEach((entry) => {
      console.log(
        `- ${entry.file} (status=${entry.status}, visited=${entry.visited}, expanded=${entry.expanded})`
      );
    });
  }
}

try {
  main();
} catch (error) {
  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error(`Error: ${String(error)}`);
  }
  if (proc) {
    proc.exitCode = 1;
  }
}
