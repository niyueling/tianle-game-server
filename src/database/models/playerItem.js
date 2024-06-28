'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const schema = new Schema({
  playerId: {
    type: String,
    required: true
  },
  shortId: {
    type: Number,
    required: true
  },
  // 道具类型
  itemType: {
    type: Number,
    required: true,
  },
  // 道具数量
  itemCount: {
    type: Number,
    required: true,
  },
  // 级别
  level: {
    type: Number,
    required: true,
    default: 1
  },
});


const PlayerItem = mongoose.model('PlayerItem', schema);

export default PlayerItem
