'use strict'
const mongoose = require('mongoose');

const RoomGangRecordSchema = new mongoose.Schema({
  roomId: {
    type:  Number,
    required: true
  },
  // 赢家金豆
  winnerGoldReward: {
    type: Number,
    required: true
  },
  // 赢家
  winnerId: {
    type: String,
    required: true,
  },
  // 赢家位置
  winnerFrom: {
    type: Number,
    required: true,
  },
  failList: {
    type: Array,
    required: true,
  },
  multiple: {
    type: Number,
    required: true,
  },
  categoryId: {
    type: String,
    required: true,
  },
  createAt: {type: Date, default: Date.now},
})


const RoomGangRecord = mongoose.model('RoomGangRecord', RoomGangRecordSchema);

export default RoomGangRecord;
