import {autoSerialize, Serializable, serialize, serializeHelp} from "../serializeDecorator";
import NormalTable from './normalTable'
import Rule from './Rule'

export default class Game implements Serializable {
  @serialize
  rule: Rule

  // 剩余局数
  @autoSerialize
  juShu: number

  @autoSerialize
  juIndex: number

  // 保存在 redis 中
  @autoSerialize
    // 最后胜利的玩家
  lastWinnerShortId: number;

  constructor(ruleObj) {
    this.rule = new Rule(ruleObj);
    this.juShu = ruleObj.juShu;
    this.juIndex = 0;
    // 最后胜利的玩家
    this.lastWinnerShortId = -1;
    this.reset();
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

    return this.createTable(room)
  }

  toJSON() {
    return serializeHelp(this)
  }

  createTable(room) {
    const Table = NormalTable
    return new Table(room, this.rule, this.juShu)
  }

  reset() {
    this.juShu = this.rule.juShu
    this.juIndex = 0;
    this.lastWinnerShortId = -1;
  }

  isAllOver(): boolean {
    return this.juShu <= 0
  }

  // 保存上局赢家的位置
  saveLastWinner(shortId) {
    this.lastWinnerShortId = shortId;
  }
}
