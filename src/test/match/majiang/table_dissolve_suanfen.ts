'use strict'

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/pcmajiang/enums'
import {displayMessage} from './mockwebsocket'
import setupMatch, {cardsFromArray} from './setupMatch'
import TableState from "../../../match/pcmajiang/table_state";
import PlayerState from "../../../match/pcmajiang/player_state";


const {expect} = chai
chai.use(chaiProperties);

describe('麻将解散', () => {

  let room, table: TableState;
  let player1: PlayerState, player2: PlayerState, player3: PlayerState, player4: PlayerState;
  let changeCaishen

  const scoreString = () => table.players.map(p => p.balance).join()

  beforeEach(function () {
    let match = setupMatch()
    table = match.table
    room = match.room
    player1 = match.players[0]
    player2 = match.players[1]
    player3 = match.players[2]
    player4 = match.players[3]
    changeCaishen = match.changeCaishen
  });


  it('解散', async () => {

    table.fapai({})


    player1.cards = cardsFromArray([Enums.wanzi2, Enums.wanzi2, Enums.wanzi2, Enums.wanzi2, Enums.wanzi9])
    player1.emitter.emit(Enums.gangBySelf, table.turn, Enums.wanzi2)

    await room.forceDissolve()

    displayMessage()

    expect(scoreString()).to.equal('6,-2,-2,-2')
  })

})
