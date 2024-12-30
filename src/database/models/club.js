'use strict';

const mongoose = require('mongoose');
const ClubSchema = new mongoose.Schema({
  owner: {type: String, required: true, ref: 'Player'},
  shortId: {type: Number, required: true},
  name: {type: String, required: true},
  createAt: {type: Date, required: true, default: Date.now},
  freeRenameCount: {type: Number, default: 0},
  state:{type: String, default: 'on'},
  // 游戏列表
  gameList: {
    type: Object,
    required: true,
    default: {},
  },
});

ClubSchema.index({joinAt: -1});
ClubSchema.index({member: 1});
ClubSchema.index({club: 1, member: 1});

const Club = mongoose.model('Club', ClubSchema);
export default Club

