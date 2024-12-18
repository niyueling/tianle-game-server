import * as mongoose from 'mongoose'
import {prop, Typegoose} from 'pshu-typegoose'

export enum ClubOp {
  // 改名
  rename= 1,
  // 转移
  transfer,
}

// 俱乐部操作日志
class ClubLog extends Typegoose {
  // 俱乐部 id
  @prop({required: true})
  clubId: mongoose.Types.ObjectId

  // 操作人
  @prop({required: true})
  operator: mongoose.Types.ObjectId

  // 操作类型
  @prop({required: true})
  op: ClubOp

  // 详情
  @prop({required: false})
  detail: any

  @prop({required: true, default: Date.now})
  createAt: Date
}

export const ClubLogModel = new ClubLog().getModelForClass(ClubLog)

/**
 * 改名操作
 * @param clubId 俱乐部 objectId
 * @param oldName 旧名字
 * @param newName 新名字
 * @param operatorId 操作人 objectId
 */
export async function logRename(clubId: string, oldName: string, newName: string, operatorId: string) {
  const m = new ClubLogModel({clubId, op: ClubOp.rename, operator: operatorId, detail: { oldName, newName } })
  return m.save();
}

/**
 * 转移战队
 * @param clubId 俱乐部 objectId
 * @param from 转出玩家 objectId
 * @param to 转入玩家 objectId
 */
export async function logTransfer(clubId: string, from: string, to: string) {
  const m = new ClubLogModel({clubId, op: ClubOp.transfer, operator: from, detail: { from, to } })
  return m.save();
}
