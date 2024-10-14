import {RobotRmqProxy} from "../base/robotRmqProxy";
import {GameType} from "@fm/common/constants";
import {random} from "lodash";

// 跑得快机器人
export class RobotDDZ extends RobotRmqProxy {
  constructor(model) {
    super(model, GameType.ddz);
  }

  // 出牌
  playCard() {
    const playCard = async() => {
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
        //如果是自己出牌，过滤下牌型
        const newPrompts = this.room.gameState.filterPromptsCards(this.playerState, cards);
        this.room.gameState.onPlayerDa(this.playerState, { cards: newPrompts[0] })
      }
    }

    setTimeout(playCard, random(1000, 2000));
  }
}
