'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RoomScoreRecordSchema = new Schema({
  room: {type: String, required: true},
  roomNum: {type: Number, required: true},
  creatorId: {type: Number},
  category: {type: String, required: true, default: 'majiang'},
  players: {type: [String], required: true, ref: 'Player'},
  scores: {type: [], required: true},
  createAt: {type: Date, required: true, default: Date.now},
  rule: {type: Object, required: true},
  roomState: {type: String, required: true, default: 'normal'},
});

RoomScoreRecordSchema.index({players: 1});
RoomScoreRecordSchema.index({room: 1});
RoomScoreRecordSchema.index({createAt: -1});

const RoomScoreRecord = mongoose.model('RoomScoreRecord', RoomScoreRecordSchema);
export default RoomScoreRecord;
