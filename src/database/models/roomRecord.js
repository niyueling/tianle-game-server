'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = mongoose.Schema.ObjectId

const RoomRecordSchema = new Schema({
  room: {type: String, required: true},
  players: {type: [String], required: true, ref: 'Player'},
  scores: {type: [], required: true},
  createAt: {type: Date, required: true, default: Date.now},
  roomNum: {type: Number, required: true},
  creatorId: {type: Number},
  rule: {type: Object, required: true},
  category: {type: String, required: true, default: 'zhadan'},
  club: {type: ObjectId, ref: 'Club'},
  checked: {type: Boolean, required: false, 'default': false},
  seen: {type: Boolean, required: false, 'default': false},
  roomState: {type: String, required: true, default: 'normal'},
  // 该房间玩到第几局
  juIndex: {type: Number, required: false,},
  // 本场大赢家
  bigWinner: {type: [], required: false},
  // 房卡消费记录
  gemCount: {
    type: Object,
    required: false,
  },
  // 记录是否已删除
  isPlayerDel: {
    type: Array,
    required: false,
    default: [],
  }
});

RoomRecordSchema.index({players: 1});
RoomRecordSchema.index({room: 1});
RoomRecordSchema.index({createAt: -1});
RoomRecordSchema.index({club: 1, createAt: -1});

const RoomRecord = mongoose.model('RoomRecord', RoomRecordSchema);
export default RoomRecord;
