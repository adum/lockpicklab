import fs from "fs";
import { CardDefinition, CardLibrary } from "./types";

export function buildCardLibrary(cards: CardDefinition[]): CardLibrary {
  const byId: Record<string, CardDefinition> = {};
  for (const card of cards) {
    byId[card.id] = card;
  }
  return { byId };
}

export function loadCardLibrary(filePath: string): CardLibrary {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as { cards: CardDefinition[] };
  return buildCardLibrary(data.cards ?? []);
}
