import {service} from "../../service/importService";
import {NewRobotManager} from "../base/newRobotManager";
import Enums from "./enums";
import {MJRobotRmqProxy} from "./robotRmqProxy";
import {RobotStep} from "@fm/common/constants";

// 机器人出牌
export class RobotManager extends NewRobotManager {
  // room: any
  disconnectPlayers: { [key: string]: MJRobotRmqProxy }

  // 创建机器人代理
  async createProxy(playerId) {
    const model = await service.playerService.getPlayerPlainModel(playerId);
    if (!model) {
      console.error('no model for', playerId)
    }
    return new MJRobotRmqProxy(model)
  }

  async readyAndPlay() {
    // 检查是否准备好
    let isOk;
    if (this.model.step === RobotStep.start) {
      // 离线用户准备
      const flag = await this.robotPlayerReady();
      isOk = await this.isHumanPlayerReady();
      if (!isOk) {
        console.log(`human player not ready`, this.room._id);
        return;
      }
      if (flag) {
        this.model.step = RobotStep.checkCardReady;
      }
      await this.save();
    }

    if (this.model.step === RobotStep.selectMode) {
      // 选择模式
      isOk = await this.isModeSelect();
      if (isOk) {
        this.model.step = RobotStep.running;
        await this.save();
      } else {
        // 机器人选择模式
        const flag = await this.selectMode();
        isOk = await this.isHumanPlayerSelectMode();
        if (!isOk) {
          console.log(`human player not select mode`, this.room._id);
          return;
        }

        if (flag) {
          this.model.step = RobotStep.running;
          await this.save();
        }
      }
    }

    if (this.model.step === RobotStep.running && this.isPlayed) {
      this.isPlayed = false;
      // 游戏未结束
      await this.playCard();

      this.isPlayed = true;
    }
  }

  // 为离线用户选择模式
  async selectMode() {
    // 在线用户都选好模式了
    for (const proxy of Object.values(this.disconnectPlayers)) {
      if (!proxy.playerState || proxy.playerState.mode !== "unknown") {
        continue;
      }
      let wanCount = 0;
      let tiaoCount = 0;
      let tongCount = 0;
      let mode = "wan";

      for (let i = 1; i <= 9; i++) {
        wanCount += proxy.playerState.cards[i];
      }

      for (let i = 11; i <= 19; i++) {
        tiaoCount += proxy.playerState.cards[i];
      }

      for (let i = 21; i <= 29; i++) {
        tongCount += proxy.playerState.cards[i];
      }

      if (Math.min(wanCount, tiaoCount, tongCount) === tiaoCount) {
        mode = "tiao";
      }

      if (Math.min(wanCount, tiaoCount, tongCount) === tongCount) {
        mode = "tong";
      }

      await this.room.gameState.onSelectMode(proxy.playerState, mode);
    }
    return true;
  }

  isHumanPlayerSelectMode() {
    if (!this.room.gameState) {
      return false;
    }
    let proxy;
    let playerState;
    for (let i = 0; i < this.room.gameState.players.length; i++) {
      playerState = this.room.gameState.players[i];
      proxy = this.room.players[i];
      if (playerState && !this.isHumanPlayerOffline(proxy)) {
        // 在线用户
        if (playerState.mode === 'unknown') {
          return false;
        }
      }
    }
    return true;
  }

  isModeSelect() {
    if (!this.room.gameState) {
      return false;
    }
    for (const proxy of this.room.gameState.players) {
      if (proxy.mode === 'unknown' || proxy.playerState.cards.length === 0) {
        // 还有人没选模式 或者还没发牌
        return false;
      }
    }
    return true;
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
      if (this.isPlayerDa(proxy.model._id.toString()) || this.isPlayerGuo(proxy.model._id.toString())) {
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
    if (!this.room.gameState && !this.isPlayed) {
      return;
    }

    const keys = Object.keys(this.disconnectPlayers);
    let proxy;
    let playerId;
    for (const key of keys) {
      proxy = this.disconnectPlayers[key];
      if (proxy.playerState.onDeposit) {
        continue;
      }

      proxy.playerState.onDeposit = true;

      playerId = proxy.model._id.toString();
      const AnGangIndex = this.isPlayerAnGang(proxy.playerState);
      const buGangIndex = this.isPlayerBuGang(proxy.playerState);
      const ziMoHu = proxy.playerState.checkZiMo();
      const jiePaoHu = proxy.playerState.checkHuState(this.room.gameState.stateData.card);

      // if (!this.room.gameState.waitRecharge) {
        if (this.isPlayerGang(playerId) && this.room.gameState.state === 2) {
          await proxy.gang(this.isPlayerGang(playerId))
        } else if (this.isPlayerChoice(playerId, jiePaoHu) && this.room.gameState.state === 2) {
          await proxy.choice(this.isPlayerChoice(playerId, jiePaoHu))
        } else if (this.isPlayerDa(playerId)) {
          if (this.waitInterval[key] >= this.getWaitSecond()) {
            this.waitInterval[key] = 0;

            if (ziMoHu.hu && !this.room.gameState.isAllHu) {
              await proxy.choice(Enums.hu)
            } else if (AnGangIndex && !this.room.gameState.isAllHu) {
              await proxy.gang(Enums.anGang, AnGangIndex)
            } else if (buGangIndex && !this.room.gameState.isAllHu) {
              await proxy.gang(Enums.buGang, buGangIndex)
            } else {
              await proxy.playCard();
            }
          }

          break;
        } else {
          // 过
          if (this.isPlayerGuo(playerId)) {
            await proxy.guo();
          }
        }
      // } else {
      //   console.warn("await player invive game-state %s current-index %s isBroke %s gold %s", this.room.gameState.state, this.room.gameState.atIndex(proxy), proxy.isBroke, model.gold)
      // }
    }
  }

  // 打
  isPlayerDa(playerId) {
    return this.room.gameState.stateData[Enums.da] &&
      playerId === this.room.gameState.stateData[Enums.da]._id.toString()
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
    const actionList = [Enums.chi];
    for (const action of actionList) {
      if (this.room.gameState.stateData[action] && playerId === this.room.gameState.stateData[action]._id.toString()) {
        return true;
      }
    }
    return false;
  }

  isPlayerGang(playerId) {
    const actionList = [Enums.gang, Enums.mingGang];
    for (const action of actionList) {
      if ([Enums.gang, Enums.mingGang].includes(action) && this.room.gameState.stateData[action]) {
        if (playerId === this.room.gameState.stateData[action]._id.toString()) {
          return action;
        }
      }
    }

    return false;
  }

  // 是否碰胡
  isPlayerChoice(playerId, jiePaoHu) {
    const actionList = [Enums.hu, Enums.peng];
    for (const action of actionList) {
      if ([Enums.peng].includes(action)
        && this.room.gameState.stateData[action] && playerId === this.room.gameState.stateData[action]._id.toString()) {
        return action;
      }

      if (action === Enums.hu && Array.isArray(this.room.gameState.stateData[action]) &&
        this.room.gameState.stateData[action].length > 0 && jiePaoHu.hu) {
        if (playerId === (Array.isArray(this.room.gameState.stateData[action]) ?
          this.room.gameState.stateData[action][0]._id.toString()
          : this.room.gameState.stateData[action]._id.toString())) return action;
      }
    }
    return false;
  }

  // 发牌完成
  async setCardReady() {
    this.model.step = RobotStep.selectMode;
    await this.save();
  }
}
