import * as chai from 'chai'
import HuPaiDetect from '../../../match/majiang/HuPaiDetect'
const {expect} = chai

describe('番数', function () {
  const rule = {ro: {kehu: ['yiTiaoLong', 'haoQi', 'caiShenGuiWei']}}
  it('平胡', function () {
    let result = {
      hu: true,
      huType: 'pingHu'
    }
    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(1)
  })

  it('碰碰胡 无财', function () {
    let result = {
      hu: true,
      huType: 'pengPengHu',
      pengPengHu: true,
      wuCai: true
    }
    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(2)
  })

  it('碰碰胡 有财', function () {
    let result = {
      hu: true,
      huType: 'pengPengHu',
      pengPengHu: true,
      wuCai: false
    }
    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(2)
  })

  it('清一色+碰碰胡 无财', function () {
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

  it('清一色+碰碰胡  有财', function () {
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


  it.skip('全求人', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      quanQiuRen: true,
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })


  it.skip('清一色全求人', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      quanQiuRen: true,
      qingYiSe: true,
      wuCai: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(16)
  })


  it('清七对', function () {
    let result = {
      hu: true,
      huType: 'qiDui',
      qiDui: true,
      wuCai: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(2)
  })


  it('七对子', function () {
    let result = {
      hu: true,
      huType: 'qiDui',
      qiDui: true,
      wuCai: false
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(2)
  })

  it.skip('七对子敲响', function () {
    let result = {
      hu: true,
      huType: 'qiDui',
      qiDui: true,
      wuCai: false,
      baoTou: true,
      takeSelfCard: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it.skip('七对子敲响财神将', function () {
    let result = {
      hu: true,
      huType: 'qiDui',
      qiDui: true,
      wuCai: false,
      baoTou: true,
      takeSelfCard: true,
      caiShenTou: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(16)
  })

  it('七对子+清一色', function () {
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

  it.skip('清七对+清一色', function () {
    let result = {
      hu: true,
      huType: 'qiDui',
      qiDui: true,
      wuCai: false,
      baoTou: true,
      takeSelfCard: true,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(16)
  })


  it('豪七有财神', function () {
    let result = {
      hu: true,
      huType: 'qiDui',
      haoQi: true,
      wuCai: false,
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it('豪七没财神', function () {
    let result = {
      hu: true,
      huType: 'qiDui',
      haoQi: true,
      wuCai: true,
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })


  it('十三不靠', function () {
    let result = {
      hu: true,
      huType: '13buKao',
    }
    result['13buKao'] = true

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(1)
  })

  it.skip('七风', function () {
    let result = {
      hu: true,
      huType: 'qiFeng',
      qiFeng: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(2)
  })

  it.skip('杠开平胡', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      gangShangKaiHua: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(2)
  })

  it.skip('杠开财神头', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      gangShangKaiHua: true,
      caiShenTou: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it.skip('杠开财神页', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      gangShangKaiHua: true,
      sanCaiYiKe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it.skip('有财清一色杠开', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      gangShangKaiHua: true,
      wuCai: false,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it.skip('无财清一色杠开', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      gangShangKaiHua: true,
      wuCai: true,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it('有财清一色', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      wuCai: false,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it('无财清一色', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      wuCai: true,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })


  it.skip('清一色敲响', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      wuCai: true,
      baoTou: true,
      qingYiSe: true,
      takeSelfCard: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it.skip('清一色财神页', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      caiShenTou: true,
      qingYiSe: true,
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(16)
  })

  it.skip('乱风', function () {
    let result = {
      hu: true,
      huType: 'luanFeng',
      luanFeng: true,
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it.skip('财神头', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      caiShenTou: true,
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it.skip('财神页', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      sanCaiYiKe: true,
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it.skip('平胡敲响', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      baoTou: true,
      takeSelfCard: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(2)
  })

  it.skip('敲响财神头', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      baoTou: true,
      caiShenTou: true,
      takeSelfCard: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it.skip('敲响财神页', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      baoTou: true,
      sanCaiYiKe: true,
      takeSelfCard: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it.skip('平胡杠爆', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      gangBao: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it.skip('清一色杠爆', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      gangBao: true,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(16)
  })

  it('平胡天胡', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      tianHu: true,
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it('清七对天胡', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      qiDui: true,
      wuCai: true,
      tianHu: true,
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it('七对子天胡', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      qiDui: true,
      wuCai: false,
      tianHu: true,
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it('财神归位天胡', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      qiDui: true,
      wuCai: false,
      tianHu: true,
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it('地胡平胡', function () {
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

  it('十三不靠地胡', function () {
    let result = {
      hu: true,
      huType: '13buKao',
      diHu: true,
    }

    result['13buKao'] = true
    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it.skip('财神归位地胡', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      diHu: true,
      caiShenGuiWei: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it.skip('海捞平胡', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      haiDiLaoYue: true,
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(2)
  })

  it.skip('海捞七对子', function () {
    let result = {
      hu: true,
      huType: 'qiDuiZi',
      haiDiLaoYue: true,
      qiDui: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it.skip('海捞清七对', function () {
    let result = {
      hu: true,
      huType: 'qiDuiZi',
      haiDiLaoYue: true,
      qiDui: true,
      wuCai: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it.skip('海捞敲响', function () {
    let result = {
      hu: true,
      huType: 'qiDuiZi',
      haiDiLaoYue: true,
      baoTou: true,
      takeSelfCard: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it.skip('起手三财', function () {
    let result = {
      hu: true,
      huType: 'qiDuiZi',
      qiShouSanCai: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(2)
  })

  it.skip('财神归位', function () {
    let result = {
      hu: true,
      huType: 'qiDuiZi',
      caiShenGuiWei: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(2)
  })

  it.skip('双财归位', function () {
    let result = {
      hu: true,
      huType: 'shuangCaiGuiWei',
      shuangCaiGuiWei: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  it.skip('三财归位', function () {
    let result = {
      hu: true,
      huType: 'pingHu',
      sanCaiGuiWei: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it.skip('清一色财神归位', function () {
    let result = {
      hu: true,
      huType: 'qiDuiZi',
      caiShenGuiWei: true,
      qingYiSe: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(8)
  })

  it.skip('财神归位敲响', function () {
    let result = {
      hu: true,
      huType: 'qiDuiZi',
      caiShenGuiWei: true,
      baoTou: true,
      takeSelfCard: true
    }

    const fan = HuPaiDetect.calFan(result, rule)
    expect(fan).to.be.eq(4)
  })

  describe.skip('一条龙', () => {
    it('财归一条龙', function () {
      let result = {
        hu: true,
        huType: 'qiDuiZi',
        caiShenGuiWei: true,
        yiTiaoLong: true
      }

      const fan = HuPaiDetect.calFan(result, rule)
      expect(fan).to.be.eq(4)
    })

    it('一条龙', function () {
      let result = {
        hu: true,
        huType: 'pingHu',
        yiTiaoLong: true
      }

      const fan = HuPaiDetect.calFan(result, rule)
      expect(fan).to.be.eq(2)
    })

    it('有财清一色一条龙', function () {
      let result = {
        hu: true,
        huType: 'pingHu',
        yiTiaoLong: true,
        qingYiSe: true,
        wuCai: false
      }

      const fan = HuPaiDetect.calFan(result, rule)
      expect(fan).to.be.eq(8)
    })

    it('无财清一色一条龙', function () {
      let result = {
        hu: true,
        huType: 'pingHu',
        yiTiaoLong: true,
        qingYiSe: true,
        wuCai: true
      }

      const fan = HuPaiDetect.calFan(result, rule)
      expect(fan).to.be.eq(16)
    })

    it('一条龙敲响', function () {
      let result = {
        hu: true,
        huType: 'pingHu',
        yiTiaoLong: true,
        baoTou: true,
        takeSelfCard: true
      }

      const fan = HuPaiDetect.calFan(result, rule)
      expect(fan).to.be.eq(4)
    })
  })
})

