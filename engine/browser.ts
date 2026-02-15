import type { CardDefinition, CardLibrary } from "./types.js";
export { applyAction, getLegalActions, isWin } from "./engine.js";
export { cloneState, normalizeState } from "./state.js";

export function buildCardLibrary(data: { cards?: CardDefinition[] }): CardLibrary {
  const byId: Record<string, CardDefinition> = {};
  const cards = data.cards ?? [];
  cards.forEach((card) => {
    byId[card.id] = card;
  });
  return { byId };
}
