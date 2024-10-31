import {autoSerialize, Serializable, serialize, serializeHelp} from "../serializeDecorator";
import NormalTable from './normalTable'
import Rule from './Rule'
import {getRandomInt} from "./utils";

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
      this.juIndex++;

      // 好友房第一局，队友级牌和对手级牌都设置为2
      if (this.juIndex === 1) {
        room.homeTeamCard = 5;
        room.awayTeamCard = 5;
        room.currentLevelCard = room.homeTeamCard;
        console.warn("本局级牌 %s", room.currentLevelCard);
      }
    }

    if (room.isPublic) {
      let levelCard = -1;

      this.juIndex++;

      // 如果是随机级牌
      if (this.rule.juShu === 6) {
        levelCard = getRandomInt(1, 13);
      }

      // 如果是过5或者过A,第一局设置级牌为2
      if ([1, 5].includes(this.rule.juShu) && this.juIndex === 1) {
        levelCard = 2;
      }

      if (levelCard !== -1) {
        room.homeTeamCard = levelCard;
        room.awayTeamCard = levelCard;
        room.currentLevelCard = room.homeTeamCard;
        console.warn("本局级牌 %s", room.currentLevelCard);
      }
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
