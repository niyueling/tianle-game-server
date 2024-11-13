'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const roomTimeRecordSchema = new Schema({
    roomId: {type: Number, required: true},
    createAt: {type: Date, required: true, default: Date.now},
    rule: {type: Object, required: true},
    category: {type: String, required: true},
    juIndex: {type: Number, required: false},
});

roomTimeRecordSchema.index({roomId: 1});
roomTimeRecordSchema.index({createAt: -1});

const roomTimeRecord = mongoose.model('roomTimeRecord', roomTimeRecordSchema);
export default roomTimeRecord;

