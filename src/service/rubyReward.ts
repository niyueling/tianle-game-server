import RoomRubyRecord from "../database/models/roomRubyRecord";
import BaseService from "./base";

export default class RubyReward extends BaseService {

  // 系统补充金豆
  async systemAddRuby(roomId, roomNum, systemAmount, winnerAmount, bigWinner, juIndex) {
    const lastRecord = await this.getLastRubyRecord(roomId);
    const mvpTimes = {};
    if (bigWinner.length > 0) {
      for (const winner of bigWinner) {
        if (lastRecord && lastRecord.mvpTimes && lastRecord.mvpTimes[winner] > 0) {
          mvpTimes[winner] = lastRecord.mvpTimes[winner] + 1;
        } else {
          mvpTimes[winner] = 1;
        }
      }
    } else if (lastRecord) {
      // 没有大赢家
      for (const key of Object.keys(lastRecord.mvpTimes)) {
        mvpTimes[key] = 0;
      }
    }
    if (!lastRecord) {
      // 第一条记录
      return RoomRubyRecord.create({
        roomId,
        roomNum,
        systemRubyReward: systemAmount,
        winnerRubyReward: winnerAmount,
        balance: systemAmount + winnerAmount,
        winnerGainRuby: 0,
        winnerList: [],
        mvpTimes,
        juIndex,
        bigWinner,
      });
    }
    return RoomRubyRecord.create({
      roomId,
      roomNum,
      systemRubyReward: systemAmount,
      winnerRubyReward: winnerAmount,
      // 加上上次的余额
      balance: systemAmount + winnerAmount + lastRecord.balance,
      winnerGainRuby: 0,
      winnerList: [],
      mvpTimes,
      juIndex,
      bigWinner,
    })
  }

  // 玩家赢得金豆
  async winnerGainRuby(roomId, roomNum, winnerList, bigWinner, juIndex) {
    const lastRecord = await this.getLastRubyRecord(roomId);
    if (!lastRecord) {
      return;
    }
    // 记录大赢家次数，清空其它赢家次数
    const mvpTimes = {};
    for (const winner of winnerList) {
      if (lastRecord.mvpTimes && lastRecord.mvpTimes[winner] > 0) {
        mvpTimes[winner] = lastRecord.mvpTimes[winner] + 1;
      } else {
        mvpTimes[winner] = 1;
      }
    }
    return RoomRubyRecord.create({
      roomId,
      roomNum,
      systemRubyReward: 0,
      winnerRubyReward: 0,
      balance: 0,
      winnerGainRuby: lastRecord.balance,
      winnerList,
      mvpTimes,
      juIndex,
      bigWinner,
    })
  }

  // 上次金豆记录
  async getLastRubyRecord(roomId) {
    const lastRecord = await RoomRubyRecord.find({
      roomId,
    }).sort({ juIndex: -1 }).limit(1);
    if (lastRecord.length === 1) {
      return lastRecord[0];
    }
    return null;
  }

  // 连续2次赢家
  async getWinnerTwice(currentWinner, lastWinner) {
    const list = [];
    for (const winner of currentWinner) {
      if (lastWinner.includes(winner)) {
        // 上次也有他
        list.push(winner);
      }
    }
    return list;
  }

  // 计算奖励
  async calculateRubyReward(roomId, currentWinner) {
    const lastRecord = await this.getLastRubyRecord(roomId);
    if (!lastRecord) {
      // 奖池为空
      return { winnerList: [], ruby: 0 };
    }
    const winnerList = await this.getWinnerTwice(currentWinner, lastRecord.bigWinner);
    if (winnerList.length === 0) {
      return { winnerList: [], ruby: 0};
    } else {
      // 奖励平分
      const amount = Math.floor(lastRecord.balance / winnerList.length);
      return { winnerList, ruby: amount };
    }
  }
}
