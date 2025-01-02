'use strict';

const mongoose = require('mongoose');

const ClubMergeSchema = new mongoose.Schema({
  fromClubId: {type: Number, required: true},
  toClubId: {type: Number, required: true},
  fromClubName: {type: String, required: true},
  toClubName: {type: String, required: true},
  type: {type: Number, default: 2},
  status: {type: Number, default: 0},
  createAt: {type: Date, required: true, default: Date.now},
});

ClubMergeSchema.index({createAt: -1});
ClubMergeSchema.index({fromClubId: 1});
ClubMergeSchema.index({toClubId: 1});

const ClubMerge = mongoose.model('ClubMerge', ClubMergeSchema);
export default ClubMerge
