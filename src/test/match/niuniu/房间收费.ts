import {last} from 'lodash'
import {matchOverMessageToScoreString, startNiuNiuGame} from "./roomUtils"
import Enums from "../../../match/niuniu/enums"
import {clearMessage, packetsTo} from "../mockwebsocket"
import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Room from "../../../match/niuniu/room_old"

chai.use(chaiProperties)
const {expect} = chai

describe('房间结算', () => {
  let tableState = null

  let player1
  let player2
  let player3
  let room

  beforeEach(() => {
    tableState = startNiuNiuGame(3).tableState
    player1 = tableState.players[0]
    player2 = tableState.players[1]
    player3 = tableState.players[2]
    tableState.room.creator = player1;
    tableState.zhuang = player1;
    tableState.maCards = [Enums.c9]

    room = tableState.room
    clearMessage()
  })

  describe('收费计算', () => {

    context('AA', () => {
      it('AA 10局 房间 1张', function () {
        expect(Room.roomFee({share: true, juShu: 10})).to.eq(0)
      });

      it('AA 36局 房间 2张', function () {
        expect(Room.roomFee({share: true, juShu: 36})).to.eq(0)
      })
    })

    it('房主付费', () => {
      expect(Room.roomFee({share: false, juShu: 12})).to.eq(0)
      expect(Room.roomFee({share: false, juShu: 24})).to.eq(0)
      expect(Room.roomFee({share: false, juShu: 36})).to.eq(0)

      expect(Room.roomFee({share: false, juShu: 31})).to.eq(0)
    })
  })
})


