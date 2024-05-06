/**
 * Created by user on 2016-07-05.
 */
import {RewardConfigModel, RewardType} from "../../database/models/RewardConfig";
import Room from './room';
import {LobbyFactory} from '../lobbyFactory'
import {accAdd} from "../../utils/algorithm";
import {PublicRoom} from "./publicRoom";

const Lobby = LobbyFactory({
  gameName: 'guobiao',
  roomFactory: function (id, rule, roomType = '', extraObj = {}) {
    let room;
    if (rule.isPublic) {
      room = new PublicRoom(rule);
    } else {
      room = new Room(rule);
    }
    room._id = id;
    return room
  },
  // fixme: Room 被循环引用, 暂时采用函数调用来延迟 ref roomFee
  roomFee: (rule) => Room.roomFee(rule),
  normalizeRule: async (rule) => {
    let specialReward = 0
    let luckyRewardList = []
    const specialRewardConfig = await RewardConfigModel.findOne({game: 'guobiao', type: RewardType.special}).lean()
    const luckyRewardConfig = await RewardConfigModel.find({game: 'guobiao', type: RewardType.lucky}).lean()

    if (specialRewardConfig) {
      specialReward = specialRewardConfig.redPocket
    }

    if (luckyRewardConfig) {
      let totalProbability = 0;
      for (const c of luckyRewardConfig) {
        totalProbability = accAdd(totalProbability, c.probability);
        luckyRewardList.push({ probability: totalProbability, amount: c.redPocket })
      }
      if (totalProbability > 1) {
        console.log('invalid red pocket config')
        luckyRewardList = [];
      } else if (totalProbability < 1){
        // 填充金额为 0 的概率
        luckyRewardList.push({ probability: 1, amount: 0})
      }
    }

    return {
      ...rule,
      luckyRewardList,
      specialReward,
    }
  }

})

export default Lobby;
