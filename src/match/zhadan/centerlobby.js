/**
 * Created by user on 2016-07-05.
 */
import Room from './room';
import {LobbyFactory} from '../lobbyFactory'
import {RewardConfigModel, RewardType} from '../../database/models/RewardConfig'
import {BattleRoom, TournamentRoom} from "./TournamentRoom";
import {accAdd} from "../../utils/algorithm";
import {PublicRoom} from "./publicRoom";
import {GameType} from "@fm/common/constants";

const Lobby = LobbyFactory({
  gameName: GameType.zd,
  roomFactory: function (id, rule, roomType = '', extraObj = {}) {
    if(roomType === 'battle'){
      return new BattleRoom(rule, extraObj.playerScore)
    }
    if(roomType === 'tournament') {
      return new TournamentRoom(rule, extraObj.playerScore, extraObj.reporter)
    }
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
    if (rule.juShu > 4) { //四局以上的房间才有红包资格
      const specialRewardConfig = await RewardConfigModel.findOne({ game: 'zhadan', type: RewardType.special }).lean()
      const luckyRewardConfig = await RewardConfigModel.find({ game: 'zhadan', type: RewardType.lucky }).lean()

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
        } else if (totalProbability < 1) {
          // 填充金额为 0 的概率
          luckyRewardList.push({ probability: 1, amount: 0 })
        }
      }
    }
    return {
      ...rule,
      specialReward,
      luckyRewardList
    }
  }
})

export default Lobby;
