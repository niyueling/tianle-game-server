import {autoSerialize, Serializable, serialize, serializeHelp} from "../serializeDecorator";
import NormalTable from './normalTable'
import Rule from './Rule'

export default class Game implements Serializable {
  @serialize
  rule: Rule

  @autoSerialize
  juShu: number

  @autoSerialize
  juIndex: number

  constructor(ruleObj) {
    this.rule = new Rule(ruleObj)
    this.juShu = ruleObj.juShu
    this.juIndex = 0
    this.reset()
  }

  startGame(room) {
    if (!room.isPublic) {
      this.juShu--
      this.juIndex++
    } else {
      // 金豆房，只要添加第几局
      this.juIndex++;
    }
    return this.createTable(room)
  }

  toJSON() {
    return serializeHelp(this)
  }

  createTable(room) {
    const wanFaMap = {
      normal: NormalTable,
    }

    const Table = wanFaMap[this.rule.wanFa] || NormalTable
    return new Table(room, this.rule, this.juShu)
  }

  reset() {
    this.juShu = this.rule.juShu
    this.juIndex = 0
  }

  isAllOver(): boolean {
    return this.juShu === 0
  }
}
