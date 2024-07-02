'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const schema = new Schema({
  uid: {type: Number, required: true},
  room: {type: String, required: true},
  juIndex: {type: Number, required: true},
  playerId: {type: String, required: true},
  gameName: {type: String, required: true},
  caregoryName: {type: String, required: true},
  currency: {type: String, required: true, default: "gold"},
  score: {type: Number, default: 0},
  time: {type: Date, default: Date.now},
});

const CombatGain = mongoose.model('CombatGain', schema);

export default CombatGain
