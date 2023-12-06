import * as mongoose from 'mongoose'
import {prop, Typegoose} from 'pshu-typegoose'

// 游戏房间信息
class RoomInfo extends Typegoose {
  // 房间号
  @prop({required: true})
  roomId: number

  // 游戏类型
  @prop({required: true})
  gameType: string

  // 俱乐部 id
  @prop({required: false})
  clubId: mongoose.Types.ObjectId
}

export const RoomInfoModel = new RoomInfo().getModelForClass(RoomInfo)

// 保存房间信息
export async function saveRoomInfo(roomId: number, gameType: string, clubId?: mongoose.Types.ObjectId) {
  let m = await RoomInfoModel.findOne({ roomId });
  if (m) {
    return;
  }
  m = new RoomInfoModel({
    roomId,
    gameType,
    clubId: clubId || null,
  });
  return m.save();
}

// 删除房间信息
export async function delRoomInfo(roomId: number) {
  const m = await RoomInfoModel.findOne({ roomId });
  if (m) {
    return m.remove();
  }
}
