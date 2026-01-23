export type CardType = "creature" | "spell" | "effect" | "mod";
export type Keyword =
  | "guard"
  | "storm"
  | "pierce"
  | "chain"
  | "sacrifice"
  | "testudo"
  | "venom"
  | "brood"
  | "scavenger"
  | "rebirth"
  | "relay"
  | "order"
  | "sleepy";

export interface DamageEffect {
  type: "damage";
  amount: number;
  chain_amount?: number;
}

export interface DamageAllEffect {
  type: "damage_all";
  amount: number;
}

export interface DeathDamageBossEffect {
  type: "death_damage_boss";
  amount: number;
}

export interface DeathDamageAllEnemiesEffect {
  type: "death_damage_all_enemies";
  amount: number;
}

export interface PoisonAlliesEffect {
  type: "poison_allies";
  amount: number;
}

export interface PurgeModsEffect {
  type: "purge_mods";
}

export interface SummonEnemyBroodlingEffect {
  type: "summon_enemy_broodling";
  amount?: number;
}

export interface EndCloneBossOnMassDeathEffect {
  type: "end_clone_boss_on_mass_death";
  amount: number;
}

export interface DeathCounterEffect {
  type: "death_counter";
  amount?: number;
}

export interface ActivateDamageEffect {
  type: "activate_damage";
  amount: number;
  threshold: number;
}

export interface GrantKeywordAlliesEffect {
  type: "grant_keyword_allies";
  keyword: Keyword;
}

export interface RequiresReadyAllyEffect {
  type: "requires_ready_ally";
}

export interface PlayTireAlliesEffect {
  type: "play_tire_allies";
}

export interface EnterTiredEffect {
  type: "enter_tired";
}

export interface BuffEffect {
  type: "buff";
  stat: "power";
  amount: number;
  requires?: "sacrifice_self";
}

export interface AuraEffect {
  type: "aura";
  stat: "power";
  amount: number;
  applies_to: "attack";
}

export interface EndBuffEffect {
  type: "end_buff";
  stat: "power";
  amount: number;
  applies_to: "untired";
}

export interface EndAdjacentBuffEffect {
  type: "end_adjacent_buff";
  stat: "power";
  amount: number;
}

export interface GrantKeywordEffect {
  type: "grant_keyword";
  keyword: Keyword;
}

export interface ShieldEffect {
  type: "shield";
  amount: number;
}

export type EffectDefinition =
  | DamageEffect
  | DamageAllEffect
  | DeathDamageBossEffect
  | DeathDamageAllEnemiesEffect
  | PoisonAlliesEffect
  | PurgeModsEffect
  | SummonEnemyBroodlingEffect
  | EndCloneBossOnMassDeathEffect
  | DeathCounterEffect
  | ActivateDamageEffect
  | GrantKeywordAlliesEffect
  | RequiresReadyAllyEffect
  | PlayTireAlliesEffect
  | EnterTiredEffect
  | BuffEffect
  | AuraEffect
  | EndBuffEffect
  | EndAdjacentBuffEffect
  | GrantKeywordEffect
  | ShieldEffect;

export interface CardDefinition {
  id: string;
  name: string;
  type: CardType;
  cost: number;
  keywords?: Keyword[];
  stats?: {
    power: number;
  };
  effects?: EffectDefinition[];
}

export interface CardLibrary {
  byId: Record<string, CardDefinition>;
}

export interface CardInstance {
  uid?: string;
  card: string;
  power: number;
  keywords: Keyword[];
  mods: string[];
  tired: boolean;
  poison?: number;
  shield?: number;
  rebirths?: number;
  counter?: number;
}

export interface SideState {
  mana: number;
  hand: string[];
  board: CardInstance[];
  deck?: string[];
  graveyard?: string[];
}

export interface OpponentState {
  health: number;
  name?: string;
  board: CardInstance[];
  deck?: string[];
  graveyard?: string[];
  poison?: number;
}

export interface GameState {
  player: SideState;
  opponent: OpponentState;
  chainCount: number;
  turn: number;
  nextUid: number;
  manaPerRound: number;
  targetRounds?: number;
  roundDeaths?: number;
}

export type PlayAction = {
  type: "play";
  card: string;
  target?: string;
};

export type AttackAction = {
  type: "attack";
  source: string;
  target: string;
};

export type ActivateAction = {
  type: "activate";
  source: string;
  target?: string;
};

export type EndAction = {
  type: "end";
};

export type Action = PlayAction | AttackAction | ActivateAction | EndAction;

export interface Puzzle {
  id: string;
  difficulty: "easy" | "medium" | "hard";
  seed?: number;
  tags?: string[];
  targetRounds?: number;
  manaPerRound?: number;
  player: SideState;
  opponent: OpponentState;
  solution?: Action[];
  metadata?: Record<string, unknown>;
}
