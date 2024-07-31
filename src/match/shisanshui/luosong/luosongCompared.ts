import {ComboTypes} from "../patterns/base"
import PlayerState from "../player_state";

import ClassicCompared from "../classic/classicCompared";

export default class LuoSongCompared extends ClassicCompared {

  isQiPai: boolean

  constructor(playerState: PlayerState) {
    super(playerState)
    this.isQiPai = this.verifyQiPai()
  }

  verifyQiPai() {
    if (this.head.combo.type === ComboTypes.TRIPLE) {
      return true
    }

    const tailType = this.tail.combo.type
    return tailType === ComboTypes.BOMB || tailType === ComboTypes.FLUSH
  }

  compareLuoSong(another: LuoSongCompared) {
    const qiPaiCompare = +this.isQiPai - (+another.isQiPai)
    if (qiPaiCompare !== 0) {
      return qiPaiCompare > 0
    }

    if (this.isQiPai && another.isQiPai) {
      return this.tail.combo.score - another.tail.combo.score > 0
    }

    let winStep = 0
    winStep += this.head.combo.score - another.head.combo.score ? 1 : -1
    winStep += this.middle.combo.score - another.middle.combo.score ? 1 : -1
    winStep += this.tail.combo.score - another.tail.combo.score ? 1 : -1
    return winStep >= 2
  }

}
