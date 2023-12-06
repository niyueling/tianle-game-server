'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ClubRequestSchema = new Schema({
  playerId: {type: String, required: true, ref: 'Player'},
  clubShortId: {type: Number, required: true},
  playerName: {type: String, required: true},
  headImage: {type: String, required: true},
  playerShortId: {type: Number, required: true},
  createAt: {type: Date, required: true, default: Date.now},
});

ClubRequestSchema.index({createAt: -1});
ClubRequestSchema.index({clubShortId: 1});

const ClubRequest = mongoose.model('ClubRequest', ClubRequestSchema);

export default ClubRequest
