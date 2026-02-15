import { initTooltips } from "./tooltip.js";
import { KEYWORD_TOOLTIPS } from "./keywords.js";
import {
  formatEffects,
  isBossModAllowed,
  resolveCardArt,
} from "./shared/card-presentation.js";

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
        desc.textContent = formatEffects(card.effects) || "—";
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
