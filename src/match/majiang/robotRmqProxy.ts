import {GameType, RedisKey} from "@fm/common/constants";
import {RobotRmqProxy} from "../base/robotRmqProxy";
import Enums from "./enums";
import {service} from "../../service/importService";

// 机器人
export class MJRobotRmqProxy extends RobotRmqProxy {
  constructor(model) {
    super(model, GameType.mj);
  }

  // 出牌
  async playCard() {
    console.warn(`playerId: ${this.playerState.model.shortId}, name: ${this.playerState.model.nickname}, onDeposit: ${this.playerState.onDeposit}`)
    if (this.playerState) {
      // 从牌堆中取出合适的牌
      const index = this.room.gameState.promptWithPattern(this.playerState, this.room.gameState.lastTakeCard);
      await this.room.gameState.onPlayerDa(this.playerState, this.room.gameState.turn, index);
      this.playerState.onDeposit = true;
    }
  }

  checkPlayerCount(player) {
    const cards = player.cards.slice();
    let count = 0;

    for (let i = 0; i < cards.length; i++) {
      if (cards[i] > 0) {
        count += cards[i];
      }
    }

    return count;
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
    console.warn(`${this.playerState.model.shortId}(${this.playerState.model.nickname})执行操作：${action}`)

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
