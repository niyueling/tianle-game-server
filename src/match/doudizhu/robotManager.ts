// 机器人出牌
import {service} from "../../service/importService";
import {NewRobotManager} from "../base/newRobotManager";
import {RobotDDZ} from "./robotProxy";

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
}
