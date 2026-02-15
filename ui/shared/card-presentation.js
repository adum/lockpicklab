import { formatKeyword } from "../keywords.js";

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

function getCardType(card) {
  return card?.type ?? "creature";
}

function getCardId(card, fallbackId) {
  return card?.id ?? fallbackId ?? null;
}

function getArtConfig(type) {
  if (type === "spell") {
    return {
      artMap: SPELL_ART,
      fallback: SPELL_PLACEHOLDER,
      folder: "spells",
    };
  }
  if (type === "effect") {
    return {
      artMap: EFFECT_ART,
      fallback: EFFECT_PLACEHOLDER,
      folder: "effects",
    };
  }
  if (type === "mod") {
    return {
      artMap: MOD_ART,
      fallback: MOD_PLACEHOLDER,
      folder: "mods",
    };
  }
  return {
    artMap: CREATURE_ART,
    fallback: CREATURE_PLACEHOLDER,
    folder: "creatures",
  };
}

export function resolveCardArt(card, fallbackId) {
  const type = getCardType(card);
  const id = getCardId(card, fallbackId);
  const { artMap, fallback, folder } = getArtConfig(type);
  const mapped = id ? artMap[id] : null;
  const auto = id ? `./assets/${folder}/${id}.jpg` : null;
  const useMapped = mapped && mapped !== fallback;
  return { src: useMapped ? mapped : auto ?? fallback, fallback };
}

export function isBossModAllowed(card) {
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

function formatDamage(amount, compact) {
  if (compact) {
    return `${amount} dmg`;
  }
  return `${amount} damage`;
}

export function formatEffect(effect, options) {
  const compact = Boolean(options?.compact);
  if (effect.type === "damage") {
    const chain = effect.chain_amount
      ? compact
        ? ` (Chain ${effect.chain_amount})`
        : ` (Chain ${effect.chain_amount})`
      : "";
    return `${compact ? "Deal" : "Deal"} ${formatDamage(effect.amount, compact)}${chain}`;
  }
  if (effect.type === "damage_all") {
    return compact
      ? `Deal ${effect.amount} dmg to all creatures`
      : `Deal ${effect.amount} damage to all creatures`;
  }
  if (effect.type === "grant_keyword_allies") {
    return `Give your creatures ${formatKeyword(effect.keyword)}`;
  }
  if (effect.type === "poison_allies") {
    return `Give your creatures ${effect.amount} poison`;
  }
  if (effect.type === "borrow_enemy") {
    return compact
      ? "Borrow a boss creature this round; it returns to the boss at end with double power"
      : "Borrow a boss creature this round; it returns at end with double power";
  }
  if (effect.type === "swap_positions") {
    return "Swap two creatures on the same board. Both become tired";
  }
  if (effect.type === "repeat_last_spell") {
    const surcharge = effect.surcharge ?? 1;
    return `Repeat your last spell (pay +${surcharge} mana)`;
  }
  if (effect.type === "execute_threshold") {
    const threshold = effect.threshold ?? 0;
    const manaGain = effect.mana_gain ?? 0;
    return compact
      ? `Destroy all creatures with ${threshold}+ power and gain ${manaGain} mana each`
      : `Destroy all creatures with ${threshold}+ power and gain ${manaGain} mana each`;
  }
  if (effect.type === "devour_ally") {
    return "On play: devour a friendly creature and gain its power";
  }
  if (effect.type === "enter_tired") {
    return "Enters tired";
  }
  if (effect.type === "death_damage_boss") {
    return compact
      ? `On death: deal ${effect.amount} dmg to boss`
      : `On death: deal ${effect.amount} damage to boss`;
  }
  if (effect.type === "death_heal_boss") {
    return `On death: boss heals ${effect.amount}`;
  }
  if (effect.type === "death_damage_all_enemies") {
    return compact
      ? `On death: deal ${effect.amount} dmg to enemy creatures`
      : `On death: deal ${effect.amount} damage to enemy creatures`;
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
    return compact
      ? `Activate at ${threshold} counters: deal ${effect.amount} dmg to any target`
      : `Activate at ${threshold} counters: deal ${effect.amount} damage to any target`;
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
    return compact
      ? `End of round: deal ${effect.amount} dmg to boss`
      : `End of round: deal ${effect.amount} damage to boss`;
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
  if (effect.type === "requires_ready_ally") {
    return "Requires an untired allied creature";
  }
  if (effect.type === "play_tire_allies") {
    return "On play: all your creatures become tired";
  }
  return "";
}

export function formatEffects(effects, options) {
  return (effects ?? [])
    .map((effect) => formatEffect(effect, options))
    .filter(Boolean)
    .join("; ");
}
