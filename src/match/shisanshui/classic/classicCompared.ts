import {values} from '../../utils'
import Combo from "../combo"
import PlayerState from "../player_state"

export class SingleCombat {
  water: number
  extra: number = 0

  constructor(readonly combo: Combo, water: number) {
    this.water = water
  }
}

export default class ClassicCompared {
  player: {
    index: number,
    model: any
  }
  playerId: string
  maPaiCount: number
  head: SingleCombat
  middle: SingleCombat
  tail: SingleCombat
  won: number
  daQiang: number[] = []
  isQiPai: boolean
  trace: object

  constructor(playerState: PlayerState) {
    const index = playerState.seatIndex
    const model = playerState.model
    const {head, middle, tail} = playerState.suit

    this.playerId = playerState.model._id
    this.maPaiCount = playerState.maPaiCount
    this.player = {index, model}
    this.head = new SingleCombat(head, 0)
    this.middle = new SingleCombat(middle, 0)
    this.tail = new SingleCombat(tail, 0)

    this.trace = {}
  }

  clean() {
    delete this.trace
  }

  public settle() {
    this.won = values(this.trace)
      // tslint:disable-next-line:no-bitwise
      .map(forOther => (~~forOther.wins + ~~forOther.extras) * ~~forOther.maTimes)
      .reduce((a, b) => a + b, 0)
  }
}
