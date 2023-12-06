import {shuffle} from 'lodash'
import {ContestConfigModel} from '../../database/models/contestConfig'
import PlayerModel from "../../database/models/player"
import {createLock} from "../../utils/lock"
import {AsyncRedisClient} from "../../utils/redis"
import {ISocketPlayer} from "../ISocketPlayer"

const tournamentLobbyQueue = `t:lobbyQueue`

type  TournamentRequest = { tId: string, gameType: string }

const contestType2Name = {
  battle: 'startBattle',
  tournament: 'startTournament'
}

export function createHandler(redisClient: AsyncRedisClient, queueNamePrefix: string = tournamentLobbyQueue) {
  const lock = createLock();

  function gameTypeToTourQueue(gameType: string, tId: string) {
    return `${queueNamePrefix}:${gameType}:${tId}`
  }

  function getCurrentPlayerNum(queueLimit, playerCounter, currentPlayer) {
    let rate = queueLimit / playerCounter
    let result = Math.floor(currentPlayer / rate)
    if (result === 0 && currentPlayer > 0) {
      result = 1
    }
    return result;
  }

  const handlers = {

    queueName: queueNamePrefix,

    'tournament/tournaments': async (player: ISocketPlayer, {gameType}: TournamentRequest) => {
      let contestConfigInfo = []

      const batch = redisClient.batch()

      const contestConfigData = await ContestConfigModel.find({gameType: gameType})
      if(!contestConfigData || contestConfigData.length === 0) {
        player.sendMessage('tournament/tournamentsReply', {ok: false, contestConfigInfo})
        return
      }
      contestConfigData.forEach(config => {
        batch.get(`tc:${config._id}`)
      })

      const tourRoomCounters = await batch.execAsync()

      for (let i = 0; i < contestConfigData.length; i++) {
        const roomCount = Number(tourRoomCounters[i])
        const info = {
          _id: contestConfigData[i]._id,
          contestType: contestConfigData[i].contestType,
          playerCount: 20 + Math.floor(Math.random() * 2) * 4 + roomCount * 4,
          gameType: contestConfigData[i].gameType,
          queueLimit: contestConfigData[i].queueLimit,
          nPlayersToKnockOut: contestConfigData[i].nPlayersToKnockOut,
          entryFee: contestConfigData[i].entryFee
        }
        contestConfigInfo.push(info);
      }
      player.sendMessage('tournament/tournamentsReply', {ok: true, contestConfigInfo})
    },

    'tournament/myTourId': async (player: ISocketPlayer, {gameType}: TournamentRequest) => {
      const tId = await redisClient.hgetAsync(`u:${player._id}`, `t:${gameType}`)
      player.sendMessage('tournament/myTourIdReply', {currentId: tId})
    },

    'tournament/count': async (player: ISocketPlayer, {gameType, tId = ''}: TournamentRequest) => {
      const config = await ContestConfigModel.findOne({_id: tId})

      if (!config) {
        return
      }

      const q = gameTypeToTourQueue(gameType, tId)
      const roomCount = parseInt(await redisClient.getAsync(`tc:${tId}`)) || 0
      const count = await redisClient.scardAsync(q) + roomCount * 4

      player.sendMessage('tournament/countReply', {
        tId,
        count
      })
    },

    'tournament/list': async (player: ISocketPlayer, {gameType, tId = ''}: TournamentRequest) => {
      const config = await ContestConfigModel.findOne({_id: tId})

      if (!config) {
        return
      }

      const q = gameTypeToTourQueue(gameType, tId)
      const [nPlayersInQueue, isInQueue] = await redisClient.batch().scard(q)
        .sismember(q, player._id)
        .execAsync()
      let {queueLimit, playerCounter} = config;
      const currentPlayers = getCurrentPlayerNum(queueLimit, playerCounter, nPlayersInQueue)
      player.sendMessage('tournament/queue', {
        currentPlayers: currentPlayers,
        tournamentSize: config.playerCounter, config: config,
        isInQueue
      })
    },

    'tournament/join': async (player: ISocketPlayer, {gameType, tId = ''}: TournamentRequest) => {
      try {
        const config = await ContestConfigModel.findOne({_id: tId})

        if (!config) {
          return player.sendMessage('tournament/joinReply', {ok: false, info: '没有此比赛Id'})
        }

        const currentTid = await redisClient.hgetAsync(`u:${player._id}`, `t:${gameType}`)

        if (currentTid && currentTid !== tId) {
          return player.sendMessage('tournament/joinReply', {ok: false, info: `您已经在另外一个比赛场`})
        }

        const queueName = gameTypeToTourQueue(gameType, config._id)

        const unlock = await lock(queueName, 3000)
        try {

          const exists = await redisClient.sismemberAsync(queueName, player._id)

          if (exists) {
            player.sendMessage('tournament/joinReply', {ok: true, info: '加入比赛成功'})
            return
          }

          const model = await PlayerModel.findById(player._id).select({gem: 1})
          const entryFee = config.entryFee || 1
          if (model.gem < entryFee) {
            return player.sendMessage('tournament/joinReply', {ok: false, info: '钻石不足'})
          }

          const updatedModel = await PlayerModel.findOneAndUpdate(
            {_id: player._id},
            {$inc: {gem: -entryFee}},
            {new: true})
          player.model.gem = updatedModel.gem
          await player.updateResource2Client()

          const [ignore, nPlayersInQueue] = await redisClient.multi()
            .sadd(queueName, player._id)
            .scard(queueName)
            .hset(`u:${player._id}`, `t:${gameType}`, config._id.toString())
            .execAsync()

          let {queueLimit, playerCounter, contestType} = config;
          const currentPlayers = getCurrentPlayerNum(queueLimit, playerCounter, nPlayersInQueue)
          player.sendMessage('tournament/wait', {
            currentPlayers: currentPlayers,
            tournamentSize: config.playerCounter, config: config
          })

          player.sendMessage('tournament/joinReply', {ok: true, info: '加入比赛成功'})
          if (nPlayersInQueue >= config.queueLimit) {
            for (let i = 0; i < config.queueLimit / config.playerCounter; i++) {

              const playersInTour = shuffle(await redisClient.spopAsync(queueName, config.playerCounter))
              player.requestTo(`${gameType}Tournament`, contestType2Name[contestType], {
                players: playersInTour,
                config: config
              })

              const multi = redisClient.batch()
              playersInTour.forEach(pId => {
                multi.hdel(`u:${pId}`, `t:${gameType}`, config._id.toString())
              })
              multi.incr(`tc:${config._id}`)
              multi.exec_atomic()
            }
          }
        } catch (e) {

          console.log(`${__filename}:100 tournament/join\n`, e);
        } finally {
          unlock()
        }
      } catch (e) {
        player.sendMessage('tournament/joinReply', {ok: false, info: '加入失败 稍后重试'})
      }
    },

    'tournament/quit': async (player: ISocketPlayer, {gameType, tId = 'battle'}: TournamentRequest) => {

      const queueName = gameTypeToTourQueue(gameType, tId)
      try {
        const unlock = await lock(queueName, 3000)
        try {
          const exists = await redisClient.sismemberAsync(queueName, player._id)
          if (exists) {

            await redisClient.multi()
              .srem(queueName, player._id)
              .hdel(`u:${player._id}`, `t:${gameType}`, tId)
              .execAsync()

            const updateModel = await PlayerModel.findOneAndUpdate(
              {_id: player._id},
              {$inc: {gem: 1}},
              {new: true})
            player.model.gem = updateModel.gem
            await player.updateResource2Client()
            return player.sendMessage('tournament/quitReply', {ok: true, info: '已退出比赛'})
          } else {
            return player.sendMessage('tournament/quitReply', {ok: false, info: '比赛已经开始或者还没有加入比赛'})
          }
        } catch (e) {
          console.error(e)
        } finally {
          unlock()
        }
      } catch (e) {
        player.sendMessage('tournament/quitReply', {ok: false, info: '退出失败 稍后重试'})
      }
    }
  }

  return handlers
}
