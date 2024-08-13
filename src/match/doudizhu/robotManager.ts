// 机器人出牌
import {service} from "../../service/importService";
import {NewRobotManager} from "../base/newRobotManager";
import {RobotDDZ} from "./robotProxy";
import Enums from "../xmmajiang/enums";

export class RobotManager extends NewRobotManager {
  disconnectPlayers: { [key: string]: RobotDDZ }

  // 创建机器人代理
  async createProxy(playerId) {
    const model = await service.playerService.getPlayerPlainModel(playerId);
    if (!model) {
      console.error('no model for', playerId)
    }
    return new RobotDDZ(model);
  }

  // 出牌
  async playCard() {
    if (!this.room.gameState || this.room.gameState.state !== 3) {
      return;
    }
    const keys = Object.keys(this.disconnectPlayers);
    for (const key of keys) {
      const proxy = this.disconnectPlayers[key];

      if (this.isPlayerDa(proxy.playerState)) {
        if (this.waitInterval[key] >= this.getWaitSecond()) {
          // 重新计时
          this.waitInterval[key] = 0;
          proxy.playCard();
        }
      }
    }
  }

  // 打
  isPlayerDa(player) {
    if(player) {
      return this.room.gameState.currentPlayerStep === player.index
    }

    return false
  }
}
