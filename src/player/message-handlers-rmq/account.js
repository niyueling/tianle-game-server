import * as os from "os";
import * as logger from 'winston';
import * as https from 'https';
import * as mongoose from 'mongoose';
import PlayerModel from '../../database/models/player';
import GM from '../../database/models/gm';
import ClubMember from '../../database/models/clubMember';
import Club from '../../database/models/club';
import {RedPocketWithdrawRecordModel, RedPocketWithDrawState} from "../../database/models/redPocketRecord";
import PlayerManager from '../player-manager';
import * as config from '../../config';
import GameRecord from '../../database/models/gameRecord'
import Notice from '../../database/models/notice'
import RankList from '../../database/models/rankList'
import BuyProductRecord from '../../database/models/buyRecord'
import Product from '../../database/models/product'
import AccountIdModel from '../../database/models/accountId';
import {createLock, withLock} from "../../utils/lock";
import {batches_transfer} from '../../wechatPay/batches_transfer'
import * as path from 'path'
import createClient from "../../utils/redis";
import {service} from "../../service/importService";
import {getNewShortPlayerId} from "../../database/init";
import {TianleErrorCode} from "@fm/common/constants";
import WatchAdverRecord from "../../database/models/watchAdverRecord";
import PlayerBenefitRecord from "../../database/models/PlayerBenefitRecord";
import {pick} from "lodash";
import * as moment from "moment";
import Task from "../../database/models/task";

const QcloudSms = require("qcloudsms_js");

// 用户接口
export const AccountAction = {
  // 根据 shortId 查询用户
  queryAccount: 'account/queryByShortId'
}

const redisClient = createClient();

const allGameName = ['xueliu', 'guobiao', 'majiang']

const locker = createLock()

const wechatPayMent = new batches_transfer({
  mchId: config.wx.mchId,
  appId: config.wx.app_id,
  key: config.wx.sign_key,
  serial_no: config.wx.serial_no,
  certFilePath: path.join(__dirname, "..", "..", "..", "apiclient_cert.pem"),
  keyFilePath: path.join(__dirname, "..", "..", "..", "apiclient_key.pem")
});

async function sendSMS(player, phoneNum, smsCode, countDown = 1) {
  const appid = 1400195814;
  const appkey = "8332c9c20fe950b8a5c5daebab4f6ffe";

  const phoneNumbers = [phoneNum];

  const templateId = 303836;

  const smsSign = "";
  const qcloudsms = QcloudSms(appid, appkey);

  async function callback(err, res, resData) {
    if (err) {
      console.log("err: ", err);
      player.sendMessage('account/getSMSCodeReply', {ok: false, info: err})
    } else {

      await redisClient.setAsync(phoneNum, smsCode, 'ex', countDown * 60)
      player.sendMessage('account/getSMSCodeReply', {ok: true, info: '短信已发送', countDown})
    }
  }

  const ssender = qcloudsms.SmsSingleSender();
  const params = [smsCode, countDown];

  ssender.sendWithParam(86, phoneNumbers[0], templateId,
    params, smsSign, "", "", callback);


}

function getLocalIP() {
  if (process.env.NODE_ENV === 'production') {
    try {
      return os.networkInterfaces().eth0[0].address
    } catch (e) {
      return '127.0.0.1'
    }
  }
  return '127.0.0.1'
}

const LOCAL_IP = getLocalIP()

function resetPlayerLuckyDrawChance(id, p, onSuccess) {
  const player = p;
  PlayerModel.update({_id: id},
    {
      $set: {
        luckyDraw: {
          date: new Date().toLocaleDateString(),
          time: 1,
          usedLuckDrawTimes: 0,
        },
      },
    },
    (err) => {
      if (err) {
        logger.error(err);
        return;
      }
      player.model.luckyDraw.time = 1;
      player.model.luckyDraw.usedLuckDrawTimes = 0;
      if (onSuccess) {
        onSuccess();
      }
    });
}

function clearUnNoticedGiftMsg(id) {
  PlayerModel.update({_id: id},
    {
      $unset: {
        receivedGiftResource: [],
      },
    },
    (err) => {
      if (err) {
        logger.error(err);
        return;
      }
    });
}

async function otherGameIsRunning(playerId, currentGameType) {
  let roomNumber
  let roomExists

  const roomHash = await service.roomRegister.allRoomsForPlayer(playerId) || {}

  for (const gn of allGameName) {
    if (gn === currentGameType) {
      continue;
    }
    roomNumber = roomHash[gn]
    roomExists = await redisClient.getAsync(`room:${roomNumber}`)
    if (roomNumber && roomExists) {
      return gn;
    }
  }
  return null;
}

export async function getContestId(pId) {
  let result = {
    contestId: null,
    gameType: ''
  }
  for (const gn of allGameName) {
    const contestIds = await redisClient.smembersAsync(`contest:${gn}`)
    for (const cId of contestIds) {
      const playerIds = await redisClient.smembersAsync(`contest:${cId}`)
      if (playerIds.findIndex(x => x === pId) >= 0) {
        result.contestId = cId
        result.gameType = gn
        return result
      }
    }
  }
}

const ObjectId = mongoose.Types.ObjectId

function addResource(playerId, {gem, gold}) {
  const player = PlayerManager.getInstance().getPlayer(playerId)
  if (player) {
    player.sendMessage('gmTool/addResource', {
      gem,
      gold,
    });
    player.model.gem += gem
    player.model.gold += gold
  }
}

export default {
  'account/login': async (p, message) => {
    const player = p;
    let tempDoc

    if (message.phoneNum && message.phoneNum.length === 11) {
      tempDoc = await PlayerModel.findOne({phone: message.phoneNum}).exec()
      if (!tempDoc) {
        player.sendMessage('account/login-fail', {reason: `手机号${message.phoneNum}未注册。`});
        return
      }

      const smsCode = await redisClient.getAsync(message.phoneNum)
      if (!smsCode) {
        player.sendMessage('account/login-fail', {ok: false, info: `验证码超时或验证码错误。`});
        return
      }

      if (smsCode !== message.smsCode) {
        player.sendMessage('account/login-fail', {ok: false, info: `验证码错误。`});
        return
      }
      // await redisClient.delAsync(message.phoneNum)
    }
    const playerManager = PlayerManager.getInstance();
    const oldPlayer = playerManager.getPlayer(message._id);
    const gameName = message.gameType || 'shisanshui'
    if (oldPlayer) {
      if (oldPlayer._id === message._id) {
        logger.warn(`重复的登录消息：${message._id}`);
        oldPlayer.disconnect();
      }
    }

    const defaultModel = {
      _id: message._id ? message._id : new mongoose.Types.ObjectId(),
      name: message.name ? message.name : message._id,
      gem: config.game.initModelGemCount,
      headImgUrl: message.headImgUrl ? message.headImgUrl : '',
      sex: message.sex,
      gold: message._id ? config.game.initModelGoldCount : 0,
      luckyDraw: {
        date: new Date().toLocaleDateString(),
        time: 1,
      },
      isTourist: !message._id,
    };

    try {
      let doc
      if (tempDoc) {
        doc = tempDoc
      } else {
        doc = await PlayerModel.findOrCreate({_id: message._id}, defaultModel);
      }
      if (message.headImgUrl && doc.headImgUrl !== message.headImgUrl) {
        doc.headImgUrl = defaultModel.headImgUrl
      }

      if (message.name && doc.name !== message.name) {
        doc.name = message.name
        await doc.save()
      }

      if (!doc.shortId) {
        doc.shortId = await getNewShortPlayerId();
      }
      const now = new Date();
      if (doc.freezeDate && now.getTime() < doc.freezeDate.getTime()) {
        player.sendMessage('account/login-fail', {reason: `账号已被冻结。[id:${doc.shortId}]`});
        setTimeout(() => {
          player.disconnect()
        }, 1000 * 5)
        return;
      }
      doc = JSON.parse(JSON.stringify(doc));

      const checkCode = await AccountIdModel.findOne({player: doc._id}).exec();

      doc.needCheckCode = checkCode == null;

      player.model = doc;

      const playerInClub = await ClubMember.findOne({member: doc._id, gameType: gameName});
      if (playerInClub) {
        const club = await Club.findOne({_id: ObjectId(playerInClub.club)});
        doc.clubShortId = club.shortId;
      }

      const myClub = await Club.find({owner: doc._id});
      if (myClub) {
        let tempClub = {}
        myClub.forEach(c => {
          tempClub[c.gameType] = c.shortId
        })
        doc.myClub = tempClub
      }

      player.setGameName(gameName)

      await player.connectToBackend(player.gameName)

      clearUnNoticedGiftMsg(doc._id);

      const roomNumber = await service.roomRegister.roomNumber(doc._id, gameName)

      if (roomNumber) {
        doc.disconnectedRoom = true;
      }

      doc.myContestData = await getContestId(doc._id)

      const hasOtherGameNotOver = await otherGameIsRunning(doc._id, gameName)
      if (hasOtherGameNotOver) {
        player.sendMessage('account/login-fail', {reason: hasOtherGameNotOver});
        return;
      }
      if (doc.luckyDraw.date !== new Date().toLocaleDateString()) {
        resetPlayerLuckyDrawChance(doc._id, player, () => {
          player.sendMessage('account/login-success', doc);
        });
      } else {
        player.sendMessage('account/login-success', doc);
      }

      const notice = await Notice.findOne().sort({createAt: -1}).exec()

      if (notice) {
        player.sendMessage('global/notice', notice.message);
      }

      player.isLoggingIn = false;
      playerManager.addPlayer(player);
    } catch (error) {
      logger.error(error);
      player.disconnect();
    }
    playerManager.removeLoggingInPlayer(message._id);
  },

  //更新用户头像，昵称
  'account/updateUserInfo': async (p, message) => {
    const model = await service.playerService.getPlayerModel(p._id)
    model.avatar = message.avatar;
    model.nickname = message.nickname;
    model.isBindWechat = true;
    await model.save();
    p.sendMessage('account/updateUserInfoReply', {ok: true, data: model});
  },

  // 救济金数据
  'account/benefitData': async (p, message) => {
    const user = await PlayerModel.findOne({_id: p._id});
    if (!user) {
      return p.sendMessage("account/benefitDataReply", {ok: false, info: TianleErrorCode.userNotFound});
    }

    if (user.helpCount > 0) {
      const start = moment(new Date()).startOf('day').toDate();
      const end = moment(new Date()).endOf('day').toDate();
      const helpCount = await PlayerBenefitRecord.count({
        playerId: p._id,
        createAt: {$gte: start, $lt: end}
      });

      let gold = 100000;

      if (user.giftExpireTime && user.giftExpireTime > new Date().getTime()) {
        gold += gold * 0.5;
      }

      return p.sendMessage("account/benefitDataReply", {
        ok: true,
        data: {gold: gold, helpCount: helpCount + 1, totalCount: user.helpCount + helpCount}
      });
    }

    return p.sendMessage("account/benefitDataReply", {ok: false, info: TianleErrorCode.receiveFail});
  },

  // 发放救济金
  'account/benefit': async (p, message) => {
    const user = await PlayerModel.findOne({_id: p._id});
    if (!user) {
      return p.sendMessage("account/benefitDataReply", {ok: false, info: TianleErrorCode.userNotFound});
    }

    let gold = 100000;

    if (user.giftExpireTime && user.giftExpireTime > new Date().getTime()) {
      gold += gold * 0.5;
    }

    if (user.helpCount > 0) {
      user.helpCount--;
      user.gold += gold;
      await user.save();

      const start = moment(new Date()).startOf('day').toDate();
      const end = moment(new Date()).endOf('day').toDate();
      const helpCount = await PlayerBenefitRecord.count({
        playerId: p._id,
        createAt: {$gte: start, $lt: end}
      });

      const data = {
        playerId: p._id.toString(),
        shortId: user.shortId,
        helpCount: helpCount + 1,
        gold: gold,
        createAt: new Date()
      }

      await PlayerBenefitRecord.create(data);

      p.sendMessage('resource/update', {ok: true, data: pick(user, ['gold', 'diamond', 'tlGold'])})
      return p.sendMessage('account/benefitReply', {
        ok: true,
        data: {gold: gold, helpCount: helpCount + 1, totalCount: user.helpCount + helpCount + 1}
      });
    }

    return p.sendMessage('account/benefitReply', {ok: false, info: TianleErrorCode.receiveFail})
  },

  'account/weChatCode': async (p, message) => {
    const appid = '';
    const appSecret = '';
    // https://api.weixin.qq.com/sns/oauth2/access_token?appid=APPID&secret=SECRET&code=CODE&grant_type=authorization_code
    const options = {
      hostname: 'api.weixin.qq.com',
      port: 80,
      path: `/sns/oauth2/access_token?appid=${appid}&secret=${appSecret}&code=${message.code}&grant_type=authorization_code`,
      method: 'GET',
      // headers: {
      //   'Content-Type': 'application/x-www-form-urlencoded',
      // },
    };
    const reqCodeRes = await https.get(options);
    console.log(reqCodeRes);
    reqCodeRes.on('data', (data) => {
      console.log(data);
    });
  },
  // 'account/recordList': async (player, msg) => {
  //
  //   if (player.model) {
  //     const playerId = player.model._id
  //
  //     let records = await RoomRecord
  //       .find({players: playerId, category: msg.gameType || 'niuniu'})
  //       .sort({createAt: -1})
  //       .limit(10)
  //       .lean()
  //       .exec()
  //
  //
  //     const formatted = records.map((r) => {
  //       return {
  //         _id: r.room,
  //         roomId: r.roomNum,
  //         time: r.createAt.getTime(),
  //         rule: r.rule,
  //         players: r.scores
  //       }
  //     })
  //
  //     player.sendMessage('account/recordListReply', formatted)
  //   }
  // },
  'account/gameReplayList': async (player, message) => {
    if (player.model) {
      let room = message.room
      let records = await GameRecord
        .find({room})
        .select({playersInfo: 1, record: 1, time: 1, states: 1, game: 1, juShu: 1})
        .sort({time: 1})
        .lean()
        .exec()
      //最后一局解散，出现多余战绩bug(例如共12局出现13.14局战绩)，用规则限制个数
      //记录错误majiang记成了game.ro导致(game.rule)报错
      let allJuShu = records[0] && (records[0].game.rule && records[0].game.rule.juShu || records[0].game.ro && records[0].game.ro.juShu) || 1
      records = records.splice(0, allJuShu)
      records.forEach((record) => {
        record.record.sort((p1, p2) => {
          if (p1 && p2) {
            p1.name.localeCompare(p2.name)
          }
        })
      })

      player.sendMessage('account/gameReplayListReply', records)
    }
  },
  'account/gameReplay': async (player, message) => {
    if (player.model) {
      let id = message._id
      let replay = await GameRecord.findOne({_id: id}).lean().exec()
      player.sendMessage('account/gameReplayReply', replay)
    }
  },
  'account/topPlayers': async (player) => {
    const current = await PlayerModel
      .find()
      .select({name: 1, headImgUrl: 1, shortId: 1, gold: 1})
      .sort({gold: -1})
      .limit(30)
      .lean()
      .exec()
    const rank = await RankList.findOne().sort({createAt: -1}).exec()

    const prevPlayers = rank && rank.players
    player.sendMessage('account/topPlayersReply', {
      current,
      prev: prevPlayers || [],
      me: player.model
    })
  },
  'account/prevTopPlayers': async (player) => {
    const rank = await RankList.findOne().sort({createAt: -1}).exec()
    let prevPlayers = rank && rank.players || []
    prevPlayers = prevPlayers.slice(0, 3)
      .map(p => ({
        name: p.name
      }))

    player.sendMessage('account/prevTopPlayersReply', {prev: prevPlayers})
  },
  'account/fromInvite': async (player, {inviteCode}) => {
    const gm = await GM.findOne({inviteCode}, {_id: 1}).lean().exec()
    if (!gm) {
      player.sendMessage('account/fromInviteReply', {ok: false, info: '无效邀请码'})
      return
    }

    const inviteBy = gm._id
    const playerId = player.model._id
    const playerModel = await PlayerModel.findOne({_id: playerId}).exec()

    if (!playerModel) {
      player.sendMessage('account/fromInviteReply', {ok: false, info: '玩家不存在'})
      return
    }

    if (playerModel.inviteBy) {
      player.sendMessage('account/fromInviteReply', {ok: false, info: '已经有邀请人'})
      return
    }

    const gem = 20
    const gold = 0

    playerModel.inviteBy = inviteBy
    playerModel.gem += gem
    player.sendMessage('gmTool/addResource', {
      gem,
      gold,
    });
    player.model.gem += gem
    player.model.gold += gold

    await PlayerModel.update({
      _id: playerId
    }, {$inc: {gem}, $set: {inviteBy}}).exec()

    player.sendMessage('account/fromInviteReply', {ok: true})
  },
  'account/buyProduct': async (player, {productId, phone, wechat}) => {
    const product = await Product.findOne({_id: productId}).lean().exec()
    if (!product) {
      player.sendMessage('account/buyProductReply', {ok: false, info: '商品不存在'})
      return
    }

    if (!product.onStock) {
      player.sendMessage('account/buyProductReply', {ok: false, info: '商品已经下架'})
      return
    }

    const playerId = player._id

    const playerModel = await PlayerModel.findOne({_id: playerId}).exec()

    let canBuy = false
    if (product.rubyPrice > 0) {
      canBuy = playerModel.ruby >= product.rubyPrice;
    } else {
      canBuy = true
    }
    if (product.goldPrice > 0) {
      canBuy = canBuy && playerModel.gold >= product.goldPrice
    }

    if (canBuy) {
      await new BuyProductRecord({
        product: product._id,
        productName: product.name,
        productPrice: {rubyPrice: product.rubyPrice, goldPrice: product.goldPrice},
        player: playerModel._id,
        state: 'paid',
        wechat, phone
      }).save()


      playerModel.ruby -= product.rubyPrice
      playerModel.gold -= product.goldPrice
      await playerModel.save()
      addResource(playerId, {ruby: -product.rubyPrice, gold: -product.goldPrice})
      player.sendMessage('account/buyProductReply', {ok: true, info: '购买成功'})
    } else {
      player.sendMessage('account/buyProductReply', {ok: false, info: '金币/宝石不足'})
    }
  },
  'account/buyRecords': async (player) => {
    const records = await BuyProductRecord.find({player: player._id}).sort({createAt: -1})
    player.sendMessage('account/buyRecordsReply', {ok: true, records})
  },
  'account/products': async (player) => {
    const products = await Product.find({onStock: true}).sort({createAt: -1})
    player.sendMessage('account/productsReply', {ok: true, products})
  },
  'account/idCheck': async (player, message) => {
    const idCode = await AccountIdModel.findOne({player: player._id}).exec();
    const birthYear = message.identifyCode.substring(6, 10);
    const date = new Date();
    const nowYear = date.getFullYear();
    let isAdult = true;
    if (nowYear - birthYear < 18) {
      isAdult = false;
    }
    if (idCode == null && isAdult) {
      await AccountIdModel.findOrCreate({player: player._id}, {player: player._id, ...message});
      var idCheckPrize = 6;
      player.model.gem += idCheckPrize;
      PlayerModel.update({_id: player.model._id},
        {
          $inc: {
            gem: idCheckPrize,
          }
        },
        (err) => {
          if (err) {
            logger.error(err);
          }
        });
      player.model.needCheckCode = false;

      // player.sendMessage('resource/update', {gem: player.model.gem})
      await player.updateResource2Client();
    } else {
      player.model.needCheckCode = true;
    }
    player.sendMessage('account/idCheckReply', {needCheckCode: player.model.needCheckCode})

  },
  'account/getInviteDate': async (player) => {
    var inviterPlayersMsg = []
    var inviterPlyaers = []
    var invite_players = await PlayerModel.find({invite_byFriend: player.model.shortId}).exec()
    console.log('playerModel---------', invite_players)

    for (let i = 0; i < invite_players.length; i++) {
      var e = invite_players[i];
      var id = e._id;
      var gameRound = "0";
      gameRound = await GameRecord.count({
        players: id
      }).exec();
      var time = e.invite_byTime.toLocaleString().replace(/T/, ' ').// replace T with a space
        replace(/\..+/, '')     // delete the dot and everything after
      var p = {shortId: e.shortId, name: e.name, invite_byTime: time, gameRecordCount: gameRound}
      inviterPlyaers.push(p);

    }

    player.sendMessage('account/getInviteDateReply', inviterPlyaers)

  },
  'account/TaskMsg': async (player) => {
    const taskList = await Task.find().select().exec();
    var taskMsg = {}
    if (!player.model.invite_curTask.length && !player.model.invite_endTask.length) {
      taskList.forEach((e) => {
        player.model.invite_curTask.push(e.index);
      })
      player.model.invite_endTask = [];
      PlayerModel.update({_id: player._id}, {
          $set: {
            invite_curTas: player.model.invite_curTask,
            invite_endTask: player.model.invite_endTask,
          },
        },
        (err) => {
          if (err) {
            logger.error(err);
            return;
          }

        })
    }
    var cTasks = player.model.invite_curTask;
    var eTasks = player.model.invite_endTask;
    var invite_players = [];
    invite_players = await PlayerModel.find({invite_byFriend: player.model.shortId}).exec();
    var curTaskList = [];
    var endTaskList = [];


    taskList.forEach((task) => {

      eTasks.forEach(index => {

        taskMsg = {taskIndex: null, taskName: null, taskProgress: null, taskStatus: null, progressStr: null}
        var endTaskindex = index;
        if (endTaskindex == task.index) {
          taskMsg.taskIndex = endTaskindex;
          taskMsg.taskName = task.name;
          taskMsg.taskStatus = 2//0完成领取奖励、1进行中、2已达成。
          taskMsg.taskProgress = 1;

          if (task.condition.inviterShortId) {
            taskMsg.progressStr = "1/1";
          } else {
            taskMsg.progressStr = `${task.condition.invitePlayers}/${task.condition.invitePlayers}`;
          }
          endTaskList.push(taskMsg)
        }
      })

      cTasks.forEach((index) => {
        var curTaskindex = index;
        taskMsg = {taskIndex: null, taskName: null, taskProgress: null, taskStatus: null, progressStr: null}
        if (curTaskindex == task.index) {
          taskMsg.taskIndex = curTaskindex;
          taskMsg.taskName = task.name;
          if (task.condition.inviterShortId) {//填写短ID任务类型
            taskMsg.taskStatus = 0;//0完成领取奖励、1进行中、2已达成。

            if (player.model.invite_byFriend != null) {
              taskMsg.taskProgress = 1
              taskMsg.progressStr = "1/1"
            } else {
              taskMsg.taskProgress = 0
              taskMsg.progressStr = "0/1"
            }
          } else {//邀请人数任务类型
            taskMsg.taskStatus = 1;//0完成领取奖励、1进行中、2已达成。
            var progress = invite_players.length / task.condition.invitePlayers;


            var mcPlayerNum = invite_players.length > task.condition.invitePlayers ? task.condition.invitePlayers : invite_players.length
            taskMsg.progressStr = mcPlayerNum + "/" + task.condition.invitePlayers;
            taskMsg.taskProgress = progress.toFixed(2);
            if (progress >= 1) {
              taskMsg.taskStatus = 0;
              taskMsg.taskProgress = 1;
            }
          }
          curTaskList.push(taskMsg)
        }
      })
    })
    var inviteNum = invite_players.length ? invite_players.length : 0
    var allTasks = curTaskList.concat(endTaskList)
    player.sendMessage('account/TaskMsgReply', {tasks: allTasks, inviteNum: inviteNum});
  },
  'account/InviteFriendPrizes': async (player, message) => {
    console.log("************ InviteFriendPrizes ")
    const friends = await PlayerModel.find({invite_byFriend: player.model.shortId}).select({_id: 1}).exec();
    const cTask = player.model.invite_curTask;
    const eTask = player.model.invite_endTask;
    const taskIndex = parseInt(message.taskIndex);
    const task = await Tasks.findOne({
      index: taskIndex
    }).exec();

    const playerId = player.model._id
    const playerModel = await PlayerModel.findOne({
      _id: playerId
    }).exec()
    var msgReply = "领取失败";
    var msg = {taskIndex: taskIndex, taskName: task.name, taskProgress: null, taskStatus: null, progressStr: null}//
    if (cTask.contains(taskIndex)) {
      msg.taskStatus = 1
    }//0完成领取奖励、1进行中、2已达成。
    var missionCompleted = async () => {
      if (taskIndex) {
      } else {

        msgReply = "无此奖励"
        return false;
      }
      var mcPlayerNum = friends.length;
      if (task.condition.gameRound) {
        mcPlayerNum = 0;
        for (let p = 0; p < friends.length; p++) {
          var invitePlayerId = friends[p];
          var played = await GameRecord.count({
            players: invitePlayerId._id
          }).exec();
          if (played > task.condition.gameRound) {
            mcPlayerNum += 1;
          }
        }
      }
      if (cTask.contains(taskIndex)) {//任务在列表中
        if (task.condition.invitePlayers) { //邀请人数任务 满足条件
          if (mcPlayerNum >= task.condition.invitePlayers) {
            msg.taskStatus = 2//0完成领取奖励、1进行中、2已达成。
            msg.taskProgress = 1;
            msg.progressStr = task.condition.invitePlayers + "/" + task.condition.invitePlayers
            return true;
          } else {
            msgReply = "邀请人数未达标，领取失败"
          }
        }

        if (task.condition.inviterShortId) { //填写邀请短Id任务，满足条件
          if (player.model.invite_byFriend) {
            msgReply = "已填写过好友ID,领取失败"
            return false
          }
          if (message.inviterShortId === player.model.shortId) {
            msgReply = "不能填写自己的ID,领取失败"
            return false
          }
          var pId = await PlayerModel.findOne({
            shortId: message.inviterShortId
          });

          if (pId) {

            console.log("pId===========>", message.inviterShortId, player.model.shortId)
            ;
            PlayerModel.update({shortId: player.model.shortId}, {
                $set: {
                  invite_byFriend: message.inviterShortId,
                  invite_byTime: new Date(),
                },
              },
              (err) => {
                if (err) {
                  logger.error(err);
                  return;
                }

              })
            msg.taskStatus = 2;//0完成领取奖励、1进行中、2已达成。
            msg.taskProgress = 1;
            msg.progressStr = "1/1"
            return true;
          } else {
            msgReply = "查无此玩家，领取失败"
          }
        }
      }
      return false;
    }
    var awards = () => {
      if (task.prize.gem) {
        msg.tips = `获得${task.prize.gem}钻石`
        addResource(playerId, {gem: task.prize.gem})
        playerModel.gem += task.prize.gem;
      }
      if (task.prize.lotteryChance) {
        //TODO,luckyDraw.Time每天还原为1次，并加上邀请好友获得的奖励次数lotteryChance
        msg.tips = `获得${task.prize.lotteryChanc}次幸运转盘抽奖机会`
        playerModel.luckyDraw.invite_time += task.prize.lotteryChance;
      }


      cTask.remove(taskIndex);
      eTask.push(taskIndex);
      playerModel.invite_curTask = cTask;
      playerModel.invite_endTask = eTask;

      player.sendMessage('account/inviteReply', {ok: true, info: msg})
      PlayerModel.update({_id: playerId},
        {

          $set: {
            gem: playerModel.gem,
            invite_curTask: playerModel.invite_curTask,
            invite_endTask: playerModel.invite_endTask,
            luckyDraw: playerModel.luckyDraw,


          },
        },
        (err) => {
          if (err) {
            logger.error(err);
            return;
          }
        });
    }
    var mc = await missionCompleted();
    if (mc == true) {
      awards();
    } else {
      player.sendMessage('account/inviteReply', {
        ok: false,
        info: msgReply
      })
    }
  },
  'account/updatePosition': async (player, position) => {
    if (player.model) {
      player.model.position = position
    }
  },
  'account/withdrawRedPocket': async (player) => {
    try {

      await withLock({key: 'red-pocket-withdraw', timeout: 7000}, async () => {

        const playerModel = await PlayerModel.findById(player._id)

        if (playerModel && !playerModel.openId) {
          return player.sendMessage('account/withdrawRedPocketReply',
            {ok: false, info: '请先到公众号绑定游戏账号'})
        }

        if (playerModel && playerModel.redPocket >= 1500) {

          const record = await RedPocketWithdrawRecordModel.create({
            player: playerModel._id,
            state: RedPocketWithDrawState.init,
            amountInFen: 1500,
            createAt: new Date()
          })

          let tem_batch_no = record._id.toString().concat("12345678");
          const tranRes = await wechatPayMent.batches_transfer({
            out_batch_no: tem_batch_no,
            batch_name: '天乐麻将红包提现',
            batch_remark: '天乐麻将红包提现',
            total_amount: 1500,
            total_num: 1,
            transfer_detail_list: [
              {
                out_detail_no: tem_batch_no,
                transfer_amount: 1500,
                transfer_remark: '天乐麻将红包提现',
                openid: playerModel.openId,
              },
            ],
          });

          if (tranRes.status == '200') {
            const updated = await PlayerModel.findByIdAndUpdate(player._id, {$inc: {redPocket: -1500}}, {'new': true})

            record.info = '完成'
            record.state = RedPocketWithDrawState.finished
            record.paymentId = tranRes.batch_id
            await record.save()

            return player.sendMessage('account/withdrawRedPocketReply',
              {ok: true, redPocket: updated.redPocket})


          } else {
            record.info = tranRes.err_code_des
            //record.state = RedPocketWithDrawState.error
            record.state = tranRes.status
            await record.save()
            return player.sendMessage('account/withdrawRedPocketReply',
              {ok: false, info: '提款失败,稍后再试!'})
          }


        } else {
          return player.sendMessage('account/withdrawRedPocketReply', {
            ok: false,
            info: '红包金额超过15元才能提现'
          })
        }
      }, locker)
    } catch (error) {
      logger.error({
        scope: 'account/withdrawRedPocket', error: error.message,
        stack: error.stack
      })
    }
  },
  'account/withdrawRedPocketRecords': async (player) => {
    const records = await RedPocketWithdrawRecordModel
      .find({player: player._id})
      .sort({createAt: -1})
      .limit(50)
      .lean()

    player.sendMessage('account/withdrawRedPocketRecordsReply', {ok: true, records})
  },
  'account/getRedPocketInfo': async (player) => {
    const playerModel = await PlayerModel.findById(player._id)

    if (playerModel) {
      player.sendMessage('account/getRedPocketInfoReply',
        {ok: true, redPocket: playerModel.redPocket})
    } else {
      player.sendMessage('account/getRedPocketInfoReply',
        {ok: false, info: '查询失败！'})
    }
  },
  'account/addWatchAdverLog': async (player, message) => {
    const data = {
      playerId: player._id,
      shortId: player.shortId,
      adId: null,
      adPosition: null
    };

    if (message.adId) {
      data.adId = message.adId;
    }

    if (message.adPosition) {
      data.adPosition = message.adPosition;
    }

    const record = await WatchAdverRecord.create(data);

    player.sendMessage('account/addWatchAdverLogReply', record);
  },
  'account/getSMSCode': async (player, message) => {
    if (!message.phoneNum || message.phoneNum.length !== 11) {
      player.sendMessage('account/getSMSCodeReply', {ok: false, info: `手机号码错误。`});
      return
    }

    const tempSmsCode = await redisClient.getAsync(message.phoneNum)
    if (tempSmsCode) {
      player.sendMessage('account/getSMSCodeReply', {ok: false, info: `验证码已发送，请查看短信获取。`});
      return
    }
    const smsCode = await redisClient.lpopAsync(`smsCodes`)
    if (!smsCode) {
      player.sendMessage('account/getSMSCodeReply', {ok: false, info: `验证码生成错误。`});
      return
    }
    await redisClient.rpushAsync('smsCodes', smsCode)
    const countDown = 1

    await sendSMS(player, message.phoneNum, smsCode, countDown)
  },
  'account/bindPhone': async (player, message) => {
    const doc = await PlayerModel.findOne({phone: message.phoneNum}).exec()
    if (doc) {
      player.sendMessage('account/bindPhoneReply', {
        ok: false,
        info: `手机号${message.phoneNum}已绑定其它微信号。`
      });
      return
    }
    const smsCode = await redisClient.getAsync(message.phoneNum)
    if (!smsCode) {
      player.sendMessage('account/bindPhoneReply', {ok: false, info: `验证码超时或验证码错误。`});
      return
    }

    if (message.smsCode.toString() !== smsCode) {
      player.sendMessage('account/bindPhoneReply', {ok: false, info: '绑定失败！'})
      return
    }
    /*
        const addGem = 20;
        await PlayerModel.findOneAndUpdate(
          {_id: player._id},
          {phone: message.phoneNum},
          {"new": true})

        await  PlayerModel.update({_id: player._id},{$inc:{gem: addGem}},false,false)

        const addFen = 100;
        await RedPocketRecordModel.create({
          player: player._id, amountInFen: addFen,
          createAt: new Date(), from: `绑定奖励`
        })
        await PlayerModel.update({_id: player._id}, {$inc: {redPocket: addFen}},false,false)
    */
    // await redisClient.delAsync(message.phoneNum)
    player.sendMessage('account/bindPhoneReply', {ok: true, info: `绑定成功！`})
    //player.sendMessage('account/bindPhoneReply', {ok:true, info: `绑定成功！获得${addGem}张房卡`})
    //player.sendMessage('resource/update', {ok:true, gem: player.model.gem + addGem})
  },
  // 查询用户
  [AccountAction.queryAccount]: async (player, message) => {
    const user = await PlayerModel.findOne({shortId: message.shortId}).exec();
    if (!user) {
      player.replyFail(AccountAction.queryAccount, '用户不存在');
      return;
    }
    // 下发用户昵称，头像
    player.replySuccess(AccountAction.queryAccount, {
      name: user.name,
      shortId: user.shortId,
      headImgUrl: user.headImgUrl
    });
  }
}
