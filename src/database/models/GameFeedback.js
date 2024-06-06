'use strict'
import * as mongoose from 'mongoose'

const gameFeedbackSchema = new mongoose.Schema({
  playerId: {type: String, required: true},
  gameReason: {type: Array, required: true},// 玩法原因： 1牌型有误，2胡牌条件有误，3算分有误，4开局勾选有误
  otherReason: {type: Array, required: true},// 其他原因： 1. 系统出错，2. 选错玩法， 3. 临时有事， 4. 有人长时间不出牌
  juShu: {type: Number, required: true},// 打到第几小局
  roomId: {type: Number, required: true},// 房间号
  gameType: {type: String, required: true},// 游戏类型
  expectateGame: {type: String},// 期待玩法
  wechatId: {type: String}, // 微信
  createAt: {type: Date, default: Date.now}
})

gameFeedbackSchema.index({gameType: 1});
gameFeedbackSchema.index({roomId: 1});
gameFeedbackSchema.index({playerId: 1});

const GameFeedback = mongoose.model('GameFeedback', gameFeedbackSchema);
export default GameFeedback

