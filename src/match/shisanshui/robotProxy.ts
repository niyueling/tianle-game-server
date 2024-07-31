import {GameType} from "@fm/common/constants";
import {RobotRmqProxy} from "../base/robotRmqProxy";

// 跑得快机器人
export class RobotSSS extends RobotRmqProxy {
  constructor(model) {
    super(model, GameType.sss);
  }

  // 出牌
  playCard() {
    console.log('play card')
  }
}
