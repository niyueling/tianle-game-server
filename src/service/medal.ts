import {GameType, MedalType} from '@fm/common/constants';
import PlayerMedal from "../database/models/PlayerMedal";
import PlayerMedalRecord from "../database/models/playerMedalRecord";
import BaseService from "./base";

// 勋章
export default class MedalService extends BaseService {
  // 添加勋章记录
  async addMedalRecord(playerId, shortId, medalType, level, gameType, achievement?) {
    return PlayerMedalRecord.create({
      playerId,
      shortId,
      medalType,
      level,
      gameType,
      achievement: achievement || {},
      createAt: new Date(),
    })
  }

  // 更新勋章等级
  async addOrUpdateMedal(playerId, shortId, medalType, level, achievement, gameType) {
    const record = await PlayerMedal.findOne({
      shortId,
      medalType,
      gameType,
    });
    if (record) {
      // 更新等级
      record.level = level;
      record.achievement = achievement || {};
      record.updateAt = new Date();
      await record.save();
    } else {
      await PlayerMedal.create({
        playerId,
        shortId,
        medalType,
        level,
        updateAt: new Date(),
        gameType,
        achievement: achievement || {},
      })
    }
    await this.addMedalRecord(playerId, shortId, medalType, level, gameType, achievement)
  }

  async getMedal(shortId, medalType, gameType) {
    return PlayerMedal.findOne({
      shortId,
      medalType,
      gameType,
    });
  }

  // 更新推广员勋章
  async updateInviteMedal(playerId, shortId, level) {
    return this.addOrUpdateMedal(playerId, shortId, MedalType.inviter, level, null, GameType.all);
  }

  async updateClubOwnerMedal(playerId, shortId, level) {
    return this.addOrUpdateMedal(playerId, shortId, MedalType.clubOwner, level, null, 'recharge');
  }

  // 更新幸运星(8个8)
  async updateLuckyMedal(playerId, shortId, level, jokerCount, gameType) {
    if (gameType !== GameType.zd) {
      // 不是炸弹，不处理
      return;
    }
    return this.addOrUpdateMedal(playerId, shortId, MedalType.lucky, level, { jokerCount, count8: 8 }, gameType);
  }

  // 游戏专家
  async updateGameProfessionMedal(playerId, shortId, gameType) {
    const oldMedal = await this.getMedal(shortId, MedalType.professional, gameType);
    let oldLevel = -1;
    let juShu = 0;
    if (oldMedal) {
      // 加上旧局数
      juShu = oldMedal.achievement.juShu;
      oldLevel = oldMedal.level;
    }
    juShu++;
    if (oldLevel === 4) {
      // 最大级，不用再处理了
      oldMedal.achievement.juShu = juShu;
      oldMedal.markModified('achievement');
      await oldMedal.save();
      return;
    }
    let newLevel = 0;
    if (juShu > 1000) {
      newLevel = 4;
    } else if (juShu >= 500) {
      newLevel = 3;
    } else if (juShu >= 300) {
      newLevel = 2;
    } else if (juShu >= 100) {
      newLevel = 1;
    }
    if (newLevel > oldLevel) {
      // 更新等级
      return this.addOrUpdateMedal(playerId, shortId, MedalType.professional, newLevel, { juShu }, gameType);
    }
  }

  // 得分王
  async updateScoreKingMedal(playerId, shortId, score, gameType) {
    // 单场得分
    let level = 0;
    switch (gameType) {
      case GameType.zd:
        // 炸弹
        if (score >= 1000) {
          level = 4;
        } else if (score >= 800) {
          level = 3;
        } else if (score >= 520) {
          level = 2;
        } else if (score >= 256) {
          level = 1;
        } else {
          // 不算
          return;
        }
        break;
      case GameType.mj:
        // 麻将 48*2
        if (score >= 96) {
          level = 4;
        } else if (score >= 48) {
          level = 3;
        } else if (score >= 24) {
          level = 2;
        } else if (score >= 12) {
          level = 1;
        } else {
          // 不算
          return;
        }
        break;
      case GameType.bf:
        // 标分 (24*3+20)*2
        if (score >= 184) {
          level = 4;
        } else if (score >= 92) {
          level = 3;
        } else if (score >= 46) {
          level = 2;
        } else if (score >= 23) {
          level = 1;
        } else {
          // 不算
          return;
        }
        break;
      case GameType.pdk:
        // 跑得快 64*2
        if (score >= 128) {
          level = 4;
        } else if (score >= 64) {
          level = 3;
        } else if (score >= 32) {
          level = 2;
        } else if (score >= 16) {
          level = 1;
        } else {
          // 不算
          return;
        }
        break;
      case GameType.sss:
        // 十三水，大菠萝 104 * 2
        if (score >= 208) {
          level = 4;
        } else if (score >= 104) {
          level = 3;
        } else if (score >= 52) {
          level = 2;
        } else if (score >= 26) {
          level = 1;
        } else {
          // 不算
          return;
        }
        break;
      default:
        return;
    }
    return this.addOrUpdateMedal(playerId, shortId, MedalType.scoreKing, level, { score }, gameType);
  }
}
