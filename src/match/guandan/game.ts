import {autoSerialize, Serializable, serialize, serializeHelp} from "../serializeDecorator";
import NormalTable from './normalTable'
import Rule from './Rule'
import {Team} from "./table"

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
      // 根据juShu参数判断是否游戏结束
      // this.juShu--
      this.juIndex++
    }

    if (room.isPublic) {
      // 金豆房如果过A，级牌回2
      this.juIndex++
    }

    // 如果是第一局，队友级牌和对手级牌都设置为2
    if (this.juIndex === 1) {
      room.homeTeamCard = 5;
      room.awayTeamCard = 5;
      room.currentLevelCard = room.homeTeamCard;
      console.warn("本局级牌 %s", room.currentLevelCard);
    }

    // 如果不是第一局，根据上一局情况，判断队友级牌和对手级牌
    if (this.juIndex > 1) {

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
