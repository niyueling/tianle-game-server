import {RuleType} from "@fm/common/constants";
import Club from '../../database/models/club'
import ClubMember from '../../database/models/clubMember'
import ClubRuleModel from "../../database/models/clubRule";
import {MailModel, MailState, MailType} from "../../database/models/mail";
import {playerInClub} from '../../match/IRoom';
import {service} from "../../service/importService";

function lobbyQueueNameFrom(gameType: string) {
  return `${gameType}Lobby`
}

// 操作战队
export const enum ClubAction {
  // 改名
  rename= 'club/rename',
  // 转移俱乐部
  transfer= 'club/transfer',
  // 清空游戏币
  cleanCoin= 'club/cleanCoin',
  // 编辑规则
  editRule= 'club/editRule',
  // 创建规则
  addRule = 'club/addRule',
  // 删除规则
  deleteRule = 'club/deleteRule',
}

// export async function getPlayerClub(playerId, gameType: string, clubId?: string) {
//   let clubMemberInfo;
//   if (clubId) {
//     clubMemberInfo = await ClubMember.findOne({ member: playerId, club: clubId })
//   } else {
//     clubMemberInfo = await ClubMember.findOne({ member: playerId })
//   }
//
//   if (!clubMemberInfo) {
//     const ownerClub = await Club.findOne({ owner: playerId });
//     if (ownerClub) {
//       return ownerClub;
//     }
//     return false
//   }
//   const club = await Club.findOne({ _id: clubMemberInfo.club }).lean()
//   return club;
// }

// async function getOwnerClub(playerId, gameType = 'zhadan', clubShortId) {
//   const ownerClub = await Club.findOne({ owner: playerId, gameType, shortId: clubShortId });
//   if (ownerClub) {
//     return ownerClub;
//   }
//   return false
// }

// 创建俱乐部房间
async function createClubRoom(player, message) {
  const club = await Club.findOne({ shortId: message.clubShortId })
  if (!club) {
    player.sendMessage('room/join-fail', { reason: '战队房错误。' });
    return
  }
  if (club.state === 'off') {
    player.sendMessage('room/join-fail', { reason: '该战队创建房间功能被圈主暂停，详情请联系圈主' });
    return
  }
  const playerInBlacklist = await service.club.playerInClubBlacklist(club._id, player._id);
  if (playerInBlacklist) {
    player.sendMessage('room/join-fail', { reason: `您暂时不能参与游戏，详情咨询圈主或管理员！` });
    return
  }
  if (!await service.club.isClubMember(player._id, club.shortId)) {
    player.sendMessage('room/join-fail', { reason: '您不是该战队成员' });
    return
  }
  // 检查是否解锁 gameType
  if (!club.gameList || !club.gameList[message.gameType]) {
    // 没解锁
    return player.sendMessage('room/join-fail', { reason: '当前游戏未解锁' });
  }
  const rule = message.rule
  const {lockedRule} = await getClubRule(club);
  const locked = lockedRule[message.gameType];
  if (locked && locked.jokerCount && locked.jokerCount === rule.jokerCount) {
    player.sendMessage('room/join-fail', { reason: '房间限制规则已改变，无法创建带有' + rule.jokerCount + '王的游戏！' });
    return
  }

  if (rule.useClubGold) {
    rule.useClubGold = true;
    let clubMember = await ClubMember.findOne({club: club._id, member: player._id})
    if (!clubMember) {
      // 检查联盟战队
      clubMember = await ClubMember.findOne({
        unionClubShortId: club.shortId,
        member: player._id,
      })
    }
    if (!clubMember || clubMember.clubGold < rule.leastGold) {
      player.sendMessage('room/join-fail', { reason: '您的金币不足' });
      return;
    }
  }

  const gameType = rule.type || 'shisanshui'
  player.setGameName(message.gameType)
  player.requestTo(lobbyQueueNameFrom(gameType), 'createClubRoom', { rule, clubId: club._id })
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

export async function playerIsAdmin(playerId, gameType, clubShortId) {
  const club = await Club.findOne({ shortId: clubShortId })
  if (!club) {
    return false
  }
  const clubMemberInfo = await ClubMember.findOne({ member: playerId, club: club._id })

  if (clubMemberInfo) {
    return clubMemberInfo.role === 'admin'
  }
  return false
}

function gameType2Name(gameType) {
  const gameName = {
    zhadan: '炸弹',
    shisanshui: '十三水',
    majiang: '麻将',
    niuniu: '牛牛'
  }
  return gameName[gameType] || gameName.zhadan
}

export default {
  // 'club/request': async (player, message) => {
  //   if (!message.gameType) {
  //     player.sendMessage('club/requestReply', { ok: false, info: '无法提交申请！' });
  //     return
  //   }
  //
  //   const alreadyJoinedClubs = await ClubMember.count({member: player.model._id, gameType: message.gameType}).lean()
  //
  //   if (alreadyJoinedClubs >= 5) {
  //     player.sendMessage('club/requestReply', { ok: false, info: '您已经加入了5个,无法提交新的申请！' });
  //     return
  //   }
  //
  //   const clubRequest = await ClubRequest.findOne({
  //     playerId: player.model._id,
  //     clubShortId: message.clubShortId,
  //     gameType: message.gameType
  //   });
  //   if (clubRequest) {
  //     player.sendMessage('club/requestReply', { ok: false, info: '已提交过申请！' });
  //     return
  //   }
  //
  //   const haveThisClub = await Club.findOne({ shortId: message.clubShortId, gameType: message.gameType })
  //   if (!haveThisClub) {
  //     const clubName = gameType2Name(message.gameType);
  //     player.sendMessage('club/requestReply', { ok: false, info: `没有Id为${message.clubShortId}的${clubName}战队！` });
  //     return
  //   }
  //
  //   const clubMember = await ClubMember.findOne({
  //     club: haveThisClub._id,
  //     member: player.model._id,
  //     gameType: message.gameType
  //   });
  //
  //   if (clubMember) {
  //     player.sendMessage('club/requestReply', { ok: false, info: '您已加入了该战队,不能重复加入！' });
  //     return
  //   }
  //
  //   await requestToAllClubMember(player.channel, 'clubRequest', haveThisClub._id, message.gameType, {})
  //
  //   ClubRequest.create({
  //     playerId: player.model._id,
  //     clubShortId: message.clubShortId,
  //     headImage: player.model.headImgUrl || "http://wx.qlogo.cn/mmopen/vi_32/" +
  //       "PiajxSqBRaEIrBEU3kqpPyp5DaY7bibfhEic2CuWdDFEjN9UJqcPeKmvhmK8RVLfjiaM2oKicAgrMNY0AicuSkZPR2ibQ/0",
  //     playerShortId: player.model.shortId,
  //     gameType: message.gameType,
  //     playerName: player.model.name,
  //   },
  //     err => {
  //       if (err) {
  //         logger.error("====>>  ", err)
  //       }
  //     }
  //   )
  //
  //   player.sendMessage('club/requestReply', { ok: true, info: '成功提交申请！' });
  // },
  'club/create': createClubRoom,
  // 'club/getClubInfo': async (player, message) => {
  //   const gameType = message.gameType
  //   const tempClub = await Club.findOne({ shortId: message.clubShortId });
  //   const clubId = tempClub ? tempClub._id.toString() : ''
  //
  //   if (!gameType) {
  //     player.sendMessage('club/getClubInfoReply', { ok: false, info: '错误的请求' });
  //   }
  //
  //   const playerClub = await getPlayerClub(player.model._id, gameType, clubId)
  //   if (!playerClub) {
  //     player.sendMessage('club/getClubInfoReply', { ok: false, roomInfo: [], clubInfo: {}, info: '非战队玩家' });
  //     return;
  //   }
  //
  //   const allClubMemberShips = await ClubMember.find({ gameType, member: player.model._id }).populate('club').lean();
  //
  //   const clubs = allClubMemberShips.map(cm => cm.club)
  //
  //   const room = await Lobby.getInstance().getClubRooms(playerClub._id);
  //   const currentClubMemberShip = allClubMemberShips.find(x => x.club._id.toString() === clubId)
  //
  //   const isAdmin = currentClubMemberShip && currentClubMemberShip.role === 'admin'
  //
  //   const clubOwnerId = playerClub.owner;
  //   const clubOwner = await PlayerModel.findOne({ _id: clubOwnerId }).sort({ name: 1 })
  //
  //   if (currentClubMemberShip && isNullOrUndefined(currentClubMemberShip.clubGold)) {// 旧数据增加clubGold
  //     await ClubMember.update({club: currentClubMemberShip.club, member: currentClubMemberShip.member},
  //       {$set: {clubGold: 0}})
  //   }
  //
  //   const currentClubPlayerGold = currentClubMemberShip && currentClubMemberShip.clubGold || 0;
  //   const clubRule = await getClubRule(playerClub);
  //   const clubInfo = {
  //     gem: clubOwner.gem,
  //     name: clubOwner.name,
  //     clubGold: currentClubPlayerGold,
  //     clubName: playerClub.name,
  //     clubShortId: playerClub.shortId,
  //     defaultRule: playerClub.defaultRule,
  //     defaultGoldRule: playerClub.defaultGoldRule,
  //     lockedRule: playerClub.lockedRule,
  //     publicRule: clubRule.publicRule,
  //     goldRule: clubRule.goldRule,
  //   }
  //
  //   // fixme : un-listen
  //   await player.listenClub(playerClub._id)
  //   player.sendMessage('club/getClubInfoReply', { ok: true, roomInfo: room, clubInfo, clubs , isAdmin });
  // },
  // 'club/leave': async (player, message) => {
  //   const club = await Club.findOne({ gameType: message.gameType, shortId: message.clubShortId })
  //   if (!club) {
  //     player.sendMessage('club/leaveReply', { ok: false, info: `没有战队【${message.clubShortId}】` });
  //     return
  //   }
  //   const leaveId = player.model._id;
  //   if (club.owner == leaveId) {
  //     player.sendMessage('club/leaveReply', { ok: false, info: `战队主不能离开自己的战队！` });
  //     return
  //   }
  //   const clubMemberInfo = await ClubMember.findOne({ club: club._id, gameType: message.gameType, member: leaveId })
  //   if (!clubMemberInfo) {
  //     player.sendMessage('club/leaveReply', { ok: false, info: '您没有加入该战队' });
  //     return
  //   }
  //   if (clubMemberInfo.clubGold != undefined && clubMemberInfo.clubGold < 0) {
  //     player.sendMessage('club/leaveReply', { ok: false, info: '金币为负数，无法退出战队，请联系战队主。' });
  //     return
  //   }
  //   await ClubMember.remove({ member: leaveId, club: club._id, gameType: message.gameType })
  //   player.sendMessage('club/leaveReply', { ok: true, info: '删除成功！' });
  // },
  // 'club/getRequestInfo': async (player, message) => {
  //   let myClub = await getOwnerClub(player.model._id, message.gameType, message.clubShortId);
  //   if (!myClub && await playerIsAdmin(player.model._id, message.gameType, message.clubShortId)) {
  //     myClub = await Club.findOne({ shortId: message.clubShortId, gameType: message.gameType });
  //   }
  //   if (!myClub) {
  //     player.sendMessage('club/getRequestInfoReply', { ok: false, info: '战队创建者才可查看' });
  //     return
  //   }
  //   if (myClub.shortId != message.clubShortId) {
  //     player.sendMessage('club/getRequestInfoReply', { ok: false, info: '该战队非自己的战队' });
  //     return
  //   }
  //   const clubRequestInfo = await ClubRequest.find({ clubShortId: message.clubShortId, gameType: message.gameType });
  //   player.sendMessage('club/getRequestInfoReply', { ok: true, clubRequestInfo });
  // },
  // 'club/dealRequest': async (player, message) => {
  //   const club = await Club.findOne({ gameType: message.gameType, shortId: message.clubShortId })
  //   let myClub = await getOwnerClub(player.model._id, message.gameType, message.clubShortId);
  //   if (!myClub && await playerIsAdmin(player.model._id, message.gameType, message.clubShortId)) {
  //     myClub = await Club.findOne({ shortId: message.clubShortId, gameType: message.gameType });
  //   }
  //
  //   const isClubOwner = myClub && myClub.shortId === message.clubShortId;
  //   const memberShip = await ClubMember.findOne({ club: club._id, member: player._id }).lean()
  //
  //   const isAmin = memberShip.role === 'admin'
  //
  //   if (isClubOwner || isAmin) {
  //     await ClubRequest.remove({
  //       playerId: message.requestId,
  //       gameType: message.gameType,
  //       clubShortId: message.clubShortId
  //     });
  //     if (message.refuse) {
  //       player.sendMessage('club/dealRequestReply', { ok: true, info: '已拒绝玩家请求！' });
  //       return;
  //     }
  //     const clubMember = await ClubMember.findOne({
  //       club: myClub._id,
  //       member: message.requestId, gameType: message.gameType
  //     });
  //
  //     if (clubMember) {
  //       player.sendMessage('club/dealRequestReply', { ok: true, info: '该玩家已加入战队！' });
  //       return
  //     }
  //
  //     const nJoinedClub = await ClubMember.count({
  //       member: message.requestId, gameType: message.gameType
  //     })
  //
  //     if (nJoinedClub >= 5) {
  //       player.sendMessage('club/dealRequestReply', { ok: false, info: '该玩家已经加入5个战队,不能再加入其它战队' });
  //       return
  //     }
  //
  //     const clubId = myClub._id
  //     ClubMember.create({
  //       club: clubId,
  //       member: message.requestId,
  //       gameType: message.gameType,
  //       clubGold: 0,
  //     },
  //       err => {
  //         if (err) {
  //           logger.error(err)
  //         }
  //       })
  //     player.sendMessage('club/dealRequestReply', { ok: true, info: '加入玩家成功！' });
  //     return;
  //   }
  //   player.sendMessage('club/dealRequestReply', { ok: false, info: '处理失败！' });
  // },
  // 'club/updatePlayerInfo': async (player, message) => {
  //   const ownerClub = await Club.find({ owner: player.model._id, gameType: message.gameType });
  //   const tempClub = {};
  //   if (ownerClub && ownerClub.length > 0) {
  //     // 存在俱乐部
  //     ownerClub.forEach(c => {
  //       tempClub[c.gameType] = c.shortId
  //     })
  //   }
  //   player.model.myClub = tempClub;
  //   const playerClub = await getPlayerClub(player.model._id, message.gameType);
  //   if (playerClub) {
  //     player.model.clubShortId = playerClub.shortId;
  //   }
  //   player.sendMessage('club/updatePlayerInfoReply', {
  //     clubShortId: player.model.clubShortId,
  //     myClub: player.model.myClub
  //   });
  // },
  // 'club/recordList': async (player, message) => {
  //   let myClub = await getOwnerClub(player.model._id, message.gameType, message.clubShortId);
  //   if (!myClub && await playerIsAdmin(player.model._id, message.gameType, message.clubShortId)) {
  //     myClub = await Club.findOne({ shortId: message.clubShortId, gameType: message.gameType });
  //   }
  //   if (myClub && myClub.shortId === message.clubShortId) {
  //     const records = await RoomRecord
  //       .find({ club: myClub._id, category: message.gameType })
  //       .sort({ createAt: -1 })
  //       .limit(1000)
  //       .lean()
  //       .exec()
  //
  //     const formatted = records.map(r => {
  //       return {
  //         _id: r.room,
  //         roomId: r.roomNum,
  //         time: r.createAt.getTime(),
  //         creatorId: r.creatorId || 233,
  //         players: r.scores,
  //         rule: r.rule,
  //         roomState: r.roomState,
  //         checked: r.checked,
  //         seen: r.seen
  //       }
  //     })
  //
  //     player.sendMessage('club/recordListReply', { ok: true, records: formatted })
  //     return;
  //   }
  //   player.sendMessage('club/recordListReply', { ok: false, info: '没有权限！' });
  // },
  // 'club/recordRankList': async (player, message) => {
  //   const club = await  Club.findOne({ shortId: message.clubShortId, gameType: message.gameType });
  //   if (club) {
  //     let onlyShowMySelf = true;
  //     const myClub = await getOwnerClub(player.model._id, message.gameType, message.clubShortId);
  //     if (myClub || await playerIsAdmin(player.model._id, message.gameType, message.clubShortId)) {
  //       onlyShowMySelf = false;
  //     }
  //
  //     const records = await RoomRecord
  //       .find({ club: club._id, category: message.gameType })
  //       .sort({ createAt: -1 })
  //       .lean()
  //       .exec()
  //
  //     const rankData = [];
  //     let currntDate = new Date(Date.now());
  //     let detailData = [];
  //
  //     const clubMembers = await ClubMember.find({ club: club._id, gameType: message.gameType })
  //       .populate('member').lean();
  //     for (const clubMember of clubMembers) {
  //       if (clubMember.member) {
  //         detailData = [];
  //         for (let i = 0; i < 3; i++) {
  //           currntDate = new Date(Date.now() - 24 * 60 * 60 * 1000 * i);
  //           detailData.push({
  //             time: currntDate.toLocaleDateString(),
  //             juData: {
  //               club: {
  //                 gold: {
  //                   ju4: 0,
  //                   ju8: 0,
  //                   ju12: 0
  //                 },
  //                 normal: {
  //                   ju4: 0,
  //                   ju8: 0,
  //                   ju12: 0
  //                 }
  //               },
  //               person: {
  //                 gold: {
  //                   ju4: 0,
  //                   ju8: 0,
  //                   ju12: 0
  //                 },
  //                 normal: {
  //                   ju4: 0,
  //                   ju8: 0,
  //                   ju12: 0
  //                 }
  //               }
  //             },
  //             scoreData: {
  //               club: {
  //                 gold: 0,
  //                 normal: 0
  //               },
  //               person: {
  //                 gold: 0,
  //                 normal: 0
  //               }
  //             }
  //           })
  //         }
  //         const pData = {
  //           shortId: clubMember.member.shortId,
  //           headImgUrl: clubMember.member.headImgUrl,
  //           name: clubMember.member.name,
  //           score: clubMember.member.score,
  //           detailData
  //         }
  //         if (onlyShowMySelf) {
  //           if (clubMember.member.shortId == player.model.shortId) {
  //             rankData.push(pData);
  //           }
  //         } else {
  //           rankData.push(pData);
  //         }
  //       }
  //     }
  //     records.forEach(r => {
  //       const juShu = r.rule.juShu;
  //       const isPerson = r.rule.clubPersonalRoom;
  //       const isGoldRoom = r.rule.useClubGold;
  //       const roomTime = new Date(r.createAt).toLocaleDateString();
  //
  //       const juAdd = function (x, ju = "ju4") {
  //         if (isPerson) {
  //           if (isGoldRoom) {
  //             x.juData.person.gold[ju] += 1;
  //           } else {
  //             x.juData.person.normal[ju] += 1;
  //           }
  //         } else {
  //           if (isGoldRoom) {
  //             x.juData.club.gold[ju] += 1;
  //           } else {
  //             x.juData.club.normal[ju] += 1;
  //           }
  //         }
  //       }
  //       const scoreAdd = function(x, score) {
  //         if (isPerson) {
  //           if (isGoldRoom) {
  //             x.scoreData.person.gold += score;
  //           } else {
  //             x.scoreData.person.normal += score;
  //           }
  //         } else {
  //           if (isGoldRoom) {
  //             x.scoreData.club.gold += score;
  //           } else {
  //             x.scoreData.club.normal += score;
  //           }
  //         }
  //       }
  //       r.scores.forEach(d => {
  //         if (onlyShowMySelf && d.shortId != player.model.shortId) {
  //           return
  //         }
  //         let tempIndex = rankData.findIndex(x => x.shortId == d.shortId);
  //         detailData = [];
  //         for (let i = 0; i < 3; i++) {
  //           currntDate = new Date(Date.now() - 24 * 60 * 60 * 1000 * i);
  //           detailData.push({
  //             time: currntDate.toLocaleDateString(),
  //             juData: {
  //               club: {
  //                 gold: {
  //                   ju4: 0,
  //                   ju8: 0,
  //                   ju12: 0
  //                 },
  //                 normal: {
  //                   ju4: 0,
  //                   ju8: 0,
  //                   ju12: 0
  //                 }
  //               },
  //               person: {
  //                 gold: {
  //                   ju4: 0,
  //                   ju8: 0,
  //                   ju12: 0
  //                 },
  //                 normal: {
  //                   ju4: 0,
  //                   ju8: 0,
  //                   ju12: 0
  //                 }
  //               }
  //             },
  //             scoreData: {
  //               club: {
  //                 gold: 0,
  //                 normal: 0
  //               },
  //               person: {
  //                 gold: 0,
  //                 normal: 0
  //               }
  //             }
  //           })
  //         }
  //         let pData = {
  //           shortId: d.shortId,
  //           headImgUrl: d.headImgUrl,
  //           name: d.name,
  //           score: d.score,
  //           detailData
  //         }
  //         if (tempIndex < 0) {
  //           rankData.push(pData);
  //           tempIndex = rankData.length - 1;
  //           pData = rankData[tempIndex];
  //         } else {
  //           pData = rankData[tempIndex];
  //           pData.score += d.score;
  //         }
  //
  //         pData.detailData.forEach(x => {
  //           if (roomTime == x.time) {
  //             scoreAdd(x, d.score);
  //           }
  //         })
  //
  //         switch (juShu) {
  //           case 4:
  //             pData.detailData.forEach(x => {
  //               if (roomTime == x.time) {
  //                 juAdd(x, "ju4");
  //               }
  //             })
  //             break;
  //           case 8:
  //             pData.detailData.forEach(x => {
  //               if (roomTime == x.time) {
  //                 juAdd(x, "ju8");
  //               }
  //             })
  //             break;
  //           case 12:
  //             pData.detailData.forEach(x => {
  //               if (roomTime == x.time) {
  //                 juAdd(x, "ju12");
  //               }
  //             })
  //             break;
  //         }
  //       })
  //     })
  //
  //     player.sendMessage('club/recordRankListReply', { ok: true, rankData})
  //     return;
  //   }
  //   player.sendMessage('club/recordRankListReply', { ok: false, info: '无法查看！' });
  // },
  // 'club/recordRoomPlayerInfo': async (player, message) => {
  //   let myClub = await getOwnerClub(player.model._id, message.gameType, message.clubShortId);
  //   if (!myClub && await playerIsAdmin(player.model._id, message.gameType, message.clubShortId)) {
  //     myClub = await Club.findOne({ shortId: message.clubShortId, gameType: message.gameType });
  //   }
  //   if (myClub && myClub.shortId === message.clubShortId) {
  //     const records = await GameRecord
  //       .find({ room: message.roomId, type: message.gameType })
  //       .sort({ time: 1 })
  //       .lean()
  //       .exec()
  //     const roomNum = records[0] && records[0].game.roomId
  //     const allJuShu = records[0] && records[0].game.rule.juShu
  //     const playerInfos = []
  //     const roomInfos = {
  //       ju: []
  //     }
  //     records.forEach(record => {
  //       const playerInfo = record.record
  //       const events = record.events.splice(0, 4)
  //       for (let i = 0; i < playerInfo.length; i++) {
  //         const playerCardsInfo = events.find(x => x.index === i)
  //         playerInfo[i].cards = []
  //         if (playerCardsInfo) {
  //           playerInfo[i].cards = playerCardsInfo.info.cards
  //         }
  //       }
  //       // 最后一局解散，出现多余战绩bug(例如共12局出现13.14局战绩)，用规则限制个数
  //       if (playerInfos.length >= allJuShu) {
  //         return
  //       }
  //       roomInfos.ju.push(record.juShu)
  //       playerInfos.push(playerInfo)
  //     })
  //     player.sendMessage('club/recordRoomPlayerInfoReply', { ok: true, playerInfos, roomInfos, roomNum })
  //     return;
  //   }
  //   player.sendMessage('club/recordRoomPlayerInfoReply', { ok: false, info: '没有权限！' });
  // },
  // 'club/changeClubRecordState': async (player, message) => {
  //   let myClub = await getOwnerClub(player.model._id, message.gameType, message.clubShortId);
  //   if (!myClub && await playerIsAdmin(player.model._id, message.gameType, message.clubShortId)) {
  //     myClub = await Club.findOne({ shortId: message.clubShortId, gameType: message.gameType });
  //   }
  //   if (!myClub) {
  //     player.sendMessage('club/changeClubRecordStateReply', { ok: false, info: '没有权限' });
  //     return;
  //   }
  //   try {
  //     await RoomRecord.update({ room: message.room }, {
  //       checked: true,
  //     })
  //     player.sendMessage('club/changeClubRecordStateReply', { ok: true, info: '移除成功' });
  //   } catch (e) {
  //     logger.error(e)
  //   }
  // },
  // 'club/seenClubRecords': async (player, message) => {
  //   let myClub = await getOwnerClub(player.model._id, message.gameType, message.clubShortId);
  //   if (!myClub && await playerIsAdmin(player.model._id, message.gameType, message.clubShortId)) {
  //     myClub = await Club.findOne({ shortId: message.clubShortId, gameType: message.gameType });
  //   }
  //   if (!myClub) {
  //     player.sendMessage('club/seenClubRecordsReply', { ok: false, info: '没有权限' });
  //     return;
  //   }
  //   try {
  //     await RoomRecord.update({ room: message.room }, {
  //       seen: true,
  //     })
  //     player.sendMessage('club/seenClubRecordsReply', { ok: true, info: '设置成功' });
  //   } catch (e) {
  //     logger.error(e)
  //   }
  // },
  // 'club/changeState': async (player, message) => {
  //   if (!message.gameType) {
  //     player.sendMessage('club/changeStateReply', { ok: false, info: '错误的请求' })
  //     return
  //   }
  //   const myClub = await Club.findOne({ owner: player.model._id, gameType: message.gameType });
  //
  //   if (myClub) {
  //     myClub.state = message.state
  //     await myClub.save()
  //     const info = message.state === 'on' ? '已打开战队创建房间功能' : '已关闭战队创建房间功能'
  //     player.sendMessage('club/changeStateReply', { ok: true, info, state: message.state })
  //   } else {
  //     player.sendMessage('club/changeStateReply', { ok: false, info: '错误的请求' })
  //   }
  // },
  // 'club/getClubMembers': async (player, message) => {
  //   let myClub = await getOwnerClub(player.model._id, message.gameType, message.clubShortId);
  //   if (!myClub && await playerIsAdmin(player.model._id, message.gameType, message.clubShortId)) {
  //     myClub = await Club.findOne({ shortId: message.clubShortId, gameType: message.gameType });
  //   }
  //   if (!myClub) {
  //     player.sendMessage('club/getClubMembersReply', { ok: false, info: '非战队创建者不能查看' });
  //     return
  //   }
  //   const clubExtra = await getClubExtra(myClub._id, message.gameType)
  //   const clubMembers = await ClubMember.find({ club: myClub._id, gameType: message.gameType })
  //   const clubMembersInfo = [];
  //   const clubExtraData = {
  //     blacklist: clubExtra && clubExtra.blacklist,
  //     renameList: clubExtra && clubExtra.renameList,
  //   }
  //   for (const clubMember of clubMembers) {
  //     const memberInfo = await PlayerModel.findOne({ _id: clubMember.member })
  //     if (memberInfo) {
  //       clubMembersInfo.push({
  //         name: memberInfo.name,
  //         id: memberInfo._id,
  //         headImage: memberInfo.headImgUrl,
  //         gem: memberInfo.gem,
  //         clubGold: clubMember.clubGold,
  //         shortId: memberInfo.shortId,
  //         isAdmin: clubMember.role === 'admin'
  //       })
  //     }
  //   }
  //
  //   player.sendMessage('club/getClubMembersReply', { ok: true, clubMembersInfo, clubExtraData });
  // },
  // 'club/renameClubPlayer': async (player, message) => {
  //   let myClub = await getOwnerClub(player.model._id, message.gameType, message.clubShortId);
  //   if (!myClub && await playerIsAdmin(player.model._id, message.gameType, message.clubShortId)) {
  //     myClub = await Club.findOne({ shortId: message.clubShortId, gameType: message.gameType });
  //   }
  //
  //   if (!myClub) {
  //     player.sendMessage('club/renameClubPlayerReply', { ok: false, info: '权限不足，不能执行操作' });
  //     return
  //   }
  //   const clubExtra = await getClubExtra(myClub._id, message.gameType)
  //   const renameList = clubExtra.renameList
  //   renameList[message.playerId] = message.rename
  //
  //   await ClubExtra.update({clubId: myClub._id}, {$set: {renameList}})
  //   player.sendMessage('club/renameClubPlayerReply', { ok: true, info: '操作成功' });
  // },
  // 俱乐部改名
  // [ClubAction.rename]: async (player, message) => {
  //   const myClub = await getOwnerClub(player.model._id, message.gameType, message.clubShortId);
  //   if (!myClub) {
  //     player.replyFail(ClubAction.rename, Errors.noPermission);
  //     return
  //   }
  //   const playerInfo = await PlayerModel.findOne({ _id: player.model._id })
  //   // 检查房卡
  //   const requiredGem = config.get('club.gemRename');
  //   if (playerInfo.gem < requiredGem) {
  //     player.replyFail(ClubAction.rename, `房卡不足请充值(需要房费${requiredGem})`);
  //     return
  //   }
  //   if (!message.newClubName || message.newClubName.length > config.get('club.maxNameLength')) {
  //     player.replyFail(ClubAction.rename, Errors.invalidName );
  //     return
  //   }
  //   // 保存新名字
  //   const oldName = myClub.name;
  //   myClub.name = message.newClubName;
  //   await myClub.save();
  //   const remainGem = playerInfo.gem - requiredGem;
  //   await PlayerModel.update({_id: player.model._id}, {$set: { gem: remainGem }}).exec();
  //   player.replySuccess(ClubAction.rename, { gem: remainGem });
  //   // 添加日志
  //   await logRename(myClub._id, oldName, myClub.name, playerInfo._id);
  // },
  // [ClubAction.rename]: async (player, message) => {
  //   const myClub = await getOwnerClub(player.model._id, message.gameType, message.clubShortId);
  //   if (!myClub) {
  //     player.replyFail(ClubAction.rename, Errors.noPermission);
  //     return
  //   }
  //   const playerInfo = await PlayerModel.findOne({ _id: player.model._id })
  //   // 检查房卡
  //   const requiredGem = config.get('club.gemRename');
  //   if (playerInfo.gem < requiredGem) {
  //     player.replyFail(ClubAction.rename, `房卡不足请充值(需要房卡${requiredGem})`);
  //     return
  //   }
  //   if (!message.newClubName || message.newClubName.length > config.get('club.maxNameLength')) {
  //     player.replyFail(ClubAction.rename, Errors.invalidName );
  //     return
  //   }
  //   // 保存新名字
  //   const oldName = myClub.name;
  //   myClub.name = message.newClubName;
  //   await myClub.save();
  //   const remainGem = playerInfo.gem - requiredGem;
  //   await PlayerModel.update({_id: player.model._id}, {$set: { gem: remainGem }}).exec();
  //   player.replySuccess(ClubAction.rename, { gem: remainGem });
  //   // 添加日志
  //   await logRename(myClub._id, oldName, myClub.name, playerInfo._id);
  // },
  // 转移
  // [ClubAction.transfer]: async (player, message) => {
  //   const myClub = await getOwnerClub(player.model._id, message.gameType, message.clubShortId);
  //   if (!myClub) {
  //     player.replyFail(ClubAction.transfer, Errors.noPermission);
  //     return
  //   }
  //   const playerInfo = await PlayerModel.findOne({ _id: player.model._id })
  //   // 检查房卡
  //   const outGem = config.get('club.transferOutGem');
  //   if (playerInfo.gem < outGem) {
  //     player.replyFail(ClubAction.transfer, `房卡不足,转移操作需要${outGem}房卡,您当前房卡为${playerInfo.gem}个`);
  //     return
  //   }
  //   // 转入的房卡
  //   const inGem = config.get('club.transferInGem');
  //   // 接收人
  //   const transferee = await PlayerModel.findOne({ shortId: message.toShortId });
  //   if (!transferee) {
  //     player.replyFail(ClubAction.transfer, Errors.playerNotExists);
  //     return
  //   }
  //   if (transferee.gem < inGem) {
  //     player.replyFail(ClubAction.transfer, '对方房卡不足,不能转入');
  //     return
  //   }
  //   if (transferee.shortId === playerInfo.shortId) {
  //     player.replyFail(ClubAction.transfer, Errors.transferClubSamePlayer);
  //     return
  //   }
  //   const hasClub = await Club.findOne({ owner: transferee._id, gameType: message.gameType });
  //   if (hasClub) {
  //     player.replyFail(ClubAction.transfer, '对方已有战队，不能转移');
  //     return
  //   }
  //   // 保存
  //   myClub.owner = transferee._id;
  //   await myClub.save();
  //   await PlayerModel.update({_id: player.model._id}, {$set: { gem: playerInfo.gem - outGem }}).exec();
  //   await PlayerModel.update({_id: transferee._id}, {$set: { gem: transferee.gem - inGem }}).exec();
  //   // 添加被转移人为成员
  //   const member = await ClubMember.findOne({ member: transferee._id, gameType: message.gameType, club: myClub._id});
  //   if (!member) {
  //     await ClubMember.create({
  //       club: myClub._id,
  //       member: transferee._id,
  //       joinAt: new Date(),
  //       gameType: message.gameType
  //     })
  //   }
  //   player.replySuccess(ClubAction.transfer,  { gem: playerInfo.gem - outGem });
  //   // 通知被转移人
  //   await notifyTransfer(playerInfo, transferee, myClub.name, myClub.shortId);
  //   // 添加日志
  //   await logTransfer(myClub._id, playerInfo._id, transferee._id);
  // },
  // 'club/operateBlackList': async (player, message) => {
  //   let myClub = await getOwnerClub(player.model._id, message.gameType, message.clubShortId);
  //   if (!myClub && await playerIsAdmin(player.model._id, message.gameType, message.clubShortId)) {
  //     myClub = await Club.findOne({ shortId: message.clubShortId, gameType: message.gameType });
  //   }
  //
  //   if (!myClub) {
  //     player.sendMessage('club/operateBlackListReply', { ok: false, info: '权限不足，不能执行操作' });
  //     return
  //   }
  //   if (myClub.owner === message.playerId) {
  //     player.sendMessage('club/operateBlackListReply', { ok: false, info: '不能操作战队主' });
  //     return
  //   }
  //   const clubExtra = await getClubExtra(myClub._id, message.gameType)
  //   let blacklist = clubExtra.blacklist
  //   if (message.operate === 'add') {
  //     blacklist.push(message.playerId)
  //   } else {
  //     blacklist = blacklist.filter(x => x != message.playerId)
  //   }
  //   clubExtra.blacklist = blacklist
  //   await clubExtra.save()
  //   player.sendMessage('club/operateBlackListReply', { ok: true, info: '操作成功' });
  // },
  // 'club/removePlayer': async (player, message) => {
  //   let myClub = await getOwnerClub(player.model._id, message.gameType, message.clubShortId);
  //   if (!myClub && await playerIsAdmin(player.model._id, message.gameType, message.clubShortId)) {
  //     myClub = await Club.findOne({ shortId: message.clubShortId, gameType: message.gameType });
  //   }
  //
  //   if (!myClub) {
  //     player.sendMessage('club/removePlayerReply', { ok: false, info: '非战队创建者不能操作' });
  //     return
  //   }
  //   if (myClub.owner === message.playerId) {
  //     player.sendMessage('club/removePlayerReply', { ok: false, info: '不能移除战队主' });
  //     return
  //   }
  //   await ClubMember.remove({ member: message.playerId, gameType: message.gameType, club: myClub._id })
  //   player.sendMessage('club/removePlayerReply', { ok: true, info: '移除成功' });
  // },
  // 'club/adminRemovePlayer': async (player, message) => {
  //
  //   const club = await Club.findOne({ shortId: message.clubShortId, gameType: message.gameType })
  //
  //   const playerToRm = await PlayerModel.findOne({ shortId: message.shortId }).lean()
  //
  //   const memberShip = await ClubMember.findOne({ club: club._id, member: playerToRm._id }).lean()
  //
  //   if (memberShip.role === 'admin') {
  //     return player.sendMessage('club/adminRemovePlayerReply', { ok: false, info: '管理员不能删除其他管理员' });
  //   }
  //
  //   if (playerToRm._id === club.owner) {
  //     return player.sendMessage('club/adminRemovePlayerReply', { ok: false, info: '管理员不能删除战队创建者' });
  //   }
  //
  //   if (playerToRm._id === player._id) {
  //     return player.sendMessage('club/adminRemovePlayerReply', { ok: false, info: '不能删除您自己' });
  //   }
  //
  //   await ClubMember.remove({ member: message.playerId, gameType: message.gameType, club: club._id })
  //
  //   player.sendMessage('club/adminRemovePlayerReply', { ok: true, info: '移除成功' });
  // },
  // 设置默认规则
  // 'club/setDefaultRule': async (player, message) => {
  //   if (!message.gameType) {
  //     player.sendMessage('club/setDefaultRuleReply', { ok: false, info: '错误的请求' })
  //     return
  //   }
  //   let myClub = await Club.findOne({ owner: player.model._id, gameType: message.gameType });
  //   if (!myClub && await playerIsAdmin(player.model._id, message.gameType, message.clubShortId)) {
  //     myClub = await Club.findOne({ shortId: message.clubShortId, gameType: message.gameType });
  //   }
  //
  //   if (myClub) {
  //     myClub.defaultRule = message.rule
  //     await myClub.save()
  //     player.sendMessage('club/setDefaultRuleReply', { ok: true })
  //   } else {
  //     player.sendMessage('club/setDefaultRuleReply', { ok: false, info: '错误的请求' })
  //   }
  // },
  // 'club/setDefaultGoldRule': async (player, message) => {
  //   if (!message.gameType) {
  //     player.sendMessage('club/setDefaultGoldRuleReply', { ok: false, info: '错误的请求' })
  //     return
  //   }
  //   let myClub = await Club.findOne({ owner: player.model._id, gameType: message.gameType });
  //   if (!myClub && await playerIsAdmin(player.model._id, message.gameType, message.clubShortId)) {
  //     myClub = await Club.findOne({ shortId: message.clubShortId, gameType: message.gameType });
  //   }
  //
  //   if (myClub) {
  //     myClub.defaultGoldRule = message.rule
  //     await myClub.save()
  //     player.sendMessage('club/setDefaultGoldRuleReply', { ok: true })
  //   } else {
  //     player.sendMessage('club/setDefaultGoldRuleReply', { ok: false, info: '错误的请求' })
  //   }
  // },
  // 'club/setLockRule': async (player, message) => {
  //   if (!message.gameType) {
  //     player.sendMessage('club/setLockRuleReply', { ok: false, info: '错误的请求' })
  //     return
  //   }
  //   let myClub = await Club.findOne({ owner: player.model._id, gameType: message.gameType });
  //   if (!myClub && await playerIsAdmin(player.model._id, message.gameType, message.clubShortId)) {
  //     myClub = await Club.findOne({ shortId: message.clubShortId, gameType: message.gameType });
  //   }
  //
  //   if (myClub) {
  //     myClub.lockedRule = message.lockedRule
  //     await myClub.save()
  //     player.sendMessage('club/setLockRuleReply', { ok: true })
  //   } else {
  //     player.sendMessage('club/setLockRuleReply', { ok: false, info: '错误的请求' })
  //   }
  // },
  // 'club/promoteAdmin': async (player, { playerShortId, gameType }) => {
  //   if (!gameType) {
  //     player.sendMessage('club/promoteAdminReply', { ok: false, info: '错误的请求' })
  //     return
  //   }
  //   if (player.model.shortId === playerShortId) {
  //     player.sendMessage('club/promoteAdminReply', { ok: false, info: '不能修改圈主权限' })
  //     return
  //   }
  //   const club = await Club.findOne({ owner: player.model._id, gameType });
  //
  //   if (club) {
  //
  //     const member = await PlayerModel.findOne({ shortId: playerShortId })
  //     const memberShip = await ClubMember.findOne({ club: club._id, member: member._id })
  //
  //     if (memberShip) {
  //       memberShip.role = 'admin'
  //       await memberShip.save()
  //       return player.sendMessage('club/promoteAdminReply', { ok: true, info: '设置成功' })
  //     } else {
  //       player.sendMessage('club/promoteAdminReply', { ok: false, info: '错误的请求' })
  //     }
  //   } else {
  //     player.sendMessage('club/promoteAdminReply', { ok: false, info: '错误的请求' })
  //   }
  // },
  // 增加游戏币
  // 'club/updatePlayerClubGold': async (player, { playerShortId, gameType, clubShortId, clubGold }) => {
  //   if (!gameType) {
  //     player.sendMessage('club/updatePlayerClubGoldReply', { ok: false, info: '错误的请求' })
  //     return
  //   }
  //   /*
  //   if (player.model.shortId === playerShortId) {
  //     player.sendMessage('club/updatePlayerClubGoldReply', { ok: false, info: '不能修改圈主' })
  //     return
  //   }
  //   */
  //   if (!clubGold || clubGold < 0) {
  //     player.sendMessage('club/updatePlayerClubGoldReply', { ok: false, info: '参数错误' })
  //     return
  //   }
  //   const club = await Club.findOne({ shortId: clubShortId, gameType });
  //
  //   if (club) {
  //
  //     const member = await PlayerModel.findOne({ shortId: playerShortId })
  //     const memberShip = await ClubMember.findOne({ club: club._id, member: member._id })
  //
  //     if (memberShip) {
  //       memberShip.clubGold += clubGold;
  //       await ClubGoldRecord.create({
  //         club: club._id,
  //         member: member._id,
  //         from: player._id,
  //         gameType,
  //         goldChange: clubGold,
  //         allClubGold: memberShip.clubGold,
  //         info: "圈主增加",
  //       })
  //
  //       await memberShip.save()
  //       return player.sendMessage('club/updatePlayerClubGoldReply', { ok: true, info: '设置成功' })
  //     } else {
  //       player.sendMessage('club/updatePlayerClubGoldReply', { ok: false, info: '错误的请求' })
  //     }
  //   } else {
  //     player.sendMessage('club/updatePlayerClubGoldReply', { ok: false, info: '错误的请求' })
  //   }
  // },
  // 清空游戏币
  // [ClubAction.cleanCoin]: async (player, { playerShortId, gameType, clubShortId }) => {
  //   if (!gameType) {
  //     player.replyFail(ClubAction.cleanCoin, Errors.requestError)
  //     return
  //   }
  //   const member = await PlayerModel.findOne({ shortId: playerShortId })
  //   const gn = await gameIsRunning(member._id);
  //   if (gn) {
  //     player.sendMessage('club/cleanCoinReply', { ok: false, info: '该玩家在游戏房间内，请退出房间后重试！'});
  //     return;
  //   }
  //   const club = await Club.findOne({ shortId: clubShortId, gameType });
  //   if (!club) {
  //     player.replyFail(ClubAction.cleanCoin, Errors.clubNotExists);
  //     return
  //   }
  //   const memberShip = await ClubMember.findOne({ club: club._id, member: member._id })
  //   if (memberShip) {
  //     const clubGold = memberShip.clubGold;
  //     memberShip.clubGold = 0;
  //     await ClubGoldRecord.create({
  //       club: club._id,
  //       member: member._id,
  //       from: player._id,
  //       gameType,
  //       goldChange: -clubGold,
  //       allClubGold: 0,
  //       info: "圈主清零",
  //     })
  //
  //     await memberShip.save()
  //     return player.replySuccess(ClubAction.cleanCoin)
  //   } else {
  //     player.replyFail(ClubAction.cleanCoin, Errors.notClubMember);
  //   }
  // },
  // 'club/getClubGoldRecords': async (player, { gameType }) => {
  //   player.sendMessage('club/getClubGoldRecordsReply', { ok: false, info: '暂未开放' })
  //   // if (!gameType) {
  //   //   player.sendMessage('club/getClubGoldRecordsReply', { ok: false, info: '错误的请求' })
  //   //   return
  //   // }
  //   // const club = await Club.findOne({ owner: player.model._id, gameType });
  //
  //   // if (club) {
  //   //   let allRecords = await ClubGoldRecord.find({club:club._id}).sort({createAt: -1}).populate('member');
  //
  //   //   let result = [];
  //   //   allRecords.forEach(x => {
  //   //     if(x.from && x.from != "pay") {
  //   //       let temp = {
  //   //         fromIsOwner: false,
  //   //         goldChange: x.goldChange,
  //   //         member: x.member && x.member.name,
  //   //         shortId: x.member && x.member.shortId,
  //   //         createAt: x.createAt
  //   //       }
  //   //       if(x.from == club.owner) {
  //   //         temp.fromIsOwner = true;
  //   //       }
  //   //       result.push(temp)
  //   //     }
  //   //   })
  //
  //   //   return player.sendMessage('club/getClubGoldRecordsReply', { ok: true, allRecords: result })
  //   // } else {
  //   //   player.sendMessage('club/getClubGoldRecordsReply', { ok: false, info: '错误的请求' })
  //   // }
  // },
  // 'club/unPromoteAdmin': async (player, { playerShortId, gameType }) => {
  //   if (!gameType) {
  //     player.sendMessage('club/unPromoteAdminReply', {ok: false, info: '错误的请求'})
  //     return
  //   }
  //   const club = await Club.findOne({owner: player.model._id, gameType});
    // [ClubAction.cleanCoin]: async (player, { playerShortId, gameType, clubShortId }) => {
    //   if (!gameType) {
    //     player.replyFail(ClubAction.cleanCoin, Errors.requestError)
    //     return
    //   }
    //   /*
    //   if (player.model.shortId === playerShortId) {
    //     player.replyFail(ClubAction.cleanCoin, Errors.noModifyClubCreator)
    //     return
    //   }
    //   */
    //   const club = await Club.findOne({ shortId: clubShortId, gameType });
    //   if (!club) {
    //     player.replyFail(ClubAction.cleanCoin, Errors.clubNotExists);
    //     return
    //   }
    //   const member = await PlayerModel.findOne({ shortId: playerShortId })
    //   const memberShip = await ClubMember.findOne({ club: club._id, member: member._id })
    //   if (memberShip) {
    //     const clubGold = memberShip.clubGold;
    //     memberShip.clubGold = 0;
    //     await ClubGoldRecord.create({
    //       club: club._id,
    //       member: member._id,
    //       from: player._id,
    //       gameType,
    //       goldChange: -clubGold,
    //       allClubGold: 0,
    //       info: "圈主清零",
    //     })
    //
    //     await memberShip.save()
    //     return player.replySuccess(ClubAction.cleanCoin)
    //   } else {
    //     player.replyFail(ClubAction.cleanCoin, Errors.notClubMember);
    //   }
    // },
    // 'club/getClubGoldRecords': async (player, { gameType }) => {
    //   player.sendMessage('club/getClubGoldRecordsReply', { ok: false, info: '暂未开放' })
    //   // if (!gameType) {
    //   //   player.sendMessage('club/getClubGoldRecordsReply', { ok: false, info: '错误的请求' })
    //   //   return
    //   // }
    //   // const club = await Club.findOne({ owner: player.model._id, gameType });
    //
    //   // if (club) {
    //   //   let allRecords = await ClubGoldRecord.find({club:club._id}).sort({createAt: -1}).populate('member');
    //
    //   //   let result = [];
    //   //   allRecords.forEach(x => {
    //   //     if(x.from && x.from != "pay") {
    //   //       let temp = {
    //   //         fromIsOwner: false,
    //   //         goldChange: x.goldChange,
    //   //         member: x.member && x.member.name,
    //   //         shortId: x.member && x.member.shortId,
    //   //         createAt: x.createAt
    //   //       }
    //   //       if(x.from == club.owner) {
    //   //         temp.fromIsOwner = true;
    //   //       }
    //   //       result.push(temp)
    //   //     }
    //   //   })
    //
    //   //   return player.sendMessage('club/getClubGoldRecordsReply', { ok: true, allRecords: result })
    //   // } else {
    //   //   player.sendMessage('club/getClubGoldRecordsReply', { ok: false, info: '错误的请求' })
    //   // }
    // },
    // 'club/unPromoteAdmin': async (player, { playerShortId, gameType }) => {
    //   if (!gameType) {
    //     player.sendMessage('club/unPromoteAdminReply', { ok: false, info: '错误的请求' })
    //     return
    //   }
    //   const club = await Club.findOne({ owner: player.model._id, gameType });
    //
    //   if (club) {
    //     const member = await PlayerModel.findOne({ shortId: playerShortId })
    //     const memberShip = await ClubMember.findOne({ club: club._id, member: member._id })
    //
    //     if (memberShip) {
    //       memberShip.role = ''
    //       await memberShip.save()
    //       return player.sendMessage('club/unPromoteAdminReply', { ok: true, info: '设置成功' })
    //     } else {
    //       player.sendMessage('club/unPromoteAdminReply', { ok: false, info: '错误的请求' })
    //     }
    //   } else {
    //     player.sendMessage('club/unPromoteAdminReply', { ok: false, info: '错误的请求' })
    //   }
    // },
    // 'club/createNewClub': async (player, message) => {
    //
    //   if (!message.gameType) {
    //     player.sendMessage('club/createNewClubReply', { ok: false, info: '错误的请求' })
    //     return
    //   }
    //
    //   const ownerClub = await Club.findOne({ owner: player.model._id, gameType: message.gameType });
    //   if (ownerClub) {
    //     player.sendMessage('club/createNewClubReply', { ok: false, info: '您已有战队！' })
    //     return
    //   }
    //
    //   const joinedClub = await ClubMember.count({ member: player.model._id, gameType: message.gameType })
    //   if (joinedClub >= 5) {
    //     player.sendMessage('club/createNewClubReply', { ok: false, info: '您已经加入了5个战队,不能再创建战队了！' })
    //     return
    //   }
    //
    //   if (!message.clubName) {
    //     player.sendMessage('club/createNewClubReply', { ok: false, info: '战队名称设置有误' })
    //     return
    //   }
    //
    //   const playerInfo = await PlayerModel.findOne({ _id: player.model._id })
    //   player.model.gem = playerInfo.gem
    //   if (player.model.gem < 1380) {
    //     player.sendMessage('club/createNewClubReply', { ok: false, info: '您的房卡不足1380张，无法创建战队' })
    //     return
    //   }
    //   if (!player.model.phone) {
    //     player.sendMessage('club/createNewClubReply', { ok: false, info: '请在大厅内先完成手机绑定，然后再创建战队' })
    //     return
    //   }
    //
    //   if (await Club.findOne({ name: message.clubName, gameType: message.gameType })) {
    //     player.sendMessage('club/createNewClubReply', { ok: false, info: '与其它战队名称重复，请更换调整名称重试！' })
    //     return
    //   }
    //   let loopTimes = 2
    //   let clubShortId = 10000;
    //
    //   while (loopTimes > 0) {
    //     const clubGlobal = await ClubGlobal.findOneAndUpdate({ type: message.gameType },
    //       { $inc: { shortIdCounter: 1 } }, { new: true })
    //     clubShortId = clubGlobal.shortIdCounter
    //     const sameClub = await Club.findOne({ shortId: clubShortId, gameType: message.gameType });
    //     if (!sameClub) {
    //       loopTimes = 0
    //     }
    //     loopTimes--
    //   }
    //
    //   try {
    //     const club = new Club({
    //       owner: player.model._id,
    //       shortId: clubShortId,
    //       name: message.clubName,
    //       gameType: message.gameType,
    //     })
    //     await club.save()
    //     await ClubMember.create({
    //       club: club._id, member: player.model._id,
    //       joinAt: new Date(),
    //       gameType: message.gameType
    //     })
    //
    //     // if (player.model.gem < 1428) {
    //     //   player.model.gem -= 99
    //     //
    //     //   await PlayerModel.update({_id: player._id}, {
    //     //     $inc: {
    //     //       gem: -99
    //     //     }
    //     //   }).exec()
    //     //   player.sendMessage('resource/update', {gold: player.model.gold, gem: player.model.gem})
    //     // }
    //
    //     player.sendMessage('club/createNewClubReply', { ok: true, info: `战队${clubShortId}创建成功` })
    //   } catch (e) {
    //     console.error(e);
    //     player.sendMessage('club/createNewClubReply', { ok: false, info: '战队创建失败' })
    //     return
    //
    //   }
    // },

    // 'club/rebate': async (player, message) => {
    //   if (!message.gameType) {
    //     player.sendMessage('club/rebateReply', { ok: false, info: '错误的请求' })
    //     return
    //   }
    //   const myClub = await Club.findOne({ shortId: message.clubShortId, owner: player.model._id,
    //     gameType: message.gameType });
    //
    //   if (myClub) {
    //     const clubId = myClub._id
    //     const day = moment().subtract(0, 'day').startOf('day').toDate()
    //     const from = moment(day).startOf('day').toDate()
    //     const end = moment(day).endOf('day').toDate()
    //
    //     const data = {
    //       roomInfo: [],
    //       getGem: 0,
    //     }
    //     const clubRoomRecord = await ClubRoomRecordModel.findOne({ club: clubId, createAt: { $gt: from, $lte: end }})
    //     if (clubRoomRecord) {
    //       const roomInfo = clubRoomRecord.roomInfo
    //       if (roomInfo) {
    //         let baJuTimes = 0
    //         let shierJuJuTimes = 0
    //         let shibaJuJuTimes = 0
    //         if (roomInfo[8]) {
    //           baJuTimes = roomInfo[8].times || 0
    //         }
    //         if (roomInfo[12]) {
    //           shierJuJuTimes = roomInfo[12].times || 0
    //         }
    //         if (roomInfo[18]) {
    //           shibaJuJuTimes = roomInfo[18].times || 0
    //         }
    //         data.roomInfo = roomInfo
    //         if (message.gameType === 'zhadan' || message.gameType === 'biaofen') {
    //           if (shierJuJuTimes >= 100) {
    //             data.getGem = baJuTimes + shierJuJuTimes * 2 || 0
    //           } else if (baJuTimes + shierJuJuTimes >= 30) {
    //             data.getGem = baJuTimes + shierJuJuTimes || 0
    //           }
    //         }
    //         if (message.gameType === 'shisanshui') {
    //           if (shibaJuJuTimes >= 100) {
    //             data.getGem = shierJuJuTimes + shibaJuJuTimes * 2 || 0
    //           } else if (shierJuJuTimes + shibaJuJuTimes >= 30) {
    //             data.getGem = shierJuJuTimes + shibaJuJuTimes || 0
    //           }
    //         }
    //
    //         if (message.gameType === 'majiang') {
    //           if (shierJuJuTimes >= 30) {
    //             data.getGem = shierJuJuTimes || 0
    //           }
    //         }
    //
    //         player.sendMessage('club/rebateReply', { ok: false, info: '请联系客服，微信号:pcsssmj', data })
    //         return
    //         /*
    //         if (clubRoomRecord.received) {
    //           player.sendMessage('club/rebateReply', { ok: false, info: '您今天已经领取过了。', data })
    //           return
    //         }
    //         if (data.getGem > 0 && !clubRoomRecord.received) {
    //           clubRoomRecord.getGem = data.getGem
    //           player.model.gem += data.getGem
    //           await PlayerModel.update({ _id: player._id }, {
    //             $inc: {
    //               gem: data.getGem
    //             }
    //           }).exec()
    //           player.sendMessage('resource/update', { gold: player.model.gold, gem: player.model.gem })
    //
    //         }
    //         clubRoomRecord.receivedAt = Date.now()
    //         clubRoomRecord.received = true
    //         await clubRoomRecord.save()
    //         */
    //       }
    //     } else {
    //       player.sendMessage('club/rebateReply', { ok: false, info: '您的战队昨日没有符合要求的房间。' })
    //       return
    //     }
    //
    //     player.sendMessage('club/rebateReply', { ok: true, data })
    //   } else {
    //     player.sendMessage('club/rebateReply', { ok: false, info: '错误的请求' })
    //   }
    // },
    // [ClubAction.editRule]: async (player, message) => {
    //   const result = await ClubRuleModel.findById(message.ruleId);
    //   if (!result) {
    //     player.replyFail(ClubAction.editRule, '没有此规则');
    //     return;
    //   }
    //   const isOk = await hasRulePermission(result.clubId, player.model._id);
    //   if (!isOk) {
    //     player.replyFail(ClubAction.editRule, '没有权限');
    //     return;
    //   }
    //   const rule = message.rule;
    //   // 人数不可更改
    //   rule.playerCount = result.playerCount;
    //   delete rule.ruleId;
    //   result.rule = rule;
    //   await result.save();
    //   player.replySuccess(ClubAction.editRule);
    // },
    // [ClubAction.addRule]: async (player, message) => {
    //   const clubShortId = message.clubShortId;
    //   const gameType = message.gameType;
    //   // 公共房还是金币房
    //   const ruleType = message.ruleType;
    //   const rule = message.rule;
    //   const playerCount = rule.playerCount;
    //   const club = await Club.findOne({ gameType, shortId: clubShortId });
    //   if (!club) {
    //     player.replyFail(ClubAction.addRule, '俱乐部不存在');
    //     return;
    //   }
    //   const isOk = await hasRulePermission(club._id, player.model._id);
    //   if (!isOk) {
    //     player.replyFail(ClubAction.addRule, '没有权限');
    //     return;
    //   }
    //   // 根据玩家数查找规则
    //   const find = await ClubRuleModel.findOne({ clubId: club._id, gameType, ruleType, playerCount });
    //   if (find) {
    //     // 当前玩家人数的规则已经有了
    //     player.replyFail(ClubAction.addRule, '当前规则已存在');
    //     return;
    //   }
    //   const { model } = await createClubRule(club._id, gameType, playerCount, ruleType, rule);
    //   // @ts-ignore
    //   player.replySuccess(ClubAction.addRule, { ...model.rule, ruleId: model._id.toString()})
    // },
    // [ClubAction.deleteRule]: async (player, message) => {
    //   const result = await ClubRuleModel.findById(message.ruleId);
    //   if (!result) {
    //     player.replyFail(ClubAction.deleteRule, '没有此规则');
    //     return;
    //   }
    //   const isOk = await hasRulePermission(result.clubId, player.model._id);
    //   if (!isOk) {
    //     player.replyFail(ClubAction.deleteRule, '没有权限');
    //     return;
    //   }
    //   await result.remove();
    //   player.replySuccess(ClubAction.deleteRule);
    // },
}

// 邮件通知战队转移
async function notifyTransfer(oldOwner, newOwner, clubName, clubId) {
  const mail = new MailModel({
    to: newOwner._id,
    type: MailType.MESSAGE,
    title: '战队转移通知',
    content: `${oldOwner.name}(${oldOwner.shortId})将战队${clubName}(${clubId})转移给您`,
    state: MailState.UNREAD,
    createAt: new Date(),
    gift: {gem: 0, ruby: 0, gold: 0}
  })
  await mail.save();
}

/**
 * 获取 club 规则
 * @param club club model
 */
async function getClubRule(club) {
  const publicRule = [];
  const goldRule = [];
  const lockedRule = {};
  const result = await ClubRuleModel.find({ clubId: club._id });
  if (result.length > 0) {
    for (const r of result) {
      if (r.ruleType === RuleType.public) {
        publicRule.push({...r.rule, ruleId: r._id.toString()});
      } else if (r.ruleType === RuleType.gold) {
        goldRule.push({...r.rule, ruleId: r._id.toString()});
      } else if (r.ruleType === RuleType.locked) {
        lockedRule[r.gameType] = {...r.rule, ruleId: r._id.toString()};
      }
    }
  }
  return { publicRule, goldRule, lockedRule };
}

// 是否有权限更改规则
async function hasRulePermission(clubId, playerId) {
  // 检查是否创建者、管理员
  const myClub = await Club.findById(clubId);
  if (!myClub) {
    // 俱乐部不存在
    return false;
  }
  if (myClub.owner === playerId) {
    // 创建者
    return true;
  }
  const member = await ClubMember.findOne({ club: clubId, member: playerId });
  // 是成员且为管理员
  return member && member.role === 'admin';
}
