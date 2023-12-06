import {ClubOp, GameType, RuleType} from '@fm/common/constants';
import * as mongoose from 'mongoose';
import * as config from "../config"
import Club from "../database/models/club";
import ClubExtra from "../database/models/clubExtra";
import ClubLogModel from "../database/models/clubLog";
import ClubMember from "../database/models/clubMember";
import ClubRuleModel from "../database/models/clubRule";
import ClubUnion from "../database/models/clubUnion";
import ClubUnionRequest from "../database/models/clubUnionRequest";
import {MailModel, MailState, MailType} from "../database/models/mail";
import {RoomDetailModel} from "../database/models/roomDetail";
import RoomRecord from "../database/models/roomRecord";
import BaseService from "./base";
import {service} from "./importService";

// 区域
export default class ClubService extends BaseService {

  // 创建新战队规则
  async createClubRule(clubId: mongoose.Types.ObjectId, gameType: string, playerCount,
                       ruleType: RuleType, rule: any): Promise<{ isNew: boolean, model }> {
    const jokerCount = rule.jokerCount || 0;
    let model;
    if (gameType === GameType.zd) {
      model = await ClubRuleModel.findOne({ clubId, gameType, ruleType, jokerCount });
    } else {
      model = await ClubRuleModel.findOne({ clubId, gameType, ruleType, playerCount });
    }
    let isNew: boolean = false;
    if (model) {
      model.rule = rule;
    } else {
      isNew = true;
      model = new ClubRuleModel({ clubId, gameType, ruleType, playerCount, rule, jokerCount });
    }
    await model.save();
    return {isNew, model};
  }

  // 添加战队成员
  async addClubMember(clubId, playerId, clubShortId) {
    // 检查战队有没有联盟
    const record = await this.getJoinUnionClub(clubShortId);
    let unionClubShortId = 0;
    if (record) {
      unionClubShortId = record.mainClubShortId;
    }
    return ClubMember.create({
      club: clubId,
      member: playerId,
      joinAt: new Date(),
      clubGold: 0,
      // 角色
      role: '',
      clubShortId,
      unionClubShortId,
    })
  }

  /**
   * 改名操作
   * @param clubId 俱乐部 objectId
   * @param oldName 旧名字
   * @param newName 新名字
   * @param operatorId 操作人 objectId
   */
  async logRename(clubId: string, oldName: string, newName: string, operatorId: string) {
    const m = new ClubLogModel({clubId, op: ClubOp.rename, operator: operatorId, detail: { oldName, newName } })
    return m.save();
  }

  /**
   * 转移战队
   * @param clubId 俱乐部 objectId
   * @param from 转出玩家 objectId
   * @param to 转入玩家 objectId
   */
  async logTransfer(clubId: string, from: string, to: string) {
    const m = new ClubLogModel({clubId, op: ClubOp.transfer, operator: from, detail: { from, to } })
    return m.save();
  }

  // 玩家战队
  async getClubMember(clubId, playerId: string) {
    const club = await Club.findById(clubId);
    if (!club) {
      return null;
    }
    return ClubMember.findOne({
      club: clubId,
      member: playerId,
    });
  }

  // 设置亲密度
  async setClubMemberDegree(clubId: mongoose.Types.ObjectId, playerId: string, degree) {
    // 亲密度只能为 10%, 20%, ... , 100%
    degree = Math.floor(degree * 10) / 10;
    const member = await this.getClubMember(clubId, playerId);
    if (!member) {
      return false;
    }
    member.degree = degree;
    await member.save();
    return true;
  }

  // 是否能联盟战队
  async isCanUnionClub(playerId, clubShortId) {
    const result = { isOk: false, info: ''}
    const ownerClub = await this.getOwnerClub(playerId);
    if (!ownerClub) {
      // 没有战队能联盟
      result.isOk = false;
      result.info = '请先创建战队';
      return result;
    }
    const commonCheck = await this.clubJoinRequestCheck(clubShortId, playerId);
    if (!commonCheck.isOk) {
      return commonCheck;
    }
    let record;
    // 检查加入的大联盟是不是只有一个
    record = await this.getJoinUnionClub(clubShortId);
    if (record) {
      result.isOk = false;
      result.info = '只能联盟一个战队';
      return result;
    }
    // 是否有人加入本联盟
    record = await this.getMyUnionClub(ownerClub.shortId);
    if (record.length > 0) {
      result.isOk = false;
      result.info = '战队已有联盟,不能加入其它战队';
      return result;
    }
    // 大联盟可加入数量有没有达到上限 50 个
    record = await this.getMyUnionClub(clubShortId);
    if (record.length >= config.club.unionClubLimit) {
      result.isOk = false;
      result.info = '联盟战队数量达到上限';
      return result;
    }
    // 大联盟成员数量有没有达到上限 1000 个
    const unionMemberCount = await this.countClubMember(commonCheck.club.shortId);
    const ownerMemberCount = await this.countClubMember(ownerClub.shortId);
    if (unionMemberCount + ownerMemberCount > config.club.unionClubMemberLimit) {
      result.isOk = false;
      result.info = '联盟成员数量达到上限';
      return result;
    }
    // 检查所有成员是不是已经在联盟中
    const allMember = await this.getAllClubMember(ownerClub.shortId);
    const playerList = service.utils.filterModel(allMember, 'member');
    record = await this.getAllMember(clubShortId, playerList);
    if (record.length > 0) {
      result.isOk = false;
      result.info = '有成员在联盟战队中';
      return result;
    }
    result.isOk = true;
    return result;
  }

  // 是否可以加入战队
  async isCanJoinClub(clubShortId, playerId) {
    const commonCheck = await this.clubJoinRequestCheck(clubShortId, playerId);
    if (!commonCheck.isOk) {
      return commonCheck;
    }
    const result = { isOk: false, info: '', club: commonCheck.club}
    let list;
    // 加入本战队的战队有没有本人
    let checkClubId = clubShortId;
    // 检查已经加入的联盟中是否有本人
    const record = await this.getJoinUnionClub(clubShortId);
    if (record) {
      checkClubId = record.mainClubShortId;
    }
    list = await this.getAllMember(checkClubId, [ playerId ]);
    if (list.length > 0) {
      result.isOk = false;
      result.info = '你已是联盟成员，不能加入该战队';
      return result;
    }
    // 大联盟成员数量有没有达到上限 1000 个
    const count = await this.countClubMember(checkClubId);
    if (count + 1 > config.club.unionClubMemberLimit) {
      result.isOk = false;
      result.info = '联盟成员达到上限';
      return result;
    }
    result.isOk = true;
    return result;
  }

  // 绑定联盟关系
  async bindUnionClub(ownerPlayerId, mainClubId, mainClubShortId, unionClub) {
    // 创建联盟关系
    await ClubUnion.create({
      mainClubShortId,
      mainClubId,
      fromClubShortId: unionClub.shortId,
      fromClubId: unionClub._id,
    })
    // 更新联盟 id
    await ClubMember.update({ club: unionClub._id },
      { $set: { unionClubShortId: mainClubShortId }},
      {multi: true}
    )
    // 将 owner 添加到 clubMember 中
    await ClubMember.create({
      club: mainClubId,
      member: ownerPlayerId,
      joinAt: new Date(),
      clubGold: 0,
      // 角色
      role: '',
      clubShortId: mainClubShortId,
      unionClubShortId: 0,
    })
    // 暂停小联盟
    unionClub.state = 'off';
    await unionClub.save();
  }

  // 解除联盟关系
  async unbindUnionClub(fromClubOwnerPlayerId, mainClubId, mainClubShortId, fromClubId, fromClubShortId) {
    // 设置 unionClubShortId = 0
    await ClubMember.update({ club: fromClubId },
      { $set: { unionClubShortId: 0 }},
      {multi: true}
    )
    // mainClub 删除加入的战队主
    await ClubMember.remove({
      club: mainClubId,
      member: fromClubOwnerPlayerId,
    })
    await ClubUnion.remove({
      mainClubShortId,
      fromClubShortId,
    })
  }

  // 获取本战队的联盟
  async getJoinUnionClub(clubShortId) {
    return ClubUnion.findOne({
      fromClubShortId: clubShortId
    });
  }

  // 获取加入本联盟的战队
  async getMyUnionClub(clubShortId) {
    return ClubUnion.find({
      mainClubShortId: clubShortId
    });
  }

  // 获取联盟成员数量
  async countClubMember(clubShortId) {
    return ClubMember.count({
      $or: [
        { clubShortId },
        { unionClubShortId: clubShortId },
      ],
    })
  }

  // 获取创建的战队
  async getOwnerClub(playerId) {
    return Club.findOne({owner: playerId});
  }

  // 获取战队所有成员（包括联盟成员）
  async getAllMember(clubShortId, playerList?) {
    if (playerList) {
      return ClubMember.find({
        member: {
          $in: playerList,
        },
        $or: [
          { clubShortId },
          { unionClubShortId: clubShortId },
        ]
      })
    }
    return ClubMember.find({
      $or: [
        { clubShortId },
        { unionClubShortId: clubShortId },
      ]
    })
  }

  async getAllClubMember(clubShortId) {
    return ClubMember.find({
      clubShortId
    })
  }

  async getClubByShortId(clubShortId) {
    return Club.findOne({shortId: clubShortId})
  }

  // 公共申请检查
  async clubJoinRequestCheck(clubShortId, playerId) {
    const result =  { isOk: false, info: '', club: null }
    const alreadyJoinedClubs = await ClubMember.count({member: playerId });
    if (alreadyJoinedClubs >= 5) {
      result.isOk = false;
      result.info = '您已经加入了5个，无法提交新的申请';
      return result;
    }
    const haveThisClub = await this.getClubByShortId(clubShortId);
    if (!haveThisClub) {
      result.isOk = false;
      result.info = `没有Id为${clubShortId}的战队！`;
      return result;
    }
    result.club = haveThisClub;
    const member = await this.getClubMember(haveThisClub._id, playerId);
    if (member) {
      result.isOk = false;
      result.info = '您已加入该战队,不能重复加入！';
      return result;
    }
    result.isOk = true;
    return result;
  }

  // 根据 roomId 获取 detail
  async getRoomDetailByRoomId(roomId: number) {
    return RoomDetailModel.findOne({ roomId })
  }

  // 获取联盟邀请
  async getOrAddUnionRequest(mainPlayerId, mainPlayerShortId, mainClubShortId, inviteClubShortId) {
    let record = await ClubUnionRequest.findOne({
      mainClubShortId,
      inviteClubShortId,
      isClose: false,
    })
    if (record) {
      return { record, isNew: false };
    }
    record = await ClubUnionRequest.create({
      mainPlayerId,
      mainPlayerShortId,
      mainClubShortId,
      inviteClubShortId,
      createAt: new Date(),
      isAccept: false,
      isClose: false,
    });
    return { record, isNew: true }
  }

  // 我的联盟邀请列表
  async getMyUnionRequest(clubShortId) {
    const record = await ClubUnionRequest.find({
      inviteClubShortId: clubShortId,
    }).populate('mainPlayerId');
    const result = [];
    for (const r of record) {
      result.push({
        requestId: r._id,
        inviterShortId: r.mainPlayerShortId,
        inviterName: r.mainPlayerId.name,
        isClose: r.isClose,
        isAccept: r.isAccept,
        createAt: r.createAt,
      })
    }
    return result;
  }

  async getClubMemberByShortId(playerId, clubShortId) {
    return ClubMember.findOne({
      member: playerId,
      clubShortId,
    });
  }

  // 统计昨日开局次数
  async countYesterdayGameByClub(clubId) {
    const result = await RoomRecord.find({
      club: clubId,
      createAt: {
        $gte: service.times.startOfYesterdayDate(),
        $lte: service.times.endOfYesterdayDate(),
      }
    })
    let count = 0;
    result.forEach(value => {
      count += value.juIndex;
    })
    return count;
  }

  // 邮件通知战队邀请
  async mailAcceptUnionClubInvite(inviter, invitee) {
    const mail = new MailModel({
      to: inviter._id,
      type: MailType.MESSAGE,
      title: '战友加入通知',
      content: `玩家ID${invitee.shortId}【${invitee.name}】同意邀请，加入您的战队成为您的亲密战友`,
      state: MailState.UNREAD,
      createAt: new Date(),
      gift: {gem: 0, ruby: 0, gold: 0}
    })
    await mail.save();
  }

  // 亲密战友解除通知
  async mailUnbindUnionClub(inviter) {
    const mail = new MailModel({
      to: inviter._id,
      type: MailType.MESSAGE,
      title: '战友解除通知',
      content: `玩家ID${inviter.shortId}【${inviter.name}】与您解除了亲密战友`,
      state: MailState.UNREAD,
      createAt: new Date(),
      gift: {gem: 0, ruby: 0, gold: 0}
    })
    await mail.save();
  }

  // 计算分成
  async calculateGold(clubShortId, playerId, goldAmount) {
    const result = { inviterGold: 0, inviterPlayerId: ''}
    const member = await this.getUnionMember(clubShortId, playerId);
    if (!member) {
      // 不是联盟成员，不需要分红
      return result;
    }
    // 查找战队主的分成比率
    const unionClub = await Club.findById(member.club);
    if (!unionClub) {
      return result;
    }
    const ownerMember = await this.getClubMember(unionClub._id, unionClub.owner);
    if (!ownerMember) {
      return result;
    }
    result.inviterPlayerId = unionClub.owner;
    // 小胖子传的是整数
    result.inviterGold = service.utils.accMul(goldAmount, ownerMember.degree / 100);
    return result;
  }

  // 获取联盟成员
  async getUnionMember(clubShortId, playerId) {
    return ClubMember.findOne({
      member: playerId,
      unionClubShortId: clubShortId
    })
  }

  // async getOwnerMember(clubId) {
  //   const club = await Club.findById(clubId);
  //   if (!club) {
  //     return null;
  //   }
  //   return ClubMember.findOne({
  //     member: club.owner,
  //     club: club._id,
  //   })
  // }

  // 加入联盟战队房间
  async joinUnionClubRoom(unionMember, gameRule, clubId, playerId) {
    const mainClub = await this.getClubByShortId(unionMember.unionClubShortId);
    if (!mainClub) {
      return { isOk: false, info: '战队不存在'};
    }
    const isOk = await this.playerInClubBlacklist(mainClub._id, playerId);
    if (isOk) {
      return { isOk: false, info: '您暂时不能参与游戏，详情咨询圈主或管理员！'};
    }
    if (gameRule.useClubGold) {
      // 检查金币
      if (unionMember.clubGold < gameRule.leastGold) {
        return { isOk: false, info: '您的金币不足' };
      }
    }
    return { isOk: true };
  }

  // 非联盟战队房
  async joinNormalClubRoom(gameRule, clubId, playerId) {
    let isOk = await this.playerCanJoinClubRoom(playerId, clubId);
    if (!isOk) {
      return { isOk: false, info: '该房间为战队房间, 非该战队成员无法加入'};
    }
    isOk = await this.playerInClubBlacklist(clubId, playerId);
    if (isOk) {
      return { isOk: false, info: '您暂时不能参与游戏，详情咨询圈主或管理员！'};
    }
    if (gameRule.useClubGold) {
      // 检查金币
      const clubMember = await ClubMember.findOne({
        club: clubId,
        member: playerId,
      });
      if (clubMember.clubGold < gameRule.leastGold) {
        return { isOk: false, info: '您的金币不足' };
      }
    }
    return { isOk: true };
  }

  async getClubExtra(clubId) {
    let clubExtra = await ClubExtra.findOne({ clubId });
    if (!clubExtra) {
      clubExtra = await ClubExtra.create({
        clubId,
      })
    }
    return clubExtra
  }

  // 是否在战队黑名单
  async playerInClubBlacklist(clubId, playerId) {
    const clubExtra = await this.getClubExtra(clubId)
    const clubBlacklist = clubExtra && clubExtra.blacklist || []
    return clubBlacklist.find(x => x === playerId);
  }

  async playerCanJoinClubRoom(playerId, clubId) {
    const clubMemberInfo = await ClubMember.findOne({
      member: playerId,
      club: clubId,
    })
    return !!clubMemberInfo;
  }

  async isClubMember(playerId, clubShortId) {
    const member = await ClubMember.findOne({
      member: playerId,
      $or: [
        { clubShortId },
        { unionClubShortId: clubShortId },
      ]
    });
    return !!member;
  }
}
