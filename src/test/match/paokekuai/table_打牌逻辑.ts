import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {genFullyCards, default as Table} from "../../../match/paodekuai/table"
import setupMatch from '../setupMatch'
import {displayMessage, packetsWithMessageName, packetsTo, clearMessage} from '../mockwebsocket'
import {default as Card, CardType} from "../../../match/paodekuai/card"
import PlayerState from "../../../match/paodekuai/player_state";
import Enums from '../../../match/paodekuai/enums'
import NormalTable from "../../../match/paodekuai/normalTable";

chai.use(chaiProperties)
const {expect} = chai


describe('打牌', () => {

  let room, table: NormalTable, allRule
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState

  const playerCount = 3

  const last = arr => arr[arr.length - 1]

  beforeEach(async () => {
    const match = setupMatch(playerCount, {})
    room = match.room
    table = match.table as NormalTable
    player1 = table.players[0]
    player2 = table.players[1]
    player3 = table.players[2]

    allRule = match.allRule
    clearMessage()

    table.start()
    table.setFirstDa(0)
  })

  it('开局无牌型限制', () => {

    // noinspection TsLint
    expect(table.status.lastPattern).to.be.null
  })

  it('第一轮不能打非法牌型', () => {
    player1.cards = [Enums.c3, Enums.c4, Enums.c5, Enums.c6, Enums.c8, Enums.c9]
    table.onPlayerDa(player1, {cards: [Enums.c3, Enums.c5]})
    displayMessage()

    expect(last(packetsTo('testid1'))).to.have.properties({
      name: 'game/daReply', message: {ok: false}
    })
  })

  it('第一轮打对 第二轮也必须打对', () => {

    player1.cards = [Enums.c3, Enums.c3, Enums.c5, Enums.c6, Enums.c8, Enums.c9]
    table.onPlayerDa(player1, {cards: [Enums.c3, Enums.c3]})

    displayMessage()

    expect(table.status.from).to.eq(0)

    expect(table.status.lastPattern).to.have.properties({
      name: 'double',
      score: 3
    })
  })

  it('第一轮打对 不能打更小的对', () => {
    player1.cards = [Enums.c3, Enums.c3, Enums.c5, Enums.c6, Enums.c8, Enums.c9]
    player2.cards = [Enums.c3, Enums.c3, Enums.c5, Enums.c6, Enums.c8, Enums.c9]

    table.onPlayerDa(player1, {cards: [Enums.c3, Enums.c3]})
    table.onPlayerDa(player2, {cards: [Enums.c3, Enums.c3]})

    displayMessage()

    expect(last(packetsTo('testid2'))).to.have.properties({
      name: 'game/daReply', message: {ok: false}
    })
  })

  it('第一家打对 其余三家全部过牌 第一家有重新自由出牌', () => {
    player1.cards = [Enums.c3, Enums.c3, Enums.c5, Enums.c6, Enums.c8, Enums.c9]
    player2.cards = [Enums.c4, Enums.c4, Enums.c5, Enums.c6, Enums.c8, Enums.c9]

    table.onPlayerDa(player1, {cards: [Enums.c3, Enums.c3]})
    table.onPlayerGuo(player2)
    table.onPlayerGuo(player3)

    displayMessage()

    expect(table.status).to.have.properties({
      lastPattern: null, lastCards: []
    })
  })

  it('最后4张可以当三带二出', () => {
    player1.cards = [Enums.c3, Enums.c3, Enums.c3, Enums.c4]
    player2.cards = [Enums.c4, Enums.c4, Enums.c5, Enums.c6, Enums.c8, Enums.c9]

    table.onPlayerDa(player1, {cards: [Enums.c3, Enums.c3, Enums.c3, Enums.c4]})

    displayMessage()

    expect(table.status).to.have.properties({
      lastPattern: {
        name: 'triple++',
        score: 3
      }
    })
  })

  it('最后3张可以当三带二出', () => {
    player1.cards = [Enums.c3, Enums.c3, Enums.c3]
    player2.cards = [Enums.c4, Enums.c4, Enums.c5, Enums.c6, Enums.c8, Enums.c9]

    table.onPlayerDa(player1, {cards: [Enums.c3, Enums.c3, Enums.c3]})

    displayMessage()

    expect(table.status).to.have.properties({
      lastPattern: {
        name: 'triple++',
        score: 3
      }
    })
  })

  it('广播第一个打牌的人', () => {
    displayMessage()
    const messages = packetsWithMessageName('game/startDa').map(p => p.message)
    const index = table.players.findIndex(p => {
      return !!p.cards.find(c => Card.compare(c, Enums.s3) === 0)
    })

    expect(messages[0]).to.be.eql({index})
  })

  it('轮流打牌', () => {

    const p = table.players[0]
    const cards = [p.cards[0]]
    table.onPlayerDa(p, {cards})

    const daReply = packetsWithMessageName('game/daReply')[0].message
    const otherDa = packetsWithMessageName('game/otherDa')[0].message

    expect(daReply).to.be.have.properties({ok: true, remains: 15})
    expect(otherDa).to.be.have.properties({index: 0, remains: 15, cards, next: 1})
  })

  it('第二人直接打牌 不通过', () => {
    table.onPlayerDa(table.players[1], {
      cards: [{type: 1, value: 1}]
    })
    const messages = packetsWithMessageName('game/daReply').map(p => p.message)
    expect(messages[0]).to.be.eql({ok: false, info: '不是您的阶段'})
  })

  it('上家打牌 下家可以炸', () => {
    player1.cards = [Enums.c3, Enums.c3, Enums.c5, Enums.c6, Enums.c8, Enums.c9]
    player2.cards = [Enums.c4, Enums.c4, Enums.s4, Enums.s4, Enums.c8, Enums.c9]

    table.onPlayerDa(player1, {cards: [Enums.c3, Enums.c3]})
    table.onPlayerDa(player2, {cards: [Enums.c4, Enums.c4, Enums.s4, Enums.s4]})

    displayMessage()

    expect(table.status).to.have.properties({
      lastPattern: {name: 'bomb', score: 404}, lastCards: [Enums.c4, Enums.c4, Enums.s4, Enums.s4]
    })

  })

  it('上家炸牌 下家可以炸', () => {
    player1.cards = [Enums.c4, Enums.c4, Enums.s4, Enums.s4, Enums.c8, Enums.c9]
    player2.cards = [Enums.c5, Enums.c5, Enums.s5, Enums.s5, Enums.c8, Enums.c9]

    table.onPlayerDa(player1, {cards: [Enums.c4, Enums.c4, Enums.s4, Enums.s4]})
    table.onPlayerDa(player2, {cards: [Enums.c5, Enums.c5, Enums.s5, Enums.s5]})

    displayMessage()

    expect(table.status).to.have.properties({
      lastPattern: {name: 'bomb', score: 405}
    })

  })

  describe('可以过牌', () => {
    it('过 消息里面带next', () => {
      const [p, p1] = table.players
      const cards = [p.cards[0]]
      table.onPlayerDa(p, {cards})

      table.onPlayerGuo(p1)
      displayMessage()
      const message = last(packetsWithMessageName('game/otherGuo')).message
      expect(message).to.have.properties({index: 1, next: 2})
    })

    it('第一人 直接点过 失败', () => {
      const [p] = table.players

      table.onPlayerGuo(p)
      displayMessage()
      const message = last(packetsWithMessageName('game/guoReply')).message
      expect(message).to.be.eql({ok: false, info: '不能过'})
    })

    it('第二人 直接点过 失败', () => {
      const [p, p1] = table.players

      table.onPlayerGuo(p1)
      const message = last(packetsWithMessageName('game/guoReply')).message
      expect(message).to.be.eql({ok: false, info: '不是您的阶段'})
    })
  })
})
