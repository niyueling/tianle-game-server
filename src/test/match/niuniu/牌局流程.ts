import {last} from 'lodash'
import {matchOverMessageToScoreString, startNiuNiuGame} from "./roomUtils"
import Enums from "../../../match/niuniu/enums"
import {clearMessage, displayMessage, packetsTo, packetsWithMessageName} from "../mockwebsocket"
import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'

chai.use(chaiProperties)
const {expect} = chai

describe('牌局流程', () => {
  let tableState = null

  beforeEach(() => {

  })

  it('需要选庄', () => {

    tableState = startNiuNiuGame(3).tableState

    tableState.timeline.immediateExec()
    tableState.timeline.immediateExec()
    tableState.timeline.immediateExec()
    tableState.timeline.immediateExec()

    displayMessage()

    const zhuangIndex = packetsWithMessageName('game/bornZhuang')[0].message.zhuang
    const playerIndex = (zhuangIndex + 1) % tableState.players.length
    expect(packetsTo(tableState.players[zhuangIndex]._id)).to.have.lengthOf(8)
    expect(packetsTo(tableState.players[playerIndex]._id)).to.have.lengthOf(9)
  })

  it('不需要选庄', () => {

    tableState = startNiuNiuGame(3, {
      zhuangType: 'tongBi'
    }).tableState

    tableState.timeline.immediateExec()
    tableState.timeline.immediateExec()


    displayMessage()


    expect(packetsTo('testid1')).to.have.lengthOf(4)
  })

})


