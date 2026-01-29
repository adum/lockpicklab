import { applyAction, getLegalActions, isWin } from "../engine/engine";
import { cloneState, normalizeState } from "../engine/state";
import {
  Rng,
  addDecoys,
  buildGeneratorPools,
  buildPuzzleAttempt,
  createSolveState,
  ghostWalk as coreGhostWalk,
  isBossModAllowed,
  materialize,
  obfuscate,
  stepSolve,
} from "./core";
import type { CardLibrary, GameState } from "../engine/types";

const defaultEngine = {
  applyAction,
  getLegalActions,
  isWin,
  normalizeState,
  cloneState,
};

export function ghostWalk(
  state: GameState,
  cards: CardLibrary,
  options?: Parameters<typeof coreGhostWalk>[3]
) {
  return coreGhostWalk(state, cards, defaultEngine, options);
}

export {
  Rng,
  addDecoys,
  buildGeneratorPools,
  buildPuzzleAttempt,
  createSolveState,
  isBossModAllowed,
  materialize,
  obfuscate,
  stepSolve,
};
