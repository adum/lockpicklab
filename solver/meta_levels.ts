import path from "path";
import type { Puzzle } from "../engine/types";

export function compareLevelFilenames(a: string, b: string): number {
  const aBase = path.basename(a, path.extname(a));
  const bBase = path.basename(b, path.extname(b));
  const aNum = Number(aBase);
  const bNum = Number(bBase);
  const aHasNum = Number.isFinite(aNum) && aBase.trim().length > 0;
  const bHasNum = Number.isFinite(bNum) && bBase.trim().length > 0;
  if (aHasNum && bHasNum && aNum !== bNum) {
    return aNum - bNum;
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function looksLikePuzzlePayload(parsed: unknown): parsed is Puzzle {
  if (!parsed || typeof parsed !== "object") {
    return false;
  }
  const puzzle = parsed as Partial<Puzzle>;
  return Boolean(
    puzzle &&
      puzzle.player &&
      puzzle.opponent &&
      Array.isArray((puzzle.player as { hand?: unknown[] }).hand)
  );
}
