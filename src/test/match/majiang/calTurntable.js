import * as chai from 'chai'
import HuPaiDetect from '../../../match/pcmajiang/HuPaiDetect'
const {expect} = chai

describe('测试幸运转盘', function () {
  it('转盘1万次', function () {
    let result = {
      hu: true,
      huType: 'pingHu'
    }
    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(1)
  })
})

