import * as config from "../../config"
import {service} from "../../service/importService";
import Enums from "./enums";
import huPaiDetect from "./HuPaiDetect";

export const allCards = [];
// 除花牌外的所有类型
export const allCardsTypeExcludeFlower = [];
for (let value = Enums.wanzi1; value <= Enums.wanzi9; value++) {
  allCards.push(...[value, value, value, value]);
  allCardsTypeExcludeFlower.push(value);
}
for (let value = Enums.zhong; value <= Enums.bai; value++) {
  allCards.push(...[value, value, value, value]);
  allCardsTypeExcludeFlower.push(value);
}
// 存在顺子的牌
const shunList = [[Enums.wanzi1, Enums.wanzi7]];

class CardManager {
  // 是否能吃(白板替代金牌)
  isCanChi(card, cardMap) {
    const originCard = card;

    const shunZi = [];
    if (card >= Enums.dong) {
      // 东南西北, 中发白
      return shunZi;
    }

    // 排第1位,第2位,第3位
    const pos = [[1, 2], [-1, 1], [-2, -1]]
    let list;
    let index;

    for (const p of pos) {
      if (cardMap[p[0] + card] > 0 && cardMap[p[1] + card] > 0) {
        // 可以吃
        list = [p[0] + card, p[1] + card, card].sort().slice();
        index = list.indexOf(card);
        list[index] = originCard;
        list.push(originCard);
        shunZi.push(list)
      }
    }
    return shunZi;
  }

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
}

export const manager = new CardManager();
