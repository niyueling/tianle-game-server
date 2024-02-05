// 为接口函数添加记录
import * as winston from "winston";

// 查询接口
export class BaseApi {
  // 接口名
  protected readonly apiRoute: string;
  // 玩家 socket
  protected readonly player: any;
  // 注入所有的 service
  protected readonly service: any;
  protected logger: winston.Winston;

  constructor(apiRoute: string, player: any, service?: {}) {
    this.apiRoute = apiRoute;
    this.player = player;
    this.service = service;
    this.logger = winston;
  }

  // 发送消息
  sendMessage(player: any, apiName: string, data: any) {
    player.sendMessage(apiName, data)
  }

  // 查询失败
  replyFail(info: string, data = {}) {
    return this.player.sendMessage(this.apiRoute + 'Reply', {ok: false, info, data})
  }

  // 兼容
  replyFailWithInfo(info: string, data = {}) {
    return this.player.sendMessage(this.apiRoute + 'Reply', {ok: false, info, ...data})
  }

  // 兼容旧接口
  replyFailWithName(name: string, info?: string, data?: any) {
    if (!data) {
      return this.player.sendMessage(name, {ok: false, info: info || ''})
    }
    return this.player.sendMessage(name, { ok: false, info: info || '', ...data})
  }

  // 查询成功
  replySuccess(data = {}) {
    return this.player.sendMessage(this.apiRoute + 'Reply', {ok: true, data})
  }

  // 兼容旧接口
  replySuccessWithInfo(info, data = {}) {
    return this.player.sendMessage(this.apiRoute + 'Reply', {ok: true, info, ...data})
  }

  // 兼容旧接口
  replySuccessWithName(name, info, data?) {
    if (!data) {
      return this.player.sendMessage(name, {ok: true, info: info || ''})
    }
    return this.player.sendMessage(name, { ok: true, info: info || '', ...data})
  }
}
