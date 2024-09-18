// const cardNameMap = new Map();
const enums = {
  getType(card) {
    return Math.floor(card / 10);
  },
  is258(card) {
    const mod = card % 10;
    return mod === 2 || mod === 5 || mod === 8;
  },

  sameType: (card1, card2) => (Math.floor(card1 / 10) === Math.floor(card2 / 10)),

  goldCurrency: "gold",
  tlGoldCurrency: "tlGold",
  slotNoCard: 0,
  noviceProtection: "新手场",
  AdvancedTitle: "进阶场",

  wanzi1: 1,
  wanzi2: 2,
  wanzi3: 3,
  wanzi4: 4,
  wanzi5: 5,
  wanzi6: 6,
  wanzi7: 7,
  wanzi8: 8,
  wanzi9: 9,

  shuzi1: 11,
  shuzi2: 12,
  shuzi3: 13,
  shuzi4: 14,
  shuzi5: 15,
  shuzi6: 16,
  shuzi7: 17,
  shuzi8: 18,
  shuzi9: 19,

  tongzi1: 21,
  tongzi2: 22,
  tongzi3: 23,
  tongzi4: 24,
  tongzi5: 25,
  tongzi6: 26,
  tongzi7: 27,
  tongzi8: 28,
  tongzi9: 29,

  // 风牌
  dong: 31,
  nan: 32,
  xi: 33,
  bei: 34,
  zhong: 35,
  fa: 36,
  bai: 37,
  // 最大牌
  maxValidCard: 38,
  // 花牌
  // 春夏秋冬
  spring: 53,
  summer: 54,
  autumn: 55,
  winter: 56,
  // 梅兰竹菊
  mei: 57,
  lan: 58,
  zhu: 59,
  ju: 60,
  // 最后一张牌
  finalCard: 61,

  chi: 'chi',
  peng: 'peng',
  gang: 'gang',
  bu: 'bu',
  hu: 'hu',
  zimo: 'zimo',
  da: 'da',
  pengGang: 'pengGang',
  qiangJin: 'qiangJin',

  guo: 'guo',
  gangByOtherDa: 'gangByOtherDa',
  gangBySelf: 'gangBySelf',
  buBySelf: 'buBySelf',
  buByOtherDa: 'buByOtherDa',
  mingGang: 'mingGang',
  anGang: 'anGang',
  jiePao: 'jiePao',
  dianPao: 'dianPao',
  // 玩家最后打的牌
  lastPlayerDaCard: 'lastPlayerDaCard',
  // 玩家最后摸的牌
  lastPlayerTakeCard: 'lastPlayerTakeCard',
  // 游金次数
  youJinTimes: 'youJinTimes',
  // 抢金胡
  qiangJinHu: 'qiangJinHu',
  youJin: 'youJin',
  shuangYou: 'shuangYou',
  sanYou: 'sanYou',

  // 胡牌类型
  hunhun: 'hunhun',
  dianGang: 'dianGang',
  taJiaZiMo: 'taJiaZiMo',
  taJiaAnGang: 'taJiaAnGang',
  taJiaMingGangSelf: 'taJiaMingGangSelf',
  pengPengHu: 'pengPengHu',
  chengBao: 'chengBao',
  qiangGang: 'qiangGang',
  // 补杠
  buGang: 'buGang',
  // 清一色
  qingYiSe: 'qingYiSe',
  // 天胡
  tianHu: 'tianHu',
  // 地胡
  diHu: 'diHu',
  // 起手3金
  qiShouSanCai: 'qiShouSanCai',
  // 3金
  sanCaiShen: 'sanCaiShen',
  // 3金倒
  sanJinDao: 'sanJinDao',
  // 平胡
  pingHu: 'pingHu',
  // 清一色，一条龙
  yiTiaoLong: 'yiTiaoLong',
  // 局数1刻
  yiKe: '1ke',
  // 局数2圈
  liangQuan: '2quan',
  // 局数4圈
  siQuan: '4quan',
};

enums.sameType = (card1, card2) =>
  (Math.floor(card1 / 10) === Math.floor(card2 / 10));
export default enums;
