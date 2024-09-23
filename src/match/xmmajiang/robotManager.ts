import {service} from "../../service/importService";
import {NewRobotManager} from "../base/newRobotManager";
import Enums from "./enums";
import {MJRobotRmqProxy} from "./robotRmqProxy";

// 机器人出牌
export class RobotManager extends NewRobotManager {
  // room: any
  disconnectPlayers: { [key: string]: MJRobotRmqProxy }

  // 创建机器人代理
  async createProxy(playerId) {
    const model = await service.playerService.getPlayerPlainModel(playerId);
    if (!model) {
      console.log('no model for', playerId)
    }
    return new MJRobotRmqProxy(model)
  }

  // 更新代理机器人等待出牌的时间
  async updateWaitPlayTime() {
    if (!this.room.gameState) {
      return;
    }
    const keys = Object.keys(this.disconnectPlayers);
    let proxy;
    for (const key of keys) {
      proxy = this.disconnectPlayers[key];
      if (this.isPlayerDa(proxy.model._id) || this.isPlayerGuo(proxy.model._id)) {
        if (this.waitInterval[key]) {
          this.waitInterval[key]++;
        } else {
          this.waitInterval[key] = 1;
        }
      }
    }
  }

  // 出牌
  async playCard() {
    if (!this.room.gameState) {
      return;
    }
    const keys = Object.keys(this.disconnectPlayers);
    let proxy;
    let playerId;
    for (const key of keys) {
      proxy = this.disconnectPlayers[key];
      playerId = proxy.model._id;

      const AnGangIndex = this.isPlayerAnGang(proxy.playerState);
      const buGangIndex = this.isPlayerBuGang(proxy.playerState);
      const choice = this.isPlayerChoice(playerId);
      const isHu = proxy.playerState.checkZiMo();
      // console.warn("room %s state %s ", this.room._id, this.room.gameState.state)

      if (this.room.gameState.testMoCards.length === 0) {
        if (this.room.gameState.state === 10)  {
          await proxy.choice(Enums.qiangJin);
          continue;
        } else if (isHu.hu && !this.room.gameState.stateData.type) {
          await proxy.choice(Enums.hu);
          continue;
        } else if (AnGangIndex) {
          await proxy.gang(Enums.anGang, AnGangIndex);
          continue;
        } else if (buGangIndex && !this.room.gameState.stateData.type) {
          await proxy.gang(Enums.buGang, buGangIndex);
          continue;
        } else if (choice) {
          await proxy.choice(choice);
          continue;
        }
      }

      if (this.isPlayerDa(playerId)) {
        if (this.waitInterval[key] >= this.getWaitSecond()) {
          await proxy.playCard();
          // 重新计时
          this.waitInterval[key] = 0;
        }
      } else {
        if (this.isPlayerGuo(playerId)) {
          await proxy.guo();
        }
      }
    }
  }

  // 打
  isPlayerDa(playerId) {
    return this.room.gameState.stateData[Enums.da] &&
      playerId.toString() === this.room.gameState.stateData[Enums.da]._id.toString()
  }

  isPlayerBuGang(player) {
    if (!Array.isArray(player.events.peng)) return false;
    for (const index in player.events.peng) {
      if (player.cards[player.events.peng[index]] > 0 && this.room.gameState.stateData[Enums.da] && player._id.toString() === this.room.gameState.stateData[Enums.da]._id.toString()) {
        return player.events.peng[index];
      }
    }
    return false;
  }

  isPlayerAnGang(player) {
    for (const index in player.cards) {
      if (player.cards[index] === 4 && !isNaN(Number(index)) && this.room.gameState.stateData[Enums.da] && player._id.toString() === this.room.gameState.stateData[Enums.da]._id.toString()) {
        return index;
      }
    }
    return false;
  }

  // 是不是能过
  isPlayerGuo(playerId) {
    const actionList = [Enums.hu, Enums.peng, Enums.gang, Enums.chi];
    for (const action of actionList) {
      if ([Enums.peng, Enums.chi, Enums.gang].includes(action)
        && this.room.gameState.stateData[action] && playerId.toString() === this.room.gameState.stateData[action]._id.toString()) {
        return true;
      }
      if (action === Enums.hu && Array.isArray(this.room.gameState.stateData[action]) &&
        this.room.gameState.stateData[action].length > 0) {
        if (playerId.toString() === (Array.isArray(this.room.gameState.stateData[action]) ?
          this.room.gameState.stateData[action][0]._id.toString()
          : this.room.gameState.stateData[action]._id.toString())) return true;
      }
    }

    return false;
  }

  // 是否碰吃杠胡
  isPlayerChoice(playerId) {
    const actionList = [Enums.hu, Enums.chi, Enums.gang, Enums.peng];

    for (const action of actionList) {
      if ([Enums.peng, Enums.chi, Enums.gang].includes(action) && this.room.gameState.stateData[action] && playerId.toString() === this.room.gameState.stateData[action]._id.toString()) {
        return action;
      }

      if (action === Enums.hu && Array.isArray(this.room.gameState.stateData[action]) &&
        this.room.gameState.stateData[action].length > 0) {
        if (playerId.toString() === (Array.isArray(this.room.gameState.stateData[action]) ?
          this.room.gameState.stateData[action][0]._id.toString()
          : this.room.gameState.stateData[action]._id.toString())) return action;
      }
    }
    return false;
  }
}
