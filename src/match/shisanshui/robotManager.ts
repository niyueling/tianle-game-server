// 机器人出牌
import {service} from "../../service/importService";
import {NewRobotManager} from "../base/newRobotManager";
import {RobotSSS} from "./robotProxy";

export class RobotManager extends NewRobotManager {
  disconnectPlayers: { [key: string]: RobotSSS }
  async createProxy(playerId) {
    const model = await service.playerService.getPlayerPlainModel(playerId);
    return new RobotSSS(model);
  }

  async playCard() {
    const keys = Object.keys(this.disconnectPlayers);
    let playerState;
    for (const key of keys) {
      playerState = this.disconnectPlayers[key].playerState;
      if (playerState && !playerState.committed) {
        // 未出牌
        this.room.gameState.commitForPlayer(playerState)
      }
    }
  }

  // 玩家是否到齐
  async isNoPlayerAbsent() {
    const count = this.room.players.filter(x => x).length;
    const snapCount = this.room.snapshot.filter(x => x).length;
    // 有2个人以上就算到齐
    return count === snapCount;
  }

  async robotPlayerReady() {
    if (this.room.readyPlayers.length === this.room.snapshot.length) {
      // 不需要准备
      return true;
    }
    let index;
    for (const proxy of Object.values(this.disconnectPlayers)) {
      index = this.room.readyPlayers.indexOf(proxy.model._id);
      if (index === -1) {
        await this.room.nextGame(proxy);
        this.room.ready(proxy);
      }
    }
    return true;
  }
}
