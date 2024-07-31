import ClassicCompared from "../classic/classicCompared";
import PlayerState from "../player_state";

export default class QiPaiCompared extends ClassicCompared {

  isQiPai: boolean
  score: number
  name: string
  extra: string

  constructor(playerState: PlayerState) {
    super(playerState)
    const {isQiPai, name, score} = playerState.suit
    this.isQiPai = isQiPai
    this.name = name
    this.score = score
    this.extra = ''
  }
}
