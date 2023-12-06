import * as mongoose from "mongoose"
import findOrCreate from '../plugins/findorcreate';

const taskSchemas = new mongoose.Schema({
  name: {type: String, require: true},
  condition: {invitePlayers: Number, gameRound: Number, inviterShortId: Boolean},
  index: {type: Number, require: true, unique: true},
  prize: {gem: Number, lotteryChance: Number},
})
taskSchemas.plugin(findOrCreate);
var task = mongoose.model('Task', taskSchemas)

async function create() {
  await task.findOrCreate({index: 1001}, {
    name: '邀请1个玩家',
    condition: {invitePlayers: 1, gameRound: 0},
    index: 1001,
    prize: {gem: 12, lotteryChance: 0}
  })
  await task.findOrCreate({index: 1002}, {
    name: '邀请4个玩家',
    condition: {invitePlayers: 4, gameRound: 0},
    index: 1002,
    prize: {gem: 38, lotteryChance: 0}
  })
  await task.findOrCreate({index: 1003}, {
    name: '邀请8个玩家',
    condition: {invitePlayers: 8, gameRound: 0},
    index: 1003,
    prize: {gem: 68, lotteryChance: 0}
  })
  await task.findOrCreate({index: 1004}, {
    name: '邀请12个玩家,',
    condition: {invitePlayers: 12, gameRound: 0},
    index: 1004,
    prize: {gem: 68, lotteryChance: 0}
  })
  await task.findOrCreate({index: 1005}, {
    name: '填写邀请者短ID',
    condition: {inviterShortId: true},
    index: 1005,
    prize: {gem: 12, lotteryChance: 0}
  })
}

create();

export default task
