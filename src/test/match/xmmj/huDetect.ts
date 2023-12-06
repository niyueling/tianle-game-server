import * as process from "process";
import {allCardExcludeFlower, manager} from "../../../match/xmmajiang/cardManager";
import Enums from "../../../match/xmmajiang/enums";
import huPaiDetect from "../../../match/xmmajiang/HuPaiDetect";
import {makeCards} from "../../../match/xmmajiang/makeCards";
import {SourceCardMap} from "../../../match/xmmajiang/player_state";
import {service} from "../../../service/importService";

const card2Map = array => {
  const cardMap = new SourceCardMap(Enums.maxValidCard).fill(0)
  for (const card of array) {
    if (cardMap[card]) {
      cardMap[card]++;
    } else {
      cardMap[card] = 1;
    }
  }
  // // 哪张是金牌（财神）
  // cardMap.caiShen = caiShen;
  return cardMap;
}
// 万字
const pingCards = [
  Enums.wanzi1, Enums.wanzi1, Enums.wanzi1,
  Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
  Enums.wanzi3, Enums.wanzi3, Enums.wanzi3,
  Enums.wanzi4, Enums.wanzi4, Enums.wanzi4,
  Enums.wanzi5, Enums.wanzi5, Enums.wanzi5,
  Enums.wanzi6, Enums.wanzi6,
];

// 有bug
const bugCards = [
  Enums.wanzi3, Enums.wanzi4, Enums.wanzi5,
  // 金牌
  Enums.wanzi9,
  Enums.tongzi4, Enums.tongzi5, Enums.tongzi5,
  Enums.tongzi6, Enums.tongzi6, Enums.tongzi7,
  Enums.tongzi3,
  Enums.bai, Enums.wanzi7, Enums.wanzi8,
  Enums.tongzi1, Enums.tongzi2, Enums.tongzi3,
]

// 4条为金
const goldTiao4 = [
  Enums.shuzi4, Enums.wanzi1,
  Enums.tongzi1, Enums.tongzi2, Enums.tongzi3,
  Enums.wanzi6, Enums.wanzi7, Enums.wanzi8,
  Enums.tongzi3, Enums.tongzi4, Enums.tongzi5,
  Enums.shuzi1, Enums.shuzi2, Enums.shuzi3,
  Enums.tongzi8, Enums.tongzi8, Enums.tongzi8,
]

const onlyDuiZi = [
  Enums.shuzi4, Enums.wanzi7,
]
function checkHu() {
  // 检查平胡
  let list = card2Map(pingCards)
  let compose
  compose = manager.isHu(list.slice());
  if (!compose) {
    console.error('胡牌失败', compose)
  }
  // 检查不是 6万 胡牌
  list[Enums.wanzi6] -= 2;
  compose = manager.isHuExcludeDuiZi(list.slice());
  if (!compose) {
    console.error('6万 胡牌失败')
  }
  list = card2Map(bugCards);
  compose = manager.getMaxHuType(list.slice(), Enums.wanzi9, {}, {}, {});
  if (!compose.hu) {
    throw new Error('出错了，要胡的')
  }
  list = card2Map(goldTiao4);
  compose = manager.getMaxHuType(list.slice(), Enums.shuzi4, {}, {}, {});
  if (!compose.hu) {
    throw new Error('出错了，要胡的')
  }
  list = card2Map(onlyDuiZi);
  compose = manager.getMaxHuType(list.slice(), Enums.shuzi4, {}, {}, {takeSelfCard: true});
  if (!compose.hu) {
    throw new Error('出错了，只有对子，也要胡的')
  }
  compose = manager.isHuExcludeDuiZi(card2Map([]));
  if (!compose) {
    throw new Error('出错了，只有对子，也要胡的')
  }
}

// 随机选择金牌
function randGoldCard() {
  return service.utils.randomIntBetweenNumber(Enums.wanzi1, Enums.bai);
}

// // 随机抽一张，排除列表中的牌
// async function randCard(excludeList) {
//   const list = [];
//   for (let value = Enums.wanzi1; value <= Enums.bai; value++) {
//     if (excludeList.indexOf(value) === -1) {
//       list.push(value)
//     }
//   }
//   const index = service.utils.randomIntLessMax(list.length);
//   return list[index];
// }

// // 替换金牌
// async function replaceGoldCard(cardList, caiShen, caiShenCount) {
//   const cards = cardList.slice();
//   let goldIndex;
//   let randomCard;
//   // 删除所有金牌
//   while (true) {
//     goldIndex = cards.indexOf(caiShen);
//     if (goldIndex === -1) {
//       break;
//     } else {
//       cards.splice(goldIndex, 1);
//       // 随机选一张
//       randomCard = await randCard([...cards, caiShen]);
//       cards.push(randomCard);
//     }
//   }
//   // 补金牌
//   cards.splice(0, caiShenCount);
//   return [...cards, ...new Array(caiShenCount).fill(caiShen)];
// }

function checkChi() {
  let cardList = manager.allCards();
  // 大牌不能吃
  let goldCard = Enums.dong;
  let isOk
  for (let i = Enums.dong; i < Enums.finalCard; i ++) {
    isOk = manager.isCanChi(i, goldCard, card2Map(cardList));
    if (isOk.length > 0) {
      console.error('出错了, 这张牌不能吃的', i)
    }
  }
  // 检查白板可以吃
  goldCard = Enums.wanzi1;
  isOk = manager.isCanChi(Enums.bai, goldCard, card2Map(cardList));
  if (isOk.length < 1) {
    console.error('出错了, 白板替代金牌可以吃的', goldCard)
  }
  // 检查3个位置
  cardList = [Enums.shuzi2, Enums.shuzi3];
  isOk = manager.isCanChi(Enums.shuzi1, goldCard, card2Map(cardList));
  if (isOk.length < 1) {
    console.error('出错了, 该牌可以吃')
  }
  isOk = manager.isCanChi(Enums.shuzi4, goldCard, card2Map(cardList));
  if (isOk.length < 1) {
    console.error('出错了, 该牌可以吃')
  }
  isOk = manager.isCanChi(Enums.tongzi9, goldCard, card2Map(cardList));
  if (isOk.length > 0) {
    console.error('出错了, 该牌不可以吃')
  }
  cardList = [Enums.shuzi2, Enums.shuzi4];
  isOk = manager.isCanChi(Enums.shuzi3, goldCard, card2Map(cardList));
  if (isOk.length < 1) {
    console.error('出错了, 该牌可以吃')
  }
}

function checkSameArray(valid, toCheck) {
  if (valid.length !== toCheck.length) {
    console.error('invalid result to compare', valid, ',', toCheck);
    return false;
  }
  for (const cmp of valid) {
    for (let i = 0; i < toCheck.length; i++) {
      if (Array.isArray(cmp)) {
        // 二维数组
        if (toCheck[i].length !== cmp.length) {
          // 长度不一致，不用比了
          continue;
        }
        for (const value of cmp) {
          const index = toCheck[i].indexOf(value)
          if (index !== -1) {
            toCheck[i].splice(index, 1)
          }
        }
        if (toCheck[i].length === 0) {
          // 相同的
          toCheck.splice(i, 1);
          break;
        }
      } else {
        // 非数组
        if (toCheck[i] === cmp) {
          toCheck.splice(i, 1);
          break;
        }
      }
    }
  }
  if (toCheck.length !== 0) {
    console.error('invalid result to compare', valid, ',', toCheck)
    return false;
  }
  return true;
}

// 检查顺子
function checkShunZi() {
  let result;
  let cardList = [Enums.wanzi1, Enums.wanzi2, Enums.wanzi3];
  result = manager.getShunZi(card2Map(cardList));
  checkSameArray([[Enums.wanzi1]], result);
  cardList = [Enums.wanzi1, Enums.wanzi2, Enums.wanzi3, Enums.wanzi4];
  result = manager.getShunZi(card2Map(cardList));
  checkSameArray([[Enums.wanzi1], [Enums.wanzi2]], result);
  cardList = [Enums.wanzi1, Enums.wanzi2, Enums.wanzi3, Enums.wanzi4, Enums.wanzi5]
  result = manager.getShunZi(card2Map(cardList));
  checkSameArray([[Enums.wanzi1], [Enums.wanzi2], [Enums.wanzi3]], result);
  cardList = [Enums.wanzi1, Enums.wanzi2, Enums.wanzi3, Enums.wanzi4, Enums.wanzi5, Enums.wanzi6]
  result = manager.getShunZi(card2Map(cardList));
  checkSameArray([[Enums.wanzi2], [Enums.wanzi3], [Enums.wanzi1, Enums.wanzi4]], result);
  cardList = [Enums.wanzi1, Enums.wanzi2, Enums.wanzi3, Enums.wanzi4, Enums.wanzi1, Enums.wanzi2, Enums.wanzi3];
  result = manager.getShunZi(card2Map(cardList));
  checkSameArray([[Enums.wanzi1, Enums.wanzi1], [Enums.wanzi1, Enums.wanzi2]], result);
  cardList = [Enums.wanzi1, Enums.wanzi2, Enums.wanzi3, Enums.tongzi1, Enums.tongzi2, Enums.tongzi4];
  result = manager.getShunZi(card2Map(cardList));
  checkSameArray([[Enums.wanzi1]], result);
  cardList = [Enums.wanzi1, Enums.wanzi2, Enums.wanzi3, Enums.tongzi1, Enums.tongzi2, Enums.tongzi3];
  result = manager.getShunZi(card2Map(cardList));
  checkSameArray([[Enums.wanzi1, Enums.tongzi1]], result);
  cardList = [Enums.wanzi1, Enums.wanzi2, Enums.wanzi3, Enums.shuzi1, Enums.shuzi2, Enums.tongzi3];
  result = manager.getShunZi(card2Map(cardList));
  checkSameArray([[Enums.wanzi1]], result);
  const cards = [
    Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
    Enums.wanzi3, Enums.wanzi4, Enums.wanzi5,
    Enums.wanzi5, Enums.wanzi6, Enums.wanzi7,
    Enums.wanzi7, Enums.wanzi8, Enums.wanzi9,
    Enums.wanzi1, Enums.wanzi1, Enums.wanzi1,
  ];
  result = manager.getShunZi(card2Map(cards));
  checkSameArray([
    [Enums.wanzi1, Enums.wanzi3, Enums.wanzi5, Enums.wanzi7],
    [Enums.wanzi2, Enums.wanzi6],
    [Enums.wanzi1, Enums.wanzi3, Enums.wanzi6],
    [Enums.wanzi1, Enums.wanzi4, Enums.wanzi7],
    [Enums.wanzi2, Enums.wanzi5, Enums.wanzi7],
  ], result);
}

function checkKeZi() {
  let result;
  let cardList = [Enums.wanzi1, Enums.wanzi2, Enums.wanzi3];
  result = manager.getKeZi(card2Map(cardList));
  checkSameArray([], result);
  cardList = [Enums.wanzi1, Enums.wanzi1, Enums.wanzi1, Enums.shuzi1];
  result = manager.getKeZi(card2Map(cardList));
  checkSameArray([Enums.wanzi1], result);
  cardList = [Enums.wanzi1, Enums.wanzi1, Enums.wanzi1, Enums.shuzi2, Enums.shuzi1, Enums.shuzi1, Enums.shuzi1];
  result = manager.getKeZi(card2Map(cardList));
  checkSameArray([Enums.wanzi1, Enums.shuzi1], result);
  cardList = [Enums.wanzi1, Enums.wanzi1, Enums.wanzi1, Enums.shuzi2, Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
    Enums.tongzi1, Enums.tongzi9, Enums.tongzi9, Enums.tongzi9];
  result = manager.getKeZi(card2Map(cardList));
  checkSameArray([Enums.wanzi1, Enums.shuzi1, Enums.tongzi9], result);
}

// 游金
function checkYouJin() {
  let cards = [
    Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
    Enums.shuzi1, Enums.shuzi2, Enums.shuzi3,
    Enums.tongzi1, Enums.tongzi2, Enums.tongzi3,
    Enums.wanzi7, Enums.wanzi8, Enums.wanzi9,
    Enums.tongzi5, Enums.tongzi5, Enums.tongzi5,
    Enums.wanzi6, Enums.tongzi6,
  ]
  let isOk: any = manager.isYouJin(card2Map(cards), Enums.wanzi6);
  if (!isOk) {
    console.error('游金错了,应该游金的')
  }
  isOk = manager.isYouJin(card2Map(cards), Enums.shuzi6);
  if (isOk) {
    console.error('游金错了,不应该游金的')
  }
  // 全顺子
  cards = [
    Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
    Enums.shuzi1, Enums.shuzi2, Enums.shuzi3,
    Enums.tongzi1, Enums.tongzi2, Enums.tongzi3,
    Enums.wanzi7, Enums.wanzi8, Enums.wanzi9,
    Enums.tongzi5, Enums.tongzi6, Enums.tongzi7,
    Enums.wanzi6, Enums.tongzi5,
  ]
  isOk = manager.isYouJin(card2Map(cards), Enums.wanzi6);
  if (!isOk) {
    console.error('游金错了,应该游金的')
  }
  cards = [
    Enums.wanzi1, Enums.wanzi1,
    Enums.nan, Enums.nan, Enums.nan,
    Enums.bei, Enums.bei,
  ]
  let cardMap = card2Map(cards);
  isOk = manager.isCanYouJin(cardMap, Enums.wanzi1);
  if (!isOk) {
    throw new Error('游金错了,应该可以游金的')
  }
  // 检查是否胡游金
  cards = [
    Enums.tongzi6, Enums.fa,
    Enums.wanzi4, Enums.wanzi5, Enums.wanzi6,
    Enums.shuzi5, Enums.shuzi6, Enums.shuzi7,
    Enums.shuzi9, Enums.shuzi9, Enums.shuzi9,
  ]
  cardMap = card2Map(cards);
  cardMap.caiShen = Enums.tongzi6;
  isOk = huPaiDetect.check(cardMap, {youJinTimes: 1, takeSelfCard: true}, {}, 1);
  console.log('hu info', isOk);
}

// TODO 去重
function checkGoldAndBai() {
  let result;
  console.log('计算白板，金牌数');
  result = manager.combineGoldCardAndBai(1, 0, Enums.wanzi1);
  if (result.length !== 34) {
    console.log('1个金牌组合出错了，长度应该是 34, 结果是', result.length);
  }
  result = manager.combineGoldCardAndBai(2, 0, Enums.wanzi1);
  if (result.length !== 1156) {
    console.log('2个金牌组合出错了，长度应该是1156(34*34), 结果是', result.length);
  }
  result = manager.combineGoldCardAndBai(3, 0, Enums.wanzi1);
  if (result.length !== 39304) {
    console.log('3个金牌组合出错了，长度应该是 39304(34*34*34), 结果是', result.length);
  }
  result = manager.combineGoldCardAndBai(1, 1, Enums.wanzi1);
  if (result.length !== 68) {
    console.log('1金牌+1个白板出错了，长度应该是 68, 结果是', result.length);
  }
  result = manager.combineGoldCardAndBai(1, 2, Enums.wanzi1);
  if (result.length !== 136) {
    console.log('1金牌+2个白板出错了，长度应该是 136, 结果是', result.length);
  }
  result = manager.combineGoldCardAndBai(1, 3, Enums.wanzi1);
  if (result.length !== 272) {
    console.log('1金牌+3个白板出错了，长度应该是 272, 结果是', result.length);
  }
  result = manager.combineGoldCardAndBai(2, 3, Enums.wanzi1);
  if (result.length !== 9248) {
    console.log('2金牌+3个白板出错了，长度应该是 9248(1156 * 8), 结果是', result.length);
  }
  result = manager.combineGoldCardAndBai(3, 3, Enums.wanzi1);
  if (result.length !== 314432) {
    console.log('3金牌+3个白板出错了，长度应该是 314432(34*34*34 * 8), 结果是', result.length);
  }
}

// 检查带金的胡牌
function checkHuByGold() {
  let result;
  const pingList = card2Map(pingCards);
  pingList[Enums.wanzi6] = 1;
  pingList[Enums.tongzi6] = 1;
  console.log('hu by gold origin list', JSON.stringify(pingList))
  result = manager.isHuByGold(pingList, Enums.tongzi6);
  console.log('hu by gold is', JSON.stringify(pingList), 'result', JSON.stringify(result))
  result = manager.allHuComposeByGold(pingList, Enums.tongzi6);
  console.log('hu by gold list', JSON.stringify(pingList), 'all compose is')
  for (const r of result) {
    console.log(JSON.stringify(r))
  }
  // 测试胡牌
  const testList = [
    Enums.wanzi5, Enums.wanzi5, Enums.wanzi5,
    Enums.wanzi9,
    Enums.tongzi7, Enums.tongzi7, Enums.tongzi7,
    Enums.dong, Enums.dong, Enums.dong, Enums.dong,
    Enums.nan, Enums.nan, Enums.nan,
    Enums.bai, Enums.bai, Enums.bai,
  ]
  // 对子9万 要胡
  result = manager.allHuComposeByGold(manager.card2Map(testList), Enums.tongzi7);
  // 要有 9 万
  console.log('all hu compose', result.length, JSON.stringify(result));
}

// 提示胡牌
function checkHuePrompt() {
  let result;
  result = makeCards.makePingHu(1, Enums.fa, 17);
  const list = result[0];
  console.log('hu compose', JSON.stringify(result));
  let required;
  // 换成东
  if (list[0] === Enums.dong) {
    list[0] = Enums.xi;
    required = Enums.xi;
  } else {
    list[0] = Enums.dong;
    required = Enums.dong;
  }
  result = manager.promptTing(manager.card2Map(list), Enums.fa);
  if (result.indexOf(required) === -1) {
    console.error('提示胡牌失败', 'card list', JSON.stringify(list), 'compose', result)
  } else {
    console.log('prompt compose', result);
  }
  const printCompose = (gangZiCount, keZiCount, shunZiCount, goldCardCount, duiZiCount) => {
    result = makeCards.makeCards(1, Enums.fa, 17,
      { gangZiCount, keZiCount, shunZiCount, goldCardCount, duiZiCount});
    console.log('make hu compose', JSON.stringify(result))
  }
  printCompose(0, 4, 1, 0, 0);
  printCompose(0, 3, 2, 0, 0);
  printCompose(0, 2, 3, 0, 0);
  printCompose(0, 1, 4, 0, 0);
  printCompose(3, 0, 0, 1, 0);
  printCompose(1, 3, 0, 0, 0);
  printCompose(2, 3, 0, 0, 0);
  printCompose(0, 4, 0, 0, 1);
  result = makeCards.makeTianHu(2, Enums.fa);
  if (result[0].indexOf(Enums.fa) === -1) {
    console.error('凑天胡牌失败了')
  }
  result = makeCards.makeDiHu(4, Enums.fa, 2);
  for (let i = 0; i < 4; i++) {
    if (i === 2) {
      // 必须得有一张金牌
      if (result[i].indexOf(Enums.fa) === -1) {
        console.error('凑地胡牌失败了')
      }
    } else {
      if (result[i].indexOf(Enums.fa) !== -1) {
        console.error('凑地胡,随机牌失败了')
      }
    }
  }
  result = makeCards.make3Jin(4, Enums.fa, 1);
  for (let i = 0; i < 4; i++) {
    if (i === 1) {
      // 必须得有3张金牌
      const countMaps = manager.card2Map(result[i]);
      if (countMaps[Enums.fa] !== 3) {
        console.error('凑3金倒失败了')
      }
    } else {
      if (result[i].indexOf(Enums.fa) !== -1) {
        console.error('凑3金倒,随机牌失败了')
      }
    }
  }
  // 3游金
  const allCards = allCardExcludeFlower.slice();
  result = makeCards.make3YouJin(allCards, 4, Enums.fa);
  // 检查倒数第1个，4个，8个
  const cardLength = result.cardMapList.length;
  if (result.cardMapList[cardLength - 1] === Enums.fa ||
    result.cardMapList[cardLength - 5] !== Enums.fa ||
    result.cardMapList[cardLength - 9] !== Enums.fa
  ) {
    console.log('3游金出错了', JSON.stringify(result));
  }
}

function checkHuType() {
  let result;
  // 一条龙
  let cards = [
    Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
    Enums.shuzi4, Enums.shuzi5, Enums.shuzi6,
    Enums.tongzi7, Enums.tongzi8, Enums.tongzi9,
    Enums.wanzi7, Enums.wanzi7, Enums.wanzi7,
    Enums.wanzi8, Enums.wanzi8, Enums.wanzi8,
    Enums.dong, Enums.dong,
  ]
  result = manager.isHu(card2Map(cards));
  if (!result) {
    console.error('应该要胡牌的')
  }
  result = manager.isYiTiaoLong(result.shunZi);
  if (!result) {
    console.error('胡牌类型必须为一条龙')
  }
  // 清一色
  cards = [
    Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
    Enums.wanzi3, Enums.wanzi4, Enums.wanzi5,
    Enums.wanzi5, Enums.wanzi6, Enums.wanzi7,
    Enums.wanzi7, Enums.wanzi8, Enums.wanzi9,
    Enums.wanzi1, Enums.wanzi1, Enums.wanzi1,
    Enums.wanzi2, Enums.wanzi2,
  ];
  result = manager.isHu(card2Map(cards));
  if (!result) {
    console.error('必须得胡牌!')
  }
  result = manager.isQingYiSe(result, {});
  if (!result) {
    console.error('必须得清一色！')
  }
}

async function running() {
  if (manager.allCards().length !== 144) {
    console.error('总牌数不是144张')
  }
  const noBigCard = manager.allCards(true);
  // 无大牌
  for (const card of noBigCard) {
    if (card >= Enums.dong && card <= Enums.bai) {
      throw new Error('不能有大牌')
    }
  }
  checkShunZi();
  checkKeZi();
  checkChi();
  const gold = randGoldCard();
  console.log('running start, gold card', gold)
  console.log('平胡')
  checkHu();
  // 所有胡牌组合
  const compose = manager.allHuCompose(card2Map(pingCards), null)
  console.log('所有胡牌组合', JSON.stringify(pingCards))
  for (const p of compose) {
    console.log(JSON.stringify(p));
  }
  checkYouJin();
  // checkGoldAndBai();
  checkHuByGold();
  // const oneGold = await replaceGoldCard(pingCards, gold, 1);
  // console.log('一张金牌', oneGold)
  // checkHu(oneGold, gold);
  checkHuePrompt();
  checkHuType();
}

running().then(() => {
  console.log('running end')
  process.exit(0)
});
