'use strict';

import Club from "./club";

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = mongoose.Schema.Types.ObjectId

const ClubRoomRecordSchema = new Schema({
  club: {type: ObjectId, ref: 'Club'},
  received: {type: Boolean, required: true, default: false},
  receivedAt: {type: Date, 'default': Date.now},
  roomInfo: {type: Object, required: true, default: {}},
  gameType: {type: String, required: true, default: 'zhadan'},
  getGem:{type: Number, default: 0},
  createAt: {type: Date, 'default': Date.now},
});

ClubRoomRecordSchema.index({createAt: -1});
ClubRoomRecordSchema.index({club: 1, createAt: -1});

const ClubRoomRecord = mongoose.model('ClubRoomRecord', ClubRoomRecordSchema);

export default ClubRoomRecord;
