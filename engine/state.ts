import { CardInstance, GameState, OpponentState, SideState } from "./types";

function cloneInstance(instance: CardInstance): CardInstance {
  return {
    uid: instance.uid,
    card: instance.card,
    power: instance.power,
    keywords: [...instance.keywords],
    mods: [...instance.mods],
    tired: instance.tired,
    poison: instance.poison ?? 0,
    shield: instance.shield ?? 0,
    rebirths: instance.rebirths ?? 0,
    counter: instance.counter ?? 0,
    borrowed: instance.borrowed ?? false,
    borrowedMultiplier: instance.borrowedMultiplier ?? 0,
  };
}

function cloneSide(side: SideState): SideState {
  return {
    mana: side.mana,
    hand: [...side.hand],
    board: side.board.map(cloneInstance),
    deck: side.deck ? [...side.deck] : undefined,
    graveyard: side.graveyard ? [...side.graveyard] : undefined,
  };
}

function cloneOpponent(side: OpponentState): OpponentState {
  return {
    health: side.health,
    name: side.name,
    board: side.board.map(cloneInstance),
    deck: side.deck ? [...side.deck] : undefined,
    graveyard: side.graveyard ? [...side.graveyard] : undefined,
    poison: side.poison ?? 0,
  };
}

export function cloneState(state: GameState): GameState {
  return {
    player: cloneSide(state.player),
    opponent: cloneOpponent(state.opponent),
    chainCount: state.chainCount,
    turn: state.turn,
    nextUid: state.nextUid,
    manaPerRound: state.manaPerRound,
    targetRounds: state.targetRounds,
    roundDeaths: state.roundDeaths ?? 0,
  };
}

function assignMissingUids(
  board: CardInstance[],
  prefix: "p" | "o",
  nextUid: { value: number }
): void {
  for (const instance of board) {
    if (!instance.uid || instance.uid.length === 0) {
      instance.uid = `${prefix}${nextUid.value}`;
      nextUid.value += 1;
    }
  }
}

export function normalizeState(input: {
  player: SideState;
  opponent: OpponentState;
  chainCount?: number;
  turn?: number;
  nextUid?: number;
  manaPerRound?: number;
  targetRounds?: number;
  roundDeaths?: number;
}): GameState {
  const nextUidRef = { value: input.nextUid ?? 1 };
  const player = cloneSide(input.player);
  const opponent = cloneOpponent(input.opponent);

  player.board.forEach((unit) => {
    unit.poison = unit.poison ?? 0;
    unit.shield = unit.shield ?? 0;
    unit.rebirths = unit.rebirths ?? 0;
    unit.counter = unit.counter ?? 0;
    unit.borrowed = unit.borrowed ?? false;
    unit.borrowedMultiplier = unit.borrowedMultiplier ?? 0;
  });
  opponent.board.forEach((unit) => {
    unit.poison = unit.poison ?? 0;
    unit.shield = unit.shield ?? 0;
    unit.rebirths = unit.rebirths ?? 0;
    unit.counter = unit.counter ?? 0;
    unit.borrowed = unit.borrowed ?? false;
    unit.borrowedMultiplier = unit.borrowedMultiplier ?? 0;
  });
  opponent.poison = opponent.poison ?? 0;

  assignMissingUids(player.board, "p", nextUidRef);
  assignMissingUids(opponent.board, "o", nextUidRef);

  return {
    player,
    opponent,
    chainCount: input.chainCount ?? 0,
    turn: input.turn ?? 1,
    nextUid: nextUidRef.value,
    manaPerRound: input.manaPerRound ?? 0,
    targetRounds: input.targetRounds,
    roundDeaths: input.roundDeaths ?? 0,
  };
}
