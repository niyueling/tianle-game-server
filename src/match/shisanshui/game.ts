import {IGame} from '../IRoom'
import {autoSerialize, Serializable, serialize, serializeHelp} from "../serializeDecorator";
import ClassicTable from './classic/classicTable'
import LuoSongTable from './luosong/luoSongTable'
import QiPaiTable from './qipai/qiPaiTable'
import Rule from './Rule'

export default class Game implements IGame, Serializable {
  @serialize
  rule: Rule

  @autoSerialize
  juShu: number

  @autoSerialize
  juIndex: number

  constructor(ruleObj) {
    this.rule = new Rule(ruleObj)
    this.juShu = 0
    this.juIndex = 0
    this.reset()
  }

  startGame(room) {
    if (!room.isPublic) {
      this.juShu--
      this.juIndex++
    }

    return this.createTable(room)
  }

  toJSON() {
    return serializeHelp(this)
  }

  createTable(room) {
    const wanFaMap = {
      luoSong: LuoSongTable,
      jingDian: ClassicTable,
      qiPai: QiPaiTable
    }

    const Table = wanFaMap[this.rule.wanFa] || ClassicTable
    return new Table(room, this.rule, this.juShu)
  }

  isAllOver(): boolean {
    return this.juShu === 0
  }

  reset() {
    this.juShu = this.rule.juShu
    this.juIndex = 0
  }
}
