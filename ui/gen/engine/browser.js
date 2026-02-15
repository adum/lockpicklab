export { applyAction, getLegalActions, isWin } from "./engine.js";
export { cloneState, normalizeState } from "./state.js";
export function buildCardLibrary(data) {
    const byId = {};
    const cards = data.cards ?? [];
    cards.forEach((card) => {
        byId[card.id] = card;
    });
    return { byId };
}
