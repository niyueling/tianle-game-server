import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {last} from 'lodash'
import Player from "../../../database/models/player";
import accoutHandler from '../../../player/message-handlers-rmq/account'

chai.use(chaiProperties)
const {expect} = chai

let messages = []

function sendMessage(name, message) {
  messages.push({name, message})
}

describe('红包功能', () => {

  beforeEach(() => messages = [])

  it('查询红包提现记录 ', async () => {

    await accoutHandler['account/withdrawRedPocketRecords']({
      _id: 'testid1', sendMessage
    })

    expect(messages).to.have.lengthOf(1)
    expect(last(messages).message).to.have.properties({records: []})
  });

  context('红包提现', () => {

    const PLAYERID = 'redPocketTest'

    beforeEach(async () => {
      await Player.create({
        _id: PLAYERID, redPocket: 0,
        name: 'iloveRedPocket'
      })
    })
    afterEach(async () => {
      await Player.remove({_id: PLAYERID})
    })

    it('提示账号绑定', async function () {
      await accoutHandler['account/withdrawRedPocket'](
        {_id: 'redPocketTest', sendMessage})

      expect(last(messages).message).to.have.properties({
        ok: false, info: '请先到公众号绑定游戏账号'
      })
    });


    it('提示金额不足', async function () {

      await Player.findByIdAndUpdate(PLAYERID, {$set: {openId: 'openId'}})

      await accoutHandler['account/withdrawRedPocket'](
        {_id: 'redPocketTest', sendMessage})

      expect(last(messages).message).to.have.properties({
        ok: false, info: '红包金额超过15元才能提现'
      })
    })

  })

})
