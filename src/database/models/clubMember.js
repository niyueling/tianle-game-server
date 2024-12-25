'use strict';

const mongoose = require('mongoose');
const ObjectId = mongoose.Schema.ObjectId

const ClubMemberSchema = new mongoose.Schema({
  club: {type: ObjectId, required: true, ref: 'Club'},
  member: {type: String, required: true, ref: 'Player'},
  joinAt: {type: Date, required: true, default: Date.now},
  role: {type: String},
  partner: {type: Boolean, default: false},
  clubGold: {type: Number, default: 0},
  leader: {type: Number},
});

ClubMemberSchema.index({joinAt: -1});
ClubMemberSchema.index({member: 1});
ClubMemberSchema.index({club: 1, member: 1});

const ClubMember = mongoose.model('ClubMember', ClubMemberSchema);
export default ClubMember
