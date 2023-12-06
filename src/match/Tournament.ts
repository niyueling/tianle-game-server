import {pick} from "lodash";
import * as config from "../config"
import {GameTypes} from "./gameTypes"
import {IMessageEmitter, IMessageGroupEmitter, IMessageSource, Message} from "./messageBus/index"
import {autoSerialize, autoSerializePropertyKeys, Serializable, serialize, serializeHelp} from "./serializeDecorator"

export type playerRankInfo = {
  _id: string,
  score: number,
  currentRoomId: string,
  knockOut?: boolean
  lastRound?: number
}

export type ContestConfig = {
  _id: string,
  contestType: string,
  gameType: string,
  nPlayersToEnd: number, nPlayersToKnockOut: number,
  entryFee: number,
  playerCounter: number, juShu: number, rule: any
  queueLimit: number
}

export class Tournament implements Serializable{
  @autoSerialize
  readonly _id: string
  @autoSerialize
  private gameType: GameTypes

  @autoSerialize
  public contestId: string
  private redisClient: any
  @autoSerialize
  private cluster: string
  @autoSerialize
  private inPlayers: playerRankInfo[]
  @autoSerialize
  private waitPlayers: playerRankInfo[]
  @autoSerialize
  private config: ContestConfig
  @autoSerialize
  private currentPlayerCount: number
  private nPlayersToEnd: number
  private nPlayersToKnockOut: number
  private lobby: { startTournamentRoom(player, tc: ContestConfig, report: IMessageEmitter, contestId: string): Promise<string> }
  private ranks: playerRankInfo[]
  private messageSource: IMessageSource
  private broadcaster: IMessageGroupEmitter
  @autoSerialize
  private currentRooms: { _id: string, players: playerRankInfo[], state: 'onGoing' | 'finish' }[]
  @autoSerialize
  public currentRound: number
  private roomReporter: IMessageEmitter

  static tournamentInRollKey(_id: string) {
    return `TourEnRoll.${_id}`
  }

  constructor(tc: ContestConfig) {
    this.config = tc
    this.nPlayersToEnd = 4
    this.nPlayersToKnockOut = config.nPlayersToKnockOut || 4
    this._id = this.config._id
    this.currentRound = 0
  }

  withMessageBus(messageBus: {
    source: IMessageSource
    emitter: IMessageGroupEmitter
    roomReport: IMessageEmitter
  }) {
    this.messageSource = messageBus.source
    this.broadcaster = messageBus.emitter
    this.roomReporter = messageBus.roomReport
    return this
  }

  withContestId(contestId: string){
    this.contestId = contestId
    return this
  }

  withRedisClient(redisClient: any){
    this.redisClient = redisClient
    return this
  }
  withClusterName(cluster: string){
    this.cluster = cluster
    return this
  }
  withPlayers(players: playerRankInfo[]){
    this.inPlayers = players
    this.ranks = players.slice()
    this.currentPlayerCount = this.inPlayers.length
    return this
  }
  withGameType(gameType: GameTypes){
    this.gameType = gameType
    return this
  }
  useLobby(startTournamentRoom){
    this.lobby = {
      startTournamentRoom: startTournamentRoom
    }
    return this
  }

  static recover(json: any){
    const contest = new Tournament(json.config)

    const keys = autoSerializePropertyKeys(contest)
    Object.assign(contest, pick(json, keys))

    contest.ranks = contest.inPlayers.slice()
    console.log('contest roomId  = ', contest.currentRooms)
    return contest
  }

  rank() {
    return this.ranks.sort((p1, p2) => {
      if (p1.lastRound === p2.lastRound) {
        return p2.score - p1.score
      } else {
        return p2.lastRound - p1.lastRound
      }
    })
  }

  private toGroups() {

    const groups: playerRankInfo[][] = []

    let currentGroup = []

    for (const p of this.inPlayers) {
      p.score = 0
      currentGroup.push(p)

      if (currentGroup.length === this.config.rule.playerCount) {
        groups.push(currentGroup)
        currentGroup = []
      }
    }

    return groups
  }

  async startCurrentRound() {
    this.currentRooms = []
    for (const g of this.toGroups()) {
      const roomId = await this.lobby.startTournamentRoom(g, this.config, this.roomReporter, this.contestId)
      g.forEach(p => {
        p.lastRound = this.currentRound
        p.currentRoomId = roomId
      })

      this.currentRooms.push({_id: roomId, players: g, state: 'onGoing'})
    }
    this.waitPlayers = []
    this.currentRound += 1
    await this.tryBestStore()
  }

  toJSON() {
    return serializeHelp(this)
  }

  async finishRoom(roomId: string) {
    const room = this.currentRooms.find(r => r._id === roomId)
    if (room) {
      room.state = 'finish'
      let currentRoomPlayers = this.inPlayers.filter(x => x.currentRoomId === roomId).sort((x,y) => x.score - y.score)
      for (let i = 0; i < this.config.nPlayersToKnockOut; i++){
        currentRoomPlayers[i].knockOut = true
      }
      this.waitPlayers.push(...currentRoomPlayers.filter(x => !x.knockOut))
    }
    await this.tryBestStore()
  }

  isCurrentRoundOver(): boolean {
    return this.currentRooms.every(r => r.state === 'finish')
  }

  private playersInCurrentRound(): number {
    return this.inPlayers.length
  }

  private isTournamentOver(): boolean {
    return this.isCurrentRoundOver() && this.playersInCurrentRound() === this.config.nPlayersToEnd
  }

  intervalBroadCastInfo(){
    setInterval(()=> {
      if(this.waitPlayers.length > 0){
        this.broadcasterTournamentInfo(this.waitPlayers)
      }
    },1000)
  }

  private currentRoundRank() {
    return this.inPlayers.sort((p1, p2) => p2.score - p1.score)
  }


  private async knockOut() {

    if(this.playersInCurrentRound() === this.config.nPlayersToEnd) {
      return
    }
    const playerRank = this.currentRoundRank()

    const knockOutIds = []

    const knockOutPlayers = this.inPlayers.filter(x => {
      if(x.knockOut) {
        knockOutIds.push(x._id)
      }
      return x.knockOut
    })
    knockOutIds.forEach(async pId => {
      await this.redisClient && this.redisClient.sremAsync(`contest:${this.contestId}`, pId)
    })
    this.broadcaster.emit({
      name: 'tournament/knockout', payload: {
        players: knockOutPlayers
      }
    }, knockOutIds)

    this.inPlayers = playerRank.filter(p => !p.knockOut)//playerRank.slice(0, playerRank.length - this.config.nPlayersToKnockOut)
    await this.tryBestStore()
  }


  private broadcastToInTournaPlayer(message: Message) {
    this.broadcaster.emit(message, this.inPlayers.map(p => p._id))
  }

  private broadcasterTournamentInfo(players = this.inPlayers){
    this.broadcaster.emit({
      name:'tournament/info',
      payload:{
        currentRooms: this.currentRooms,
        currentRound: this.currentRound
      }
    }, players.map(p => p._id))
  }

  async listenRoom(){
    this.intervalBroadCastInfo()
    await this.messageSource.consume(async (messageBody) => {

      switch (messageBody.name) {
        case 'roomOver':
          const {scoreMap, roomId} = messageBody.payload

          for (const key in  scoreMap) {
            const value = scoreMap[key]
            const p = this.inPlayers.find(p => p._id === key)
            if (p) p.score = value
          }

          await this.finishRoom(roomId)
          this.broadcasterTournamentInfo()

          // this.broadcastToInTournaPlayer({
          //   name: 'tournament/status',
          //   payload: {
          //     _id: this.config._id,
          //     rooms: this.currentRooms.length, finishedRooms: this.currentRooms.filter(r => r.state === 'finish'),
          //     rank: this.rank()
          //   }
          // })
          if (this.isTournamentOver()) {
            this.broadcastToInTournaPlayer({
              name: 'tournament/allOver',
              payload: {_id: this.config._id, rank: this.rank()}
            })
            await this.messageSource.close()
            this.broadcaster.close()
            if(this.redisClient) {
              await this.redisClient.rpushAsync('contestIds', this.contestId)
              await this.redisClient.sremAsync(`cluster-contest-${this.cluster}`, this.contestId)
              await this.redisClient.delAsync('contest:info:' + this.contestId)
              await this.redisClient.delAsync(`contest:${this.contestId}`)
              await this.redisClient.sremAsync(`contest:${this.gameType}`, this.contestId)
              await this.redisClient.decrAsync(`tc:${this.contestId}`)
            }
            return;
          }
          await this.knockOut()

          if (this.isCurrentRoundOver()) {
            if(this.currentRound >= 1) {
              setTimeout(async () => {
                await this.startCurrentRound()
              }, 10000)
            } else {
              await this.startCurrentRound()
            }
          }
          break;
      }
    })
  }

  async start() {
    await this.listenRoom()

    await this.startCurrentRound()
  }

  private async tryBestStore() {
    try {
      await this.redisClient && this.redisClient.setAsync('contest:info:' + this.contestId, JSON.stringify(this.toJSON()))
    } catch (e) {
      console.error(`store contest ${this.contestId} failed with `, e)
    }

  }

  public getCurrentRoomIds(){
    return this.currentRooms.map(x => x.state === 'onGoing' && x._id)
  }
}
