/**
 * Created by Mcgrady on 2016/7/9.
 */
import * as logger from 'winston';
import PlayerModel from '../../database/models/player';
import * as config from '../../config';
import Prize from "../../database/models/prize"
import PrizeRecord from "../../database/models/prizeRecord"
import Player from "../../database/models/player"
import RoomRecord from "../../database/models/roomRecord"
import * as moment from "moment"
import {RedPocketRecordModel} from "../../database/models/redPocketRecord";

function awardLuckyDraw(prizeIndex, p) {
  if (prizeIndex < 1) return;

  const player = p;
  const prize = config.game.prizeIndex2Prize[prizeIndex - 1];
  const sum = prize.count;
  switch (prize.type) {
    case 'gem':
      PlayerModel.update({_id: player.model._id}, {$inc: {gem: sum}},
        (err) => {
          if (err) {
            logger.error(err);
          } else {
            player.model.gem += sum;
          }
        });
      return;
    case 'gold':
      PlayerModel.update({_id: player.model._id}, {$inc: {gold: sum}},
        (err) => {
          if (err) {
            logger.error(err);
          } else {
            player.model.gold += sum;
          }
        });
      return;
    case 'again':
      PlayerModel.update({_id: player.model._id}, {$inc: {'luckyDraw.time': sum}},
        (err) => {
          if (err) {
            logger.error(err);
          } else {
            player.model.luckyDraw.time += sum;
          }
        });
      return;
    case 'none':
    default:
      return;
  }
}

async function getPrizeInfo(playerId, prizeNeedRoomNum = 5) {
  const startOfToday = moment().startOf('day').toDate()
  const endOfToday = moment().endOf('day').toDate()

  const validRoomNum = await RoomRecord.count({
    players: playerId,
    roomState: 'normal_last',
    createAt: {$gte: startOfToday, $lt: endOfToday}
  })

  const playerData = await PlayerModel.findOne({_id: playerId})
  const luckyDrawData = playerData.luckyDraw
  const allLuckDrawTimes = Math.floor(validRoomNum / prizeNeedRoomNum)
  const usedLuckDrawTimes = luckyDrawData.usedLuckDrawTimes || 0
  return {usedLuckDrawTimes, allLuckDrawTimes, validRoomNum}
}

export function getRandomNum() {
  const randomSeed =  Math.random();
  const probabilityCfg = config.game.DrawProbability;
  let total = 0;
  let index = 0;
  for (const key of Object.keys(probabilityCfg)) {
    total += probabilityCfg[key];
    if (total >= randomSeed) {
      index = Number(key) + 1;
      break;
    }
  }

  index = Math.max(index, 1)

  const max = (index * (360 / config.game.prizeCount)) - 5;
  const min = ((index - 1) * (360 / config.game.prizeCount)) + 5;
  return {
    index,
    rotate: Math.floor((Math.random() * ((max - min) + 1)) + min),
  };
}

async function getRandomPrize() {
  const prizes = await Prize.find({onStock: true, chance: {$gt: 0}}).sort({chance: -1}).lean()

  const defaultPrize = prizes[0]

  for (let i = 1; i < prizes.length; i++) {
    prizes[i].chance += prizes[i - 1].chance
  }
  let randomChance = Math.random();

  const resultPrize = prizes.find(p => p.chance > randomChance) || defaultPrize

  return resultPrize;
}

const resourceHandler = {
  'resource/gem2gold': async(p, message) => {
    const player = p;
    const gem2ExchangeNum = Number(message.gemCount);
    const gem2GoldExchangeRate = config.game.gem2GoldExchangeRate;
    let success = false;
    let reason = '';
    let usedGem = 0;
    if (message.gemCount > player.model.gem) {
      reason = '当前所有钻石不足';
    } else {
      const doc = await PlayerModel.update({_id: player.model._id},
        {
          $inc: {
            gem: -gem2ExchangeNum,
            gold: gem2ExchangeNum * gem2GoldExchangeRate,
          },
        });
      if (doc.ok) {
        player.model.gem += gem2ExchangeNum;
        player.model.gold += gem2ExchangeNum * gem2GoldExchangeRate;
        success = true;
        usedGem = gem2ExchangeNum;
      } else {
        reason = '数据存储异常';
      }
    }
    player.sendMessage('gem2goldRet', {
      success,
      usedGem,
      reason,
      getGold: usedGem * gem2GoldExchangeRate,
    });
    return success;
  },

  'resource/luckyDraw': async (p, message) => {
    const player = p;
    const prizeNeedRoomNum = config.game.prizeNeedRoomNum;

    let {usedLuckDrawTimes, allLuckDrawTimes, validRoomNum} = await getPrizeInfo(player.model._id, prizeNeedRoomNum)
    if(usedLuckDrawTimes < allLuckDrawTimes){

      const prize = await getRandomPrize();

      if (prize) {
        const updatePlayer = await Player.findOneAndUpdate({_id: player._id}, {$inc: {'luckyDraw.usedLuckDrawTimes': 1}}, {new: true})
        usedLuckDrawTimes = updatePlayer.luckyDraw.usedLuckDrawTimes
        let prizeRecordState = 'NotReceived'
        if (prize.gem > 0) {
          await Player.findOneAndUpdate({_id: player._id}, {$inc: {gem: prize.gem}}, {new: true})
          await player.updateResource2Client();
          // player.model.gem = updatedGemPlayer.gem;

          // player.sendMessage('resource/update', {
          //   gold: player.model.gold,
          //   gem: player.model.gem
          // })
          prizeRecordState = 'Done'
        }
        const createTime = new Date()
        if(prize.redPocket > 0){
          await Player.findOneAndUpdate({_id: player._id}, {$inc: {redPocket: prize.redPocket}}, {new: true})
          await RedPocketRecordModel.create({
            player: player._id, amountInFen: prize.redPocket,
            createAt: createTime,from: `lucky:${prize.name}`
          })
          prizeRecordState = 'Done'
        }

        await new PrizeRecord({
          prize: prize._id,
          prizeName: prize.name,
          prizeImageUrl: prize.imageUrl,
          player: player,
          playerShortId: player.model.shortId,
          state: prizeRecordState,
        }).save();

        player.sendMessage('luckyDrawResult',
          {
            prizeIndex: prize.index,
            prizeName: prize.name,
            prizeCreateAt: createTime,
            success: true,
            model: player.model,
            times: allLuckDrawTimes - usedLuckDrawTimes,
            validRoomNum,
          });
      } else {
        player.sendMessage('luckyDrawResult', {success: false, reason: '未找到该奖品'});
      }
    } else {
      player.sendMessage('luckyDrawResult', {success: false, reason: '所打房间不够'});
    }
  },
  'resource/prize': async (p) => {
    const player = p;
    // await countPlayerLuckyDaw(p);
    const prizeNeedRoomNum = config.game.prizeNeedRoomNum;
    const {usedLuckDrawTimes, allLuckDrawTimes, validRoomNum} = await getPrizeInfo(player.model._id, prizeNeedRoomNum)
    const times = allLuckDrawTimes - usedLuckDrawTimes //total - used >= 0 ? total - used : 0

    const prize = await Prize.find({onStock: true}).select({chance: 0}).sort({index: -1})
    if (prize.length === 0) {
      return player.sendMessage('account/prizeList', {
        ok: false,
        reason: '活动未开始！',
        times,
        validRoomNum,
      })
    }

    player.sendMessage('account/prizeList', {
      ok: true, prize, times,
      validRoomNum,
    })
  },
  'resource/prizeLog': async (p) => {
    const player = p;
    const startDay = moment().subtract('day', 3).toDate();
    const playerPrize = await PrizeRecord.find({player: player._id, createAt: {$gte: startDay}}).sort({createAt: -1})
    player.sendMessage('account/prizeRecord', {ok: true, playerPrize})
  },
};
export default resourceHandler;
