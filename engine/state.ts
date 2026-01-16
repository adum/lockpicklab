import { CardInstance, GameState, OpponentState, SideState } from "./types";

function cloneInstance(instance: CardInstance): CardInstance {
  return {
    uid: instance.uid,
    card: instance.card,
    power: instance.power,
    keywords: [...instance.keywords],
    mods: [...instance.mods],
    tired: instance.tired,
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
    board: side.board.map(cloneInstance),
    deck: side.deck ? [...side.deck] : undefined,
    graveyard: side.graveyard ? [...side.graveyard] : undefined,
  };
}

export function cloneState(state: GameState): GameState {
  return {
    player: cloneSide(state.player),
    opponent: cloneOpponent(state.opponent),
    chainCount: state.chainCount,
    turn: state.turn,
    nextUid: state.nextUid,
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
}): GameState {
  const nextUidRef = { value: input.nextUid ?? 1 };
  const player = cloneSide(input.player);
  const opponent = cloneOpponent(input.opponent);

  assignMissingUids(player.board, "p", nextUidRef);
  assignMissingUids(opponent.board, "o", nextUidRef);

  return {
    player,
    opponent,
    chainCount: input.chainCount ?? 0,
    turn: input.turn ?? 1,
    nextUid: nextUidRef.value,
  };
}
