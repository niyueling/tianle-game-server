'use strict'
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  roomId: {
    type:  Number,
    required: true
  },
  redPocket: {
    type: Number,
    required: true
  },
  playerId: {
    type: String,
    required: true,
  },
  multiple: {
    type: Boolean,
    required: true,
    default: false
  },
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
  createAt: {type: Date, default: Date.now},
})


const RoomRedPocketRecord = mongoose.model('RoomRedPocketRecord', schema);

export default RoomRedPocketRecord;
