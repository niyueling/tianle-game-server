// 机器人出牌
import {RobotStep} from "@fm/common/constants";
import {service} from "../../service/importService";
import {NewRobotManager} from "../base/newRobotManager";
import {RobotGuanDan} from "./robotProxy";

export class RobotManager extends NewRobotManager {
  disconnectPlayers: { [key: string]: RobotGuanDan }

  async createProxy(playerId) {
    const model = await service.playerService.getPlayerPlainModel(playerId);
    return new RobotGuanDan(model);
  }

  async readyAndPlay() {
    // 检查是否准备好
    let isOk;
    if (this.model.step === RobotStep.start) {
      // 离线用户准备
      const flag = await this.robotPlayerReady();
      isOk = await this.isHumanPlayerReady();
      if (!isOk) {
        // console.log(`human player not ready`, this.room._id);
        return;
      }
      if ((flag && this.room.isPublic) || !this.room.isPublic) {
        this.model.step = RobotStep.checkCardReady;
        await this.save();
      }
    }

    if (this.model.step === RobotStep.selectMode) {
      // 选择模式
      isOk = await this.isModeSelect();
      if (isOk) {
        this.model.step = RobotStep.running;
        await this.save();
      } else {
        isOk = await this.isHumanPlayerSelectMode();
        if (isOk) {
          // 离线用户选择
          console.log('select offline player mode')
          await this.selectMode();
          this.model.step = RobotStep.running;
          await this.save();
        }
      }
    }

    if (this.model.step === RobotStep.running) {
      await this.playCard();
    }
  }

  // 为离线用户选择模式
  async selectMode() {
    // 在线用户都选好模式了
    for (const proxy of Object.values(this.disconnectPlayers)) {
      if (!proxy.playerState) {
        console.error('invalid player state', JSON.stringify(this.disconnectPlayers))
        continue;
      }

      await this.room.gameState.onSelectMode(proxy.playerState, 2);
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
        if (!playerState.isChooseMode) {
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
    if (this.room.gameState.nextAction) {
      // 模式选好了
      return true;
    }

    for (const proxy of this.room.gameState.players) {
      if (!proxy.isChooseMode) {
        // 还有人没选模式
        return false;
      }
    }
    return true;
  }

  // 发牌完成
  async setCardReady() {
      this.model.step = RobotStep.running;
      await this.save();
  }
}
