'use strict'
const mongoose = require('mongoose');

const RoomGoldRecordSchema = new mongoose.Schema({
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
  // 输家
  failList: {
    type: Array,
    required: true,
  },
  //输家输豆数量
  failGoldList: {
    type: Array,
    required: true,
  },
  // 输家位置
  failFromList: {
    type: Array,
    required: true,
  },
  multiple: {
    type: Number,
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
  categoryId: {
    type: String,
    required: false,
  },
  isPublic: {
    type: Boolean,
    required: false,
  },
  createAt: {type: Date, default: Date.now},
})


const RoomGoldRecord = mongoose.model('RoomGoldRecord', RoomGoldRecordSchema);

export default RoomGoldRecord;
