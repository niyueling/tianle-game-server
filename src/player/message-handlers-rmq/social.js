/**
 * Created by Mcgrady on 2016/8/2.
 */
import * as moment from 'moment'
import PlayerModel from '../../database/models/player';
import PlayerManager from '../player-manager';

const socialHandlers = {
  'social/lookUpPlayerByName': async (p, message) => {
    const player = p;
    const lookUpName = message.playerName;
    let errMsg = '';
    let success = false;
    const friend = await PlayerModel.findById(lookUpName);
    success = friend !== null;
    errMsg = success ? errMsg : '查无此人';
    player.sendMessage('social/lookUpPlayerByNameResult',
      {
        success,
        errMsg,
        playerId: success ? friend._id : '',
      });
  },

  'social/share': async (player) => {
    const lastShare = player.model.lastShareAt || new Date(0)
    const today = moment()
    if (today.isSame(lastShare, 'day')) {
      player.sendMessage('social/shareReward', {
        errorCode: 0,
        // msg: '分享成功\n今日免费房卡已经领取\n请在0点后继续分享领取'
        msg: '分享成功\n'
      })
    } else {
      player.model.gem = player.model.gem + 1
      player.model.lastShareAt = new Date()

      await PlayerModel.update({_id: player._id}, {
        $set: {lastShareAt: player.model.lastShareAt},
        $inc: {gem: 1}
      }).exec()

      player.sendMessage('social/shareReward', {
        errorCode: 0, gem: player.model.gem,
        msg: '分享成功\n'
        // msg: '分享成功\n获得一张免费房卡'
      })
      await player.updateResource2Client();
      // player.sendMessage('resource/update', {gold: player.model.gold, gem: player.model.gem})
    }

  },
  'social/giftResource': async (p, message) => {
    const player = p;
    const lookUpName = message.playerName;
    let errMsg = '';
    let success = false;
    const giftGem = message.gem ? Number(message.gem) : 0;
    const giftGold = message.gold ? Number(message.gold) : 0;
    if (giftGem > player.model.gem || giftGold > player.model.gold) {
      errMsg = '赠送资源超出拥有';
    }
    if ((giftGem + giftGold) === 0) {
      errMsg = '未输入赠送资源';
    }

    if (!errMsg) {
      const friend = await PlayerModel.findById(lookUpName);
      if (friend) {
        success = true;
        const friendProcess = PlayerManager.getInstance().getPlayer(friend._id);
        if (friendProcess) {
          friendProcess.sendMessage('social/giftFromFriend', {
            from: player.model._id,
            gold: giftGold,
            gem: giftGem,
          });
        }
        const updateSelfGiftRecord = await PlayerModel.update({_id: player.model._id},
          {
            $inc: {gold: -giftGold, gem: -giftGem},
            $push: {
              giftResource: {
                to: friend._id,
                gold: giftGold,
                gem: giftGem,
              }
            },
          });
        if (updateSelfGiftRecord.ok) {
          player.model.gold -= giftGold;
          player.model.gem -= giftGem;
        }
        const updateFriendGetGiftRecord = await PlayerModel.update({_id: friend._id},
          {
            $inc: {gold: giftGold, gem: giftGem},
            $push: {
              receivedGiftResource: {
                from: player.model._id,
                gold: giftGold,
                gem: giftGem,
                noticed: friendProcess !== null && friendProcess !== undefined,
              }
            },
          });
        if (updateFriendGetGiftRecord.ok && friendProcess) {
          friendProcess.model.gold += giftGold;
          friendProcess.model.gem += giftGem;
        }
      } else {
        success = false;
        errMsg = '查无此人';
      }
    }
    player.sendMessage('social/giftResourceResult',
      {
        success,
        errMsg,
        gold: success ? giftGold : 0,
        gem: success ? giftGem : 0,
      });
  },
};

export default socialHandlers;

