import {RobotRmqProxy} from "../base/robotRmqProxy";
import {GameType} from "@fm/common/constants";

// 跑得快机器人
export class RobotDDZ extends RobotRmqProxy {
  constructor(model) {
    super(model, GameType.ddz);
  }

  // 出牌
  playCard() {
    if (this.room.gameState.canGuo()) {
      // 自动托管
      const cards = this.room.gameState.promptWithPattern(this.playerState);
      if (cards.length > 0) {
        this.room.gameState.onPlayerDa(this.playerState, { cards })
      } else {
        this.room.gameState.guoPai(this.playerState);
      }
    } else {
      const cards = this.room.gameState.playManager.firstPlayCard(this.playerState.cards);
      this.room.gameState.onPlayerDa(this.playerState, { cards })
    }
  }
}
