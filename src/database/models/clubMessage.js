'use strict';

const mongoose = require('mongoose');

const ClubMessageSchema = new mongoose.Schema({
  playerId: {type: String, required: true, ref: 'Player'},
  clubShortId: {type: Number, required: true},
  playerName: {type: String, required: true},
  avatar: {type: String, required: true},
  message: {type: String, required: true},
  playerShortId: {type: Number, required: true},
  type: {type: Number, default: 4},
  state: {type: Number, default: 1},
  createAt: {type: Date, required: true, default: Date.now},
});

ClubMessageSchema.index({createAt: -1});
ClubMessageSchema.index({clubShortId: 1});

const ClubMessage = mongoose.model('ClubMessage', ClubMessageSchema);
export default ClubMessage
