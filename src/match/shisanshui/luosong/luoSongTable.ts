/**
 * Created by Color on 2016/7/6.
 */
import PlayerState from '../player_state'
import Table from "../table"
import CompareSuit from "./luosongCompared"

const stateQiangZhuang = 'stateQiangZhuang'
const stateWaitCommit = 'stateWaitCommit'
const stateGameOver = 'stateGameOver'

class TableState extends Table {

  name() {
    console.log(`${__filename}:17 name`, 'luosong')
    return 'luosong'
  }

  constructor(room, rule, restJushu) {
    super(room, rule, restJushu)
  }

  async start() {
    this.state = stateQiangZhuang
    this.players.forEach((p, idx) => {
      if (p) {
        return p.seatIndex = idx
      }
    })
  }

  resume(json) {
    super.resume(json)
  }

  toJSON() {
    const superJSON = super.toJSON()
    return superJSON
  }

  playerOnQiangZhuang(player, qiang) {
    player.setQiangZhuang(qiang)
    this.room.broadcast('game/anotherQiangZhuang', {index: player.seatIndex, qiang})

    this.selectZhuangIfAllOperated()
  }

  selectZhuangIfAllOperated() {
    if (this.allOperated) {
      this.randomChoiceZhuang()
      this.enterWaitCommitStage()
      this.fapai()
    }
  }

  enterWaitCommitStage() {
    this.state = stateWaitCommit
  }

  get randomDice() {
    return Math.floor(Math.random() * 6) + 1
  }

  randomChoiceZhuang() {
    const dices = [this.randomDice, this.randomDice]

    let qiangZhuangPlayers = this.players.filter(p => p.isQiangZhuang)
    if (qiangZhuangPlayers.length === 0) {
      qiangZhuangPlayers = this.players
    }
    const players = qiangZhuangPlayers.map(p => p.seatIndex)
    const limit = qiangZhuangPlayers.length
    const point = dices[0] + dices[1]
    const zhuang = qiangZhuangPlayers[point % limit]
    zhuang.setZhuang()

    this.room.broadcast('game/zhuangBorn', {zhuang: zhuang.seatIndex, players, dice: dices})
  }

  get allOperated() {
    return this.players.filter(p => p.isOperated).length === this.playerCount
  }

  playersOfCompare(): CompareSuit[] {
    const result = this.players.map(player => player && new CompareSuit(player))
    const zhuang = this.players.find(p => p && p.isZhuang)
    const zhuangSuit = result.find(suit => suit.player.index === zhuang.seatIndex)
    const otherSuits = result.filter(suit => suit.player.index !== zhuang.seatIndex)

    for (let i = 0; i < otherSuits.length; i++) {
      const playerSuit = otherSuits[i]

      const operator = zhuangSuit.compareLuoSong(playerSuit) ? 1 : -1
      const maTimes = this.mapMaCount2Times(playerSuit, zhuangSuit)

      zhuangSuit.trace[playerSuit.player.index] = {wins: 6 * operator, maTimes}
      playerSuit.trace[playerSuit.player.index] = {wins: -6 * operator, maTimes}
    }

    result.forEach(r => r.settle())
    return result
  }

  listenPlayer(player: PlayerState) {
    super.listenPlayer(player)
    const newEvents = ['game/qiangZhuang']

    player.msgDispatcher.on('game/qiangZhuang', ({qiang}) => this.playerOnQiangZhuang(player, qiang))
    this.listenerOn.push(...newEvents)
  }

  reconnectContent(index, player) {
    const content = super.reconnectContent(index, player)
    const creator = this.room.creator.model._id
    return Object.assign(content, {creator})
  }
}

export default TableState
