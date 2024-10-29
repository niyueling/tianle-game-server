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

    if (this.model.step === RobotStep.running) {
      await this.playCard();
    }
  }

  // 发牌完成
  async setCardReady() {
      this.model.step = RobotStep.running;
      await this.save();
  }
}
