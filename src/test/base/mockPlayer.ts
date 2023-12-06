import * as EventEmitter from 'events';
import * as mongoose from 'mongoose'
import * as config from '../../config'
import {initClubShortId, initPlayerInviteCode, initPlayerShortId} from "../../database/init";
import Player from "../../database/models/player";
import {service} from "../../service/importService";
// 初始化用户 id, club id
mongoose.connect(config.database.url).then(() => {
  initPlayerShortId();
  initClubShortId();
  initPlayerInviteCode();
})

// 所有接口类
const apiClass = {
}

export class MockPlayer extends EventEmitter {
  model: any;
  constructor(model) {
    super();
    this.model = model;
  }
  get _id() { return this.model._id; }
  get name() { return this.model.name; }
  sendMessage(message) {
    console.info('receive', message)
  }
  getIpAddress() { return 'localhost'; }
  isRobot() {
    return true;
  }
}

export async function mustGetMockPlayerSocket(name?: string): Promise<MockPlayer> {
  if (!name) {
    // 每次生成随机名
    name = Date.now().toString();
  }
  const model = await service.playerService.findOrCreatePlayerByName(name);
  return new MockPlayer(model);
}

// 获取接口类
export function getApiClass(apiClassName, apiName, mockPlayer) {
  if (apiClass[apiClassName]) {
    return new apiClass[apiClassName](apiName, mockPlayer, service);
  }
  throw new Error('invalid apiClassName' + apiClassName);
}

// 删除 robot 开头的玩家
export async function deletePlayerStartWithRobot() {
  // 删除所有机器人
  await Player.remove({
    name: /^robot.*/i,
  });
}

// 初始化
export function init() {
  return;
}
