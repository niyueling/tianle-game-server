import {RuleType, TianleErrorCode} from "@fm/common/constants";
import Club from '../../database/models/club'
import ClubMember from '../../database/models/clubMember'
import ClubRuleModel from "../../database/models/clubRule";
import Lobby from '../../match/zhadan/centerlobby';
import {service} from "../../service/importService";
import ClubExtra from "../../database/models/clubExtra";

function lobbyQueueNameFrom(gameType: string) {
  return `${gameType}Lobby`
}

export async function getClubInfo(clubId: string) {
  const room = await Lobby.getInstance().getClubRooms(clubId);

  const club = await Club.findOne({ _id: clubId }).populate('owner');

  if (!club) {
    return;
  }

  const clubOwner = club.owner;
  const rules = await getClubRule(club);
  const clubInfo = {
    diamond: clubOwner.diamond,
    nickname: clubOwner.nickname,
    clubName: club.name,
    clubShortId: club.shortId,
    publicRule: rules.publicRule
  }

  return { ok: true, roomInfo: room, clubInfo };
}

async function playerInClub(clubShortId: string, playerId: string) {
  if (!clubShortId) {
    return false;
  }
  const club = await Club.findOne({shortId: clubShortId});
  if (!club) {
    return false;
  }

  if (club.owner === playerId) {
    return true;
  }

  return ClubMember.findOne({club: club._id, member: playerId}).exec();
}

export async function playerInClubBlacklist(clubId, playerId) {
  const clubExtra = await getClubExtra(clubId)
  const clubBlacklist = clubExtra && clubExtra.blacklist || []
  return clubBlacklist.find(x => x === playerId)
}

async function getClubExtra(clubId) {
  let clubExtra = await ClubExtra.findOne({clubId});
  if (!clubExtra) {
    clubExtra = await ClubExtra.create({
      clubId
    });
  }
  return clubExtra;
}

// 创建俱乐部房间
async function createClubRoom(player, message) {
  if (!await playerInClub(message.clubShortId, player._id)) {
    player.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.notClubMember});
    return
  }

  const club = await Club.findOne({shortId: message.clubShortId})
  if (!club) {
    player.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.clubNotExists});
    return
  }
  if (club.state === 'off') {
    player.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.clubIsPause});
    return
  }
  const playerInBlacklist = await playerInClubBlacklist(club._id, player._id)
  if (playerInBlacklist) {
    player.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.notJoinClubGame});
    return
  }

  const rule = message.rule;

  // if (rule.useClubGold) {
  //   rule.useClubGold = true;
  //   let clubMember = await ClubMember.findOne({club: club._id, member: player._id})
  //   if (!clubMember) {
  //     // 检查联盟战队
  //     clubMember = await ClubMember.findOne({
  //       unionClubShortId: club.shortId,
  //       member: player._id,
  //     })
  //   }
  //   if (!clubMember || clubMember.clubGold < rule.leastGold) {
  //     player.sendMessage('room/join-fail', { reason: '您的金币不足' });
  //     return;
  //   }
  // }

  const gameType = rule.type;
  player.setGameName(gameType);
  await player.connectToBackend(gameType);
  player.requestTo(lobbyQueueNameFrom(gameType), 'createClubRoom', { rule, clubId: club._id });
}

export async function requestToAllClubMember(channel, name, clubId, gameType, info) {

  const club = await Club.findOne({ _id: clubId });

  if (!club) {
    return
  }

  channel.publish(
    `exClubCenter`,
    `club:${gameType}:${clubId}`,
    toBuffer({ name, payload: info }))
}

function toBuffer(messageJson) {
  return new Buffer(JSON.stringify(messageJson))
}

export default {
  'club/create': createClubRoom,
}

/**
 * 获取 club 规则
 * @param club club model
 */
async function getClubRule(club) {
  const publicRule = [];
  const goldRule = [];
  const result = await ClubRuleModel.find({ clubId: club._id });
  if (result.length > 0) {
    for (const r of result) {
      if (r.ruleType === RuleType.public) {
        publicRule.push({...r.rule, ruleId: r._id.toString()});
      } else if (r.ruleType === RuleType.gold) {
        goldRule.push({...r.rule, ruleId: r._id.toString()});
      }
    }
  }
  return { publicRule, goldRule };
}
