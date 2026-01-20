import { initTooltips } from "./tooltip.js";

const container = document.getElementById("cards-container");
const searchInput = document.getElementById("card-search");

const KEYWORD_TOOLTIPS = {
  guard: "Guard: must be attacked before non-Guard targets.",
  storm: "Storm: can attack any target immediately.",
  pierce: "Pierce: excess power hits the boss.",
  chain: "Chain: bonus effect if a card was already played this round.",
  sacrifice: "Sacrifice: destroy this creature to give a friendly creature +4 power.",
  scavenger: "Scavenger: gains +1 power whenever another creature dies.",
  rebirth: "Rebirth: when this creature dies, it returns with +1 power.",
  relay:
    "Relay: when this creature attacks a creature, adjacent allies gain power equal to the damage dealt.",
  order:
    "Order: can only be played if you have an untired creature; when played, all your creatures become tired.",
  sleepy: "Sleepy: enters play tired.",
};

const CREATURE_ART = {
  cultist: "./assets/creatures/cultist.jpg",
  lancer: "./assets/creatures/lancer.jpg",
  iron_golem: "./assets/creatures/iron_golem.jpg",
};

const CREATURE_PLACEHOLDER = "./assets/creatures/placeholder.jpg";

const EFFECT_ART = {
  war_banner: "./assets/effects/placeholder.jpg",
  vigil_banner: "./assets/effects/placeholder.jpg",
};

const EFFECT_PLACEHOLDER = "./assets/effects/placeholder.jpg";

const MOD_ART = {
  piercing_rune: "./assets/mods/placeholder.jpg",
  testudo_rune: "./assets/mods/placeholder.jpg",
  wooden_shield: "./assets/mods/placeholder.jpg",
  requiem_rune: "./assets/mods/placeholder.jpg",
};

const MOD_PLACEHOLDER = "./assets/mods/placeholder.jpg";

const SPELL_ART = {
  fireball: "./assets/spells/fireball.jpg",
  spark: "./assets/spells/spark.jpg",
  blightwave: "./assets/spells/placeholder.jpg",
};

const SPELL_PLACEHOLDER = "./assets/spells/placeholder.jpg";

function formatEffects(card) {
  if (!card.effects || card.effects.length === 0) {
    return "";
  }
  return card.effects
    .map((effect) => {
      if (effect.type === "damage") {
        const chain = effect.chain_amount ? ` (Chain ${effect.chain_amount})` : "";
        return `Deal ${effect.amount} damage${chain}`;
      }
      if (effect.type === "damage_all") {
        return `Deal ${effect.amount} damage to all creatures`;
      }
      if (effect.type === "death_damage_boss") {
        return `On death: deal ${effect.amount} damage to boss`;
      }
      if (effect.type === "buff") {
        if (effect.amount < 0) {
          return `Lose ${Math.abs(effect.amount)} power`;
        }
        return `Give +${effect.amount} power`;
      }
      if (effect.type === "shield") {
        return `Shield ${effect.amount} (blocks next damage)`;
      }
      if (effect.type === "aura") {
        if (effect.stat === "power" && effect.applies_to === "attack") {
          return `Your creatures get +${effect.amount} power on attack`;
        }
        return `Aura: +${effect.amount} ${effect.stat}`;
      }
      if (effect.type === "end_buff") {
        if (effect.stat === "power" && effect.applies_to === "untired") {
          return `End of round: untired creatures gain +${effect.amount} power`;
        }
        return `End of round: +${effect.amount} ${effect.stat}`;
      }
      if (effect.type === "grant_keyword") {
        return `Grant ${formatKeyword(effect.keyword)}`;
      }
      return "";
    })
    .filter(Boolean)
    .join("; ");
}

function formatKeyword(keyword) {
  if (!keyword) {
    return "";
  }
  return `${keyword.charAt(0).toUpperCase()}${keyword.slice(1)}`;
}

function renderCards(cards) {
  container.innerHTML = "";
  const groups = {
    creature: [],
    spell: [],
    effect: [],
    mod: [],
  };
  cards.forEach((card) => {
    groups[card.type]?.push(card);
  });

  Object.entries(groups).forEach(([type, list]) => {
    if (list.length === 0) {
      return;
    }
    const group = document.createElement("section");
    group.className = "card-group";

    const title = document.createElement("h2");
    title.textContent = type;
    group.appendChild(title);

    const listWrap = document.createElement("div");
    listWrap.className = "card-list";

    list.forEach((card) => {
      const item = document.createElement("div");
      item.className = "library-card";

      const handCard = document.createElement("div");
      handCard.className = `hand-card type-${card.type ?? "creature"}`;

      if (
        card.type === "creature" ||
        card.type === "spell" ||
        card.type === "effect" ||
        card.type === "mod"
      ) {
        let artMap = CREATURE_ART;
        let fallback = card.type === "creature" ? CREATURE_PLACEHOLDER : null;
        if (card.type === "spell") {
          artMap = SPELL_ART;
          fallback = SPELL_PLACEHOLDER;
        } else if (card.type === "effect") {
          artMap = EFFECT_ART;
          fallback = EFFECT_PLACEHOLDER;
        } else if (card.type === "mod") {
          artMap = MOD_ART;
          fallback = MOD_PLACEHOLDER;
        }
        const artSrc =
          artMap[card.id] ?? fallback;
        if (artSrc) {
          const artWrap = document.createElement("div");
          artWrap.className = "hand-art";
          const artImg = document.createElement("img");
          artImg.src = artSrc;
          artImg.alt = `${card.name ?? card.id} art`;
          artWrap.appendChild(artImg);
          handCard.appendChild(artWrap);
        }
      }

      const topRow = document.createElement("div");
      topRow.className = "hand-card-top";

      const powerBadge = document.createElement("span");
      powerBadge.className = `hand-badge ${card.type === "creature" ? "power" : "spacer"}`;
      powerBadge.textContent = card.type === "creature" ? String(card.stats?.power ?? 0) : "";

      const costBadge = document.createElement("span");
      costBadge.className = "hand-badge mana";
      costBadge.textContent = String(card.cost ?? "?");

      topRow.appendChild(powerBadge);
      topRow.appendChild(costBadge);

      const name = document.createElement("span");
      name.className = "hand-name";
      name.textContent = card.name ?? card.id;

      handCard.appendChild(topRow);
      handCard.appendChild(name);

      if (card.type === "spell" || card.type === "effect" || card.type === "mod") {
        const desc = document.createElement("div");
        desc.className = "hand-desc";
        desc.textContent = formatEffects(card) || "—";
        handCard.appendChild(desc);
      }

      if (card.keywords && card.keywords.length > 0) {
        const keywords = document.createElement("div");
        keywords.className = "hand-keywords";
        card.keywords.forEach((kw) => {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = kw;
          const tooltip = KEYWORD_TOOLTIPS[kw];
          if (tooltip) {
            tag.dataset.tooltip = tooltip;
          }
          keywords.appendChild(tag);
        });
        handCard.appendChild(keywords);
      }

      item.appendChild(handCard);
      listWrap.appendChild(item);
    });

    group.appendChild(listWrap);
    container.appendChild(group);
  });
}

async function loadCards() {
  const response = await fetch("../cards/cards.json");
  const data = await response.json();
  return data.cards ?? [];
}

let allCards = [];

initTooltips();
loadCards().then((cards) => {
  allCards = cards;
  renderCards(cards);
});

searchInput.addEventListener("input", () => {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    renderCards(allCards);
    return;
  }
  const filtered = allCards.filter((card) => {
    return (
      card.name?.toLowerCase().includes(query) ||
      card.id?.toLowerCase().includes(query) ||
      card.type?.toLowerCase().includes(query)
    );
  });
  renderCards(filtered);
});
