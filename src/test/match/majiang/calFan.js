import * as chai from 'chai'
import HuPaiDetect from '../../../match/pcmajiang/HuPaiDetect'
const {expect} = chai

describe('番数', function () {
  const rule = {ro: {kehu: ['qiDui', 'pengPengHu', 'qingYiSe', 'haoQi', 'shuangHaoQi', 'sanHaoQi', 'tianHu', 'diHu']}}
  it('平胡', function () {
    let result = {
      hu: true,
      huType: 'pingHu'
    }
    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(1)
  })

  it('七大对 + 无癞子', function () {
    let result = {
      hu: true,
      huType: 'pengPengHu',
      pengPengHu: true,
      wuCai: true
    }
    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(2)
  })

  it('七大对 + 有癞子', function () {
    let result = {
      hu: true,
      huType: 'pengPengHu',
      pengPengHu: true,
      wuCai: false
    }
    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(2)
  })

  it('清一色 + 七大对 + 无癞子', function () {
    let result = {
      hu: true,
      huType: 'pengPengHu',
      pengPengHu: true,
      qingYiSe: true,
      wuCai: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it('清一色 + 七大对 + 有癞子', function () {
    let result = {
      hu: true,
      huType: 'pengPengHu',
      pengPengHu: true,
      qingYiSe: true,
      wuCai: false
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it('七对子 + 无癞子', function () {
    let result = {
      hu: true,
      huType: 'qiDui',
      qiDui: true,
      wuCai: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(2)
  })


  it('七对子 + 有癞子', function () {
    let result = {
      hu: true,
      huType: 'qiDui',
      qiDui: true,
      wuCai: false
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(2)
  })

  it('清一色 + 七对子 + 有癞子', function () {
    let result = {
      hu: true,
      huType: 'qiDui',
      qiDui: true,
      wuCai: false,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it('清一色 + 七对子 + 无癞子', function () {
    let result = {
      hu: true,
      huType: 'qiDui',
      qiDui: true,
      wuCai: true,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })


  it('豪华七小对 + 有癞子', function () {
    let result = {
      hu: true,
      huType: 'haoQi',
      haoQi: true,
      wuCai: false,
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it('豪华七小对 + 无癞子', function () {
    let result = {
      hu: true,
      huType: 'haoQi',
      haoQi: true,
      wuCai: true,
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it('清一色 + 豪华七小对 + 无癞子', function () {
    let result = {
      hu: true,
      huType: 'haoQi',
      haoQi: true,
      wuCai: true,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(16)
  })


  it('清一色 + 豪华七小对 + 有癞子', function () {
    let result = {
      hu: true,
      huType: 'haoQi',
      haoQi: true,
      wuCai: false,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(16)
  })

  it('清一色 + 双豪华七小对 + 无癞子', function () {
    let result = {
      hu: true,
      huType: 'shuangHaoQi',
      shuangHaoQi: true,
      wuCai: true,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(32)
  })


  it('清一色 + 双豪华七小对 + 有癞子', function () {
    let result = {
      hu: true,
      huType: 'shuangHaoQi',
      shuangHaoQi: true,
      wuCai: false,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(32)
  })

  it('清一色 + 三豪华七小对 + 无癞子', function () {
    let result = {
      hu: true,
      huType: 'sanHaoQi',
      sanHaoQi: true,
      wuCai: true,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(64)
  })


  it('清一色 + 三豪华七小对 + 有癞子', function () {
    let result = {
      hu: true,
      huType: 'sanHaoQi',
      sanHaoQi: true,
      wuCai: false,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(64)
  })

  it('清一色 + 有癞子', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      wuCai: false,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it('清一色 + 无癞子', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      wuCai: true,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it('天胡', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      tianHu: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it('清一色天胡', function () {
    let result = {
      hu: true,
      tianHu: true,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(16)
  })

  it('七对子天胡', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      qiDui: true,
      tianHu: true,
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it('地胡', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      diHu: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it('清一色地胡', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      diHu: true,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(16)
  })
})

