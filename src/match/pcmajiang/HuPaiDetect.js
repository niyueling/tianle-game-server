import Enums from './enums';

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

const changShaMajiangCards =
  [
    1, 2, 3, 4, 5, 6, 7, 8, 9,
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 23, 24, 25, 26, 27, 28, 29,
  ];

function spreadCardAndCaiShen(countMap) {
  const caiShen = countMap.caiShen
  const cards = countMap.slice()
  const lastTakeCard = countMap.lastTakeCard
  const baiCount = countMap[Enums.bai]
  //取出财神
  const caiCount = cards[caiShen] || 0
  //规避财神是白板
  cards[caiShen] = 0
  //白板代替财神的初始位置
  cards[caiShen] = cards[Enums.bai]
  cards[Enums.bai] = 0

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
  backup: (new Array(38)).fill(0),
  check(originCountMap, events, rule, seatIndex) {
    return this.checkHuType(originCountMap, events, seatIndex, rule)
  },

  checkHuType(originCountMap, events, seatIndex, rule) {
    const maybes = this.allAvailableHuResult(originCountMap, events, seatIndex)
    return this.maxHuResult(originCountMap, events, maybes, rule)
  },

  allAvailableHuResult(sourceCardMap, events, seatIndex) {
    const result = {}
    let maybes = []
    const {caiCount, lastTakeCard} = spreadCardAndCaiShen(sourceCardMap);
    const {caiShen} = sourceCardMap

    const lastTakeCardAndCaiShen = {lastTakeCard, caiShen}
    const checkHuFuncArray = [
      {func: this.checkQiDui, args: [sourceCardMap, result]},
      // {func: this.checkQiFeng, args: [sourceCardMap, events, result]},
      // {func: this.checkPengPengHu, args: [sourceCardMap, events, result, caiCount]},
      // {func: this.checkLuanFeng, args: [sourceCardMap, events, result]},
      // {func: this.check13bukao, args: [sourceCardMap, events, result]},
      // {func: this.checkQiShouSanCai, args: [sourceCardMap, events, result, seatIndex]},
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

    return maybes;
  },

  maxHuResult(originCountMap, events, maybes, rule) {
    const usable = rule.ro.kehu || []
    const sorter = (a, b) => b.fan - a.fan

    const sortedResult = maybes

      .filter(r => !(r.qiShouSanCai && usable.indexOf('qiShouSanCai') === -1))
      .map(r => this.combineOtherProps(originCountMap, events, r))
      .map(r => {
        r.fan = this.calFan(Object.assign(r, {takeSelfCard: originCountMap.takeSelfCard}), rule)
        return r
      })
      .sort(sorter)

    const maxResult = sortedResult[0] || {hu: false}
    // if (maxResult.fan >= 16) {
    //   maxResult.fan = 16
    // }

    return maxResult
  },

  combineOtherProps(originCountMap, events, result) {
    const {first, alreadyTakenCard, haiDi, takeSelfCard, gang, qiangGang, qiaoXiang, caiShen} = originCountMap
    const caiCount = originCountMap[caiShen]
    const clearCaiShenHolder2Flat = () => {
      let flatCards = []
      for (let groupName in result.huCards) {
        let cardGroup = result.huCards[groupName]
        let idx = -1
        while ((idx = cardGroup.indexOf(CAISHEN_HOLDER)) !== -1) {
          cardGroup.splice(idx, 1)
        }
        flatCards = flatCards.concat(cardGroup)
      }
      return flatCards
    }

    const checkPengPengHuAndAssignProps = () => {
      const shunZi = result.huCards.shunZi
      const extras = events[Enums.chi]
      if (shunZi && shunZi.length === 0 && !extras) {
        result.huType = 'pengPengHu'
        result.pengPengHu = true
      }
    }

    result.baoTou = qiaoXiang

    //有牌型的  13不靠 qifeng luanfeng 不需要
    if (result.huCards) {
      checkPengPengHuAndAssignProps()
      const flatCards = clearCaiShenHolder2Flat()


      this.checkQingYiSe(flatCards.slice(), events, result, caiShen)
      if (result.huType === 'pingHu') {
        this.checkYiTiaoLong(result)
        this.checkQuanQiuRen(originCountMap.slice(), events, result)
      }

      if (first) {
        if (takeSelfCard) {
          result.tianHu = true
        }
        if (alreadyTakenCard === false) {
          result.diHu = true
        }
      }
    }

    if (haiDi && takeSelfCard) {
      // result.haiDiLaoYue = true
    }


    if (gang) {
      if (result.baoTou) {
        result.baoTou = false
        result.gangBao = true
      } else {
        result.gangShangKaiHua = true
      }
    }

    if (qiangGang) {
      result.qiangGang = true
    }

    if (result.wuCai === undefined) {
      result.wuCai = true
    }

    if (result.guiWeiCount > 0) {
      result.caiShenGuiWei = true
      if (result.guiWeiCount === 2) {
        result.shuangCaiGuiWei = true
        delete result.caiShenGuiWei
      } else if (result.guiWeiCount === 3) {
        result.sanCaiGuiWei = true
        delete result.caiShenGuiWei
      }
    }

    if (caiCount === 3) {
      result.sanCaiShen = true
    }

    return result
  },

  checkPingHu(countMap, lastTakeCardAndCaiShen, result) {
    const allSearch = true
    const cards = countMap.slice()
    const caiShen = countMap.caiShen
    const caiCount = cards[caiShen]
    let baiCount = countMap[Enums.bai]

    cards[caiShen] = 0

    for (let useBai = 0; useBai <= baiCount; useBai++) {
      cards[caiShen] += baiCount - useBai
      cards[Enums.bai] = useBai

      this.huRecur(cards, false, caiCount, lastTakeCardAndCaiShen, result, allSearch)

      cards[caiShen] -= baiCount - useBai
      cards[Enums.bai] = baiCount
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
          // resMap.qiDuiZiBaoTou = true
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
      if (siZhang.length === 1) {
        resMap.haoQi = true
        resMap.huType = 'haoQi'
      } else if (siZhang.length === 2) {
        resMap.shuangHaoQi = true
        resMap.huType = 'shuangHaoQi'
      } else if (siZhang.length === 3) {
        resMap.sanHaoQi = true
        resMap.huType = 'sanHaoQi'
      } else {
        resMap.qiDui = true
        resMap.huType = 'qiDui'
      }

      resMap.huCards = {duiZi, siZhang, sanZhang}
    }

    return resMap.hu
  }
  ,


  huRecur(_countMap, _jiang, caiCount = 0, lastTakeCardAndCaiShen, result, allSearch) {
    const countMap = _countMap;
    let jiang = _jiang;

    if (!result.huCards) {
      result.huCards = {useJiang: [], keZi: [], shunZi: [], gangZi: []}
      result.hu = false
      result.huType = 'pingHu'
      result.guiWeiCount = 0
    }

    const {useJiang, keZi, shunZi, gangZi} = result.huCards

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
      return exit        //   递归退出条件：如果没有剩牌，则和牌返回。
    }
    let i = 1;
    for (; !countMap[i] && i < 38; i++) ;    //   找到有牌的地方，i就是当前牌,   PAI[i]是个数

    // console.log("i   =   ", i);                         //   跟踪信息

    //   4张组合(杠子)
    if (countMap[i] === 4) {                               //   如果当前牌数等于4张
      countMap[i] -= 4;                                     //   除开全部4张牌
      gangZi.push(i)
      if (this.huRecur(countMap, jiang, caiCount, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      gangZi.splice(gangZi.indexOf(i), 1)
      countMap[i] = 4;                                     //   否则，取消4张组合
    }

    //   3张组合(大对) 自己组成刻字
    if (countMap[i] >= 3) {                              //   如果当前牌不少于3张
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
      result.wuCai = false

      if (i === Enums.bai) {
        result.guiWeiCount += 1
      }

      if (this.huRecur(countMap, jiang, caiCount - 1, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }

      if (i === Enums.bai) {
        result.guiWeiCount -= 1
      }
      keZi.splice(keZi.indexOf(i), 1)
      result.wuCai = true
      countMap[i] += 2;
    }


    // 使用 2财神组成刻字
    if (countMap[i] == 1 && caiCount >= 2) {                              //   如果当前牌不少于3张
      countMap[i] -= 1;
      keZi.push(i)
      result.wuCai = false

      if (i === Enums.bai) {
        result.sanCaiYiKe = true
      }

      if (this.huRecur(countMap, jiang, caiCount - 2, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      if (i === Enums.bai) {
        result.sanCaiYiKe = false
      }

      keZi.splice(keZi.indexOf(i), 1)
      result.wuCai = true
      countMap[i] += 1;
    }


    //优先用财神做刻字 和 将
    if (!_jiang && caiCount >= 2) {
      useJiang.push(CAISHEN_HOLDER)
      result.caiShenTou = true
      result.wuCai = false
      if (lastTakeCardAndCaiShen.lastTakeCard === lastTakeCardAndCaiShen.caiShen) {
        result.baoTou = true
      }
      if (this.huRecur(countMap, true, caiCount - 2, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      result.caiShenTou = false
      result.wuCai = true
      result.baoTou = false
      useJiang.pop()
    }

    if (caiCount === 3) {
      keZi.push(CAISHEN_HOLDER)
      result.sanCaiYiKe = true
      result.wuCai = false
      if (this.huRecur(countMap, jiang, caiCount - 3, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      result.sanCaiYiKe = false
      result.wuCai = true
      keZi.splice(keZi.indexOf(CAISHEN_HOLDER), 1)
    }


    if (!_jiang && countMap[i] >= 2) {          //   如果之前没有将牌，且当前牌不少于2张
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
      result.wuCai = false
      if (lastTakeCardAndCaiShen.lastTakeCard == i) {
        result.baoTou = true
      }

      if (i === Enums.bai) {
        result.guiWeiCount += 1
      }


      if (this.huRecur(countMap, true, caiCount - 1, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      result.baoTou = false
      result.wuCai = true
      useJiang.pop()
      if (i === Enums.bai) {
        result.guiWeiCount -= 1
      }
      countMap[i]++;
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
      const originGuiWeiCount = result.guiWeiCount
      if (lastTakeCardAndCaiShen.caiShen === i + 2) {
        result.caiShenGuiWei = true
        result.wuCai = true
        result.guiWeiCount += 1
      }
      result.wuCai = false
      if (this.huRecur(countMap, jiang, caiCount - 1, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      shunZi.splice(shunZi.lastIndexOf(i), 3)
      result.caiShenGuiWei = false
      result.guiWeiCount = originGuiWeiCount
      result.wuCai = true
      countMap[i]++;
      countMap[i + 1]++;
    }

    if (caiCount >= 1 && i % 10 <= 8 && hasNeighbour) {
      countMap[i]--;
      countMap[i + 1]--;
      shunZi.push(CAISHEN_HOLDER, i, i + 1)
      result.wuCai = false
      const originGuiWeiCount = result.guiWeiCount
      if (lastTakeCardAndCaiShen.caiShen === i - 1) {
        result.caiShenGuiWei = true
        result.wuCai = true
        result.guiWeiCount += 1
      }
      if (this.huRecur(countMap, jiang, caiCount - 1, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      shunZi.splice(shunZi.lastIndexOf(CAISHEN_HOLDER), 3)
      result.caiShenGuiWei = false
      result.guiWeiCount = originGuiWeiCount
      result.wuCai = true
      countMap[i]++;
      countMap[i + 1]++;
    }

    let hasGap = countMap[i + 2] > 0;
    if (caiCount >= 1 && i % 10 <= 7 && hasGap) {
      countMap[i]--;
      countMap[i + 2]--;
      shunZi.push(i, CAISHEN_HOLDER, i + 2)
      const originGuiWeiCount = result.guiWeiCount
      if (lastTakeCardAndCaiShen.caiShen === i + 1) {
        result.caiShenGuiWei = true
        result.wuCai = true
        result.guiWeiCount += 1
      }
      result.wuCai = false
      if (this.huRecur(countMap, jiang, caiCount - 1, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      shunZi.splice(shunZi.lastIndexOf(i), 3)
      result.caiShenGuiWei = false
      result.guiWeiCount = originGuiWeiCount
      result.wuCai = true
      countMap[i]++;
      countMap[i + 2]++;
    }

    if (caiCount >= 2) {
      countMap[i]--;
      let caiShen = lastTakeCardAndCaiShen.caiShen

      shunZi.push(i, CAISHEN_HOLDER, CAISHEN_HOLDER)
      const originGuiWeiCount = result.guiWeiCount

      if (Enums.sameType(i, lastTakeCardAndCaiShen.caiShen) && (
          Math.abs(caiShen - i) === 1 ||
          Math.abs(caiShen - i) === 2)) {
        result.caiShenGuiWei = true
        result.guiWeiCount += 1
      }
      result.wuCai = false

      if (this.huRecur(countMap, jiang, caiCount - 2, lastTakeCardAndCaiShen, result, allSearch)) {
        return true;             //   如果剩余的牌组合成功，和牌
      }
      shunZi.splice(shunZi.lastIndexOf(i), 3)
      result.caiShenGuiWei = false
      result.guiWeiCount = originGuiWeiCount
      result.wuCai = true
      countMap[i]++;
    }


    //   无法全部组合，不和！
    return false;
  }
  ,
  remain(PAI) {
    let sum = 0;
    for (let i = 1; i < 38; i++) {
      sum += PAI[i];
    }
    return sum;
  }
  ,

  checkDaSiXi(countMap) {
    for (let i = 1; i < 38; i++) {
      if (countMap[i] === 4) {
        return true;
      }
    }
    return false;
  }
  ,

  checkBanBanHu(countMap) {
    for (let i = 1; i < 38; i++) {
      if (countMap[i] > 0 && is258(i)) {
        return false;
      }
    }
    return true;
  }
  ,

  checkQueYiSe(countMap) {
    let type0 = false;
    let type1 = false;
    let type2 = false;
    for (let i = 1; i < 38; i++) {
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
    for (let i = 1; i < 38; i++) {
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

    for (let i = 1; i < 38; i++) {
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

    //财神
    if (has3Peng && resMap.hu) {
      if (caiCount === 2) {
        (resMap.caiShenGuiWei = true)
      }
      else if (caiCount === 3) {
        resMap.sanCaiYiKe = true
      }
    }

    if (resMap.hu) {
      resMap.huType = 'pengPengHu'
      resMap.huCards = {peng: pengArray, duiZi, keZi}
    }

    return resMap.hu;
  }
  ,

  checkJiangJiangHu(countMap, events, resMap) {
    let card258 = 0;
    for (let i = 1; i < 38; i++) {
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
      if (card == caiShen) return
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
    return color == 0
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
      if (cards[card] != 1) return;

      let idx = fengCard.indexOf(card * 1);
      let tail = card % 10;
      let color = parseInt(card / 10);


      if (idx > -1) {
        fengCard.splice(idx, 1)
      }
      else {
        if (bukao[color].length == 0) {
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


    for (var card in cards) {
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
      if (checkQingYiSe && x == Enums.bai) x = caiShen
      recordSe(x);
    });
    events[Enums.chi] && events[Enums.chi].forEach(combol => {
      if (checkQingYiSe && combol[0] == Enums.bai) combol[0] = caiShen
      recordSe(combol[0]);
    });
    events[Enums.mingGang] && events[Enums.mingGang].forEach(x => {
      if (checkQingYiSe && x == Enums.bai) x = caiShen
      recordSe(x);
    });
    events[Enums.anGang] && events[Enums.anGang].forEach(x => {
      if (checkQingYiSe && x == Enums.bai) x = caiShen
      recordSe(x);
    });

    if (detectFeng == feng) {
      return false;
    }

    let se = 0;
    type0 && (se++);
    type1 && (se++);
    type2 && (se++);

    return se === 1;
  }
  ,

  checkQingYiSe(flatCards, events, resMap, caiShen) {
    if (this.isQingYiSe(flatCards, events, true, caiShen)) {
      resMap.qingYiSe = true
      return true;
    }
    return false;
  },

  checkQuanQiuRen(countMap, events, result) {
    let cardsInHand = 0;
    for (let i = 1; i < 38; i++) {
      cardsInHand += countMap[i]
      if (cardsInHand > 2)
        return
    }

    if (cardsInHand <= 2) {

      result.quanQiuRen = true;
      result.baoTou = false;

    }
  }
  ,

  backUpCards(countMap) {
    for (let i = 0; i < countMap.length; i++) {
      this.backup[i] = countMap[i];
    }
  }
  ,

  recoverCards(countMap) {
    const mapRef = countMap;
    for (let i = 0; i < this.backup.length; i++) {
      mapRef[i] = this.backup[i];
    }
  }
  ,

  checkTingPai(countMap_, events, rule) {
    const countMap = countMap_;
    for (let i = changShaMajiangCards.length - 1; i >= 0; i--) {
      const supposed = changShaMajiangCards[i];
      if (countMap[supposed] < 4) {
        countMap[supposed]++;
        this.backUpCards(countMap);
        const hu = this.checkQiDui(countMap, events)
          || this.checkJiangJiangHu(countMap, events)
          || this.checkPengPengHu(countMap, events)
          || this.huRecur(countMap, false, rule);
        this.recoverCards(countMap);
        countMap[supposed]--;
        if (hu) {
          return true;
        }
      }
    }
    return false;
  },

  checkYiTiaoLong(result) {
    const cards = result.huCards.shunZi
    let long = [], found = false
    for (let card = 0; card < 38; card++) {
      if (cards.indexOf(card) > -1) {
        long.push(card)
      }
      if (card % 10 === 9) {
        found = (long.length === 9);
        if (found) {
          result['yiTiaoLong'] = true
          break
        }
        long = []
      }
    }
    return found;
  }
  ,

  checkQiShouSanCai(countMap, events, resMap, seatIndex) {
    let turn = countMap.turn
    if (seatIndex < 0) return false;
    if (turn > 4 || turn > seatIndex + 1)
      return false

    if (countMap[countMap.caiShen] >= 3) {
      resMap && (resMap['hu'] = true) && (resMap['qiShouSanCai'] = true)
      resMap.huType = 'qiShouSanCai'
      return true;
    }

    return false;
  }
  ,

  mayCaiShenTou(sourceCards) {
    const {cards, caiCount} = spreadCardAndCaiShen(sourceCards)
    if (caiCount < 2) return false
    const qiDuiResult = {}
    this.checkQiDui(sourceCards, qiDuiResult)

    return this.huRecur(cards, true, caiCount - 2, {
      lastTakeCard: sourceCards.lastTakeCard,
      caiShen: sourceCards.caishen
    }, {}) || qiDuiResult.caiShenTou
  }
  ,
  checkQiaoXiang(sourceCards) {
    const {cards, caiShen, caiCount} = spreadCardAndCaiShen(sourceCards)
    const qiDuiQiaoXiangCards = Object.assign([], sourceCards)
    let canAddCard = -1
    for (let i = 1; i < Enums.bai; i++) {
      if (qiDuiQiaoXiangCards[i] == 0 && i !== caiShen) {
        canAddCard = i
        break
      }
    }
    //加任意牌能胡
    qiDuiQiaoXiangCards[canAddCard] += 1

    const pingHuQiaoXiang = this.huRecur(cards, true, caiCount - 1, {
      lastTakeCard: sourceCards.lastTakeCard,
      caiShen: sourceCards.caishen
    }, {})
    return pingHuQiaoXiang || this.checkQiDui(qiDuiQiaoXiangCards, {})
  }
  ,

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
    if(!rule.useCaiShen || rule.hzlz_option === 'all'){
      return [
        {prop: 'qingYiSe', times: 4},
        {prop: 'tianHu', times: 4},
        {prop: 'diHu', times: 4},
        // {prop: 'quanQiuRen', times: 4},
        // {prop: '13buKao', times: 1},
        // {prop: 'qiFeng', times: 2},
        // {prop: 'luanFeng', times: 8},
        // {prop: 'caiShenTou', times: 4},
        // {prop: 'sanCaiYiKe', times: 4},
        // {prop: 'gangBao', times: 4},
        // {prop: 'qiShouSanCai', times: 2},
        // {prop: 'gangShangKaiHua', times: 2},
        // {prop: 'gangShangPao', times: 2},
        // {prop: 'haiDiLaoYue', times: 2},
        // {prop: 'haiDiPao', times: 2},
        // {prop: 'caiShenGuiWei', times: 2},
        // {prop: 'shuangCaiGuiWei', times: 4},
        // {prop: 'sanCaiGuiWei', times: 8},
        {prop: 'qiangGang', times: 2},
        {prop: 'pengPengHu', times: 2},
        {prop: 'qiDui', times: 2},
        {prop: 'haoQi', times: 4},
        {prop: 'shuangHaoQi', times: 8},
        {prop: 'sanHaoQi', times: 16},
      ]
    }
    if(rule.hzlz_option === 'qidui'){
      return [
        {prop: 'qiDui', times: 2},
        {prop: 'haoQi', times: 4},
        {prop: 'shuangHaoQi', times: 8},
        {prop: 'sanHaoQi', times: 16},
      ]
    }
    return []
  },

  // calculateWuCaiEffectGroup(result, rule) {
  //   const keHu = rule.ro.kehu || []
  //   const specialTimes = (t) => t
  //
  //   const propertiesAndTimes = rule.useCaiShen ? [] : [
  //     {prop: 'pengPengHu', times: 2},
  //     {prop: 'qiDui', times: 2},
  //     {prop: 'haoQi', times: 4},
  //   ]
  //   let {hits, fan} = this.checkPropertiesAndGetHitsWithFan(result, propertiesAndTimes)
  //
  //   if (hits > 0 && result.wuCai) {
  //     // fan *= specialTimes(2)
  //   }
  //   return fan
  // },

  calculateNormalGroup(result, rule) {
    const keHu = rule.ro.kehu || []
    const specialTimes = (t) => t

    const propertiesAndTimes = this.getPropertiesAndTimes(rule)

    if (result.qiDuiZiBaoTou) {
      delete result.baoTou
      delete result.qiDui
      delete result.haoQi
    }

    let {fan} = this.checkPropertiesAndGetHitsWithFan(result, propertiesAndTimes)


    if (result.qiDuiZiBaoTou) {
      // fan *= specialTimes(4);
    }

    if (result.sanCaiShen) {
      // fan *= 2
    }

    if (result.baoTou) {
      // if (!result.takeSelfCard) {
      //   delete result.baoTou;
      // } else {
      //   fan *= specialTimes(2);
      // }
    }

    return fan
  },

  calFan(result, rule) {
    let fan = 1
    fan *= this.calculateNormalGroup(result, rule)
    // fan *= this.calculateWuCaiEffectGroup(result, rule)
    return fan
  }
}

export default HuPaiDetect;
