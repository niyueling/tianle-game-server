'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  playerId: {
    type: String,
    required: true
  },
  taskType: {
    type: Number,
    required: false,
  },
  typeId: {
    type: Number,
    required: false,
  },
  count: {
    type: Number,
    required: true,
    default: 0
  },
  // 创建时间
  createAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

const PlayerCardTypeRecord = mongoose.model('PlayerCardTypeRecord', schema);
export default PlayerCardTypeRecord
