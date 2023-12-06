'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = mongoose.Schema.Types.ObjectId

const ClubGoldRecordSchema = new Schema({
  club: {type: ObjectId, required: true, ref: 'Club'},
  member: {type: String, required: true, ref: 'Player'},
  from: {type: String, ref: 'Player', default: "pay"},
  goldChange: {type: Number, required: true},
  allClubGold: {type: Number, default: 0},
  createAt: {type: Date, required: true, default: Date.now},
  info: {type: String},
});

ClubGoldRecordSchema.index({createAt: -1});
ClubGoldRecordSchema.index({member: 1});
ClubGoldRecordSchema.index({club: 1, member: 1});

const ClubGoldRecord = mongoose.model('ClubGoldRecord', ClubGoldRecordSchema);

export default ClubGoldRecord
