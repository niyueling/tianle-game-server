import {GameType, RedisKey} from "@fm/common/constants";
import {RobotRmqProxy} from "../base/robotRmqProxy";
import Enums from "./enums";

// 机器人
export class MJRobotRmqProxy extends RobotRmqProxy {
  constructor(model) {
    super(model, GameType.xueliu);
  }

  // 出牌
  async playCard() {
    if (this.playerState) {
      // 从牌堆中取出合适的牌
      const card = this.room.gameState.promptWithPattern(this.playerState, this.room.gameState.lastTakeCard);
      this.playerState.emitter.emit(Enums.da, this.room.gameState.turn, card);
    }
  }


  async guo() {
    if (this.playerState) {
      // 过
      await this.room.gameState.onPlayerGuo(
        this.playerState, this.room.gameState.turn, this.room.gameState.lastTakeCard
      );
    }
  }

  async choice(action) {
    if (this.playerState) {
      await this.room.gameState.promptWithOther(
        action, this.playerState
      );
    }
  }

  async gang(action, index = 0) {
    switch (action) {
      case Enums.gang:
        await this.room.gameState.promptWithOther(Enums.gang, this.playerState);
        break;

      case Enums.anGang:
        await this.room.gameState.promptWithOther(Enums.anGang, this.playerState, index);
        break;

      case Enums.buGang:
        await this.room.gameState.promptWithOther(Enums.buGang, this.playerState, index);
        break;
    }
  }
}
