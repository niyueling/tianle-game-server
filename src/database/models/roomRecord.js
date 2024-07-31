'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RoomRecordSchema = new Schema({
    room: {type: String, required: true},
    players: {type: [String], required: true, ref: 'Player'},
    scores: {type: [], required: true},
    createAt: {type: Date, required: true, default: Date.now},
    roomNum: {type: Number, required: true},
    creatorId: {type: Number },
    rule: {type: Object, required: true},
    category: {type: String, required: true, default: 'shisanshui'},
    roomState: {type: String, required: true, default: 'normal'},
    // 该房间玩到第几局
    juIndex: {type: Number, required: false,},
    // 本场大赢家
    bigWinner: {type: [], required: false},
});

RoomRecordSchema.index({players: 1});
RoomRecordSchema.index({room: 1});
RoomRecordSchema.index({createAt: -1});
RoomRecordSchema.index({club: 1, createAt: -1});

const RoomRecord = mongoose.model('RoomRecord', RoomRecordSchema);
export default RoomRecord;
