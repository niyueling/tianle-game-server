/**
 * Created by Color on 2016/7/7.
 */

const cardNameMap = new Map();
const enums = {
  getType(card) {
    return Math.floor(card / 10);
  },
  is258(card) {
    const mod = card % 10;
    return mod === 2 || mod === 5 || mod === 8;
  },

  sameType: (card1, card2) => (Math.floor(card1 / 10) === Math.floor(card2 / 10)),

  ruleType: {
    zhuanZhuanMaJiang: 1,
    sanRenZhuanZhuan: 2,
    erRenZhuanZhuan: 3,
    changShaMaJiang: 4,
    lobby3Player: 5,
    lobby2Player: 6,
    lobby4Player: 7
  },

  slotNoCard: 0,

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

  constellation1: 41,// 白羊座
  constellation2: 42,// 金牛座
  constellation3: 43,// 双子座
  constellation4: 44,// 巨蟹座
  constellation5: 45,// 狮子座
  constellation6: 46,// 处女座
  constellation7: 47,// 天秤座
  constellation8: 48,// 天蝎座
  constellation9: 49,// 射手座
  constellation10: 50,// 摩羯座
  constellation11: 51,// 水瓶座
  constellation12: 52,// 双鱼座
  constellationColors: [1, 1, 2, 1, 3, 2, 3, 1, 2, 3, 2, 3],

  dong: 31,
  nan: 32,
  xi: 33,
  bei: 34,
  zhong: 35,
  fa: 36,
  bai: 37,
  zeus:38, // 宙斯(癞子牌)
  poseidon: 39,// 波塞冬(癞子牌)
  athena: 40,// 雅典娜(癞子牌)

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

  chi: 'chi',
  peng: 'peng',
  gang: 'gang',
  bu: 'bu',
  hu: 'hu',
  zimo: 'zimo',
  da: 'da',
  pengGang: 'pengGang',
  broke: 'broke',
  openCard: 'openCard',
  huTakeCard: 'huTakeCard',
  startDeposit: 'startDeposit',
  competiteHu: 'competiteHu',
  topHu: 'topHu',
  topDa: 'topDa',
  topGang: 'topGang',
  restoreGame: 'restoreGame',

  guo: 'guo',
  gangByOtherDa: 'gangByOtherDa',
  gangBySelf: 'gangBySelf',
  buBySelf: 'buBySelf',
  buByOtherDa: 'buByOtherDa',
  mingGang: 'mingGang',
  anGang: 'anGang',
  jiePao: 'jiePao',
  dianPao: 'dianPao',
  multipleHu: 'multipleHu',
  huCards: 'huCards',

  hunhun: 'hunhun',
  dianGang: 'dianGang',
  taJiaZiMo: 'taJiaZiMo',
  taJiaAnGang: 'taJiaAnGang',
  taJiaMingGangSelf: 'taJiaMingGangSelf',
  pengPengHu: 'pengPengHu',
  chengBao: 'chengBao',
  qiangGang: 'qiangGang',
  buGang: 'buGang',

  cardNameMap
};

cardNameMap.set(enums.wanzi1, '1wan');
cardNameMap.set(enums.wanzi2, '2wan');
cardNameMap.set(enums.wanzi3, '3wan');
cardNameMap.set(enums.wanzi4, '4wan');
cardNameMap.set(enums.wanzi5, '5wan');
cardNameMap.set(enums.wanzi6, '6wan');
cardNameMap.set(enums.wanzi7, '7wan');
cardNameMap.set(enums.wanzi8, '8wan');
cardNameMap.set(enums.wanzi9, '9wan');

cardNameMap.set(enums.tongzi1, '1tong');
cardNameMap.set(enums.tongzi2, '2tong');
cardNameMap.set(enums.tongzi3, '3tong');
cardNameMap.set(enums.tongzi4, '4tong');
cardNameMap.set(enums.tongzi5, '5tong');
cardNameMap.set(enums.tongzi6, '6tong');
cardNameMap.set(enums.tongzi7, '7tong');
cardNameMap.set(enums.tongzi8, '8tong');
cardNameMap.set(enums.tongzi9, '9tong');

cardNameMap.set(enums.shuzi1, '1shu');
cardNameMap.set(enums.shuzi2, '2shu');
cardNameMap.set(enums.shuzi3, '3shu');
cardNameMap.set(enums.shuzi4, '4shu');
cardNameMap.set(enums.shuzi5, '5shu');
cardNameMap.set(enums.shuzi6, '6shu');
cardNameMap.set(enums.shuzi7, '7shu');
cardNameMap.set(enums.shuzi8, '8shu');
cardNameMap.set(enums.shuzi9, '9shu');

cardNameMap.set(enums.dong, 'dong');
cardNameMap.set(enums.nan, 'nan');
cardNameMap.set(enums.xi, 'xi');
cardNameMap.set(enums.bei, 'bei');
cardNameMap.set(enums.zhong, 'zhong');
cardNameMap.set(enums.fa, 'fa');
cardNameMap.set(enums.bai, 'bai');

enums.sameType = (card1, card2) =>
  (Math.floor(card1 / 10) === Math.floor(card2 / 10));
export default enums;
