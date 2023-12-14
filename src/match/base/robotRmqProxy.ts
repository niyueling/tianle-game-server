import {PlayerRmqProxy} from "../PlayerRmqProxy";

// 机器人
export class RobotRmqProxy extends PlayerRmqProxy {
  isPublicRobot: boolean
  constructor(model, gameName) {
    super(model, null, gameName);
    this.model = model
    this.ip = model.ip;
    this.channel = null
    this.isPublicRobot = false;
  }

  // 通知 websocket server.js
  sendMessage(name: string, message: any) {
    if (message.info) {
      // 有状况的消息
      console.log('on robot message', name, 'info', message.info, 'roomId', this.room._id, 'message', message, 'shortId', this.model.shortId);
    }
  }

  isRobot(): boolean {
    return true
  }

  get playerState() {
    return this.room && this.room.gameState && this.room.gameState.players[this.seatIndex] || null;
  }

  // 出牌
  playCard() {
    throw new Error('play card not implemented');
  }
}
