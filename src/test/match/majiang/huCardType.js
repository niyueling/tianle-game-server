/**
 * Created by jone on 28/10/2016.
 */

import Enums from '../../../match/majiang/enums';


function huCardFactory(caiShen) {
  return {
    shuangCaiGuiWei: [
      caiShen, caiShen, //tongzi4 or tongzi7
      Enums.zhong, Enums.zhong,
      Enums.tongzi5, Enums.tongzi5,
      Enums.tongzi6, Enums.tongzi6,
    ],
    qiDuiZiQiaoXiang_14: [
      caiShen, caiShen,
      Enums.wanzi1,
      Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi9,
      Enums.shuzi4, Enums.shuzi4,
      Enums.tongzi1, Enums.tongzi1,
      Enums.tongzi3, Enums.tongzi3,
      Enums.bei, Enums.bei
    ],
    qiDuiZiQiaoXiang_bai_14: [
      caiShen, caiShen,
      Enums.wanzi1,
      Enums.wanzi3, Enums.wanzi3,
      Enums.bai,
      Enums.shuzi4, Enums.shuzi4,
      Enums.tongzi1, Enums.tongzi1,
      Enums.tongzi3, Enums.tongzi3,
      Enums.bei, Enums.bei
    ],
    sanCaiGuiWei_11: [
      caiShen, caiShen, caiShen,
      Enums.zhong, Enums.zhong,
      Enums.tongzi2, Enums.tongzi3,
      Enums.tongzi5, Enums.tongzi5,
      Enums.tongzi6, Enums.tongzi6,
    ],
    pingHu2CaiShen: [
      caiShen, caiShen,
      Enums.zhong, Enums.zhong,
      Enums.xi, Enums.xi,
      Enums.tongzi5,
    ],
    peng: [
      Enums.tongzi4,
      Enums.tongzi5,
      Enums.tongzi6,
      Enums.tongzi7,
      Enums.tongzi4,
      Enums.tongzi5,
      Enums.tongzi6,
      Enums.tongzi7,
    ],
    pingHuQiDui: [
      Enums.wanzi2, Enums.wanzi2,
      Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi4,

      Enums.tongzi4,
      Enums.tongzi5,
      Enums.tongzi6,
      Enums.tongzi7,

      Enums.tongzi4,
      Enums.tongzi5,
      Enums.tongzi6,
      Enums.tongzi7,
    ],
    pengPengHu: [
      Enums.tongzi5,
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
      Enums.wanzi7, Enums.wanzi5, Enums.wanzi6,
      Enums.wanzi7, Enums.wanzi5, Enums.wanzi6,
    ],
    pengPengHu_4: [
      Enums.tongzi5,
      Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
    ],
    pengPengHu_7: [
      Enums.tongzi5,
      Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
      Enums.wanzi3, Enums.wanzi3, Enums.wanzi3,
    ],
    pengPengHu_3caiShen_4: [
      caiShen, caiShen, caiShen,
      Enums.tongzi5,
    ],
    pengPengHu_caiShen_7: [
      caiShen, caiShen,
      Enums.tongzi5, Enums.tongzi8,
      Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
    ],
    sanGang: [
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
      Enums.wanzi4, Enums.wanzi4, Enums.wanzi4,
      Enums.wanzi6,
    ],
    qiDui: [
      caiShen,
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
      Enums.wanzi4, Enums.wanzi5, Enums.wanzi6,
      Enums.wanzi4, Enums.wanzi5, Enums.wanzi6,
    ],
    qiDuiBaoTouCaiShenTou: [
      caiShen, caiShen, caiShen,
      Enums.wanzi1, Enums.tongzi6, Enums.shuzi3,
      Enums.wanzi1, Enums.tongzi6, Enums.shuzi3,
      Enums.tongzi9, Enums.shuzi8, Enums.wanzi9,
      Enums.tongzi9,
    ],
    caiShenTou: [
      caiShen, caiShen, caiShen,
      Enums.wanzi1, Enums.wanzi2,
      Enums.wanzi1, Enums.wanzi2,
      Enums.wanzi1, Enums.wanzi2,
      Enums.tongzi4,
      Enums.tongzi5,
      Enums.tongzi6,
      Enums.tongzi7,
    ],
    baoTouNotCaiShenTou: [
      caiShen, caiShen,
      Enums.shuzi5, Enums.shuzi5,
      Enums.tongzi3, Enums.tongzi4, Enums.tongzi5,
      Enums.tongzi5, Enums.tongzi6, Enums.tongzi7,
      Enums.tongzi6, Enums.tongzi7, Enums.tongzi8,
    ],
    qiDuiBaoTou: [
      caiShen, caiShen,
      Enums.wanzi8, Enums.wanzi3, Enums.wanzi2,
      Enums.wanzi8, Enums.wanzi3,
      Enums.wanzi4, Enums.wanzi4,
      Enums.wanzi5, Enums.wanzi5,
      Enums.wanzi6, Enums.wanzi6,
    ],
    wuCai13BuKao: [
      Enums.dong, Enums.xi, Enums.nan, Enums.bei,
      Enums.wanzi2, Enums.wanzi5, Enums.wanzi9,
      Enums.tongzi1, Enums.tongzi6, Enums.tongzi9,
      Enums.shuzi1, Enums.shuzi5, Enums.shuzi9,
    ],
    youCai13BuKao: [
      caiShen,
      Enums.dong, Enums.bei, Enums.fa,
      Enums.wanzi2, Enums.wanzi5, Enums.wanzi8,
      Enums.tongzi3, Enums.tongzi6, Enums.tongzi9,
      Enums.shuzi1, Enums.shuzi4, Enums.shuzi7,
    ],
    caiShenShiFeng13BuKao: [
      caiShen,
      Enums.dong, Enums.xi, Enums.nan, Enums.bai, Enums.bai,
      Enums.wanzi2, Enums.wanzi5, Enums.wanzi9,
      Enums.tongzi1, Enums.tongzi6, Enums.tongzi9,
      Enums.shuzi1,
    ],
    youCaiQiFeng_13: [
      caiShen, caiShen,
      Enums.dong, Enums.nan, Enums.xi, Enums.bei, Enums.zhong, Enums.fa,
      Enums.wanzi3, Enums.wanzi8,
      Enums.tongzi2, Enums.tongzi5,
      Enums.shuzi3,
    ],
    youCaiQiFeng: [
      caiShen,
      Enums.dong, Enums.nan, Enums.bei, Enums.zhong, Enums.fa, Enums.bai,
      Enums.wanzi1, Enums.wanzi4,
      Enums.tongzi2, Enums.tongzi5,
      Enums.shuzi3,
    ],
    wuCaiQiFeng: [
      Enums.dong, Enums.nan, Enums.xi, Enums.bei, Enums.zhong, Enums.fa, Enums.bai,
      Enums.wanzi2, Enums.wanzi5,
      Enums.tongzi1, Enums.tongzi6,
      Enums.shuzi1, Enums.shuzi5,
    ],
    luanFeng: [
      caiShen,
      Enums.dong, Enums.xi, Enums.nan, Enums.bei,
      Enums.dong, Enums.xi, Enums.nan, Enums.bei,
      Enums.dong, Enums.xi, Enums.nan, Enums.bei,
    ],
    luanFengChi: [
      caiShen,
      Enums.dong, Enums.xi, Enums.nan,
      Enums.dong, Enums.xi, Enums.nan,
      Enums.dong, Enums.xi, Enums.nan,
      Enums.zhong,
      Enums.wanzi2, Enums.wanzi3
    ],
    qiShouSanCai: [
      caiShen, caiShen, caiShen,
      Enums.bei,
      Enums.wanzi2, Enums.wanzi5, Enums.wanzi9,
      Enums.tongzi1, Enums.tongzi6, Enums.tongzi9,
      Enums.dong,
    ],

    pingHu: [
      Enums.wanzi1, Enums.wanzi1, Enums.wanzi1,
      Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
      Enums.wanzi3, Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi4, Enums.wanzi5,
      Enums.dong, Enums.dong,
    ],
    pingHuBaoTou: [
      caiShen,
      Enums.wanzi1, Enums.wanzi1, Enums.wanzi1,
      Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
      Enums.wanzi3, Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi4, Enums.wanzi5, Enums.wanzi6,
    ]
    ,
    qingYiSe: [
      Enums.wanzi1, Enums.wanzi1, Enums.wanzi1,
      Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
      Enums.wanzi3, Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi4, Enums.wanzi5,
      Enums.wanzi6, Enums.wanzi6,
    ],

    hunYiSe: [
      Enums.wanzi1, Enums.wanzi1, Enums.wanzi1,
      Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
      Enums.wanzi3, Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi4, Enums.wanzi5,
      Enums.dong, Enums.dong,
    ],
    gangBao: [
      caiShen,
      Enums.wanzi1, Enums.wanzi1, Enums.wanzi1,
      Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
      Enums.wanzi3, Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi4, Enums.wanzi4, Enums.wanzi4,

    ],
    duoGang: [
      caiShen,
      Enums.wanzi1, Enums.wanzi1, Enums.wanzi1,
      Enums.wanzi2, Enums.wanzi2,
      Enums.wanzi3, Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi4, Enums.wanzi4, Enums.wanzi4,
      Enums.tongzi1,
    ],
    hunGangBao: [
      caiShen, Enums.dong, caiShen,
      Enums.wanzi1, Enums.wanzi1, Enums.wanzi1,
      Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
      Enums.wanzi3, Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi4,
    ],
    maxHu: [
      Enums.wanzi7, Enums.bai,
      Enums.wanzi1, Enums.wanzi1, Enums.wanzi1,
      Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
      Enums.wanzi3, Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi6,
      Enums.wanzi8,
    ],
    caiShenGuiWei: [
      caiShen, Enums.wanzi7,
      Enums.wanzi1, Enums.wanzi1, Enums.wanzi1,
      Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
      Enums.wanzi3, Enums.wanzi3, Enums.wanzi3,
      Enums.tongzi6, Enums.tongzi6
    ]

  };
}


export default huCardFactory
