'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  playerId: {
    type: String,
    required: true
  },
  shortId: {
    type: Number,
    required: true
  },
  // 称号ID
  propId: {
    type: Number,
    required: true
  },
  // 有效期
  times: {
    type: Number,
    required: true
  },
  // 是否使用
  isUse: {
    type: Boolean,
    required: true,
    default: false
  },
  // 获得时间
  createAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

schema.index({propId: 1});

const PlayerMedal = mongoose.model('PlayerMedal', schema);

export default PlayerMedal
