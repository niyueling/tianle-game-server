'use strict';
const mongoose = require('mongoose');

const RobotMangerSchema = new mongoose.Schema({
  roomId: {
    type: Number,
    required: true
  },
  depositCount: {
    type: Number,
    required: true
  },
  // 玩家托管数, 子文档使用 markModified 保存
  depositPlayer: {
    type: Object,
    required: true,
    default: {},
  },
  // 累计掉线时长
  offlineTimes: {
    type: Object,
    required: true,
    default: {},
  },
  // 公共房机器人
  publicRoomRobot: {
    type: Array,
    required: true,
    default: [],
  },
  step: {
    type: Number,
    required: true
  },
});
RobotMangerSchema.index({roomId: 1});
const RobotMangerModel = mongoose.model('RobotManager', RobotMangerSchema);
module.exports = {
  RobotMangerModel,
}
