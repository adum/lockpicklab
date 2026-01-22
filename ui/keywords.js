export const KEYWORD_TOOLTIPS = {
  guard: "Guard: must be attacked before non-Guard targets.",
  storm: "Storm: can attack any target immediately.",
  pierce: "Pierce: excess power hits the boss.",
  testudo:
    "Testudo: if flanked by friendly creatures, this creature takes no combat damage.",
  venom: "Venom: when this creature attacks, it gives the target a poison token.",
  poison: "Poison: takes damage at the end of every round.",
  brood:
    "Brood: when this creature is damaged but survives, it spawns a Broodling next to it.",
  chain: "Chain: bonus effect if a card was already played this round.",
  sacrifice: "Sacrifice: destroy this creature to give a friendly creature +4 power.",
  scavenger: "Scavenger: gains +1 power whenever another creature dies.",
  rebirth: "Rebirth: when this creature dies, it returns with +1 power.",
  relay:
    "Relay: when this creature attacks a creature, adjacent allies gain power equal to the damage dealt.",
  order:
    "Order: can only be played if you have an untired creature; when played, all your creatures become tired.",
  sleepy: "Sleepy: enters play tired.",
  tired: "Tired: this creature already attacked this round.",
};

export function formatKeyword(keyword) {
  if (!keyword) {
    return "";
  }
  return `${keyword.charAt(0).toUpperCase()}${keyword.slice(1)}`;
}
