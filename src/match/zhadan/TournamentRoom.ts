import {Channel} from "amqplib"
// @ts-ignore
import {pick} from "lodash"
import {AsyncRedisClient} from "../../utils/redis"
import {IMessageEmitter} from "../messageBus"
import {getPlayerRmqProxy} from "../PlayerRmqProxy"
import {autoSerialize, autoSerializePropertyKeys} from "../serializeDecorator"
import NormalTable from "./normalTable"
import Room from "./room"

const noop = async () => {
  return;
}

const gameType = 'zhadan'

export class TournamentRoom extends Room {

  static RoomType = 'tournamentRoom'

  @autoSerialize
  contestId: string = null

  emitter: IMessageEmitter = null

  @autoSerialize
  private canLeave: boolean

  @autoSerialize
  roomType: string = TournamentRoom.RoomType

  static async recover(json: any, repository: { channel: Channel, userCenter: any }): Promise<TournamentRoom> {

    const playerScores = Object.keys(json.scoreMap)
      .map(_id => ({_id, score: json.scoreMap[_id]}))

    const room = new TournamentRoom(json.gameRule, playerScores, null)

    const gameAutoKeys = autoSerializePropertyKeys(room.game)
    Object.assign(room.game, pick(json.game, gameAutoKeys))

    const keys = autoSerializePropertyKeys(room)
    Object.assign(room, pick(json, keys))

    for (const [index, playerId] of json.playersOrder.entries()) {
      if (playerId) {
        const playerRmq = await getPlayerRmqProxy(playerId, repository.channel, gameType);
        if (json.players[index]) {
          room.players[index] = playerRmq
        }
        room.playersOrder[index] = playerRmq;
      }
    }

    for (const [index, playerId] of json.snapshot.entries()) {
      room.snapshot[index] = await getPlayerRmqProxy(playerId, repository.channel, gameType);
    }

    if (json.gameState) {
      room.gameState = new NormalTable(room, room.rule, room.game.juShu)
      room.gameState.resume(json)
    }

    if (room.roomState === 'dissolve') {
      const delayTime = room.dissolveTime + 180 * 1000 - Date.now();
      room.dissolveTimeout = setTimeout(() => {
        room.forceDissolve()
      }, delayTime)
    }

    return room
  }

  constructor(rule, playerScores: { _id: string, score: number }[], reportEmitter: IMessageEmitter) {
    super(rule)

    for (const {_id, score} of playerScores) {
      this.scoreMap[_id] = score
    }
    this.emitter = reportEmitter

    this.charge = noop
    this.creator = {
      model: {_id: 'tournament'}, toString() {
        return 'tournament'
      }
    }

    this.canLeave = false
  }

  leave(player): boolean {

    if (!this.canLeave) {
      return false
    }

    return super.leave(player)
  }

  async join(player) {
    if (await super.join(player)) {
      await this.ready(player)
      return true
    } else {
      return false
    }
  }

  // isRoomAllOver(): boolean {
  //   const [p1, p2] = this.getSortedPlayerScores()
  //   return p1.score !== p2.score
  // }

  private getSortedPlayerScores(): { _id: string, score: number }[] {
    return this.snapshot
      .map(p => ({
        _id: p._id,
        score: this.scoreMap[p._id] || 0
      }))
      .sort((p1, p2) => p2.score - p1.score)
  }

  async gameOver(states, firstPlayerId) {
    await super.gameOver(states, firstPlayerId)

    if (this.isRoomAllOver()) {
      await this.notifyTournamentCenter()
      const playerIds = this.getSortedPlayerScores()
      const rewards = this.rule.ro.rewards
      for(let i = 0; i < rewards.length; i ++){
        const winner = this.getPlayerById(playerIds[i]._id)
        const index = i + 1
        const reward = - rewards[i]
        this.payUseGem(winner, reward, `比赛获胜利 ${index}`);
      }
    }
  }

  allOverMessage() {
    const message: any = super.allOverMessage()
    message.isTournament = true
    return message
  }

  async notifyTournamentCenter() {
    this.emitter.emit({
      name: 'roomOver',
      payload: {scoreMap: this.scoreMap, roomId: this._id}
    })
  }
}

export class BattleRoom extends Room {

  static RoomType = 'battleRoom'

  @autoSerialize
  contestId: string = null

  emitter: IMessageEmitter = null
  private canLeave: boolean

  @autoSerialize
  roomType: string = BattleRoom.RoomType

  static async incCount(redis: AsyncRedisClient, _id) {
  }

  static async decCount(redis: AsyncRedisClient, _id) {

  }

  static async recover(json: any, repository: { channel: Channel, userCenter: any }): Promise<BattleRoom> {

    const playerScores = Object.keys(json.scoreMap)
      .map(_id => ({_id, score: json.scoreMap[_id]}))

    const room = new BattleRoom(json.gameRule, playerScores)

    const gameAutoKeys = autoSerializePropertyKeys(room.game)
    Object.assign(room.game, pick(json.game, gameAutoKeys))

    const keys = autoSerializePropertyKeys(room)
    Object.assign(room, pick(json, keys))

    for (const [index, playerId] of json.playersOrder.entries()) {
      if (playerId) {
        const playerRmq = await getPlayerRmqProxy(playerId, repository.channel, gameType);
        if (json.players[index]) {
          room.players[index] = playerRmq
        }
        room.playersOrder[index] = playerRmq;
      }
    }

    for (const [index, playerId] of json.snapshot.entries()) {
      room.snapshot[index] = await getPlayerRmqProxy(playerId, repository.channel, gameType);
    }

    if (json.gameState) {
      room.gameState = new NormalTable(room, room.rule, room.game.juShu)
      room.gameState.resume(json)
    }

    if (room.roomState === 'dissolve') {
      const delayTime = room.dissolveTime + 180 * 1000 - Date.now();
      room.dissolveTimeout = setTimeout(() => {
        room.forceDissolve()
      }, delayTime)
    }

    return room
  }

  constructor(rule, playerScores: { _id: string, score: number }[]) {
    super(rule)
    for (const {_id, score} of playerScores) {
      this.scoreMap[_id] = score
    }

    this.creator = {
      model: {_id: 'tournament'}, toString() {
        return 'tournament'
      }
    }

    this.canLeave = false
  }

  leave(player): boolean {

    if (!this.canLeave) {
      return false
    }

    return super.leave(player)
  }

  async join(player) {
    if (await super.join(player)) {
      await this.ready(player)
      return true
    } else {
      return false
    }
  }

  isRoomAllOver(): boolean {
    const [p1, p2] = this.getSortedPlayerScores()
    return p1.score !== p2.score
  }

  private getSortedPlayerScores(): { _id: string, score: number }[] {
    return this.snapshot
      .map(p => ({
        _id: p._id,
        score: this.scoreMap[p._id] || 0
      }))
      .sort((p1, p2) => p2.score - p1.score)
  }

  async gameOver(states, firstPlayerId) {

    await super.gameOver(states, firstPlayerId)

    if (this.isRoomAllOver()) {
      const playerId = this.getSortedPlayerScores()[0]._id
      const winner = this.getPlayerById(playerId)
      const reward = this.rule.ro.rewards[0]

      this.payUseGem(winner, -reward, `比赛[${this._id}] ${reward}`)
    }
  }

  allOverMessage() {
    const message: any = super.allOverMessage()
    message.isBattle = true
    return message
  }

  async charge() {
    return noop();
  }
}
