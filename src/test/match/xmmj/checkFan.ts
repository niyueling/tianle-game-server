// 计算番数
import * as chai from "chai";
import {manager} from "../../../match/xmmajiang/cardManager";
import Enums from "../../../match/xmmajiang/enums";
import {pingHuList} from "./huCards";

chai.should();

describe('测试番数', async () => {
  let maps;
  let goldCard;
  let result;
  it('平胡', async () => {
    goldCard = Enums.fa;
    maps = manager.card2Map(pingHuList.common);
    result = manager.getMaxHuType(maps, goldCard, null, {}, {})
    // 平胡 1倍
    result.fan.should.equal(1, '平胡番数不为1');
    maps = manager.card2Map(pingHuList.wanZiQingYiSe);
    result = manager.getMaxHuType(maps, goldCard, null, {}, {})
    // 清一色 2倍
    result.fan.should.equal(2, '清一色番数不为2');
    maps = manager.card2Map(pingHuList.youJinFa);
    result = manager.getMaxHuType(maps, goldCard, null, {youJinTimes: 1}, {})
    // 游金 4倍
    result.fan.should.equal(4, '游金番数不为4');
    result = manager.getMaxHuType(maps, goldCard, null, {youJinTimes: 2}, {})
    // 二游 8倍
    result.fan.should.equal(8, '二游需要 8 倍');
    result = manager.getMaxHuType(maps, goldCard, null, {youJinTimes: 3}, {})
    // 3游 16倍
    result.fan.should.equal(16, '3游需要16倍');
    // 3金倒 4倍
    maps = manager.card2Map(pingHuList.sanJinFa);
    result = manager.getMaxHuType(maps, goldCard, null, {}, {})
    result.fan.should.equal(4, '3金倒需要4倍');
  });
})
