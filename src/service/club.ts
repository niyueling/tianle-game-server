import Club from "../database/models/club";
import ClubMember from "../database/models/clubMember";
import BaseService from "./base";
import {service} from "./importService";

// 区域
export default class ClubService extends BaseService {


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

}
