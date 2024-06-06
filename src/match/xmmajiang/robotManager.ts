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
    // console.log('robot play card, keys', keys, this.room._id);
    for (const key of keys) {
      proxy = this.disconnectPlayers[key];
      playerId = proxy.model._id;
      const AnGangIndex = this.isPlayerAnGang(proxy.playerState);
      const buGangIndex = this.isPlayerBuGang(proxy.playerState);
      const isHu = proxy.playerState.checkZiMo();
      if (this.room.gameState.testMoCards.length === 0) {
        if (this.room.gameState.state === 10) {
          return await proxy.choice(Enums.qiangJin);
        } else if (isHu.hu) {
          return await proxy.choice(Enums.hu)
        } else if (AnGangIndex) {
          return await proxy.gang(Enums.anGang, AnGangIndex)
        } else if (buGangIndex) {
          return await proxy.gang(Enums.buGang, buGangIndex)
        } else if (this.isPlayerGang(playerId)) {
          return await proxy.gang(this.isPlayerGang(playerId))
        } else if (this.isPlayerChoice(playerId)) {
          return await proxy.choice(this.isPlayerChoice(playerId))
        }
      }

      if (this.isPlayerDa(playerId)) {
        if (this.waitInterval[key] >= this.getWaitSecond()) {
          await proxy.playCard();
          // 重新计时
          this.waitInterval[key] = 0;
        }
        break;
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
      if (player.cards[player.events.peng[index]] > 0) {
        return player.events.peng[index];
      }
    }
    return false;
  }

  isPlayerAnGang(player) {
    for (const index in player.cards) {
      if (player.cards[index] === 4 && !isNaN(Number(index))) {
        return index;
      }
    }
    return false;
  }

  // 是不是能过
  isPlayerGuo(playerId) {
    const actionList = [Enums.hu, Enums.peng, Enums.chi];
    for (const action of actionList) {
      if ([Enums.peng, Enums.chi].includes(action)
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

  isPlayerGang(playerId) {
    const actionList = [Enums.gang, Enums.anGang, Enums.mingGang];
    for (const action of actionList) {
      if ([Enums.gang, Enums.anGang, Enums.mingGang].includes(action) && this.room.gameState.stateData[action]) {
        if (playerId.toString() === this.room.gameState.stateData[action]._id.toString()) return action;
      }
    }

    return false;
  }

  // 是否碰杠胡
  isPlayerChoice(playerId) {
    const actionList = [Enums.hu, Enums.peng, Enums.chi];
    for (const action of actionList) {
      if ([Enums.peng, Enums.chi].includes(action)
        && this.room.gameState.stateData[action] && playerId.toString() === this.room.gameState.stateData[action]._id.toString()) {
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

  // async readyAndPlay() {
  //   await super.readyAndPlay();
  //   if (this.model.step === RobotStep.running) {
  //     // 检查吃杠胡
  //   }
  // }
}
