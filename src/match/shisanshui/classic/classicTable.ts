/**
 * Created by Color on 2016/7/6.
 */
import {values} from "../../utils"
import {AuditSSS} from "../auditSSS";
import Table from "../table"
import CompareSuit from "./classicCompared"

const stateWaitCommit = 'stateWaitCommit'
const stateGameOver = 'stateGameOver'

class TableState extends Table {
  name() {
    console.log(`${__filename}:17 name`, 'classic')
    return 'classic'
  }

  constructor(room, rule, restJushu) {
    super(room, rule, restJushu)
  }

  async start() {
    await this.fapai()
    this.state = stateWaitCommit
    // 重置
    this.audit = new AuditSSS();
  }

  resume(json) {
    super.resume(json)
  }

  toJSON() {
    return super.toJSON()
  }

  increase(r: CompareSuit, headWin, middleWin, tailWin, sign: number) {
    r.head.water += headWin.win * sign
    r.middle.water += middleWin.win * sign
    r.tail.water += tailWin.win * sign

    r.head.extra += headWin.extra * sign
    r.middle.extra += middleWin.extra * sign
    r.tail.extra += tailWin.extra * sign
  }

  // 比较大小
  playersOfCompare(): CompareSuit[] {
    const result = this.players.filter(p => p).map(player => new CompareSuit(player))
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const prev = result[i]
        const next = result[j]
        // 初始
        this.audit.initPlayer(prev.player.index, next.player.index);
        this.audit.initPlayer(next.player.index, prev.player.index);
        const {headWin, middleWin, tailWin} = this.compare(prev, next)
        const maTimes = this.mapMaCount2Times(prev, next)
        this.maybeDraw(prev, next, {headWin, middleWin, tailWin})
        this.increase(prev, headWin, middleWin, tailWin, 1)
        this.increase(next, headWin, middleWin, tailWin, -1)
        this.audit.setBaseWater(prev.player.index, next.player.index, headWin.win, middleWin.win, tailWin.win);
        this.audit.setMaPaiTimes(prev.player.index, next.player.index, maTimes);
        this.recordBothInfo(prev, next, maTimes, {headWin, middleWin, tailWin})
      }
    }

    this.handleQuanLeiDa(result)
    result.forEach(r => r.settle())
    return result
  }

  recordBothInfo(prev, next, maTimes: number, {headWin, middleWin, tailWin}) {
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
    const extras = 0
    if (daQiangTimes > 1) {
      this.audit.setShootTimes(prev.player.index, next.player.index, daQiangTimes)
    }
    prev.trace[next.player.index] = {wins, extras, maTimes}
    next.trace[prev.player.index] = {wins: -1 * wins, extras, maTimes}
  }

  handleQuanLeiDa(result: CompareSuit[]) {
    const quanLeiDa = compareResult => this.playerCount > 2 && compareResult.daQiang.length === this.playerCount - 1
    const winSuit = result.filter(r => quanLeiDa(r))[0]

    if (winSuit) {
      this.addScoreQuanLeiDa(winSuit, result)
      this.audit.setQuanLeiDaTimes(winSuit.player.index);
    }
  }

  addScoreQuanLeiDa(winSuit: CompareSuit, allSuit: CompareSuit[]) {
    values(winSuit.trace).forEach(forOther => forOther.wins *= 2)
    const otherPlayers = allSuit.filter(s => s !== winSuit)
    otherPlayers.forEach(suit => {
      suit.trace[winSuit.player.index].wins *= 2
    })
  }

  compare(a: CompareSuit, b: CompareSuit): { headWin, middleWin, tailWin } {
    const headWin = this.compareOn('head', a, b)
    const middleWin = this.compareOn('middle', a, b)
    const tailWin = this.compareOn('tail', a, b)
    return {headWin, middleWin, tailWin}
  }

}

export default TableState
