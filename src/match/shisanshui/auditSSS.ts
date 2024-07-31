// 统计十三水
// 翻倍数
interface WaterTimes {
  // 基础分
  baseWater: number
}
interface AuditData {
  // // 是否被对手打枪
  // isShoot: boolean
  // 打枪倍数
  shootTimes: number
  // 全垒打倍数
  quanLeiDaTimes: number
  // 马牌倍数
  maPaiTimes: number
  // 第一墩得分
  head: WaterTimes
  middle: WaterTimes
  tail: WaterTimes
  // 特殊牌得分
  extra: number
}
export class AuditSSS {
  currentRound: { [key: string]: {
    // 对手 playerId
    [key: string]: AuditData
  }};

  constructor() {
    this.currentRound = {};
  }

  // 初始化
  initPlayer(playerIndex, againstPlayerIndex) {
    if (!this.currentRound[playerIndex]) {
      this.currentRound[playerIndex] = {};
    }
    this.currentRound[playerIndex][againstPlayerIndex] = {
      extra: 0,
      // 打枪倍数
      shootTimes: 1,
      // 全垒打倍数
      quanLeiDaTimes: 1,
      // 马牌倍数
      maPaiTimes: 1,
      head: {
        baseWater: 0,
      },
      middle: {
        baseWater: 0,
      },
      tail: {
        baseWater: 0,
      },
    }
  }

  // 基础分
  setBaseWater(playerIndex, againstPlayerIndex, headBaseWater: number, middleBaseWater: number, tailBaseWater: number) {
    this.currentRound[playerIndex][againstPlayerIndex].head.baseWater = headBaseWater;
    this.currentRound[playerIndex][againstPlayerIndex].middle.baseWater = middleBaseWater;
    this.currentRound[playerIndex][againstPlayerIndex].tail.baseWater = tailBaseWater;
    this.currentRound[againstPlayerIndex][playerIndex].head.baseWater = -headBaseWater;
    this.currentRound[againstPlayerIndex][playerIndex].middle.baseWater = -middleBaseWater;
    this.currentRound[againstPlayerIndex][playerIndex].tail.baseWater = -tailBaseWater;
  }

  // 更新打枪倍数
  setShootTimes(playerIndex, againstPlayerIndex, shootTimes: number) {
    this.currentRound[playerIndex][againstPlayerIndex].shootTimes = shootTimes;
    this.currentRound[againstPlayerIndex][playerIndex].shootTimes = shootTimes;
  }
  // 全垒打倍数
  setQuanLeiDaTimes(playerIndex) {
    const keys = Object.keys(this.currentRound[playerIndex]);
    for (const k of keys) {
      this.currentRound[playerIndex][k].quanLeiDaTimes = 2;
      this.currentRound[k][playerIndex].quanLeiDaTimes = 2;
    }
  }
  // 马牌倍数
  setMaPaiTimes(playerIndex, againstPlayerIndex, maPaiTimes: number) {
    this.currentRound[playerIndex][againstPlayerIndex].maPaiTimes = maPaiTimes;
    this.currentRound[againstPlayerIndex][playerIndex].maPaiTimes = maPaiTimes;
  }

  // 设置奇牌分(特殊牌)
  setQiPaiExtra(playerIndex, againstPlayerIndex, score) {
    this.currentRound[playerIndex][againstPlayerIndex].extra = score;
    this.currentRound[againstPlayerIndex][playerIndex].extra = -score;
  }
}
