'use strict';

const mongoose = require('mongoose');
const ClubExtraSchema = new mongoose.Schema({
  clubId: { type: String, required: true, ref: 'club' },
  blacklist: { type: Array, default: [] },
  partnerBlacklist: { type: Array, default: [] },
  renameList: { type: Object, default: {} },
  partnerRenameList: { type: Object, default: {} },
  createAt: { type: Date, required: true, default: Date.now },
});

ClubExtraSchema.index({ clubId: -1 });
ClubExtraSchema.index({ createAt: -1 });

const ClubExtra = mongoose.model('ClubExtra', ClubExtraSchema);
export default ClubExtra
