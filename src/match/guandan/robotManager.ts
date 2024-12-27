// 机器人出牌
import {RobotStep} from "@fm/common/constants";
import {service} from "../../service/importService";
import {NewRobotManager} from "../base/newRobotManager";
import {RobotGuanDan} from "./robotProxy";
import {CardType} from "./card";
import {arraySubtract} from "./patterns/base";

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
      isOk = this.isModeSelect();
      if (!isOk) {
        isOk = this.isHumanPlayerSelectMode();
        if (isOk) {
          // 离线用户选择
          console.log('select offline player mode ', this.room._id);
          await this.selectMode();
        }
      }
    }

    if (this.model.step === RobotStep.returnTribute) {
      // 进还贡
      isOk = this.isTributeSelect();
      if (isOk) {
        this.model.step = RobotStep.running;
        await this.save();
      } else {
        const payAndReturnFunc = async () => {
          await this.payAndReturnTribute();
        }

        setTimeout(payAndReturnFunc, 1500);
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
      if (!proxy.playerState || proxy.playerState.isChooseMode) {
        console.error('invalid player state', JSON.stringify(this.disconnectPlayers))
        continue;
      }

      const random = Math.random();
      if (random < 0.8) {
        await this.room.gameState.onSelectMode(proxy.playerState, Math.random() < 0.8 ? 2 : 1);
        return true;
      }
    }

    return true;
  }

  // 机器人选择进还贡
  async payAndReturnTribute() {
    for (const proxy of Object.values(this.disconnectPlayers)) {
      if (!proxy.playerState) {
        continue;
      }

      if ((proxy.playerState.payTributeState && !proxy.playerState.payTributeCard) || (proxy.playerState.returnTributeState && !proxy.playerState.returnTributeCard)) {
        const random = Math.random();
        if (random < 0.5) {
          const cardSlices = proxy.playerState.cards.slice();
          const sortCard = cardSlices.sort((grp1, grp2) => {
            return grp2.point - grp1.point
          });
          const caiShen = cardSlices.filter(c => c.type === CardType.Heart && c.value === this.room.currentLevelCard);
          const subtractCards = arraySubtract(sortCard.slice(), caiShen);

          // 进贡
          if (proxy.playerState.payTributeState) {
            return await this.room.gameState.onPayTribute(proxy.playerState, {card: subtractCards[0]});
          }

          // 还贡
          if (proxy.playerState.returnTributeState) {
            return await this.room.gameState.onReturnTribute(proxy.playerState, {card: subtractCards[subtractCards.length - 1]});
          }

          return true;
        }
      }
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
        // if (!playerState.isChooseMode) {
        //   return false;
        // }
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

  isTributeSelect() {
    if (!this.room.gameState) {
      return false;
    }
    if (this.model.step === RobotStep.running) {
      return true;
    }

    for (const proxy of this.room.gameState.players) {
      if ((proxy.payTributeState && !proxy.payTributeCard) || (proxy.returnTributeState && !proxy.returnTributeCard)) {
        return false;
      }
    }
    return true;
  }

  // 发牌完成
  async setCardReady(allowDouble) {
    this.model.step = RobotStep.running;

    if (allowDouble) {
      this.model.step = RobotStep.selectMode;
    }

    await this.save();
  }
}
