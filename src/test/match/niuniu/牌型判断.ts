import {last} from 'lodash'
import {matchOverMessageToScoreString, startNiuNiuGame} from "./roomUtils"
import Enums from "../../../match/niuniu/enums"
import {clearMessage, packetsTo} from "../mockwebsocket"
import * as chai from 'chai'
import NiuSuit from '../../../match/niuniu/niuSuit'
import * as chaiProperties from 'chai-properties'

chai.use(chaiProperties)
const {expect} = chai

describe('牌型判断', () => {
  let tableState = null

  let player1

  beforeEach(() => {
    tableState = startNiuNiuGame(3).tableState
    player1 = tableState.players[0]
    clearMessage()
  })

  it('牛4', function () {
    const cards = [
      Enums.cK, Enums.cK, Enums.c10,
      Enums.c1, Enums.c3
    ]
    const result = new NiuSuit(cards).niuResult

    expect(result).to.have.properties({
      bomb: false,
      fiveColor: false,
      fiveSmall: false,
      niu: 4
    })
  })

  it('五花牛', function () {
    const cards = [
      Enums.cK, Enums.cK, Enums.cQ,
      Enums.cQ, Enums.cJ
    ]
    const result = new NiuSuit(cards).niuResult

    expect(result).to.have.properties({
      bomb: false,
      fiveColor: true,
      fiveSmall: false,
      niu: 10
    })
  })

  it('五小牛', function () {
    const cards = [
      Enums.c1, Enums.c2, Enums.c2,
      Enums.c2, Enums.c1
    ]
    const result = new NiuSuit(cards).niuResult

    expect(result).to.have.properties({
      bomb: false,
      fiveColor: false,
      fiveSmall: true,
      niu: 0
    })
  })

  it('炸弹', function () {
    const cards = [
      Enums.c10, Enums.d10, Enums.s10,
      Enums.h10, Enums.c1
    ]
    const result = new NiuSuit(cards).niuResult

    expect(result).to.have.properties({
      bomb: true,
      fiveColor: false,
      fiveSmall: false,
      niu: 1
    })
  })

})


