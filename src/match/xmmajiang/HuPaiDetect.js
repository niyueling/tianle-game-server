import Enums from './enums';
import {manager} from "./cardManager";

const cloneHuResult = function (obj) {
  const option = Object.assign({}, obj)
  delete option.options
  delete option.multiOptions

  const {useJiang, keZi, shunZi, gangZi} = obj.huCards

  const huCards = {}
  huCards.useJiang = useJiang.length > 0 ? useJiang.slice() : [];
  huCards.keZi = keZi.length > 0 ? keZi.slice() : [];
  huCards.shunZi = shunZi.length > 0 ? shunZi.slice() : [];
  huCards.gangZi = gangZi.length > 0 ? gangZi.slice() : [];

  option.huCards = huCards
  return option
}


function is258(card) {
  const mod = card % 10;
  return mod === 2 || mod === 5 || mod === 8;
}

function getType(card) {
  return Math.floor(card / 10);
}

// 替换金牌、白板
function spreadCardAndCaiShen(countMap) {
  // 金牌
  const caiShen = countMap.caiShen
  const cards = countMap.slice()
  const lastTakeCard = countMap.lastTakeCard
  const baiCount = countMap[Enums.bai] || 0
  //取出财神
  const caiCount = cards[caiShen] || 0
  // //规避财神是白板
  // cards[caiShen] = 0
  // //白板代替财神的初始位置
  // cards[caiShen] = cards[Enums.bai]
  cards[Enums.bai] = baiCount;

  return {
    cards,
    caiCount,
    caiShen,
    lastTakeCard,
    baiCount
  }
}

const CAISHEN_HOLDER = -999

const HuPaiDetect = {
  backup: (new Array(Enums.maxValidCard)).fill(0),
  check(originCountMap, events, rule, seatIndex) {
    return this.checkHuType(originCountMap, events, seatIndex, rule);
  },

  checkHuType(originCountMap, events, seatIndex, rule) {
    const maybes = this.allAvailableHuResult(originCountMap, events, seatIndex, rule)
    return this.maxHuResult(originCountMap, events, maybes, rule)
  },

  allAvailableHuResult(sourceCardMap, events, seatIndex, rule) {
    const result = {}
    let maybes = []
    const {caiShen, lastTakeCard, takeSelfCard, turn} = sourceCardMap

    const lastTakeCardAndCaiShen = {lastTakeCard, caiShen, takeSelfCard, turn, seatIndex, rule, sourceCardMap}
    const checkHuFuncArray = [
      {func: this.checkSanJinDao, args: [sourceCardMap, events, result, seatIndex, rule]},
      {func: this.checkPingHu, args: [sourceCardMap, lastTakeCardAndCaiShen, result]},
    ]

    const clear = (m) => {
      for (let v in m) {
        m[v] = null
      }
    }

    for (let checkFunc of checkHuFuncArray) {
      clear(result)
      let func = checkFunc.func
      func.apply(this, checkFunc.args)

      if (result.hu) {
        if (result.multiOptions) {
          maybes = maybes.concat(result.options)
        } else {
          maybes.push(Object.assign({}, result))
        }
      }
    }

    if (maybes.length) {
      // console.warn("maybes-%s", JSON.stringify(maybes));
    }
    return maybes;
  },

  maxHuResult(originCountMap, events, maybes, rule) {
    let sanJinDaoData = maybes[0] || {};

    if (maybes.length && maybes[0].huType === Enums.qiShouSanCai) {
      sanJinDaoData = maybes[0];

      if (maybes.length > 1) {
        maybes.splice(0, 1);
      }
    }

    const sorter = (a, b) => b.fan - a.fan
    const sortedResult = maybes
      .map(r => this.combineOtherProps(originCountMap, events, r))
      .map(r => {
        r.fan = this.calFan(Object.assign(r, {takeSelfCard: originCountMap.takeSelfCard}), rule)
        return r
      })
      .sort(sorter)

    let huInfo = {hu: false};

    if (sortedResult[0]) {
      huInfo = sortedResult[0];

      if (huInfo.huType === Enums.pingHu && sanJinDaoData.huType === Enums.qiShouSanCai) {
        huInfo.huType = Enums.qiShouSanCai;
        huInfo.sanCaiShen = true;
      }
    }

    return huInfo;
  },

  combineOtherProps(originCountMap, events, result) {
    const {turn, takeSelfCard, gang, qiangGang} = originCountMap;

    //有牌型的  13不靠 qifeng luanfeng 不需要
    if (result.huCards) {
      // 庄家抓牌就胡
      if (turn === 1) {
        if (takeSelfCard) {
          result.tianHu = true
        }
      }
    }

    // 杠上开花
    if (gang && !result.baoTou) {
      result.gangShangKaiHua = true
    }

    if (qiangGang) {
      result.qiangGang = true
    }

    if (result.huType === Enums.qiShouSanCai) {
      // 统计刻子等
      const keZi = manager.getKeZi(originCountMap);
      result.huCards = { keZi };
    }

    // 添加游金次数
    if (result.isYouJin) {
      result[Enums.youJinTimes] = events[Enums.youJinTimes] || 0;
    }
    return result;
  },

  checkPingHu(countMap, lastTakeCardAndCaiShen, result) {
    // 查找所有胡牌
    const allSearch = true
    const cards = countMap.slice()
    const caiShen = countMap.caiShen
    const caiCount = cards[caiShen]
    let baiCount = countMap[Enums.bai]
    cards[caiShen] = 0
    // 白板替金牌代表的牌
    if (caiShen === Enums.bai) {
      // 金牌是白板，把所有白板当金牌
      this.huRecur(cards, false, caiCount, lastTakeCardAndCaiShen, result, allSearch)
    } else {
      for (let useBai = 0; useBai <= baiCount; useBai++) {
        cards[caiShen] = baiCount - useBai
        cards[Enums.bai] = useBai
        this.huRecur(cards, false, caiCount, lastTakeCardAndCaiShen, result, allSearch)
        cards[caiShen] -= baiCount - useBai
        cards[Enums.bai] = baiCount
      }
    }
  },

  checkQiDui(sourceCountMap, resMap = {}) {
    let danZhang = [], duiZi = [], siZhang = [], sanZhang = []
    resMap.hu = false

    const {caiShen, caiCount, lastTakeCard} = spreadCardAndCaiShen(sourceCountMap)


    const cards = sourceCountMap.slice()
    cards[caiShen] = 0

    for (let i = 0; i < cards.length; i++) {
      switch (cards[i]) {
        case 1:
          // 单张
          danZhang.push(i);
          break;
        case 2:
          duiZi.push(i)
          break;
        case 3:
          sanZhang.push(i)
          break;
        case 4:
          siZhang.push(i)
          break;
        default:
          break;
      }
    }

    let hasDuiZi = duiZi.length + siZhang.length * 2;
    let danZhangNeedCai = danZhang.length;
    let sanZhangNeedCai = sanZhang.length;

    let remainCaiCount = caiCount - danZhangNeedCai - sanZhangNeedCai
    let useCaiDuiZiCount = hasDuiZi + danZhangNeedCai + sanZhangNeedCai * 2

    let hasDanBai = danZhang.indexOf(Enums.bai) >= 0 || sanZhang.indexOf(Enums.bai) >= 0

    if (hasDuiZi === 7) {
      resMap.hu = true
      resMap.wuCai = true
    }
    //财神的情况
    else if (remainCaiCount >= 0 && useCaiDuiZiCount >= 6) {
      resMap.hu = true
      resMap.wuCai = false

      if (hasDanBai) {
        resMap.caiShenGuiWei = true
      }

      //非财神 单数即为爆头
      if (cards[lastTakeCard] % 2 === 1 && caiShen !== lastTakeCard) {
        if (cards[lastTakeCard] === 3) {
          resMap.baoTou = true
        } else {
          resMap.qiDuiZiBaoTou = true
          resMap.baoTou = true
        }
      }

      if (remainCaiCount === 2) {
        resMap.caiShenTou = true
        if (caiShen === lastTakeCard) {
          resMap.baoTou = true
        }
        duiZi.push(CAISHEN_HOLDER)
      }

      duiZi = duiZi.concat(danZhang)
      //siZhang = siZhang.concat(sanZhang)
    }

    if (resMap.hu) {
      if (siZhang.length > 0) {
        resMap.haoQi = true
      }
      else {
        resMap.qiDui = true
      }
      resMap.huType = 'qiDui'
      resMap.huCards = {duiZi, siZhang, sanZhang}
    }

    return resMap.hu
  }
  ,


  huRecur(_countMap, _jiang, caiCount = 0, lastTakeCardAndCaiShen, result, allSearch) {
    const countMap = _countMap;
    let jiang = _jiang;

    if (!result.huCards) {
      result.huCards = {useJiang: [], keZi: [], shunZi: [], gangZi: []};
      result.hu = false;
      result.huType = Enums.pingHu;
    }

    const {useJiang, keZi, shunZi, gangZi} = result.huCards;

    if (!this.remain(countMap) && caiCount === 0) {
      if (!jiang) return false

      result.hu = true
      let exit = !allSearch   //搜索所有可能

      if (allSearch) {
        if (!result.options) {
          result.multiOptions = true
          result.options = []
        }
        let option = cloneHuResult(result)

        delete option.options
        delete option.multiOptions
        result.options.push(option)
      }
      //console.log(`${__filename}:315 huRecur`, result)
      return exit        //   递归退出条件：如果没有剩牌，则和牌返回。
    }

    let i = 1;
    // 找到有牌的地方，i就是当前牌,   PAI[i]是个数
    while (!countMap[i] && i < Enums.maxValidCard) {
      i++;
    }
    // for (; !countMap[i] && i < Enums.maxCard; i++) ;    //   找到有牌的地方，i就是当前牌,   PAI[i]是个数

    // console.log("check card i   =   ", i);                         //   跟踪信息

    //   4张组合(杠子)
    //   如果当前牌数等于4张
    if (countMap[i] === 4) {
      countMap[i] -= 4;
      gangZi.push(i)
      if (this.huRecur(countMap, jiang, caiCount, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      gangZi.splice(gangZi.indexOf(i), 1)
      countMap[i] = 4;                                     //   否则，取消4张组合
    }

    //   3张组合(大对) 自己组成刻字
    //   如果当前牌不少于3张
    if (countMap[i] >= 3) {
      countMap[i] -= 3;                                   //   减去3张牌]
      keZi.push(i)
      if (this.huRecur(countMap, jiang, caiCount, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      keZi.splice(keZi.indexOf(i), 1)
      countMap[i] += 3;                                   //   取消3张组合
    }

    // 使用财神组成刻字
    if (countMap[i] >= 2 && caiCount >= 1) {                              //   如果当前牌不少于3张
      countMap[i] -= 2;
      keZi.push(i)
      // // 无财
      // result.wuCai = false
      //
      // if (i === Enums.bai) {
      //   result.guiWeiCount += 1
      // }

      if (this.huRecur(countMap, jiang, caiCount - 1, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      //
      // if (i === Enums.bai) {
      //   result.guiWeiCount -= 1
      // }
      keZi.splice(keZi.indexOf(i), 1)
      // result.wuCai = true
      countMap[i] += 2;
    }


    // 使用2财神组成刻字
    // 如果当前牌不少于3张
    if (countMap[i] === 1 && caiCount >= 2) {
      countMap[i] -= 1;
      keZi.push(i)
      // result.wuCai = false

      // if (i === Enums.bai) {
      //   result.sanCaiYiKe = true
      // }

      if (this.huRecur(countMap, jiang, caiCount - 2, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      // if (i === Enums.bai) {
      //   result.sanCaiYiKe = false
      // }

      keZi.splice(keZi.indexOf(i), 1)
      // result.wuCai = true
      countMap[i] += 1;
    }

    // 优先用财神做刻字 和 将
    if (!_jiang && caiCount >= 2) {
      useJiang.push(CAISHEN_HOLDER)
      // result.caiShenTou = true
      // result.wuCai = false
      // 区分杠上开花

      if (lastTakeCardAndCaiShen.takeSelfCard) {
        // 检查是不是游金
        result.isYouJin = true;
      }

      if (this.huRecur(countMap, true, caiCount - 2, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      // result.caiShenTou = false
      // result.wuCai = true
      // result.baoTou = false
      result.isYouJin = false
      useJiang.pop()
    }

    if (caiCount === 3) {
      keZi.push(CAISHEN_HOLDER)
      // result.sanCaiYiKe = true
      // result.wuCai = false
      if (lastTakeCardAndCaiShen.takeSelfCard) {
        // 检查是不是游金
        result.isYouJin = true;
      }

      if (this.huRecur(countMap, jiang, caiCount - 3, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      result.isYouJin = false
      // result.wuCai = true
      keZi.splice(keZi.indexOf(CAISHEN_HOLDER), 1)
    }

    //   如果之前没有将牌，且当前牌不少于2张
    if (!_jiang && countMap[i] >= 2) {
      jiang = true;
      countMap[i] -= 2;                                   //   减去2张牌
      useJiang.push(i)
      if (this.huRecur(countMap, jiang, caiCount, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      jiang = false;
      useJiang.pop()
      countMap[i] += 2;                                   //   取消2张组合
    }


    if (!_jiang && caiCount >= 1) {
      countMap[i]--;
      useJiang.push(i)
      // result.wuCai = false
      // if (lastTakeCardAndCaiShen.lastTakeCard === i) {
      //   result.baoTou = true
      // }
      //
      // if (i === Enums.bai) {
      //   result.guiWeiCount += 1
      // }
      if (lastTakeCardAndCaiShen.takeSelfCard) {
        // 检查是不是游金
        result.isYouJin = true;
      }
      //   如果剩余的牌组合成功，和牌
      if (this.huRecur(countMap, true, caiCount - 1, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;
      }
      useJiang.pop()
      result.isYouJin = false;
      // result.baoTou = false
      // result.wuCai = true
      countMap[i]++;
      // if (i === Enums.bai) {
      //   result.guiWeiCount -= 1
      // }
    }

    // 如果剩余的牌都是金牌,则设置为游金
    if (this.remain(countMap) === caiCount) {
      result.isYouJin = true;
    }

    if (Enums.dong <= i) return false;

    //   顺牌组合，注意是从前往后组合！
    if (countMap[i] && i % 10 !== 8 && i % 10 !== 9 &&       //   排除数值为8和9的牌
      countMap[i + 1] && countMap[i + 2]) {            //   如果后面有连续两张牌
      countMap[i]--;
      countMap[i + 1]--;
      countMap[i + 2]--;                                     //   各牌数减1
      shunZi.push(i, i + 1, i + 2)
      if (this.huRecur(countMap, jiang, caiCount, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      shunZi.splice(shunZi.lastIndexOf(i), 3)
      countMap[i]++;
      countMap[i + 1]++;
      countMap[i + 2]++;                                     //   恢复各牌数

    }

    let hasNeighbour = countMap[i + 1] > 0;
    if (caiCount >= 1 && i % 10 <= 8 && hasNeighbour) {
      countMap[i]--;
      countMap[i + 1]--;
      shunZi.push(i, i + 1, CAISHEN_HOLDER)
      // const originGuiWeiCount = result.guiWeiCount
      // if (lastTakeCardAndCaiShen.caiShen === i + 2) {
      //   result.caiShenGuiWei = true
      //   result.wuCai = true
      //   result.guiWeiCount += 1
      // }
      // result.wuCai = false
      if (this.huRecur(countMap, jiang, caiCount - 1, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      shunZi.splice(shunZi.lastIndexOf(i), 3)
      countMap[i]++;
      countMap[i + 1]++;
      // result.caiShenGuiWei = false
      // result.guiWeiCount = originGuiWeiCount
      // result.wuCai = true
    }

    if (caiCount >= 1 && i % 10 <= 8 && hasNeighbour) {
      countMap[i]--;
      countMap[i + 1]--;
      shunZi.push(CAISHEN_HOLDER, i, i + 1)
      // result.wuCai = false
      // const originGuiWeiCount = result.guiWeiCount
      // if (lastTakeCardAndCaiShen.caiShen === i - 1) {
      //   result.caiShenGuiWei = true
      //   result.wuCai = true
      //   result.guiWeiCount += 1
      // }
      if (this.huRecur(countMap, jiang, caiCount - 1, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      shunZi.splice(shunZi.lastIndexOf(CAISHEN_HOLDER), 3)
      // result.caiShenGuiWei = false
      // result.guiWeiCount = originGuiWeiCount
      // result.wuCai = true
      countMap[i]++;
      countMap[i + 1]++;
    }

    let hasGap = countMap[i + 2] > 0;
    if (caiCount >= 1 && i % 10 <= 7 && hasGap) {
      countMap[i]--;
      countMap[i + 2]--;
      shunZi.push(i, CAISHEN_HOLDER, i + 2)
      // const originGuiWeiCount = result.guiWeiCount
      // if (lastTakeCardAndCaiShen.caiShen === i + 1) {
      //   result.caiShenGuiWei = true
      //   result.wuCai = true
      //   result.guiWeiCount += 1
      // }
      // result.wuCai = false
      if (this.huRecur(countMap, jiang, caiCount - 1, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      shunZi.splice(shunZi.lastIndexOf(i), 3)
      countMap[i]++;
      countMap[i + 2]++;
      // result.caiShenGuiWei = false
      // result.guiWeiCount = originGuiWeiCount
      // result.wuCai = true
    }

    if (caiCount >= 2) {
      countMap[i]--;
      shunZi.push(i, CAISHEN_HOLDER, CAISHEN_HOLDER)
      // let caiShen = lastTakeCardAndCaiShen.caiShen
      // const originGuiWeiCount = result.guiWeiCount
      // if (Enums.sameType(i, lastTakeCardAndCaiShen.caiShen) && (
      //     Math.abs(caiShen - i) === 1 ||
      //     Math.abs(caiShen - i) === 2)) {
      //   result.caiShenGuiWei = true
      //   result.guiWeiCount += 1
      // }
      // result.wuCai = false

      if (this.huRecur(countMap, jiang, caiCount - 2, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      shunZi.splice(shunZi.lastIndexOf(i), 3)
      countMap[i]++;
      // result.caiShenGuiWei = false
      // result.guiWeiCount = originGuiWeiCount
      // result.wuCai = true
    }
    //   无法全部组合，不和！
    return false;
  }
  ,
  remain(PAI) {
    let sum = 0;
    for (let i = 1; i < Enums.maxValidCard; i++) {
      sum += PAI[i];
    }
    return sum;
  },

  checkDaSiXi(countMap) {
    for (let i = 1; i < Enums.maxValidCard; i++) {
      if (countMap[i] === 4) {
        return true;
      }
    }
    return false;
  },

  checkBanBanHu(countMap) {
    for (let i = 1; i < Enums.maxValidCard; i++) {
      if (countMap[i] > 0 && is258(i)) {
        return false;
      }
    }
    return true;
  },

  checkQueYiSe(countMap) {
    let type0 = false;
    let type1 = false;
    let type2 = false;
    for (let i = 1; i < Enums.maxValidCard; i++) {
      const c = countMap[i];
      if (c > 0) {
        switch (getType(i)) {
          case 0:
            type0 = true;
            break;
          case 1:
            type1 = true;
            break;
          case 2:
            type2 = true;
            break;
          default:
            break;
        }
      }
    }
    return (!type0) || (!type1) || (!type2);
  },

  checkLiuLiuShun(countMap) {
    let kezi = 0;
    for (let i = 1; i < Enums.maxValidCard; i++) {
      if (countMap[i] === 3) {
        kezi++;
      }
    }
    return kezi > 1;
  },

  checkPengPengHu(countMap, events, resMap = {}, caiCount = 0) {
    let keZi = [];
    let duiZi = [];
    let danZi = []
    let pengArray = events[Enums.peng] ? Array.prototype.slice.call(events[Enums.peng]) : []
    let has3Peng = pengArray.length === 3;
    resMap.hu = false
    const {lastTakeCard} = countMap
    const {cards, caiShen, baiCount} = spreadCardAndCaiShen(countMap)
    cards[Enums.bai] = baiCount
    cards[caiShen] = 0

    for (let i = 1; i < Enums.maxValidCard; i++) {
      if (cards[i] === 3) {
        keZi.push(i)
      } else if (cards[i] === 2) {
        duiZi.push(i)
      } else if (cards[i] === 1) {
        danZi.push(i)
      }
    }

    if (danZi.length) {
      return false
    }

    if (caiCount > 0 && caiCount < 2) return false
    if (caiCount === 2) duiZi.push(CAISHEN_HOLDER)
    if (caiCount === 3) keZi.push(CAISHEN_HOLDER)

    if (has3Peng && keZi.length === 1 && duiZi.length === 1 && lastTakeCard === keZi[0]) {
      resMap.hu = true
      resMap.pengPengHu = true
    }

    // //财神
    // if (has3Peng && resMap.hu) {
    //   if (caiCount === 2) {
    //     (resMap.caiShenGuiWei = true)
    //   }
    //   else if (caiCount === 3) {
    //     resMap.sanCaiYiKe = true
    //   }
    // }

    if (resMap.hu) {
      resMap.huType = 'pengPengHu'
      resMap.huCards = {peng: pengArray, duiZi, keZi}
    }

    return resMap.hu;
  }
  ,

  checkJiangJiangHu(countMap, events, resMap) {
    let card258 = 0;
    for (let i = 1; i < Enums.maxValidCard; i++) {
      if (countMap[i] > 0) {
        if (!is258(i)) {
          return;
        }
        card258 += countMap[i];
      }
    }
    events[Enums.peng] && events[Enums.peng].forEach(x => {
      if (!is258(x)) {
        return;
      }
      card258 += 3;
    });
    events[Enums.mingGang] && events[Enums.mingGang].forEach(x => {
      if (!is258(x)) {
        return;
      }
      card258 += 3;
    });
    events[Enums.anGang] && events[Enums.anGang].forEach(x => {
      if (!is258(x)) {
        return;
      }
      card258 += 3;
    });
    if (card258 === 14) {
      resMap && (resMap.hu = true) && (resMap.jiangJiangHu = true);
      return true;
    }
    return false;
  }
  ,

  checkLuanFeng(sourceCountMap, events, resMap) {
    const {caiShen} = sourceCountMap
    let color = 0
    const each = (card) => {
      if (card === caiShen) return
      if (card < Enums.dong) {
        color = 1
      }
    }
    for (let e of sourceCountMap.entries()) {
      if (e[1] > 0)
        each(e[0])
    }


    events[Enums.peng] && events[Enums.peng].forEach(x => {
      each(x);
    });
    events[Enums.chi] && events[Enums.chi].forEach(combol => {
      each(combol[0]);
    });
    events[Enums.mingGang] && events[Enums.mingGang].forEach(x => {
      each(x);
    });
    events[Enums.anGang] && events[Enums.anGang].forEach(x => {
      each(x);
    });


    if (!color) {
      resMap && (resMap['hu'] = true) && (resMap['luanFeng'] = true)
      resMap.huType = 'luanFeng'
      return true
    }
    return color === 0
  }
  ,

  checkQiFeng(sourceCountMap, events = [], resMap) {
    let hasEvent = Array.prototype.slice.call(events).length > 0;
    if (hasEvent) return false;

    const cards = sourceCountMap.slice()
    const caiShen = sourceCountMap.caiShen
    const caiCount = sourceCountMap[caiShen]
    const baiCount = sourceCountMap[Enums.bai]
    const hasCai = caiCount > 0
    let hasFeng = 0;

    // if (caiShen <= Enums.bai && caiShen >= Enums.dong) {
    //   return false;
    // }
    let reallyFengCount = 0
    for (let feng = Enums.dong; feng <= Enums.bai; feng++) {
      if (sourceCountMap[feng] > 0) {
        reallyFengCount += 1
      }
    }

    for (let useCai = 0; useCai <= caiCount; useCai++) {
      for (let useBai = 0; useBai <= baiCount; useBai++) {
        cards[caiShen] += baiCount - useBai
        cards[Enums.bai] = useBai
        cards[caiShen] -= useCai

        if (this.testBuKao(cards, useCai, hasFeng, resMap)) {
          if (resMap) {
            resMap['hu'] = true
            resMap['qiFeng'] = true

            if (caiCount - useCai > 0) {
              if (caiShen >= Enums.dong && reallyFengCount === 7) {
                resMap['caiShenGuiWei'] = true
              }
              resMap.huType = 'qiFeng'
            }
          }
          return true
        }

        cards[caiShen] -= baiCount - useBai
        cards[Enums.bai] = baiCount
        cards[caiShen] += useCai
      }
    }
    return false;
  }
  ,


  check13bukao(sourceCountMap, events = [], resMap) {
    let hasEvent = Array.prototype.slice.call(events).length > 0;
    if (hasEvent) return false;

    const cards = sourceCountMap.slice()
    const caiShen = sourceCountMap.caiShen
    const caiCount = sourceCountMap[caiShen]

    const hasCai = caiCount > 0
    let baiCount = cards[Enums.bai]
    let hasFeng = 2;

    // if (caiShen <= Enums.bai && caiShen >= Enums.dong) {
    //   if (baiCount < 2) {
    //     return false;
    //   }
    // }
    for (let useCai = 0; useCai <= caiCount; useCai++) {
      for (let useBai = 0; useBai <= baiCount; useBai++) {
        cards[caiShen] += baiCount - useBai
        cards[Enums.bai] = useBai
        cards[caiShen] -= useCai

        let fengsInHand = 0
        for (let fengCard = Enums.dong; fengCard <= Enums.bai; fengCard++) {
          fengsInHand += cards[fengCard]
        }

        if (this.testBuKao(cards, useCai, hasFeng)) {
          if (resMap) {
            resMap.hu = true
            resMap['13buKao'] = true
            resMap.huType = '13buKao'

            if (caiCount - useCai > 0 && fengsInHand === 7) {
              resMap['caiShenGuiWei'] = true
            }
          }
          return true
        }
        cards[caiShen] -= baiCount - useBai
        cards[Enums.bai] = baiCount
        cards[caiShen] += useCai
      }
    }

    return false;
  }
  ,

  testBuKao(cards, caiCount, hasFeng = 2) {
    var fengCard = [];
    var bukao = [[], [], []];
    const fengCapacity = 7;
    const needFeng = fengCapacity - hasFeng;
    let lackCount = 0;
    for (var i = Enums.dong; i <= Enums.bai; i++) fengCard.push(i);

    const recordSe = (card) => {
      if (cards[card] !== 1) return;

      let idx = fengCard.indexOf(card * 1);
      let tail = card % 10;
      let color = parseInt(card / 10);


      if (idx > -1) {
        fengCard.splice(idx, 1)
      }
      else {
        if (bukao[color].length === 0) {
          bukao[color] = [tail]
          return
        }
        var sameColorCards = bukao[color];
        if (!sameColorCards) {
          bukao[color].push(tail)
        }
        else if (tail - sameColorCards[sameColorCards.length - 1] >= 3) {
          bukao[color].push(tail)
        }
        else {
          return false;
        }
      }
    }


    for (const card in cards) {
      if (cards[card] > 0) {
        recordSe(card)
      }
    }

    let reduceFengCount = fengCapacity - fengCard.length

    if (reduceFengCount > needFeng + 1) {
      return false;
    }
    if (reduceFengCount < needFeng) {
      lackCount = needFeng - reduceFengCount;
    }


    //test 七风
    if (hasFeng === 0) {
      //财神代替风
      //if (lackCount > 0) return false
      let buKaoCount = 0
      bukao.forEach(cs => buKaoCount += cs.length)
      lackCount += Math.max(7 - buKaoCount, 0)
    } else {
      //bukao.forEach(cs => lackCount += (3 - cs.length))
      let length = 0
      bukao.forEach(cs => length += cs.length)
      lackCount = 14 - length - reduceFengCount
    }
    return lackCount === caiCount
  }
  ,

  checkHunYiSe(flatCards, events, resMap, caiShen) {
    if (this.isQingYiSe(flatCards, events, false, caiShen)) {
      resMap.hunYiSe = true
      return true
    }

    return false
  }
  ,

  isQingYiSe(flatCards, events, detectFeng = true, caiShen) {
    const checkQingYiSe = detectFeng
    let type0 = false;
    let type1 = false;
    let type2 = false;
    let feng = false;
    const recordSe = (card) => {
      if (card === Enums.bai) {
        card = caiShen
      }
      switch (getType(card)) {
        case 0:
          type0 = true;
          break;
        case 1:
          type1 = true;
          break;
        case 2:
          type2 = true;
          break;
        case 3:
          feng = true;
          break;
        default:
          break;
      }
    };
    flatCards.forEach(recordSe)

    events[Enums.peng] && events[Enums.peng].forEach(x => {
      if (checkQingYiSe && x === Enums.bai) x = caiShen
      recordSe(x);
    });
    events[Enums.chi] && events[Enums.chi].forEach(combol => {
      if (checkQingYiSe && combol[0] === Enums.bai) combol[0] = caiShen
      recordSe(combol[0]);
    });
    events[Enums.mingGang] && events[Enums.mingGang].forEach(x => {
      if (checkQingYiSe && x === Enums.bai) x = caiShen
      recordSe(x);
    });
    events[Enums.anGang] && events[Enums.anGang].forEach(x => {
      if (checkQingYiSe && x === Enums.bai) x = caiShen
      recordSe(x);
    });

    if (detectFeng === feng) {
      return false;
    }

    let se = 0;
    type0 && (se++);
    type1 && (se++);
    type2 && (se++);

    return se === 1;
  },

  checkQingYiSe(flatCards, events, resMap, caiShen) {
    // if (this.isQingYiSe(flatCards, events, true, caiShen)) {
    //   resMap.qingYiSe = true
    //   return true;
    // }
    return false;
  },

  backUpCards(countMap) {
    for (let i = 0; i < countMap.length; i++) {
      this.backup[i] = countMap[i];
    }
  },

  recoverCards(countMap) {
    const mapRef = countMap;
    for (let i = 0; i < this.backup.length; i++) {
      mapRef[i] = this.backup[i];
    }
  },

  // 3金倒
  checkSanJinDao(countMap, events, result, seatIndex, rule) {
    const turn = countMap.turn
    // if (seatIndex < 0) return false;
    // if (turn > 4 || turn > seatIndex + 1) {
    //   return false
    // }
    if (rule.sanJinMustQiShou) {
      // 3金倒必起手
      if (turn > 4 || turn > seatIndex + 1 || seatIndex < 0) {
        return false
      }
    }
    // console.warn("caishen-%s, caiCount-%s", countMap.caiShen, countMap[countMap.caiShen]);
    // 3金倒不必起手
    if (countMap[countMap.caiShen] >= 3) {
      result.hu = true;
      result.huType = Enums.qiShouSanCai
      result[Enums.sanCaiShen] = true;
      return true;
    }
    return false;
  },

  checkPropertiesAndGetHitsWithFan(result, propsTimesArr) {
    let hits = 0
    let fan = 1
    propsTimesArr.forEach(propAndTimes => {
      if (result[propAndTimes.prop]) {
        fan *= propAndTimes.times
        hits += 1
      }
    })
    return {hits, fan}
  },

  getPropertiesAndTimes(rule){
    return [
      // {prop: Enums.qingYiSe, times: 4},
      {prop: Enums.tianHu, times: 4},
      // {prop: Enums.diHu, times: 4},
      // 3金倒
      {prop: Enums.sanCaiShen, times: 4},
      {prop: Enums.qiangGang, times: 2},
      // {prop: Enums.pengPengHu, times: 2},
    ];
  },

  calculateNormalGroup(result, rule) {
    const propertiesAndTimes = this.getPropertiesAndTimes(rule)

    let {fan} = this.checkPropertiesAndGetHitsWithFan(result, propertiesAndTimes)
    if (result.isYouJin) {
      if (result.youJinTimes === 1) {
        fan *= 4;
      } else if (result.youJinTimes === 2) {
        fan *= 8;
      } else if (result.youJinTimes > 2) {
        fan *= 16;
      }
    }

    return fan
  },

  // 计番
  calFan(result, rule) {
    let fan = 1
    fan *= this.calculateNormalGroup(result, rule)
    return fan
  },
}

export default HuPaiDetect;
