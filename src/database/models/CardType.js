'use strict'
const mongoose = require('mongoose');

const CardTypeSchema = new mongoose.Schema({
  //牌型名称
  cardName: {
    type: String,
    required: true
  },
  //牌型ID
  cardId: {
    type: Number,
    required: true
  },
  //牌型倍数
  multiple: {
    type: Number,
    required: true
  },
  // 是否限制序数牌
  isOrdinal: {
    type: Number,
    required: true
  },
  //序数牌牌型
  ordinalCard: {
    type: Array,
    default: []
  },
  //序数牌牌类型
  ordinalCardType: {
    type: String
  },
  //序数牌数值总和
  ordinalSum: {
    type: Number,
    default: 0
  },
  //其他牌型
  extraCard: {
    type: Array,
    default: []
  },
  // 星座牌个数
  constellateCount: {
    type: Number,
    default: 0
  },
  condition: {
    type: Object,
    default: []
  },
  //是否起手胡
  isTianHu: {
    type: Boolean,
    default: false
  },
  //是否纯星座胡牌
  isConstellate: {
    type: Boolean,
    default: false
  },
  level: {
    type: Number,
    default: 0
  },
  createAt: {type: Date, default: Date.now},
})

const CardType = mongoose.model('CardType', CardTypeSchema);

export default CardType;
