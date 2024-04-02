'use strict';

const mongoose = require('mongoose');

// 金豆房配置表
const schema = new mongoose.Schema({
    // title
    title: {
        type: String,
        required: true,
    },
    // 游戏
    game: {
        type: String,
        required: true,
    },
    level: {
        type: Number,
        required: true,
    },
    // 房间类型， gold = 金豆
    category: {
        type: String,
        required: true,
    },
    // 底注
    Ante: {
        type: Number,
        required: true,
    },
    // 底分
    base: {
        type: Number,
        required: true,
    },
    // 单次最多赢豆
    maxGold: {
      type: Number,
      required: true,
    },
    // 最高倍率
    maxMultiple: {
        type: Number,
        required: true,
    },
    // 最少金豆数
    minAmount: {
        type: Number,
        required: true,
    },
    // 最大金豆数
    maxAmount: {
        type: Number,
        required: true,
    },
    // 上线人数
    playerCount: {
        type: Number,
        required: true,
    },
    // 房费
    roomRate: {
        type: Number,
        required: true,
    },
    // 是否开启
    isOpen: {
        type: Boolean,
        required: true,
    },
    // 创建时间
    createAt: {
        type: Date,
        required: true,
        default: Date.now,
    },
})

const GameCategory = mongoose.model('GameCategory', schema);
export default GameCategory
