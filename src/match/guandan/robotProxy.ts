import {RobotRmqProxy} from "../base/robotRmqProxy";

// 机器人
export class RobotGuanDan extends RobotRmqProxy {
  constructor(model) {
    super(model, 'guandan');
  }

  // 出牌
  playCard() {
    if (this.room.gameState.canGuo()) {
      // 自动托管
      const cards = this.room.gameState.promptWithPattern(this.playerState);
      console.warn("play card index %s cards %s", this.playerState.seatIndex, JSON.stringify(cards));
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
