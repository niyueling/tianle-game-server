import * as config from "../../config"
import {service} from "../../service/importService";
import Enums from "./enums";
import huPaiDetect from "./HuPaiDetect";

export const allCards = [];
// 除花牌外的所有类型
export const allCardsTypeExcludeFlower = [];
for (let value = Enums.wanzi1; value < Enums.maxValidCard; value++) {
  if (value % 10 === 0) {
    // 没有这种牌
    continue;
  }
  allCards.push(...[value, value, value, value]);
  allCardsTypeExcludeFlower.push(value);
}
// 除花牌外的所有牌
export const allCardExcludeFlower = allCards.slice();
// 添加花牌
for (let value = Enums.spring; value < Enums.finalCard; value++) {
  allCards.push(value);
}

// 存在顺子的牌
const shunList = [[Enums.wanzi1, Enums.wanzi7], [Enums.shuzi1, Enums.shuzi7], [Enums.tongzi1, Enums.tongzi7]];

class CardManager {
  // 抽金牌
  randGoldCard() {
    let index = service.utils.randomIntLessMax(6);
    index += service.utils.randomIntLessMax(6);
    return index;
  }

  // 所有牌
  allCards(noBigCard?) {
    if (noBigCard) {
      // 不需要大牌
      return service.utils.shuffleArray(allCards.filter(value => !(value >= Enums.dong && value <= Enums.bai)))
    }

    return service.utils.shuffleArray(allCards.slice());
  }

  // 是否能吃(白板替代金牌)
  isCanChi(card, goldCard, cardMap) {
    const originCard = card;
    if (originCard === goldCard) {
      // 金牌不能吃?
      return [];
    }
    if (card === Enums.bai) {
      // 取金牌的值
      card = goldCard;
    }
    const shunZi = [];
    if (card >= Enums.dong) {
      // 东南西北, 中发白
      return shunZi;
    }

    // 排第1位,第2位,第3位
    const pos = [[1, 2], [-1, 1], [-2, -1]]
    let list;
    let index;

    // 金牌置为0
    const goldCount = cardMap[goldCard];
    cardMap[goldCard] = 0;

    // 白板置为金牌
    const baiCount = cardMap[Enums.bai];
    cardMap[Enums.bai] = 0;
    cardMap[goldCard] = baiCount;


    for (const p of pos) {
      if (cardMap[p[0] + card] > 0 && cardMap[p[1] + card] > 0) {
        // 可以吃
        list = [p[0] + card, p[1] + card, card].sort().slice();
        const baiIndex = list.findIndex(c => c === goldCard);
        if (baiIndex !== -1) {
          list[baiIndex] = Enums.bai;
        }
        index = list.indexOf(card);
        list[index] = originCard;
        list.push(originCard);
        shunZi.push(list)
      }
    }
    cardMap[Enums.bai] = baiCount;
    cardMap[goldCard] = goldCount;
    return shunZi;
  }

  // // 是否可以吃胡
  // isCanHu(card, goldCard, cardMap) {
  //   cardMap[card]++;
  //   const isOk = this.isHuByGold(cardMap, goldCard);
  //   cardMap[card]--;
  //   return !!isOk;
  // }

  // 获取所有对子
  getDuiZi(cardMap) {
    const result = [];
    for (const value of allCardsTypeExcludeFlower) {
      if (cardMap[value] >= 2) {
        if (result.indexOf(value) === -1) {
          result.push(value);
        }
      }
    }
    return result;
  }

  // 所有刻子 (3个相同, 杠子要去掉)
  getKeZi(cardMap) {
    const result = [];
    let times;
    for (const value of allCardsTypeExcludeFlower) {
      times = Math.floor(cardMap[value] / 3);
      if (times > 0) {
        result.push(...new Array(times).fill(value));
      }
    }
    return result;
  }

  // 获取一组牌中的顺子
  getShunZi(cardMap) {
    const allType = [];
    let min;
    for (const l of shunList) {
      for (let i = l[0]; i <= l[1]; i++) {
        if (cardMap[i] > 0 && cardMap[i + 1] > 0 && cardMap[i + 2] > 0) {
          // 检查相同的顺子有几个
          min = Math.min(cardMap[i], cardMap[i + 1], cardMap[i + 2]);
          allType.push(...new Array(min).fill(i));
        }
      }
    }
    const allCompose = this.getAllCompose(allType);
    return this.getValidCompose(allCompose, cardMap);
  }

  // 获取全排列组合
  getAllCompose(list) {
    const result = [];
    let combine;
    for (let i = 0; i < list.length; i++) {
      combine = service.cards.arrayCombine(list, i + 1)
      result.push(...combine);
    }
    return this.uniqueArray(result);
  }

  isArrayExists(cmp, result) {
    for (const r of result) {
      if (r.length !== cmp.length) {
        // 长度不一致，不用比了
        continue;
      }
      const copyList = r.slice();
      for (const value of cmp) {
        const index = copyList.indexOf(value)
        if (index !== -1) {
          copyList.splice(index, 1)
        }
      }
      if (copyList.length === 0) {
        // 相同
        return true;
      }
    }
    return false;
  }

  // 去重2维数组(先排序)
  uniqueArray(result) {
    const newResult = [];
    const exist = {};
    let key;
    for (const cmp of result) {
      key = JSON.stringify(cmp.slice().sort());
      if (!exist[key]) {
        newResult.push(cmp);
        exist[key] = true;
      }
    }
    return newResult;
  }

  // 获取有效组合
  getValidCompose(composeList, cardMap) {
    let recover;
    let isOk;
    const valid = [];
    for (const list of composeList) {
      recover = {};
      for (const value of list) {
        this.incRecover(value, recover);
        this.incRecover(value + 1, recover);
        this.incRecover(value + 2, recover);
        cardMap[value]--;
        cardMap[value + 1]--;
        cardMap[value + 2]--;
      }
      // 检查cardMap是否为负数
      isOk = this.isValidCompose(cardMap);
      if (isOk) {
        valid.push(list);
      }
      this.recoverCard(cardMap, recover);
    }
    return valid;
  }

  // 检查是否还存在顺子
  isValidCompose(cardMap) {
    for (const card of allCardsTypeExcludeFlower) {
      if (cardMap[card] < 0) {
        // 被扣成负数，肯定不是有效组合
        return false;
      }
      if (cardMap[card] > 0 && cardMap[card + 1] > 0 && cardMap[card + 2] > 0) {
        // 还有顺子，不是完整的组合
        return false;
      }
    }
    return true;
  }

  incRecover(value, recover) {
    if (recover[value]) {
      recover[value]++;
    } else {
      recover[value] = 1;
    }
  }

  recoverCard(cardMap, recover) {
    for (const k of Object.keys(recover)) {
      cardMap[k] += recover[k];
    }
    return cardMap;
  }

  recoverCardByDec(cardMap, recover) {
    for (const k of Object.keys(recover)) {
      cardMap[k] -= recover[k];
    }
    return cardMap;
  }

  // 带万能牌的胡, 计算剩下的牌数，减少计算量
  isHuByGold(cardMap, goldCard) {
    const baiCount = cardMap[Enums.bai] || 0;
    const goldCount = cardMap[goldCard] || 0;
    // 清空原来的牌
    cardMap[Enums.bai] = 0;
    cardMap[goldCard] = 0;
    const baiGoldCompose = this.combineGoldCardAndBai(goldCount, baiCount, goldCard);
    if (baiGoldCompose.length < 1) {
      // 没有金牌或者白板，普通胡
      return this.isHu(cardMap);
    }
    let recover;
    let huCompose;
    for (const list of baiGoldCompose) {
      recover = {};
      for (const value of list) {
        this.incRecover(value, recover)
        cardMap[value]++;
      }
      huCompose = this.isHu(cardMap);
      if (huCompose) {
        // 胡了
        this.recoverCardByDec(cardMap, recover);
        // 还原白板，金牌
        cardMap[Enums.bai] = baiCount;
        cardMap[goldCard] = goldCount;
        return huCompose;
      }
      // 测试下一个
      this.recoverCardByDec(cardMap, recover);
    }
    // 还原白板，金牌
    cardMap[Enums.bai] = baiCount;
    cardMap[goldCard] = goldCount;
    // 所有牌都算过了，不可能胡
    return null;
  }

  allHuComposeByGold(cardMap, goldCard) {
    const baiCount = cardMap[Enums.bai] || 0;
    const goldCount = cardMap[goldCard] || 0;
    // 清空原来的牌
    cardMap[Enums.bai] = 0;
    cardMap[goldCard] = 0;
    const baiGoldCompose = this.combineGoldCardAndBai(goldCount, baiCount, goldCard);
    if (baiGoldCompose.length < 1) {
      // 没有金牌或者白板，普通组合
      return this.allHuCompose(cardMap, { gold: [], bai: [] });
    }
    let recover;
    let ignore;
    let compose;
    let value;
    let replace;
    const huList = [];
    for (const list of baiGoldCompose) {
      recover = {};
      ignore = false;
      replace = { gold: [], bai: []}
      for (let i = 0; i < list.length; i++) {
        value = list[i];
        if (i < goldCount) {
          // 金牌替换的
          replace.gold.push(value);
        } else {
          // 白板
          replace.bai.push(value);
        }
        this.incRecover(value, recover)
        cardMap[value]++;
      }
      compose = this.allHuCompose(cardMap, replace);
      if (compose.length > 0) {
        // 胡了
        huList.push(...compose)
      }
      // 测试下一个
      this.recoverCardByDec(cardMap, recover);
    }
    // 还原白板，金牌
    cardMap[Enums.bai] = baiCount;
    cardMap[goldCard] = goldCount;
    return huList;
  }

  // 所有胡牌组合, 杠子要先去掉
  allHuCompose(cardMap, replace) {
    const duiList = this.getDuiZi(cardMap);
    let duRecover;
    let shunRecover;
    // 胡牌组合
    const huCompose = [];
    let huShunZi;
    let huKeZi;
    for (const d of duiList) {
      // 扣掉对子
      duRecover = {};
      this.incRecover(d, duRecover);
      this.incRecover(d, duRecover);
      cardMap[d] -= 2;
      // 检查顺子， 刻子
      const compose = this.getShunZi(cardMap);
      for (const list of compose) {
        // 扣掉顺子牌
        huShunZi = [];
        shunRecover = {};
        for (const card of list) {
          this.incRecover(card, shunRecover)
          this.incRecover(card + 1, shunRecover)
          this.incRecover(card + 2, shunRecover)
          cardMap[card]--;
          cardMap[card + 1]--;
          cardMap[card + 2]--;
          huShunZi.push([card, card + 1, card + 2])
        }
        if (this.isZeroCard(cardMap)) {
          // 胡了，没有刻子
          huCompose.push({
            // 对子
            duiZi: [ d, d],
            // 顺子
            shunZi: huShunZi,
            // 刻子
            keZi: [],
            replace,
          })
        } else {
          huKeZi = this.getKeZiByHu(cardMap);
          if (huKeZi.length > 0) {
            // 胡牌
            huCompose.push({
              // 对子
              duiZi: [ d, d],
              // 顺子
              shunZi: huShunZi,
              // 刻子
              keZi: huKeZi,
              replace,
            })
          }
        }
        // 还原牌
        this.recoverCard(cardMap, shunRecover);
      }
      // 检查没顺子的情况
      huKeZi = this.getKeZiByHu(cardMap);
      if (huKeZi.length > 0) {
        // 胡牌
        huCompose.push({
          // 对子
          duiZi: [ d, d],
          // 顺子
          shunZi: [],
          // 刻子
          keZi: huKeZi,
          replace,
        })
      }
      // 检查没有刻子的情况
      if (this.isZeroCard(cardMap)) {
        // 胡牌
        huCompose.push({
          // 对子
          duiZi: [ d, d],
          // 顺子
          shunZi: [],
          // 刻子
          keZi: [],
          replace,
        })
      }
      // 还原对子
      this.recoverCard(cardMap, duRecover)
    }
    return huCompose;
  }

  // 是否胡
  isHu(cardMap) {
    // 杠子要先去掉
    const duiList = this.getDuiZi(cardMap);
    let duRecover;
    let huCompose;
    const result = {
      duiZi: [],
      keZi: [],
      shunZi: [],
    }
    for (const d of duiList) {
      // 扣掉对子
      duRecover = {};
      this.incRecover(d, duRecover);
      this.incRecover(d, duRecover);
      cardMap[d] -= 2;
      result.duiZi = [d, d];
      // 检查顺子， 刻子
      huCompose = this.isHuExcludeDuiZi(cardMap);
      if (huCompose) {
        // 还原牌数
        this.recoverCard(cardMap, duRecover)
        result.keZi = huCompose.keZi;
        result.shunZi = huCompose.shunZi;
        return result;
      }
      // 还原对子
      this.recoverCard(cardMap, duRecover)
    }
    return null;
  }

  // 是否三金倒
  isSanJinDao(cardMap, goldCard) {
    // if (turn !== 1) {
    //   // 不是第一个
    //   return false;
    // }
    return cardMap[goldCard] >= 3;
  }

  // 是否游金 17张牌
  isYouJin(cardMap, goldCard) {
    if (cardMap[goldCard] < 1) {
      // 没有金牌，不可能游金
      return false;
    }
    let huCompose;
    cardMap[goldCard]--;
    for (const card of allCardsTypeExcludeFlower) {
      if (cardMap[card] < 1) {
        continue;
      }
      // 扣一张，当对子
      cardMap[card]--;
      huCompose = this.isHuExcludeDuiZi(cardMap);
      if (huCompose) {
        cardMap[card]++;
        cardMap[goldCard]++;
        return true;
      }
      // 还原
      cardMap[card]++;
    }

    cardMap[goldCard]++;
    return false;
  }

  // 16 张牌下，是否能游金
  isCanYouJin(cardMap, goldCard) {
    if (cardMap[goldCard] < 1) {
      // 没有金牌，不可能游金
      return false;
    }
    // 金牌先清空
    const goldCount = cardMap[goldCard];
    let baiCount = 0;
    cardMap[goldCard] = 0;

    // 如果金牌非字牌，白板换成金牌参与计算
    if (goldCard < Enums.dong && cardMap[Enums.bai] > 0) {
      baiCount = cardMap[Enums.bai];
      cardMap[Enums.bai] = 0;
      cardMap[goldCard] = baiCount;
    }

    // 剩下是否全是刻子，顺子
    const result: any = {};
    huPaiDetect.huRecur(cardMap.slice(),
      true,
      goldCount - 1,
      {lastTakeCard: 0, caiShen: goldCard},
      result,
      false
    );
    cardMap[goldCard] = goldCount;
    if (baiCount > 0) {
      cardMap[Enums.bai] = baiCount;
    }

    // 是否胡游金
    return result.hu;
  }

  // // 带金牌的胡牌
  // isHuExcludeDuiZiByGold(cardMap, goldCard) {
  //   const goldCount = cardMap[goldCard] || 0;
  //   const baiCount = cardMap[Enums.bai] || 0;
  //   cardMap[Enums.bai] = 0;
  //   cardMap[goldCard] = 0;
  //   const baiGoldCombine = this.combineGoldCardAndBai(goldCount, baiCount, goldCard)
  //   if (baiGoldCombine.length < 1) {
  //     // 没有金牌,白板
  //     return this.isHuExcludeDuiZi(cardMap);
  //   }
  //   let recover;
  //   let huCompose;
  //   for (const list of baiGoldCombine) {
  //     recover = {};
  //     for (const value of list) {
  //       this.incRecover(value, recover)
  //       cardMap[value]++;
  //     }
  //     huCompose = this.isHuExcludeDuiZi(cardMap);
  //     if (huCompose) {
  //       // 胡了
  //       this.recoverCardByDec(cardMap, recover);
  //       // 还原白板，金牌
  //       cardMap[Enums.bai] = baiCount;
  //       cardMap[goldCard] = goldCount;
  //       return huCompose;
  //     }
  //     // 测试下一个
  //     this.recoverCardByDec(cardMap, recover);
  //   }
  //   // 还原白板，金牌
  //   cardMap[Enums.bai] = baiCount;
  //   cardMap[goldCard] = goldCount;
  //   // 所有牌都算过了，不可能胡
  //   return null;
  // }

  // 没有对子的胡牌
  isHuExcludeDuiZi(cardMap) {
    let shunRecover;
    let keZi = [];
    const compose = this.getShunZi(cardMap);
    let shunZi = [];
    for (const list of compose) {
      // 扣掉顺子牌
      shunRecover = {};
      shunZi = [];
      for (const card of list) {
        this.incRecover(card, shunRecover)
        this.incRecover(card + 1, shunRecover)
        this.incRecover(card + 2, shunRecover)
        cardMap[card]--;
        cardMap[card + 1]--;
        cardMap[card + 2]--;
        shunZi.push([card, card + 1, card + 2])
      }
      if (this.isZeroCard(cardMap)) {
        // 没有刻子
        this.recoverCard(cardMap, shunRecover);
        return { keZi: [], shunZi }
      }
      // 检查剩下是不是全为刻子
      keZi = this.getKeZiByHu(cardMap);
      if (keZi.length > 0) {
        // 胡牌
        this.recoverCard(cardMap, shunRecover);
        return { keZi, shunZi };
      }
      // 还原牌
      this.recoverCard(cardMap, shunRecover);
    }
    // 检查无顺子情况
    keZi = this.getKeZiByHu(cardMap);
    if (keZi.length > 0) {
      return { keZi, shunZi: [] };
    }
    // 检查无顺子，刻子
    if (this.isZeroCard(cardMap)) {
      return { keZi: [], shunZi: [] }
    }
    return null;
  }

  isZeroCard(cardMap) {
    for (const value of allCardsTypeExcludeFlower) {
      if (cardMap[value] !== 0) {
        return false;
      }
    }
    return true;
  }

  // 判断剩下的牌是不是能用刻子胡
  getKeZiByHu(cardMap) {
    // 检查没有顺子的情况
    let keZiRecover;
    let keZi;
    keZi = this.getKeZi(cardMap);
    keZiRecover = {};
    const huKeZi = [];
    let card;
    for (let i = 0; i < keZi.length; i++) {
      card = keZi[i];
      this.incRecover(card, keZiRecover)
      this.incRecover(card, keZiRecover)
      this.incRecover(card, keZiRecover)
      cardMap[card] -= 3;
      huKeZi.push([card, card, card]);
    }
    // 检查是不是没牌了
    if (this.isZeroCard(cardMap)) {
      this.recoverCard(cardMap, keZiRecover);
      return huKeZi;
    }
    this.recoverCard(cardMap, keZiRecover);
    return [];
  }

  // 根据白板数，金牌数组合
  combineGoldCardAndBai(goldCount, baiCount, goldCard) {
    const calculateCard = (count, result, cardRange) => {
      if (count === 0) {
        return result;
      }
      const newResult = [];
      for (const value of cardRange) {
        if (result.length > 0) {
          for (const r of result) {
            newResult.push([...r, value])
          }
        } else {
          newResult.push([value]);
        }
      }
      return calculateCard(count - 1, this.uniqueArray(newResult), cardRange);
    }
    let cardResult = calculateCard(goldCount, [], allCardsTypeExcludeFlower);
    if (goldCard === Enums.bai) {
      // 白板就是金牌
      return cardResult;
    }
    cardResult = calculateCard(baiCount, cardResult, [Enums.bai, goldCard]);
    return cardResult;
  }

  card2Map(array) {
    const cardMap = new Array(Enums.finalCard).fill(0)
    for (const card of array) {
      if (cardMap[card]) {
        cardMap[card]++;
      } else {
        cardMap[card] = 1;
      }
    }
    return cardMap;
  }

  // 根据牌型提示听牌
  promptTing(cardsMap, goldCard) {
    const result = [];
    let huResult;
    for (const card of allCardsTypeExcludeFlower) {
      if (cardsMap[card] > 0) {
        // 有这张牌, 扣掉, 再看会不会胡
        cardsMap[card]--;
        cardsMap[goldCard]++;
        huResult = this.isHuByGold(cardsMap, goldCard)
        if (huResult) {
          // 可以胡
          result.push(card);
        }
        cardsMap[card]++;
        cardsMap[goldCard]--;
      }
    }
    return result;
  }

  // 最大胡
  getMaxHuType(cardMap, goldCard, rule, events, opt) {
    const allCombine = this.allHuComposeByGold(cardMap, goldCard);
    let result;
    let maxFan = 0;
    let maxResult = { hu: false, fan: 0, huCards: {}, takeSelfCard: false, [Enums.youJinTimes]: 0 };
    opt.maxFan = opt.maxFan || config.xmmj.maxFan;
    for (const combine of allCombine) {
      result = this.calculateFan(cardMap, goldCard, events, combine, opt, rule);
      // console.debug('getMaxHuType', fan, 'opt', JSON.stringify(opt), 'huCards', JSON.stringify(combine));
      if (result.hu && maxFan < result.fan) {
        console.debug('getMaxHuType', result.fan, 'opt', JSON.stringify(opt), 'huCards', JSON.stringify(combine));
        maxFan = result.fan;
        maxResult = result;
        maxResult.fan = maxFan;
        const shunZi = [];
        combine.shunZi.map(value => shunZi.push(...value))
        maxResult.huCards = {
          useJiang: [combine.duiZi[0]],
          keZi: combine.keZi.map(value => value[0]),
          shunZi,
          replace: combine.replace,
        }
        maxResult.takeSelfCard = !!opt.takeSelfCard;
      }
    }
    // 检查3金倒
    const isOk = this.isSanJinDao(cardMap, goldCard);
    if (isOk) {
      if (!rule.sanJinMustQiShou || rule.sanJinMustQiShou && opt.turn === opt.seatIndex + 1) {
        // 3金倒不必起手或者 3金倒必起手
        result = { hu: true, fan: 1 }
        result[Enums.sanCaiShen] = true;
        result.huType = Enums.qiShouSanCai;
        result.fan *= 4;
        if (maxResult.fan < result.fan) {
          maxResult = result;
          // 无对子，刻子，顺子
          maxResult.huCards = {
            useJiang: [],
            keZi: [],
            shunZi: [],
          };
        }
      }
    }
    if (maxResult.fan >= opt.maxFan) {
      // 倍数不能超过上限
      maxResult.fan = opt.maxFan;
    }
    return maxResult;
  }

  // 清一色，一条龙
  isYiTiaoLong(shunZiList) {
    const long = [];
    let value;
    for (const list of shunZiList) {
      for (const card of list) {
        value = card % 10;
        if (!long.includes(value)) {
          long.push(value);
        }
      }
    }
    // 1 - 9都有了
    return long.length === 9;
  }

  // 清一色
  isQingYiSe(combine, events) {
    let isOk = true;
    let lastType = 0;
    let cardType;
    for (const card of [].concat(...combine.keZi).concat(...combine.shunZi).concat(combine.duiZi)) {
      cardType = Math.floor(card / 10);
      if (lastType === 0) {
        lastType = cardType;
        continue;
      }
      if (lastType !== cardType) {
        // 不是清一色
        isOk = false;
        break;
      }
    }
    if (!isOk) {
      return false;
    }
    // 检查吃、碰、胡的牌
    const checkCard = eventType => {
      if (events[eventType]) {
        for (const card of events[eventType]) {
          cardType = Math.floor(card / 10);
          if (lastType !== cardType) {
            return false;
          }
        }
      }
      return true;
    }
    isOk = checkCard(Enums.peng);
    if (!isOk) {
      return false;
    }
    isOk = checkCard(Enums.chi);
    if (!isOk) {
      return false;
    }
    isOk = checkCard(Enums.mingGang);
    if (!isOk) {
      return false;
    }
    isOk = checkCard(Enums.anGang);
    return isOk;
  }

  // 检查碰碰胡
  isPengPengHu(huCards, events) {
    // 没有吃牌
    const noChiPai = !events[Enums.chi];
    // 没有顺子
    const noShunZi = huCards.shunZi.length === 0;
    return noChiPai && noShunZi
  }

  // 是否胡游金
  isYouJinCombine(combine) {
    if (!combine.replace || !combine.replace.gold || combine.replace.gold.length === 0) {
      // 没有金牌
      return false;
    }
    // 检查对子有没有金牌
    return combine.replace.gold.includes(combine.duiZi[0]);
  }

  // 计算倍数
  calculateFan(cardMap, goldCard, events, combine, opt, rule) {
    let result;
    let isOk;
    result = { hu: true, huType: Enums.pingHu, fan: 1 }
    if (opt.turn === 1 && opt.takeSelfCard) {
      // 天胡
      result.tianHu = true;
      result.huType = Enums.tianHu;
      result.fan *= 8;
    } else if (opt.turn === opt.seatIndex + 1 && opt.takeSelfCard) {
      // 地胡
      result.diHu = true;
      result.huType = Enums.diHu;
      result.fan *= 4;
    }
    if (opt.qiangGang) {
      // 抢杠
      result[Enums.qiangGang] = true;
      result.fan *= 2;
    }
    isOk = this.isPengPengHu(combine, events);
    if (isOk) {
      result[Enums.pengPengHu] = true;
      result.fan *= 2;
    }
    isOk = this.isQingYiSe(combine, events);
    if (isOk) {
      // 清一色
      isOk = this.isYiTiaoLong(combine.shunZi);
      result[Enums.qingYiSe] = true;
      if (isOk) {
        // 一条龙
        result[Enums.yiTiaoLong] = true;
      }
      result.fan *= 2;
    }
    if (opt.takeSelfCard) {
      // 自己摸牌，才需要检查游金
      isOk = this.isYouJinCombine(combine);
      if (isOk) {
        result[Enums.youJinTimes] = events[Enums.youJinTimes] || 0;
        if (result[Enums.youJinTimes] === 1) {
          result.fan *= 4;
        } else if (result[Enums.youJinTimes] === 2) {
          result.fan *= 8;
        } else if (result[Enums.youJinTimes] > 2) {
          result.fan *= 16;
        }
      }
    }
    // console.debug('getMaxHuType', result, 'opt', JSON.stringify(opt), 'huCards', JSON.stringify(combine));
    // 检查是不是双金
    if (combine.replace.gold.length > 1 && rule.doubleGoldYouJin) {
      // 双金只能游金
      if (!result[Enums.youJinTimes]) {
        result.fan = 0;
        result.hu = false;
      }
    }
    return result;
  }

  // 是否听牌
  isTing(cardMap, goldCard) {
    // cardMap[goldCard]++;
    for (let card = Enums.wanzi1; card < Enums.maxValidCard; card++) {
      if (cardMap[card] > 3) {
        continue;
      }
      cardMap[card]++;
      const allCombine = this.allHuComposeByGold(cardMap, goldCard);
      cardMap[card]--;
      if (allCombine.length > 0) {
        return true;
      }
    }
    return false;
  }
}

export const manager = new CardManager();
