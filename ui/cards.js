import { initTooltips } from "./tooltip.js";
import { KEYWORD_TOOLTIPS, formatKeyword } from "./keywords.js";

const container = document.getElementById("cards-container");
const searchInput = document.getElementById("card-search");
const previewModal = document.createElement("div");

previewModal.className = "card-modal";
previewModal.setAttribute("aria-hidden", "true");
previewModal.innerHTML = `
  <div class="card-modal-backdrop"></div>
  <div class="card-modal-content" role="dialog" aria-modal="true">
    <button class="card-modal-close" type="button" aria-label="Close preview">×</button>
    <img class="card-modal-image" alt="" />
  </div>
`;
document.body.appendChild(previewModal);

const previewImage = previewModal.querySelector(".card-modal-image");
const previewClose = previewModal.querySelector(".card-modal-close");
const previewBackdrop = previewModal.querySelector(".card-modal-backdrop");

function openPreview(src, fallback, label) {
  if (!previewImage) {
    return;
  }
  previewImage.src = src;
  previewImage.alt = `${label} art`;
  if (fallback && fallback !== src) {
    previewImage.onerror = () => {
      if (previewImage.src !== fallback) {
        previewImage.src = fallback;
      }
    };
  } else {
    previewImage.onerror = null;
  }
  previewModal.classList.add("open");
  previewModal.setAttribute("aria-hidden", "false");
}

function closePreview() {
  previewModal.classList.remove("open");
  previewModal.setAttribute("aria-hidden", "true");
}

previewClose?.addEventListener("click", closePreview);
previewBackdrop?.addEventListener("click", closePreview);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePreview();
  }
});

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
  flank_rune: "./assets/mods/placeholder.jpg",
};

const MOD_PLACEHOLDER = "./assets/mods/placeholder.jpg";

const SPELL_ART = {
  fireball: "./assets/spells/fireball.jpg",
  spark: "./assets/spells/spark.jpg",
  blightwave: "./assets/spells/placeholder.jpg",
  toxic_mist: "./assets/spells/placeholder.jpg",
};

const SPELL_PLACEHOLDER = "./assets/spells/placeholder.jpg";

function resolveCardArt(card) {
  const type = card?.type;
  let artMap = null;
  let fallback = null;
  let folder = null;
  if (type === "spell") {
    artMap = SPELL_ART;
    fallback = SPELL_PLACEHOLDER;
    folder = "spells";
  } else if (type === "effect") {
    artMap = EFFECT_ART;
    fallback = EFFECT_PLACEHOLDER;
    folder = "effects";
  } else if (type === "mod") {
    artMap = MOD_ART;
    fallback = MOD_PLACEHOLDER;
    folder = "mods";
  } else {
    artMap = CREATURE_ART;
    fallback = CREATURE_PLACEHOLDER;
    folder = "creatures";
  }
  const id = card?.id;
  const mapped = id ? artMap[id] : null;
  const auto = id ? `./assets/${folder}/${id}.jpg` : null;
  const useMapped = mapped && mapped !== fallback;
  return { src: useMapped ? mapped : auto ?? fallback, fallback };
}

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
      if (effect.type === "grant_keyword_allies") {
        return `Give your creatures ${formatKeyword(effect.keyword)}`;
      }
      if (effect.type === "poison_allies") {
        return `Give your creatures ${effect.amount} poison`;
      }
      if (effect.type === "borrow_enemy") {
        return "Borrow a boss creature this round; it returns at end with double power";
      }
      if (effect.type === "swap_positions") {
        return "Swap two creatures on the same board. Both become tired";
      }
      if (effect.type === "repeat_last_spell") {
        const surcharge = effect.surcharge ?? 1;
        return `Repeat your last spell (pay +${surcharge} mana)`;
      }
      if (effect.type === "devour_ally") {
        return "On play: devour a friendly creature and gain its power";
      }
      if (effect.type === "enter_tired") {
        return "Enters tired";
      }
      if (effect.type === "death_damage_boss") {
        return `On death: deal ${effect.amount} damage to boss`;
      }
      if (effect.type === "death_heal_boss") {
        return `On death: boss heals ${effect.amount}`;
      }
      if (effect.type === "death_damage_all_enemies") {
        return `On death: deal ${effect.amount} damage to enemy creatures`;
      }
      if (effect.type === "death_after_attack") {
        return "After this creature attacks, it dies";
      }
      if (effect.type === "purge_mods") {
        return "Remove all mods from a creature";
      }
      if (effect.type === "summon_enemy_broodling") {
        return "On play: summon a Broodling for the boss";
      }
      if (effect.type === "end_clone_boss_on_mass_death") {
        return `End of round: if ${effect.amount}+ creatures died, copy the strongest boss creature`;
      }
      if (effect.type === "cast_counter") {
        const amount = effect.amount ?? 1;
        return `Gain ${amount} counter${amount === 1 ? "" : "s"} whenever you cast a spell or mod`;
      }
      if (effect.type === "death_counter") {
        const amount = effect.amount ?? 1;
        return `Gain ${amount} counter${amount === 1 ? "" : "s"} whenever a creature dies`;
      }
      if (effect.type === "activate_damage") {
        const threshold = effect.threshold ?? 0;
        return `Activate at ${threshold} counters: deal ${effect.amount} damage to any target`;
      }
      if (effect.type === "activate_mana") {
        return "Activate: gain mana equal to counters, then destroy this";
      }
      if (effect.type === "mana_on_mod") {
        return `Gain ${effect.amount} mana when you play a mod`;
      }
      if (effect.type === "end_mana") {
        if (effect.amount < 0) {
          return `End of round: lose ${Math.abs(effect.amount)} mana`;
        }
        return `End of round: gain ${effect.amount} mana`;
      }
      if (effect.type === "end_damage_boss") {
        return `End of round: deal ${effect.amount} damage to boss`;
      }
      if (effect.type === "end_self_buff") {
        if (effect.stat === "power") {
          if (effect.amount < 0) {
            return `End of round: this loses ${Math.abs(effect.amount)} power`;
          }
          return `End of round: this gains ${effect.amount} power`;
        }
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
      if (effect.type === "end_adjacent_buff") {
        return `End of round: adjacent allies gain +${effect.amount} power`;
      }
      if (effect.type === "no_attack") {
        return "Cannot attack";
      }
      if (effect.type === "anchored_aura") {
        const amount = effect.amount ?? 1;
        return `Adjacent allies gain +${amount} power`;
      }
      if (effect.type === "grant_keyword") {
        return `Grant ${formatKeyword(effect.keyword)}`;
      }
      return "";
    })
    .filter(Boolean)
    .join("; ");
}

function isBossModAllowed(card) {
  if (!card || card.type !== "mod") {
    return false;
  }
  return !(card.effects ?? []).some((effect) => {
    if (effect.type === "death_damage_boss") {
      return true;
    }
    if (effect.type === "grant_keyword" && effect.keyword === "pierce") {
      return true;
    }
    return false;
  });
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

      let previewSrc = null;
      let previewFallback = null;
      if (
        card.type === "creature" ||
        card.type === "spell" ||
        card.type === "effect" ||
        card.type === "mod"
      ) {
        const { src: artSrc, fallback: artFallback } = resolveCardArt(card);
        previewSrc = artSrc;
        previewFallback = artFallback;
        if (artSrc) {
          const artWrap = document.createElement("div");
          artWrap.className = "hand-art";
          const artImg = document.createElement("img");
          artImg.src = artSrc;
          if (artFallback && artFallback !== artSrc) {
            artImg.onerror = () => {
              if (artImg.src !== artFallback) {
                artImg.src = artFallback;
              }
            };
          }
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

      if (card.effects && card.effects.length > 0) {
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

      if (card.type === "mod" && isBossModAllowed(card)) {
        const tags = document.createElement("div");
        tags.className = "hand-keywords";
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "boss ok";
        tag.dataset.tooltip = "Can be granted to boss creatures by the generator.";
        tags.appendChild(tag);
        handCard.appendChild(tags);
      }

      item.appendChild(handCard);
      handCard.addEventListener("click", () => {
        const label = card.name ?? card.id ?? "card";
        if (previewSrc) {
          openPreview(previewSrc, previewFallback, label);
        }
      });
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
