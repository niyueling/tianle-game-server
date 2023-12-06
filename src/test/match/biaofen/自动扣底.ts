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

describe('自动扣底', () => {


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


  it('自动扣底', () => {

    table.autoSelectPrimary()
    const zhuang = players[0]

    expect(zhuang.cards).to.have.lengthOf(25)
  })

})
