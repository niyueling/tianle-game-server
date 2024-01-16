'use strict'
const mongoose = require('mongoose');

const RoomGoldRecordSchema = new mongoose.Schema({
  roomId: {
    type:  Number,
    required: true
  },
  // 赢家金豆做奖励
  winnerGoldReward: {
    type: Number,
    required: true
  },
  // 中奖人
  winnerId: {
    type: String,
    required: true,
  },
  // 中奖人
  failList: {
    type: Array,
    required: true,
  },
  // 该房间玩到第几局
  juIndex: {
    type: Number,
    required: true,
  },
  cardTypes: {
    type: Object,
    required: true
  },
  createAt: {type: Date, default: Date.now},
})


const RoomGoldRecord = mongoose.model('RoomGoldRecord', RoomGoldRecordSchema);

export default RoomGoldRecord;
