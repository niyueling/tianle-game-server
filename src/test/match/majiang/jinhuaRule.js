/**
 * Created by jone on 23/10/2016.
 */
'use strict'

import * as chai from 'chai'
import HuPaiDetect from '../../../match/majiang/HuPaiDetect';
import Enums from '../../../match/majiang/enums';
import huCardFactory from './huCardType'
import {genCardArray}  from '../../../match/majiang/player_state'

const expect = chai.expect;

const genAssistList = (cards, card) => {
  const assistList = new Array(38).fill(0);
  card && (assistList[card] = 1);
  cards.forEach(x => {
    if (x !== Enums.slotNoCard) {
      assistList[x]++;
    }
  });
  return assistList;
};


describe('gen card', function () {
  it('card array', function () {
    const cards = [
      Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.zhong,
      Enums.wanzi1, Enums.wanzi1, Enums.wanzi7,
      Enums.tongzi1, Enums.tongzi4, Enums.tongzi7,
      Enums.shuzi1, Enums.shuzi4, Enums.shuzi7
    ];


    const assistList = genAssistList(cards)
    assistList.takeSelf = true
    assistList.caisheng = Enums.xi

    const cardArray = genCardArray(assistList)
    expect(cardArray.sort()).to.deep.equal(cards.sort())
  })
})

describe('13不靠', () => {
  it('5风牌 + 3 * 147 = 14 无财神', () => {
    const cards = [Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.zhong,
      Enums.wanzi1, Enums.wanzi4, Enums.wanzi7,
      Enums.tongzi1, Enums.tongzi4, Enums.tongzi7,
      Enums.shuzi1, Enums.shuzi4, Enums.shuzi7
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.shuzi3
    const resMap = {}
    const pass = HuPaiDetect.check13bukao(assistList, [], resMap)
    expect(pass).be.true;
    expect(resMap.hu).be.true;
    expect(resMap['13buKao']).be.true;
  });

  it('5风牌 + 混色 3 6 9 无财神 fail', () => {
    // + 3 6 9
    const cards5 = [Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.zhong,
      Enums.tongzi3, Enums.wanzi6, Enums.wanzi9,
      Enums.shuzi1, Enums.shuzi4, Enums.shuzi7,
      Enums.tongzi1, Enums.tongzi4, Enums.tongzi7
    ];
    const assistList = genAssistList(cards5)
    assistList.caiShen = Enums.shuzi3
    const fail5 = HuPaiDetect.check13bukao(assistList)
    expect(fail5).be.false;
  })

  it('6风牌 也能胡', () => {
    const cards1 = [
      Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.zhong, Enums.fa,
      Enums.wanzi3, Enums.wanzi6, Enums.wanzi9,
      Enums.shuzi1, Enums.shuzi4, Enums.shuzi7,
      Enums.tongzi1, Enums.tongzi4,
    ];
    const assistList = genAssistList(cards1)
    assistList.caiShen = Enums.shuzi3
    const pass = HuPaiDetect.check13bukao(assistList)
    expect(pass).be.be.true
  })

  it('缺1 + 1财神 pass', () => {
    const cards1 = [Enums.zhong, Enums.dong, Enums.xi, Enums.nan, Enums.bei,
      Enums.wanzi3, Enums.wanzi6, Enums.wanzi9,
      Enums.shuzi1, Enums.shuzi4, Enums.shuzi7,
      Enums.tongzi1, Enums.tongzi4,
      Enums.tongzi8
    ];
    const assistList = genAssistList(cards1)
    assistList.caiShen = Enums.tongzi8
    const resMap = {}
    const pass = HuPaiDetect.check13bukao(assistList, [], resMap)
    expect(pass).be.true;
  })

  it('缺3 + 3财神 pass', () => {
    const cards1 = [Enums.zhong, Enums.dong, Enums.xi, Enums.nan, Enums.bei,
      Enums.wanzi2,
      Enums.shuzi1, Enums.shuzi4, Enums.shuzi7,
      Enums.tongzi1, Enums.tongzi4,
      Enums.tongzi8, Enums.tongzi8, Enums.tongzi8
    ];
    const assistList = genAssistList(cards1)
    assistList.caiShen = Enums.tongzi8
    const resMap = {}
    const pass = HuPaiDetect.check13bukao(assistList, [], resMap)
    expect(pass).be.true;
  })

  it('财神归位 pass', () => {
    const cards1 = [Enums.zhong, Enums.dong, Enums.xi, Enums.nan, Enums.bei,
      Enums.wanzi1, Enums.wanzi4, Enums.wanzi7,
      Enums.shuzi1, Enums.shuzi4, Enums.shuzi7,
      Enums.tongzi2, Enums.tongzi5, Enums.tongzi8,
    ];
    const assistList = genAssistList(cards1)
    assistList.caiShen = Enums.tongzi8
    const resMap = {}
    const pass = HuPaiDetect.check13bukao(assistList, [], resMap)
    expect(pass).be.true;
    expect(resMap.hu).be.true;
    expect(resMap['13buKao']).be.true;
  })

  it.skip('2个财神 1归位 1替牌 pass', () => {
    const cards1 = [Enums.zhong, Enums.dong, Enums.xi, Enums.nan, Enums.bei,
      Enums.wanzi1, Enums.wanzi7,
      Enums.shuzi1, Enums.shuzi4, Enums.shuzi7,
      Enums.tongzi2, Enums.tongzi5, Enums.tongzi8,
      Enums.tongzi8
    ];
    const assistList = genAssistList(cards1)
    assistList.caiShen = Enums.tongzi8
    const resMap = {}
    const pass = HuPaiDetect.check13bukao(assistList, [], resMap)
    expect(pass).be.true;
    expect(resMap.hu).be.true;
    expect(resMap['13buKao']).be.true;
    expect(resMap['caiShenGuiWei']).be.true;
  })

  it('3个财神 2个白板->1个替换 pass', () => {
    const cards1 = [Enums.zhong, Enums.dong, Enums.xi, Enums.nan, Enums.bai,
      Enums.bai,
      Enums.wanzi1,
      Enums.shuzi1, Enums.shuzi4,
      Enums.tongzi2, Enums.tongzi5,
      Enums.tongzi8, Enums.tongzi8, Enums.tongzi8,
    ];
    const assistList = genAssistList(cards1)
    assistList.caiShen = Enums.tongzi8
    const resMap = {}
    const pass = HuPaiDetect.check13bukao(assistList, [], resMap)
    expect(pass).be.true;
    expect(resMap.hu).be.true;
    expect(resMap['13buKao']).be.true;
  })

  it('2个财神 1归位 1替牌 2白板 1替换 1归位 pass', () => {
    const cards1 = [Enums.zhong, Enums.dong, Enums.xi, Enums.bai,
      Enums.bai,
      Enums.wanzi1, Enums.wanzi7,
      Enums.shuzi1, Enums.shuzi4, Enums.shuzi7,
      Enums.tongzi2, Enums.tongzi5,
      Enums.tongzi8, Enums.tongzi8
    ];
    const assistList = genAssistList(cards1)
    assistList.caiShen = Enums.tongzi8
    const resMap = {}
    const pass = HuPaiDetect.check13bukao(assistList, [], resMap)
    expect(pass).be.true;
    expect(resMap.hu).be.true;
    expect(resMap['13buKao']).be.true;
  })

  it('财神为风牌 1张白板 fail', () => {
    const cards1 = [Enums.bai, Enums.zhong, Enums.xi, Enums.nan, Enums.bei,
      Enums.tongzi3, Enums.wanzi6, Enums.wanzi9,
      Enums.shuzi1, Enums.shuzi4, Enums.shuzi7,
      Enums.tongzi1, Enums.tongzi4, Enums.tongzi7
    ];
    const assistList = genAssistList(cards1)
    assistList.caiShen = Enums.dong
    const pass = HuPaiDetect.check13bukao(assistList)
    expect(pass).be.false;
  })


  it('财神为风牌 必须2张白板 pass', () => {
    const cards1 = [Enums.bai, Enums.bai, Enums.xi, Enums.nan, Enums.bei,
      Enums.wanzi3, Enums.wanzi6, Enums.wanzi9,
      Enums.shuzi1, Enums.shuzi4, Enums.shuzi7,
      Enums.tongzi1, Enums.tongzi4, Enums.tongzi7
    ];
    const assistList = genAssistList(cards1)
    assistList.caiShen = Enums.dong
    const resMap = {}
    const pass = HuPaiDetect.check13bukao(assistList, [], resMap)
    expect(pass).be.true;
  })

  it('财神为风牌 缺1 + 1财 pass', () => {
    const cards1 = [Enums.bai, Enums.bai, Enums.xi, Enums.nan, Enums.bei,
      Enums.dong,
      Enums.wanzi3, Enums.wanzi9,
      Enums.shuzi1, Enums.shuzi4, Enums.shuzi7,
      Enums.tongzi1, Enums.tongzi4, Enums.tongzi7
    ];
    const assistList = genAssistList(cards1)
    assistList.caiShen = Enums.dong
    const resMap = {}
    const pass = HuPaiDetect.check13bukao(assistList, [], resMap)
    expect(pass).be.true;
  })
})

describe('平胡 ', () => {
  const resMap = {}
  it('将 + 顺子  pass', function () {
    const cards1 = [Enums.dong, Enums.dong, Enums.tongzi1, Enums.tongzi2, Enums.tongzi3,];
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.huRecur(assistList1, false, 0, null, resMap)
    expect(pass).be.true;
  })

  it('将 + 刻字  pass', function () {
    const cards1 = [Enums.dong, Enums.dong, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1,];
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.huRecur(assistList1, false, 0, null, resMap)
    expect(pass).be.true;
  })

  it('将 + 杠  pass', function () {
    const cards1 = [Enums.dong, Enums.dong, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1];
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.huRecur(assistList1, false, 0, null, resMap)
    expect(pass).be.true;
  })

  it('2对 + 1财神 pass ', function () {
    const cards1 = [Enums.dong, Enums.dong, Enums.tongzi1, Enums.tongzi1];
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.huRecur(assistList1, false, 1, {caiShen: Enums.tongzi3}, resMap)
    expect(pass).be.true;
  })

  it('将 + 杠 + 1财 fail ', function () {
    const cards1 = [Enums.dong, Enums.dong, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1];
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.huRecur(assistList1, false, 1, {caiShen: Enums.tongzi3}, resMap)
    expect(pass).be.false;
  })

  it('ping hu: 将 + 顺子缺头 1,2 + 1财 pass ', function () {
    const cards1 = [Enums.dong, Enums.dong, Enums.tongzi1, Enums.tongzi2];
    const assistList1 = genAssistList(cards1)

    const pass = HuPaiDetect.huRecur(assistList1, false, 1, {caiShen: Enums.tongzi3}, resMap)
    expect(pass).be.true;
  })

  it('将 + 顺子卡档 1,3 + 1财 pass ', function () {
    const cards1 = [Enums.dong, Enums.dong, Enums.tongzi1, Enums.tongzi3];
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.huRecur(assistList1, false, 1, {caiShen: Enums.tongzi3}, resMap)
    expect(pass).be.true;
  })

  it('将 + 顺子缺头 8,9 + 1财 pass ', function () {
    const cards1 = [Enums.dong, Enums.dong, Enums.tongzi8, Enums.tongzi9,
    ];
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.huRecur(assistList1, false, 1, {caiShen: Enums.tongzi3}, resMap)
    expect(pass).be.true;
  })

  it('ping hu: 将 + 顺子卡档 7,9 + 1财 pass ', function () {
    const cards1 = [Enums.dong, Enums.dong, Enums.tongzi7, Enums.tongzi9,
    ];
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.huRecur(assistList1, false, 1, {caiShen: Enums.tongzi3}, resMap)
    expect(pass).be.true;
  })

  it('单张 + 顺子 + 1财 pass ', function () {
    const cards1 = [Enums.dong, Enums.tongzi7, Enums.tongzi8, Enums.tongzi9,
    ];
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.huRecur(assistList1, false, 1, {caiShen: Enums.tongzi3}, resMap)
    expect(pass).be.true;
  })

  it('东 南 西 + 将 fail ', function () {
    const cards1 = [Enums.dong, Enums.nan, Enums.xi, Enums.tongzi7, Enums.tongzi7];
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.huRecur(assistList1, false, 0, {caiShen: Enums.tongzi3}, resMap)
    expect(pass).be.false;
  })

  it('东 东 东  + 西 西 pass ', function () {
    const cards1 = [Enums.dong, Enums.dong, Enums.dong, Enums.xi, Enums.xi];
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.huRecur(assistList1, false, 0, {}, resMap)
    expect(pass).be.true;
  })

})

describe('7对', () => {
  it('清七对', () => {
    const cards1 = [
      Enums.dong, Enums.dong,
      Enums.xi, Enums.xi,
      Enums.bei, Enums.bei,
      Enums.nan, Enums.nan,
      Enums.zhong, Enums.zhong,
      Enums.fa, Enums.fa,
      Enums.bai, Enums.bai,
    ];
    const assistList1 = genAssistList(cards1)
    assistList1.caiShen = Enums.wanzi1
    assistList1.lastTakeCard = Enums.wanzi1
    const resMap = {}
    const pass = HuPaiDetect.checkQiDui(assistList1, resMap)
    expect(pass).be.true;
  })

  it('七对子', () => {
    const cards1 = [
      Enums.dong, Enums.dong,
      Enums.xi, Enums.xi,
      Enums.bei, Enums.bei,
      Enums.nan, Enums.nan,
      Enums.zhong, Enums.zhong,
      Enums.fa, Enums.fa,
      Enums.bai, Enums.bai,
    ];
    const assistList1 = genAssistList(cards1)
    assistList1.caiShen = Enums.wanzi1
    assistList1.lastTakeCard = Enums.wanzi1
    const resMap = {}
    const pass = HuPaiDetect.checkQiDui(assistList1, resMap)

    expect(pass).be.true;
    expect(resMap).to.have.property('hu', true);
    expect(resMap).to.have.property('qiDui', true);
  })

  it('七对子 fail', () => {
    const cards1 = [
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
      Enums.wanzi4, Enums.wanzi4,
      Enums.dong, Enums.bei, Enums.bei
    ];
    const assistList1 = genAssistList(cards1)
    assistList1.caiShen = Enums.bei
    assistList1.lastTakeCard = Enums.wanzi1
    const resMap = {}
    const pass = HuPaiDetect.checkQiDui(assistList1, resMap)
    expect(pass).be.false;
  })

  it('七对子 爆头  ', () => {
    const cards1 = [
      Enums.dong, Enums.dong,
      Enums.xi, Enums.xi,
      Enums.bei, Enums.bei,
      Enums.nan, Enums.nan,
      Enums.zhong, Enums.zhong,
      Enums.zhong, Enums.zhong,
      Enums.wanzi1, Enums.wanzi1,
    ];
    const assistList1 = genAssistList(cards1)
    assistList1.caiShen = Enums.wanzi1
    assistList1.lastTakeCard = Enums.wanzi1
    const resMap = {}
    const pass = HuPaiDetect.checkQiDui(assistList1, resMap)
    expect(pass).be.true;

    expect(resMap).to.have.property('hu', true);
    expect(resMap).to.have.property('baoTou', true);
    expect(resMap).to.have.property('haoQi', true);
  })


  it('七对子 财神 爆头  ', () => {
    const cards1 = [
      Enums.bai, Enums.bai,
      Enums.tongzi4, Enums.tongzi4,
      Enums.tongzi2, Enums.tongzi2,
      Enums.shuzi3, Enums.shuzi3,
      Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
      Enums.wanzi1, Enums.wanzi1,
      Enums.wanzi6,
    ];
    const assistList1 = genAssistList(cards1)
    assistList1.lastTakeCard = Enums.wanzi2
    assistList1.caiShen = Enums.wanzi2
    const resMap = {}
    const pass = HuPaiDetect.checkQiDui(assistList1, resMap)
    expect(pass).be.true;

    expect(resMap).to.have.property('hu', true);
    expect(resMap).to.have.property('caiShenTou', true);
    expect(resMap).to.have.property('baoTou', true);
    expect(resMap).to.have.property('qiDui', true);

  })
})


describe('碰碰胡 先有三碰', () => {
  const events = {'peng': [Enums.tongzi1, Enums.tongzi2, Enums.tongzi3]}

  it('无财神', () => {
    const cards1 = [
      Enums.dong, Enums.dong,
      Enums.xi, Enums.xi, Enums.xi,
    ];
    const assistList1 = genAssistList(cards1)
    assistList1.lastTakeCard = Enums.xi
    const resMap = {}
    const pass = HuPaiDetect.checkPengPengHu(assistList1, events, resMap)

    expect(pass).be.true;
    expect(resMap).to.have.property('hu', true);
    expect(resMap).to.have.property('pengPengHu', true);
  })

  it('1财神,2对  fail', () => {
    const cards1 = [
      Enums.dong, Enums.dong,
      Enums.xi, Enums.xi,
    ];
    const assistList1 = genAssistList(cards1)
    const resMap = {}
    const pass = HuPaiDetect.checkPengPengHu(assistList1, events, resMap, 1)
    expect(pass).be.false;
  })

  it('2财神,1对,1单张 fail', () => {
    const cards1 = [
      Enums.dong, Enums.dong,
      Enums.xi,
    ];
    const assistList1 = genAssistList(cards1)
    const resMap = {}
    const peng = Enums.peng;
    const pass = HuPaiDetect.checkPengPengHu(assistList1, events, resMap, 2)
    expect(pass).be.false;
  })

  it('2财神,3单张  fail', () => {
    const cards1 = [
      Enums.dong,
      Enums.nan,
      Enums.xi,
    ];
    const assistList1 = genAssistList(cards1)
    const resMap = {}
    const peng = Enums.peng;
    const pass = HuPaiDetect.checkPengPengHu(assistList1, events, resMap, 2)
    expect(pass).be.false;
  })
})

describe('全求人', () => {
  it('1对', () => {
    const cards1 = [
      Enums.dong, Enums.dong
    ];
    const assistList1 = genAssistList(cards1)
    const resMap = {}
    HuPaiDetect.checkQuanQiuRen(assistList1, [], resMap)
    expect(resMap).to.have.property('quanQiuRen', true);
  })
})

describe('清一色', () => {

  it('无财神', () => {
    const cards1 = [
      Enums.wanzi1, Enums.wanzi1, Enums.wanzi1, Enums.wanzi2, Enums.wanzi2, Enums.wanzi2, Enums.wanzi3, Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi4, Enums.wanzi4, Enums.wanzi4, Enums.wanzi5, Enums.wanzi5,
    ];
    const assistList1 = genAssistList(cards1)
    assistList1.caiShen = Enums.tongzi1
    const resMap = {}
    const pass = HuPaiDetect.checkQingYiSe(assistList1, [], resMap)
    expect(pass).is.true;
    expect(resMap.qingYiSe).is.true;
  })

  it('无财神', () => {
    const cards1 = [
      Enums.wanzi1, Enums.wanzi1, Enums.wanzi2, Enums.wanzi2, Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi4, Enums.wanzi4,
    ];
    const assistList1 = genAssistList(cards1)
    assistList1.caiShen = Enums.tongzi1
    const pass = HuPaiDetect.check(assistList1, [], {ro: {kehu: []}}, 0)
    expect(pass.hu).is.true;
    expect(pass.qingYiSe).is.true;
    expect(pass.wuCai).is.true;
  })

  it('有财神', () => {
    const cards1 = [
      Enums.wanzi1
    ];
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.isQingYiSe(assistList1, [], 1)
    expect(pass).is.true;
  })

  it('风牌 fail', () => {
    const cards1 = [
      Enums.dong
    ]
    const pass = HuPaiDetect.isQingYiSe(cards1, [], {})
    expect(pass).is.false;
  })

  it('风牌 混一色 pass', () => {
    const cards1 = [
      Enums.dong, Enums.dong, Enums.dong,
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
      Enums.wanzi4, Enums.wanzi4
    ];
    const resMap = {}
    const pass = HuPaiDetect.checkHunYiSe(cards1, [], resMap)
    expect(pass).is.true;
    expect(resMap.hunYiSe).is.true;
  })
})

describe('乱风', () => {
  it('全风牌', () => {
    const cards1 = []
    for (var i = 0; i < 14; i++) {
      cards1.push(Enums.dong)
    }
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.checkLuanFeng(assistList1, [], {})
    expect(pass).is.true
  })

  it('13风牌 + 1万  fail', () => {
    const cards1 = [Enums.wanzi1]
    for (var i = 0; i < 13; i++) {
      cards1.push(Enums.dong)
    }
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.checkLuanFeng(assistList1, [], {})
    expect(pass).is.false
  })


  it('11风牌 + 1碰  pass', () => {
    const cards1 = []
    for (var i = 0; i < 11; i++) {
      cards1.push(Enums.dong)
    }
    const events = []
    events.peng = [Enums.zhong]
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.checkLuanFeng(assistList1, events, {})
    expect(pass).is.true
  })

  it('11风牌 + 1万字碰  fail', () => {
    const cards1 = []
    for (var i = 0; i < 11; i++) {
      cards1.push(Enums.dong)
    }
    const events = []
    events.peng = [Enums.wanzi1]
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.checkLuanFeng(assistList1, events, {})
    expect(pass).is.fail
  })

  it('10风牌 + 1碰 + 白板  pass', () => {
    const cards1 = [Enums.bai]
    for (var i = 0; i < 10; i++) {
      cards1.push(Enums.dong)
    }

    const events = []
    events.peng = [Enums.zhong]
    const assistList1 = genAssistList(cards1)
    const pass = HuPaiDetect.checkLuanFeng(assistList1, events, {})
    expect(pass).is.true
  })
})

describe('七风', function () {
  it('7风牌 + 2 * 147 + 1 = 14 pass', function () {
    const cards = [Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.zhong, Enums.fa, Enums.bai,
      Enums.wanzi1, Enums.wanzi4, Enums.wanzi7,
      Enums.tongzi1, Enums.tongzi4, Enums.tongzi7,
      Enums.shuzi1,
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.shuzi3
    const resMap = {}
    const pass = HuPaiDetect.checkQiFeng(assistList, [], resMap)
    expect(pass).be.true;
    expect(resMap.hu).be.true;
    expect(resMap['qiFeng']).be.true;
  })

  it('7风牌 +  147 + 17 + 28 = 14 pass', function () {
    const cards = [Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.zhong, Enums.fa, Enums.bai,
      Enums.wanzi1, Enums.wanzi4, Enums.wanzi7,
      Enums.shuzi1, Enums.shuzi7,
      Enums.tongzi2, Enums.tongzi8
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.shuzi3
    const resMap = {}
    const pass = HuPaiDetect.checkQiFeng(assistList, [], resMap)
    expect(pass).be.true;
    expect(resMap.hu).be.true;
    expect(resMap['qiFeng']).be.true;
  })

  it('7风牌 + 2 财神 ', function () {
    const cards = [Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.zhong, Enums.fa, Enums.bai,
      Enums.wanzi8,
      Enums.tongzi6, Enums.tongzi9,
      Enums.shuzi6, Enums.shuzi9,
      Enums.tongzi1, Enums.tongzi1
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.tongzi1
    const resMap = {}
    const pass = HuPaiDetect.checkQiFeng(assistList, [], resMap)
    expect(pass).be.true;
    expect(resMap.hu).be.true;
    expect(resMap['qiFeng']).be.true;
  })

  it('6风牌  147+147+14 fail', function () {
    const cards = [Enums.dong, Enums.nan, Enums.bei, Enums.zhong, Enums.fa, Enums.bai,
      Enums.wanzi1, Enums.wanzi4, Enums.wanzi7,
      Enums.tongzi1, Enums.tongzi4, Enums.tongzi7,
      Enums.shuzi1, Enums.shuzi4
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.shuzi3
    const resMap = {}
    const pass = HuPaiDetect.checkQiFeng(assistList, [], resMap)
    expect(pass).be.false;
  })

  it('6风牌  财神能不能代替风 ', function () {
    const cards = [Enums.dong, Enums.nan, Enums.bei, Enums.zhong, Enums.fa, Enums.bai,
      Enums.wanzi1, Enums.wanzi4, Enums.wanzi7,
      Enums.tongzi1, Enums.tongzi4, Enums.tongzi7,
      Enums.shuzi1, Enums.shuzi3
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.shuzi3
    const resMap = {}
    const pass = HuPaiDetect.checkQiFeng(assistList, [], resMap)
    expect(pass).be.fail;
  })

  it('7风牌  1 财神 + 缺1 pass', function () {
    const cards = [Enums.dong, Enums.nan, Enums.xi, Enums.bei, Enums.zhong, Enums.fa, Enums.bai,
      Enums.wanzi1, Enums.wanzi4, Enums.wanzi7,
      Enums.tongzi1, Enums.tongzi7,
      Enums.shuzi1, Enums.shuzi3
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.shuzi3
    const resMap = {}
    const pass = HuPaiDetect.checkQiFeng(assistList, [], resMap)
    expect(pass).be.true;
    expect(resMap.hu).be.true;
    expect(resMap.qiFeng).be.true;
  })

  it('7风牌  1 财神 + 159 + 29 + 5 pass', function () {
    const cards = [Enums.dong, Enums.nan, Enums.xi, Enums.bei, Enums.zhong, Enums.fa, Enums.bai,
      Enums.wanzi2, Enums.wanzi9,
      Enums.tongzi5,
      Enums.shuzi1, Enums.shuzi3, Enums.shuzi6, Enums.shuzi9,
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.shuzi3
    const resMap = {}
    const pass = HuPaiDetect.checkQiFeng(assistList, [], resMap)
    expect(pass).be.true;
    expect(resMap.hu).be.true;
    expect(resMap.qiFeng).be.true;
  })


  it('7风牌  财神归位 pass', function () {
    const cards = [Enums.dong, Enums.nan, Enums.xi, Enums.bei, Enums.zhong, Enums.fa, Enums.bai,
      Enums.wanzi1, Enums.wanzi4, Enums.wanzi7,
      Enums.tongzi1, Enums.tongzi4, Enums.tongzi7,
      Enums.shuzi3
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.shuzi3
    const resMap = {}
    const pass = HuPaiDetect.checkQiFeng(assistList, [], resMap)
    expect(pass).be.true;
    expect(resMap.hu).be.true;
    expect(resMap.qiFeng).be.true;

  })

  it(' 2财神 白板代替财神的位置 pass', function () {
    const cards = [
      Enums.dong, Enums.nan, Enums.xi, Enums.bei, Enums.zhong, Enums.fa, Enums.bai, Enums.bai,
      Enums.wanzi1, Enums.wanzi4, Enums.wanzi7,
      Enums.tongzi1,
      Enums.shuzi3, Enums.shuzi3,
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.shuzi3
    const resMap = {}
    const pass = HuPaiDetect.checkQiFeng(assistList, [], resMap)
    expect(pass).be.true;
    expect(resMap.hu).be.true;
    expect(resMap.qiFeng).be.true;
  })

  it(' 2财神 白板代替财神的位置 pass', function () {
    const cards = [
      Enums.dong, Enums.nan, Enums.xi, Enums.bei, Enums.zhong, Enums.fa, Enums.bai,
      Enums.wanzi2, Enums.wanzi5, Enums.wanzi9,
      Enums.tongzi1, Enums.tongzi6,
      Enums.shuzi1, Enums.shuzi5,
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.dong
    const resMap = {}
    const pass = HuPaiDetect.checkQiFeng(assistList, [], resMap)
    expect(pass).be.true;
    expect(resMap.hu).be.true;
    expect(resMap.qiFeng).be.true;
  })

  it(' 7风 财神不能代替风 ', function () {
    const assistList = genAssistList(huCardFactory(Enums.tongzi4).youCaiQiFeng)
    assistList[Enums.tongzi9] += 1
    assistList.caiShen = Enums.tongzi4
    const resMap = {}
    const pass = HuPaiDetect.checkQiFeng(assistList, [], resMap)
    expect(pass).be.false;
  })
})

describe.skip('一条龙', function () {
  it('无财神', function () {
    const result = {
      huCards: {
        shunZi: [
          Enums.wanzi1, Enums.wanzi2, Enums.wanzi3, Enums.wanzi4, Enums.wanzi5, Enums.wanzi6, Enums.wanzi7, Enums.wanzi8, Enums.wanzi9,
        ]
      }
    };

    const pass = HuPaiDetect.checkYiTiaoLong(result)
    expect(pass).be.true
    expect(result['yiTiaoLong']).be.true
  })

  it('有财神 fail', function () {
    const cards = [
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3, Enums.wanzi4, Enums.wanzi5, Enums.wanzi6, Enums.wanzi7, Enums.wanzi8,
      Enums.tongzi2, Enums.tongzi3, Enums.tongzi4,
      Enums.tongzi5, Enums.tongzi5,

      Enums.dong
    ];

    const assistCards = genAssistList(cards)
    assistCards.caiShen = Enums.dong

    const pass = HuPaiDetect.check(assistCards, [], {ro: {kehu: ['yiTiaoLong']}}, 0)
    expect(pass.hu).be.true
    expect(pass.yiTiaoLong).is.undefined
  })
})

describe('起手三财', function () {
  it('第一圈', function () {
    const cards = [Enums.dong, Enums.dong, Enums.dong,
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3, Enums.wanzi4, Enums.wanzi5, Enums.wanzi6, Enums.wanzi7, Enums.wanzi8, Enums.wanzi9,
      Enums.tongzi2, Enums.tongzi3,
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.dong
    assistList.turn = 1
    const resMap = {}
    const pass = HuPaiDetect.checkQiShouSanCai(assistList, [], resMap, 0)
    expect(pass).be.true;
    expect(resMap.hu).be.true;
    expect(resMap['qiShouSanCai']).be.true;
  })

  it('第5圈 fail', function () {
    const cards = [Enums.dong, Enums.dong, Enums.dong,
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3, Enums.wanzi4, Enums.wanzi5, Enums.wanzi6, Enums.wanzi7, Enums.wanzi8, Enums.wanzi9,
      Enums.tongzi2, Enums.tongzi3,
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.dong
    assistList.turn = 5
    const resMap = {}
    const pass = HuPaiDetect.checkQiShouSanCai(assistList, [], resMap)
    expect(pass).be.false;
  })
})

describe('敲响测试', function () {
  it('may qiaoxiao', function () {
    const cards = [
      Enums.dong, Enums.dong, Enums.dong,
      Enums.wanzi1, Enums.wanzi1, Enums.wanzi1,
      Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
      Enums.tongzi2, Enums.tongzi3, Enums.tongzi4, Enums.tongzi5,
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.dong

    const pass = HuPaiDetect.checkQiaoXiang(assistList)
    expect(pass).be.true;
  })


  it('财神和单张组成刻字', function () {
    let caiShen = Enums.wanzi1;

    const cards = [
      Enums.wanzi3,
      caiShen, caiShen, caiShen,
      Enums.shuzi1, Enums.shuzi2, Enums.shuzi3,
      Enums.tongzi1, Enums.tongzi2, Enums.tongzi3,

    ];

    const assistList = genAssistList(cards)
    assistList.caiShen = caiShen

    const pass = HuPaiDetect.checkQiaoXiang(assistList)
    expect(pass).to.be.true

  });


  it('may 财神头', function () {
    const cards = [
      Enums.dong, Enums.dong, Enums.dong,
      Enums.wanzi1, Enums.wanzi1, Enums.wanzi1,
      Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
      Enums.tongzi1, Enums.tongzi3, Enums.tongzi4, Enums.tongzi5,
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.dong
    assistList.turn = 5
    const pass = HuPaiDetect.checkQiaoXiang(assistList)
    expect(pass).be.true;
  })

  it('敲响 may 财神头', function () {
    const cards = [
      Enums.wanzi1, Enums.wanzi1,
      Enums.wanzi2, Enums.wanzi2,
      Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi4, Enums.wanzi4,
      Enums.wanzi5, Enums.wanzi5,
      Enums.wanzi6, Enums.wanzi6,
      Enums.wanzi7, Enums.wanzi7,

    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.wanzi6
    assistList.turn = 5
    const pass = HuPaiDetect.mayCaiShenTou(assistList)
    expect(pass).be.true;
  })

  it.skip('敲响 may 财神头+自摸', function () {

    const cards = [
      Enums.shuzi1, Enums.shuzi2, Enums.shuzi3,
      Enums.shuzi7, Enums.shuzi8, Enums.shuzi9,
      Enums.tongzi4, Enums.tongzi4, Enums.tongzi4,
      Enums.tongzi5, Enums.tongzi6, Enums.tongzi7,
      Enums.tongzi2, Enums.tongzi2
    ];

    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.tongzi2
    assistList.turn = 5
    assistList.lastTakeCard = Enums.shuzi1
    assistList.takeSelfCard = true
    assistList.qiaoXiang = true

    // const pass = HuPaiDetect.mayCaiShenTou(assistList)

    let check = HuPaiDetect.check(assistList, [], {ro: {kehu: []}}, 0)

    // expect(pass).be.true;
  })


  it.skip('敲响 普通敲响', function () {

    const cards = [
      Enums.shuzi1, Enums.shuzi2, Enums.shuzi3,
      Enums.shuzi7, Enums.shuzi8, Enums.shuzi9,
      Enums.tongzi4, Enums.tongzi4, Enums.tongzi4,
      Enums.tongzi5, Enums.tongzi6, Enums.tongzi7,
      Enums.tongzi2, Enums.tongzi7
    ];

    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.tongzi2
    assistList.turn = 5
    assistList.lastTakeCard = Enums.tongzi7
    assistList.takeSelfCard = true
    assistList.qiaoXiang = true

    let check = HuPaiDetect.check(assistList, [], {ro: {kehu: []}}, 0)
    expect(check).to.have.properties({baoTou: true, fan: 2})
  })

  it.skip('敲响 财神叶', function () {

    const cards = [
      Enums.shuzi1, Enums.shuzi2, Enums.shuzi3,
      Enums.shuzi7, Enums.shuzi8, Enums.shuzi9,
      Enums.tongzi4, Enums.tongzi4, Enums.tongzi4,
      Enums.tongzi5, Enums.tongzi5,
      Enums.tongzi2, Enums.tongzi2, Enums.tongzi2
    ];

    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.tongzi2
    assistList.turn = 5
    assistList.lastTakeCard = Enums.tongzi5
    assistList.takeSelfCard = true
    assistList.qiaoXiang = true

    let check = HuPaiDetect.check(assistList, [], {ro: {kehu: []}}, 0)
    expect(check).to.have.properties({sanCaiYiKe: true, fan: 6})
  })


})

describe('反馈', function () {
  it('基本', function () {
    const cards = [
      Enums.wanzi8, Enums.wanzi5, Enums.wanzi4,
      Enums.shuzi5, Enums.shuzi6, Enums.shuzi7,
      Enums.shuzi8, Enums.shuzi8,
      Enums.tongzi2, Enums.tongzi3, Enums.tongzi4,
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.wanzi8
    assistList.turn = 5
    let events = []
    events['chi'] = [Enums.shuzi1, Enums.shuzi2, Enums.shuzi3]
    const pass = HuPaiDetect.check(assistList, events, {ro: {kehu: []}}, 0)
    expect(pass.hu).be.true;
  })


  it('七对敲响检查', function () {
    const cards = [
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi7, Enums.wanzi7, Enums.wanzi7,
      Enums.shuzi1, Enums.shuzi1,
      Enums.tongzi3, Enums.tongzi3,
      Enums.tongzi7, Enums.tongzi7,
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.wanzi1
    assistList.turn = 5
    const pass = HuPaiDetect.checkQiaoXiang(assistList)
    expect(pass).be.false;
  });

  it.skip('豪七 不可胡 是七对子', function () {
    const cards = [
      Enums.wanzi2, Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
      Enums.wanzi7, Enums.wanzi7,
      Enums.shuzi1, Enums.shuzi1,
      Enums.tongzi3, Enums.tongzi3,
      Enums.tongzi7, Enums.tongzi7,
      Enums.dong, Enums.dong,
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.wanzi8
    assistList.turn = 5
    let events = []
    const pass = HuPaiDetect.check(assistList, events, {ro: {kehu: []}}, 0)
    expect(pass.hu).be.true;
    expect(pass.haoQi).be.false;
    expect(pass.qiDui).be.true;
  })

  it('豪7', function () {
    const cards = [
      Enums.wanzi2, Enums.wanzi2, Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi7, Enums.wanzi7, Enums.wanzi7,
      Enums.shuzi1, Enums.shuzi1,
      Enums.tongzi3, Enums.tongzi3,
      Enums.tongzi7, Enums.tongzi7,
      Enums.dong
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.dong
    assistList.turn = 5
    const pass = HuPaiDetect.check(assistList, [], {ro: {kehu: ['haoQi']}}, 0)
    expect(pass.hu).be.true
    expect(pass.haoQi).be.undefined

  });

  it('平胡 财神 白板', function () {
    const cards = [
      Enums.wanzi4, Enums.wanzi4, Enums.wanzi4,
      Enums.wanzi7, Enums.wanzi7,
      Enums.shuzi1, Enums.shuzi2, Enums.shuzi3,
      Enums.shuzi7, Enums.bai, Enums.shuzi6
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.shuzi3
    assistList.turn = 5
    let events = []
    events['peng'] = [Enums.tongzi3]
    const pass = HuPaiDetect.check(assistList, events, {ro: {kehu: []}}, 0)
    expect(pass.hu).be.true;
  })

  it('白板清一色', function () {
    const cards = [
      Enums.shuzi4,
      Enums.shuzi4,
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.shuzi3
    assistList.turn = 5
    let events = []
    events['chi'] = [[Enums.shuzi7, Enums.shuzi8, Enums.shuzi9]]
    events['peng'] = [Enums.shuzi2, Enums.bai]
    events['gang'] = [Enums.shuzi6]
    const pass = HuPaiDetect.check(assistList, events, {ro: {kehu: ['hunYiSe']}}, 0)
    expect(pass.hu).true;
    expect(pass.qingYiSe).true
    expect(pass.hunYiSe).undefined
  })

  it.skip('白板混一色', function () {
    const cards = [
      Enums.wanzi1, Enums.wanzi1,
      Enums.wanzi2, Enums.wanzi3, Enums.wanzi4,
      Enums.wanzi5, Enums.wanzi6, Enums.wanzi7,
      Enums.tongzi7, Enums.tongzi7,
      Enums.bei, Enums.bei, Enums.bei,
      Enums.bai,
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.tongzi7
    assistList.turn = 5
    let events = []
    const pass = HuPaiDetect.check(assistList, events, {ro: {kehu: ['hunYiSe']}}, 0)
    expect(pass.hu).true;
    expect(pass.hunYiSe).true
  })

  it('碰碰胡', function () {
    const cards = [
      Enums.bei, Enums.bei,
      Enums.bai, Enums.bai, Enums.bai
    ];
    const assistList = genAssistList(cards)
    assistList.caiShen = Enums.tongzi7
    assistList.turn = 5
    assistList.lastTakeCard = Enums.bai
    let events = []
    events.peng = [Enums.wanzi1, Enums.wanzi2, Enums.wanzi3]
    const pass = HuPaiDetect.check(assistList, events, {ro: {kehu: ['hunYiSe']}}, 0)

    expect(pass.hu).true;
    expect(pass.pengPengHu).true;
  })
})


