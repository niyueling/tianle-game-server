/**
 * Created by Color on 2016/7/6.
 */
import {values} from "../../utils"
import QiPaiCompared from "../qipai/qiPaiCompareSuit"
import Table from "../table"

const stateWaitCommit = 'stateWaitCommit'
const stateGameOver = 'stateGameOver'

class TableState extends Table {
  name() {
    return 'qiPai'
  }

  constructor(room, rule, restJushu) {
    super(room, rule, restJushu)
  }

  async start() {
    await this.fapai()
    this.state = stateWaitCommit
  }

  resume(json) {
    super.resume(json)
  }

  toJSON() {
    return super.toJSON()
  }

  playersOfCompare(): QiPaiCompared[] {
    const result = this.players.filter(p => p).map(player => new QiPaiCompared(player))

    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const prev = result[i]
        const next = result[j]
        // 初始
        this.audit.initPlayer(prev.player.index, next.player.index);
        this.audit.initPlayer(next.player.index, prev.player.index);
        const {headWin, middleWin, tailWin, allWin, allFail} = this.compare(prev, next)
        const maTimes = this.mapMaCount2Times(prev, next)
        const times = ((allWin || allFail) ? 2 : 1) * maTimes
        this.maybeDraw(prev, next, {headWin, middleWin, tailWin})
        // 基础分
        this.audit.setBaseWater(prev.player.index, next.player.index, headWin.win, middleWin.win, tailWin.win);
        this.increaseByPosition({prev, next, headWin, middleWin, tailWin, times})
        // 马牌倍数
        this.audit.setMaPaiTimes(prev.player.index, next.player.index, maTimes);
        this.recordBothInfo(prev, next, maTimes, {headWin, middleWin, tailWin})
      }
    }
    // 检查全垒打
    this.handleQuanLeiDa(result)
    result.forEach(r => r.settle())
    return result
  }

  recordBothInfo(prev, next, maTimes, {headWin, middleWin, tailWin}) {
    const allWin = [headWin, middleWin, tailWin].map(w => w.win).filter(win => win > 0).length === 3
    const allFail = [headWin, middleWin, tailWin].map(w => w.win).filter(win => win < 0).length === 3
    if (allWin) {
      prev.daQiang.push(next.player.index)
    }
    if (allFail) {
      next.daQiang.push(prev.player.index)
    }
    const daQiangTimes = (allWin || allFail ) ? 2 : 1
    const wins = (headWin.win + middleWin.win + tailWin.win ) * daQiangTimes
    const extras = headWin.extra + middleWin.extra + tailWin.extra
    // 打枪倍数
    if (daQiangTimes > 1) {
      this.audit.setShootTimes(prev.player.index, next.player.index, daQiangTimes)
    }
    prev.trace[next.player.index] = {wins, extras, maTimes}
    next.trace[prev.player.index] = {wins: -1 * wins, extras: -1 * extras, maTimes}
  }

  // 位置翻倍
  increaseByPosition({prev, next, headWin, middleWin, tailWin, times}) {
    this.increase(prev, headWin, middleWin, tailWin, times)
    this.increase(next, headWin, middleWin, tailWin, -1 * times)
  }

  increase(r: QiPaiCompared, headWin, middleWin, tailWin, times: number) {

    r.head.water += headWin.win * times
    r.middle.water += middleWin.win * times
    r.tail.water += tailWin.win * times

    r.head.extra += headWin.extra * times
    r.middle.extra += middleWin.extra * times
    r.tail.extra += tailWin.extra * times

  }

  handleQuanLeiDa(result: QiPaiCompared[]) {
    const quanLeiDa = compareResult => this.playerCount > 2 && compareResult.daQiang.length === this.playerCount - 1
    const winSuit = result.filter(r => quanLeiDa(r))[0]
    if (winSuit) {
      this.addScoreQuanLeiDa(winSuit, result)
      this.audit.setQuanLeiDaTimes(winSuit.player.index);
    }
  }

  addScoreQuanLeiDa(winSuit: QiPaiCompared, allSuit: QiPaiCompared[]) {
    values(winSuit.trace).forEach(forOther => forOther.wins *= 2)
    const otherPlayers = allSuit.filter(s => s !== winSuit)
    otherPlayers.forEach(suit => {
      suit.trace[winSuit.player.index].wins *= 2;
    })
  }

  compare(a: QiPaiCompared, b: QiPaiCompared): { headWin, middleWin, tailWin, allWin, allFail } {
    if (a.isQiPai || b.isQiPai) {
      return this.compareWithQiPai(a, b)
    }
    return this.compareWithRegular(a, b)
  }

  compareWithQiPai(a: QiPaiCompared, b: QiPaiCompared) {
    const headWin = {win: 0, extra: 0}
    const empty = {win: 0, extra: 0}

    if (a.isQiPai && b.isQiPai) {
      const aExtra = this.getQiPaiWaterBy(a);
      const bExtra = this.getQiPaiWaterBy(b);
      headWin.extra = aExtra > bExtra ? aExtra : -bExtra;
      if (aExtra === bExtra) {
        headWin.extra = 0;
      }
    } else if (a.isQiPai && !b.isQiPai) {
      headWin.extra = this.getQiPaiWaterBy(a)
    } else {
      headWin.extra = -1 * this.getQiPaiWaterBy(b)
    }
    // 添加特殊分(extra已经被翻倍-打枪)
    if (headWin.extra !== 0) {
      this.audit.setQiPaiExtra(a.player.index, b.player.index, headWin.extra / 2)
      // 加上打枪的倍数
      this.audit.setShootTimes(a.player.index, b.player.index, 2)
    }
    return {headWin, middleWin: empty, tailWin: empty, allWin: false, allFail: false}
  }

  getQiPaiWaterBy(suit: QiPaiCompared) {
    const scoreMap = {
      '至尊清龙': 104,
      '一条龙': 52,
      '三同花顺': 36,
      '四套三条': 16,
      '五对三条': 6,
      '六对半': 6,
      '六对半带炸弹': 10,
      '三顺子': 6,
      '三顺子带同花顺': 10,
      '三同花': 6,
      '三同花带同花顺': 10,
      '六同': 12,
      '七同': 24,
    }
    return scoreMap[suit.name + suit.extra] || 0
  }

  compareWithRegular(a, b) {
    const headWin = this.compareOn('head', a, b)
    const middleWin = this.compareOn('middle', a, b)
    const tailWin = this.compareOn('tail', a, b)
    const allWin = [headWin, middleWin, tailWin].map(w => w.win).filter(win => win > 0).length === 3
    const allFail = [headWin, middleWin, tailWin].map(w => w.win).filter(win => win < 0).length === 3
    return {headWin, middleWin, tailWin, allWin, allFail}
  }
}

export default TableState
