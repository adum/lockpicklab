export type CardType = "creature" | "spell" | "effect" | "mod";
export type Keyword =
  | "guard"
  | "storm"
  | "pierce"
  | "chain"
  | "sacrifice"
  | "testudo"
  | "venom"
  | "brood";

export interface DamageEffect {
  type: "damage";
  amount: number;
  chain_amount?: number;
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
  | BuffEffect
  | AuraEffect
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
