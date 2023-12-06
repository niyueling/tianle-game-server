import {CardType} from "../../../match/biaofen/card"
import PlayerState from "../../../match/biaofen/player_state"
import {packets, packetsTo, packetsWithMessageName} from "../mockwebsocket"
import setupMatch from './setupMatch'
import Enums from '../../../match/biaofen/enums'
import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {last} from 'lodash'

chai.use(chaiProperties)
const {expect} = chai

describe('叫分', () => {


  let players: PlayerState[]
  let table

  beforeEach(() => {

    const match = setupMatch()
    players = match.players
    table = match.table

    table.jiaoFenStatus.jiaoFens[0] = {fen: 80}
    table.firstPlayerIndex = 0
    table.startSelectPrimary(0)
  })


  it('默认底牌 8张', () => {
    expect(table.diCards).to.have.lengthOf(8)
  })


  it('庄 扣底选主', () => {

    table.onPlayerSelectPrimary(players[0], {primaryType: CardType.Club})
    table.onPlayerKouDi(players[0], {diCards: players[0].cards.slice(0, 8)})

    expect(table.primaryType).to.equal(CardType.Club)
    expect(players[0]).to.have.property('cards').with.lengthOf(25)
  })

})
