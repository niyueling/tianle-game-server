import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {last} from 'lodash'
import {CardType} from "../../../match/biaofen/card"
import Enums from '../../../match/biaofen/enums'
import PlayerState from "../../../match/biaofen/player_state"
import {packets, packetsTo, packetsWithMessageName} from "../mockwebsocket"
import setupMatch from './setupMatch'

chai.use(chaiProperties)
const {expect} = chai

describe('持久化', () => {


  let players: PlayerState[]
  let table

  beforeEach(() => {

    const match = setupMatch()
    players = match.players
    table = match.table

  })


  it('toJson', () => {
    table.toJSON()
    JSON.stringify(table.toJSON(), null, ' ')
    // no news is good news
  });

})
