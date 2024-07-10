import {RobotRmqProxy} from "../base/robotRmqProxy";

// 机器人
export class RobotZD extends RobotRmqProxy {
  constructor(model) {
    super(model, 'zhadan');
  }

  // 出牌
  playCard() {
    if (this.room.gameState.canGuo()) {
      // 自动托管
      const cards = this.room.gameState.promptWithPattern(this.playerState);
      if (cards.length > 0) {
        this.room.gameState.onPlayerDa(this.playerState, { cards }, true)
      } else {
        this.room.gameState.guoPai(this.playerState, true);
      }
    } else {
      const cards = this.room.gameState.promptWithFirstPlay(this.playerState);
      this.room.gameState.onPlayerDa(this.playerState, { cards }, true)
    }
  }
}
