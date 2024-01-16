'use strict'
const mongoose = require('mongoose');

const RoomGoldRecordSchema = new mongoose.Schema({
  playerId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  roomId: {
    type: Number,
    required: true
  },
  cardTypes: {
    type: Object,
    required: true
  },
  createAt: {type: Date, default: Date.now},
})


const RoomGoldRecord = mongoose.model('RoomGoldRecord', RoomGoldRecordSchema);

export default RoomGoldRecord;
