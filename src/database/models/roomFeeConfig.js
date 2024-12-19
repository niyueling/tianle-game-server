'use strict';

const mongoose = require('mongoose');

// 金豆房配置表
const schema = new mongoose.Schema({
  // 游戏
  game: {
    type: String,
    required: true,
  },
  juShu: {
    type: Number,
    required: true,
  },
  diamond: {
    type: Number,
    required: true,
  },
  juType: {
    type: Number
  },
  clubMode: {
    type: Boolean,
    required: true,
  },
  personMode: {
    type: Boolean,
    required: true,
  },
})

const RoomFeeConfig = mongoose.model('RoomFeeConfig', schema);
export default RoomFeeConfig
