/**
 * Created by user on 2016-07-06.
 */
import {autoSerialize, Serializable, serializeHelp} from "../serializeDecorator"
import Rule from './Rule';
import TableState from './table_state';

class Game implements Serializable {
  @autoSerialize
  juShu: number

  @autoSerialize
  juIndex: number

  rule: any

  constructor(ruleObj) {
    this.rule = new Rule(ruleObj);
    this.juIndex = 0;
    this.juShu = this.rule.juShu;
  }

  startGame(room) {
    if (!room.isPublic) {
      this.juShu--;
      this.juIndex++;
    } else {
      this.juIndex++;
    }
    return new TableState(room, this.rule, this.juShu);
  }

  toJSON() {
    return serializeHelp(this)
  }

  isAllOver(): boolean {
    return this.juShu === 0
  }

}

export default Game;
