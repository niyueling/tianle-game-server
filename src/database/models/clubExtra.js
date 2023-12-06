'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ClubExtraSchema = new Schema({
  clubId: { type: String, required: true, ref: 'club' },
  blacklist: { type: Array, default: [] },
  renameList: { type: Object, default: {} },
  createAt: { type: Date, required: true, default: Date.now },
});

ClubExtraSchema.index({ clubId: -1 });
ClubExtraSchema.index({ createAt: -1 });
const ClubExtra = mongoose.model('ClubExtra', ClubExtraSchema);

export default ClubExtra
