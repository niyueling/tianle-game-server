'use strict'

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/pcmajiang/enums'
import {last, nth} from 'lodash'
import {displayMessage, packets, packetsTo} from './mockwebsocket'
import setupMatch from './setupMatch'

const {expect} = chai
chai.use(chaiProperties);
let sleepDur = 100
let sleep = function (time) {
  return new Promise((resolve) => {
    setTimeout(resolve, time)
  })
}

const genAssistList = (cards, card) => {
  const assistList = new Array(38).fill(0);
  card && (assistList[card] = 1);
  cards.forEach(x => {
    if (x !== Enums.slotNoCard) {
      assistList[x]++;
    }
  });
  return assistList;
};

describe('牌桌', function () {

  describe('游戏流程', function () {

    let room, table;
    let player1, player2, player3, player4;
    let changeCaishen

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


    describe('用户bug 玩家1打一万 玩家2可吃可胡 玩家3可碰', () => {

      beforeEach(() => {
        table.fapai()
        changeCaishen(Enums.dong)
        player1.cards = new Array(38).fill(0);
        player1.cards[Enums.wanzi1] = 2

        player2.cards = new Array(38).fill(0);
        player2.cards[Enums.wanzi2] = 1;
        player2.cards[Enums.wanzi3] = 1;
        player2.cards[Enums.shuzi3] = 2;


        player3.cards = new Array(38).fill(0)
        player3.cards[Enums.wanzi1] = 2;
        player3.cards[Enums.shuzi3] = 1

        player4.cards = new Array(38).fill(0)
        player4.cards[Enums.zhong] = 1
        player4.cards[Enums.tongzi1] = 1
      })

      it('玩家2不胡, 玩家3碰', () => {
        player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)

        expect(last(packetsTo('testid2')).message).to.have.properties({hu: true})
        expect(last(packetsTo('testid3')).message).to.have.properties({peng: true})

        player3.emitter.emit(Enums.peng, table.turn, Enums.wanzi1)
        player2.emitter.emit(Enums.guo, table.turn, Enums.wanzi1)

        expect(last(packetsTo('testid3')).message).to.have.properties({errorCode: 0})
      })

      it.skip('玩家2不胡, 玩家3不碰 玩家2可吃', () => {
        player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)

        player2.emitter.emit(Enums.chi, table.turn, Enums.wanzi1, Enums.wanzi2, Enums.wanzi3)
        player3.emitter.emit(Enums.guo, table.turn, Enums.wanzi1)

        displayMessage();

        expect(last(packetsTo('testid2')).message).to.have.properties({errorCode: 0})
      })

      it('玩家2不能直接吃', () => {
        player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
        expect(last(packetsTo('testid2')).message).to.have.properties({hu: true})
        expect(last(packetsTo('testid3')).message).to.have.properties({peng:true})

        player2.emitter.emit(Enums.chi, table.turn, Enums.wanzi2, Enums.wanzi3)
        displayMessage();
      })
    });


    describe('用户bug 玩家1打白板 玩家2可吃可胡 玩家3可胡', () => {

      beforeEach(() => {
        table.fapai()


        player1.cards = new Array(38).fill(0);
        player1.cards[Enums.bai] = 1

        player2.cards = new Array(38).fill(0);

        player2.cards[Enums.shuzi7] = 1;
        player2.cards[Enums.wanzi3] = 1;
        player2.cards[Enums.wanzi4] = 1;
        player2.cards[Enums.wanzi5] = 1;
        player2.cards[Enums.wanzi6] = 1;
        player2.cards[Enums.shuzi8] = 1;
        player2.cards[Enums.shuzi9] = 1;
        player2.cards[Enums.tongzi3] = 1;
        player2.cards[Enums.tongzi4] = 1;
        player2.cards[Enums.tongzi5] = 1;
        player2.cards.caiShen = Enums.shuzi7

        player3.cards = new Array(38).fill(0)
        player3.cards[Enums.shuzi7] = 2;
        player3.cards[Enums.wanzi1] = 1;
        player3.cards[Enums.wanzi7] = 1;
        player3.cards[Enums.shuzi5] = 1;
        player3.cards[Enums.shuzi9] = 1;
        player3.cards[Enums.tongzi4] = 1;
        player3.cards[Enums.tongzi8] = 1;
        player3.cards[Enums.dong] = 1;
        player3.cards[Enums.nan] = 1;
        player3.cards[Enums.xi] = 1;
        player3.cards[Enums.bei] = 1;
        player3.cards[Enums.zhong] = 1;
        player3.cards.caiShen = Enums.shuzi7


        player4.cards = new Array(38).fill(0)
        player4.cards[Enums.zhong] = 1
        player4.cards[Enums.tongzi1] = 1

        changeCaishen(Enums.shuzi7)
      })

      // todo 修复次问题
      it.skip('玩家2不能吃', () => {
        player1.emitter.emit(Enums.da, table.turn, Enums.bai)
        displayMessage();
        expect(last(packets).message).to.have.properties({hu: true, chi: false})
      })
    });


    it.skip('吃 胡 一起出现', function () {

      table.fapai()
      changeCaishen(Enums.dong)
      player1.cards = new Array(38).fill(0);
      player1.cards[Enums.wanzi1] = 2

      player2.cards = new Array(38).fill(0);
      player2.cards[Enums.wanzi2] = 1;
      player2.cards[Enums.wanzi3] = 1;
      player2.cards[Enums.shuzi3] = 2;

      player3.cards = new Array(38).fill(0)
      player4.cards = new Array(38).fill(0)

      player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
      expect(last(packets).message).to.have.properties({hu: true, chi: true})
    })


    it('碰 胡 一起出现,选择碰', function () {

      table.fapai()
      changeCaishen(Enums.dong)
      player1.cards = new Array(38).fill(0);
      player1.cards[Enums.wanzi1] = 1

      player2.cards = new Array(38).fill(0);

      player2.cards[Enums.wanzi1] = 2;
      player2.cards[Enums.shuzi3] = 2;

      player3.cards = new Array(38).fill(0)
      player3.cards[Enums.xi] = 1

      player4.cards = new Array(38).fill(0)
      player4.cards[Enums.xi] = 1

      player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
      expect(last(packets).message).to.have.properties({hu: true, peng: true, from: 0})

      player2.emitter.emit(Enums.peng, table.turn, Enums.wanzi1)
      player2.emitter.emit(Enums.da, table.turn, Enums.shuzi3)
      displayMessage()
    })


    it('多人 碰 胡 一起出现', function () {

      table.fapai()
      changeCaishen(Enums.dong)
      player1.cards = new Array(38).fill(0);
      player1.cards[Enums.wanzi1] = 1

      player2.cards = new Array(38).fill(0);
      player2.cards[Enums.wanzi1] = 2;
      player2.cards[Enums.shuzi3] = 2;

      player3.cards = new Array(38).fill(0);
      player3.cards[Enums.wanzi1] = 1;
      player3.cards[Enums.shuzi3] = 3;

      player4.cards = new Array(38).fill(0)
      player4.cards[Enums.xi] = 1

      player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
      displayMessage()

      expect(last(packetsTo('testid2')).message).to.have.properties({hu: true, card: 1, from: 0, turn: 2})
      expect(last(packetsTo('testid3')).message).to.have.properties({hu: true, card: 1, from: 0, turn: 2})

    })


    it('验证碰的 from ', function () {

      table.fapai()
      changeCaishen(Enums.dong)
      player1.cards = new Array(38).fill(0);
      player1.cards[Enums.wanzi1] = 2
      player1.cards[Enums.bei] = 2

      player2.cards = new Array(38).fill(0);
      player2.cards[Enums.wanzi1] = 2;
      player2.cards[Enums.shuzi3] = 2;
      player2.cards[Enums.xi] = 1

      player3.cards = new Array(38).fill(0)
      player3.cards[Enums.xi] = 1
      player3.cards[Enums.shuzi1] = 1


      player4.cards = new Array(38).fill(0)
      player4.cards[Enums.xi] = 1
      player4.cards[Enums.shuzi1] = 1

      player1.emitter.emit(Enums.da, table.turn, Enums.bei)
      player2.emitter.emit(Enums.da, table.turn, Enums.xi)
      player3.emitter.emit(Enums.da, table.turn, Enums.xi)
      player4.emitter.emit(Enums.da, table.turn, Enums.xi)

      player1.emitter.emit(Enums.da, table.turn, Enums.bei)

      player2.emitter.emit(Enums.da, table.turn, Enums.wanzi1)

      displayMessage()
      expect(last(packets).message).to.have.properties({peng: true, from: 1})

    })


    it('开局 牌数112', function () {
      expect(table.remainCards).to.equal(112)
    });

    it('发牌', function () {
      table.fapai();

    });

    describe.skip('白板吃碰', function () {
      it('打出的白板能吃', function () {

        player1.caiShen = Enums.wanzi1;
        player1.cards = new Array(38).fill(0);
        player1.cards[Enums.wanzi2] = 1;
        player1.cards[Enums.wanzi3] = 1;

        let check = {};
        player1.checkChi(Enums.bai, check)
        expect(check.chiCombol).to.has.properties([[Enums.wanzi2, Enums.wanzi3]]);

      });

      it('中发白不能吃', function () {

        player1.caiShen = Enums.wanzi1;
        player1.cards = new Array(38).fill(0);
        player1.cards[Enums.zhong] = 1;
        player1.cards[Enums.fa] = 1;

        let check = {}

        player1.checkChi(Enums.bai, check)
        expect(check.chiCombol).to.be.empty
        expect(check.chi).to.equal(undefined)

      })

      it('手中的白板 可以参与被吃', function () {
        player1.caiShen = Enums.wanzi1;
        player1.cards = new Array(38).fill(0);
        player1.cards[Enums.bai] = 1;
        player1.cards[Enums.wanzi3] = 1;

        let check = {};
        player1.checkChi(Enums.wanzi2, check);

        expect(check).to.has.properties({
          chiCombol: [[Enums.bai, Enums.wanzi3]]
        });
        expect(check.chi === player1).to.be.true;
      });

      it('财神不是白板,白板可以碰', function () {
        player1.caiShen = Enums.wanzi2;
        player1.cards = new Array(38).fill(0);
        player1.cards[Enums.bai] = 2;

        let check = {};
        player1.checkPengGang(Enums.bai, check);
        expect(check).not.empty;
        expect(check.pengGang === player1).to.be.true
        expect(check.peng === player1).to.be.true
      });


      it('财神是风 白板不能被吃', function () {
        player1.caiShen = Enums.xi
        player1.cards = new Array(38).fill(0)

        player1.cards[Enums.dong] = 2
        player1.cards[Enums.nan] = 1
        player1.cards[Enums.fa] = 1

        let check = {}
        player1.checkChi(Enums.bai, check)

        expect(check.chi).to.be.empty
      });

    })

    it('财神不能吃', function () {
      player1.caiShen = Enums.wanzi1;
      player1.cards = new Array(38).fill(0);
      player1.cards[Enums.wanzi2] = 1;
      player1.cards[Enums.wanzi3] = 1;

      let check = {};
      player1.checkChi(Enums.wanzi1, check);

      expect(check.chi).to.be.empty;
    });

    it('财神不能碰', function () {
      player1.caiShen = Enums.wanzi2;
      player1.cards = new Array(38).fill(0);
      player1.cards[Enums.wanzi2] = 2;

      let check = {};
      player1.checkPengGang(Enums.wanzi2, check);
      expect(check).is.empty;
      expect(check).has.deep.eq({});
    });


    it('打财神 不能胡', function () {
      player1.caiShen = Enums.wanzi2;
      player1.cards = new Array(38).fill(0);
      player1.cards[Enums.bai] = 2;
      player1.cards[Enums.wanzi6] = 1;
      player1.cards[Enums.wanzi7] = 1;

      let hu = player1.checkJiePao(player1.caiShen);
      expect(hu).is.false;
    });


    it('同时胡碰bug  玩家1:打1万;玩家2:胡一万,取消不胡;玩家3:碰一万,能够碰', function () {
      table.fapai()
      changeCaishen(Enums.dong)

      player1.cards[Enums.wanzi1] = 1;

      player2.cards = new Array(38).fill(0);
      player2.cards[Enums.wanzi1] = 2;
      player2.cards[Enums.wanzi3] = 1;


      player3.cards = new Array(38).fill(0);
      player3.cards[Enums.wanzi2] = 1;
      player3.cards[Enums.wanzi3] = 1;
      player3.cards[Enums.wanzi4] = 2;

      player4.cards = new Array(38).fill(0)
      player4.cards[Enums.wanzi9] = 1

      let turn = 1;

      player1.emitter.emit(Enums.da, turn, Enums.wanzi1)
      turn++

      player3.emitter.emit(Enums.guo, turn, Enums.wanzi1)

      player2.emitter.emit(Enums.peng, turn, Enums.wanzi1)
      displayMessage()

      expect(last(packets)).to.have.properties({
        name: 'game/oppoPeng', message: {"card": Enums.wanzi1, "index": 1, "turn": turn}
      })
    })

    it.skip('同时碰吃 玩家1: 打一万; 玩家3: 碰一万,取消不碰; 玩家2: 吃一万,能够吃', function () {

      table.fapai()
      changeCaishen(Enums.dong)

      player1.cards = new Array(38).fill(0)
      player1.cards[Enums.wanzi1] = 1;

      player2.cards = new Array(38).fill(0);
      player2.cards[Enums.wanzi2] = 1;
      player2.cards[Enums.wanzi3] = 1;
      player2.cards[Enums.shuzi1] = 1;
      player2.cards[Enums.wanzi4] = 1;


      player3.cards = new Array(38).fill(0);
      player3.cards[Enums.wanzi1] = 2;
      player3.cards[Enums.wanzi4] = 1;

      player4.cards = new Array(38).fill(0)
      player4.cards [Enums.bai] = 1

      player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)

      player3.emitter.emit(Enums.guo, table.turn, Enums.wanzi1);
      player2.emitter.emit(Enums.chi, table.turn, Enums.wanzi1, Enums.wanzi2, Enums.wanzi3);

      expect(last(packets)).to.have.properties({
        name: 'game/oppoChi',
        message: {"card": Enums.wanzi1, "turn": table.turn - 1, "index": 1, "suit": [Enums.wanzi2, Enums.wanzi3]}
      })
    })

    it.skip('敲响', function () {

      table.fapai()

      player1.cards = new Array(38).fill(0)
      player1.cards[Enums.wanzi1] = 1;

      player2.cards = new Array(38).fill(0);
      player2.cards[Enums.wanzi2] = 1;
      player2.cards[Enums.wanzi3] = 3;
      player2.cards.caiShen = Enums.wanzi2

      player3.cards = new Array(38).fill(0);
      player4.cards = new Array(38).fill(0)
      changeCaishen(Enums.wanzi2)

      player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)

      let {message: message} = nth(packets, -4)
      let {message: lastMsg} = nth(packets, -1)
      expect(message.info).eq("可以敲响")
      expect(lastMsg).has.properties({index: 1})
    })

    it('无牌了不提示敲响', async function () {

      table.fapai()
      changeCaishen(Enums.dong)

      player1.cards = new Array(38).fill(0)
      player1.cards[Enums.wanzi1] = 1;

      player2.cards = new Array(38).fill(0);
      player2.cards[Enums.wanzi2] = 1;
      player2.cards[Enums.wanzi3] = 3;
      player2.cards.caiShen = Enums.wanzi2

      player3.cards = new Array(38).fill(0);
      player4.cards = new Array(38).fill(0)

      player1.takeLastCard = true
      player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
      table.remainCards = 0
      player2.emitter.emit(Enums.guo, table.turn, Enums.wanzi1)

      await sleep(sleepDur)
      displayMessage()

      let {message: {states}} = last(packets)
      expect(states[1]).has.properties({index: 1, score: 0})
    })


    it.skip('同时胡吃 玩家1: 打一万; 玩家3: 胡一万,取消不胡; 玩家2: 吃一万,能够吃', function () {

      table.fapai()

      player1.cards[Enums.wanzi1] = 1;

      player2.cards = new Array(38).fill(0);
      player2.cards[Enums.wanzi2] = 1;
      player2.cards[Enums.wanzi3] = 1;
      player2.cards[Enums.shuzi3] = 1;

      player3.cards = new Array(38).fill(0);
      player3.cards[Enums.wanzi1] = 2;
      player3.cards[Enums.tongzi1] = 2;

      changeCaishen(Enums.dong)

      let turn = 1;

      player1.emitter.emit(Enums.da, turn, Enums.wanzi1)
      turn++

      player3.emitter.emit(Enums.guo, turn, Enums.wanzi1);
      player2.emitter.emit(Enums.chi, turn, Enums.wanzi1, Enums.wanzi2, Enums.wanzi3);

      displayMessage()

      expect(last(packets)).to.has.properties({
        name: 'game/oppoChi',
        message: {"card": Enums.wanzi1, "turn": turn, "index": 1, "suit": [Enums.wanzi2, Enums.wanzi3]}
      })
    })

    it('碰完 再杠 不需要选择', function () {
      table.fapai()

      player1.cards = new Array(38).fill(0)
      player1.events = {'peng': [Enums.wanzi9]}
      let turn = 1;
      player1.takeCard(turn, Enums.wanzi9);

      //displayMessage()

      expect(last(packets)).to.have.properties({
        name: 'game/TakeCard',
        message: {card: 9, turn: 1, gang: [[9, 'buGang']], hu: false, huInfo: null},
        to:'testid1'
      })
    });


    describe('庄', function () {
      it('胡牌玩家 胡牌玩家为庄', async function () {
        table.gameState = 3
        table.players[3].events.hu = [{}]
        let expectNextZhuang = table.players[3]

        await table.gameOver()

        expect(room.players[0].model._id).to.equal(expectNextZhuang.model._id)

      });
    })

    describe.skip('海底胡牌', function () {
      it('最后四张牌放炮 放炮者承担全部费 并且有承包', function () {

        table.fapai()
        changeCaishen(Enums.wanzi3)
        table.caiShen = Enums.bai

        table.turn = 10
        player1.cards[Enums.wanzi1] = 1

        player2.cards = new Array(38).fill(0)
        player2.cards[Enums.wanzi1] = 1
        player2.cards[Enums.wanzi2] = 3
        player2.cards[Enums.dong] = 3
        player2.cards[Enums.tongzi1] = 3
        player2.cards[Enums.shuzi2] = 3

        player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
        player2.emitter.emit(Enums.hu, table.turn, Enums.wanzi1)


        displayMessage()

        let {message: {states}} = last(packets)

        expect(states[0]).to.have.properties({score: -12000,})
        expect(states[0].events.chengBao).is.not.undefined
        expect(states[1]).to.have.properties({score: 12000 * 0.95,})
        expect(states[2]).to.have.properties({score: 0})
        expect(states[3]).to.have.properties({score: 0})

      })


      it('最后五张牌放炮 正常结算', function () {

        table.fapai()

        table.remainCards = 5

        table.turn = 10
        player1.cards[Enums.wanzi1] = 1

        player2.cards = new Array(38).fill(0)
        player2.cards[Enums.wanzi1] = 1
        player2.cards[Enums.wanzi2] = 3
        player2.cards[Enums.shuzi1] = 3
        player2.cards[Enums.tongzi1] = 3

        player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
        player2.emitter.emit(Enums.hu, table.turn, Enums.wanzi1)

        let {message: {states}} = last(packets)

        expect(states[0]).to.have.properties({score: -6000})
        expect(states[1]).to.have.properties({score: 12000 * 0.95})
        expect(states[2]).to.have.properties({score: -3000})
        expect(states[3]).to.have.properties({score: -3000})

      })
    })

    describe('吃碰限制 ', function () {

      it('player 记录 碰牌次数0', function () {
        table.fapai();
        player1.cards = new Array(38).fill(0)
        player1.cards[Enums.wanzi1] = 2;
        player1.cards[Enums.wanzi2] = 2;

        player1.pengPai(Enums.wanzi1, player2)
        expect(player1.contacted(player2)).to.equal(0)

        player1.pengPai(Enums.wanzi2, player2)
        expect(player1.contacted(player2)).to.equal(0)
      })

      it('player 记录 吃牌次数 0', function () {
        table.fapai();
        player1.cards = new Array(38).fill(0)
        player1.cards[Enums.wanzi2] = 2;
        player1.cards[Enums.wanzi3] = 2;

        player1.chiPai(Enums.wanzi1, Enums.wanzi2, Enums.wanzi3, player2)
        expect(player1.contacted(player2)).to.equal(0)

        player1.chiPai(Enums.wanzi1, Enums.wanzi2, Enums.wanzi3, player2)
        expect(player1.contacted(player2)).to.equal(0)
      });

    })


    describe('抢杠 承包', function () {

      describe('保护碰/杠 逻辑', function () {
        context('没有人胡牌的情况下', function () {
          it('能碰/杠', function () {
            table.fapai()
            changeCaishen(Enums.bai)
            player1.cards[Enums.wanzi1] = 1

            player2.cards = new Array(38).fill(0)
            player2.cards[Enums.wanzi1] = 3
            player2.cards [Enums.tongzi1] = 1

            player3.cards = new Array(38).fill(0)
            player4.cards = new Array(38).fill(0)


            player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
            let {message: lastMessage} = last(packets)
            displayMessage()
            expect(lastMessage).to.have.properties({peng: true, gang: true, gangInfo: [1, 'mingGang']})
          })
        })
      })
    })


    describe('听牌要亮暗杠', function () {
      it('听牌要亮暗杠', function () {
        table.fapai()

        player1.cards = new Array(38).fill(0)

        player1.cards.caiShen = Enums.fa
        player1.events[Enums.anGang] = [Enums.bai]

        player1.cards[Enums.wanzi2] = 3
        player1.cards[Enums.wanzi3] = 3
        player1.cards[Enums.shuzi1] = 3
        player1.cards[Enums.shuzi2] = 3
        player1.cards[Enums.dong] = 1
        player1.cards[Enums.xi] = 1

        player1.emitter.emit(Enums.da, table.turn, Enums.dong)

        displayMessage()

        let mingGangNotifies = packets.filter((p) => p.name === 'game/showAnGang');

        expect(mingGangNotifies).to.have.length(1)
        expect(mingGangNotifies[0].message).to
          .have.properties({cards: [Enums.bai]})
      })
    })

    describe('3个人同时胡', () => {
      it('bug', () => {
        table.fapai()
        changeCaishen(Enums.dong)

        player1.cards = new Array(38).fill(0)
        player1.cards[Enums.wanzi1] = 1

        player2.cards = new Array(38).fill(0)
        player2.cards[Enums.wanzi1] = 1
        player2.cards[Enums.wanzi2] = 3
        player2.cards[Enums.shuzi1] = 3
        player2.cards[Enums.shuzi3] = 3
        player2.cards[Enums.shuzi8] = 3

        player3.cards = new Array(38).fill(0)
        player3.cards[Enums.wanzi1] = 1
        player3.cards[Enums.wanzi2] = 3
        player3.cards[Enums.shuzi1] = 3
        player3.cards[Enums.shuzi3] = 3
        player3.cards[Enums.shuzi8] = 3

        player4.cards = new Array(38).fill(0)
        player4.cards[Enums.wanzi1] = 1
        player4.cards[Enums.wanzi2] = 3
        player4.cards[Enums.shuzi1] = 3
        player4.cards[Enums.shuzi3] = 3
        player4.cards[Enums.shuzi8] = 3

        player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
        expect(last(packetsTo('testid2')).message).to.have.properties({hu: true})
        expect(last(packetsTo('testid3')).message).to.have.properties({hu: true})
        expect(last(packetsTo('testid4')).message).to.have.properties({hu: true})

        player2.emitter.emit(Enums.guo, table.turn)
        expect(last(packetsTo('testid2')).message).to.have.properties({errorCode: 0})
        player3.emitter.emit(Enums.guo, table.turn)
        expect(last(packetsTo('testid3')).message).to.have.properties({errorCode: 0})
        player4.emitter.emit(Enums.hu, table.turn, Enums.wanzi1)
      })
    })

    describe.skip('老庄', () => {
      it('只有庄家赔老庄倍数', () => {
        table.fapai()
        changeCaishen(Enums.dong)

        table.zhuang = player1
        room.currentBase = 3

        player1.cards = new Array(38).fill(0)
        player1.cards[Enums.wanzi1] = 1

        player2.cards = new Array(38).fill(0)
        player2.cards[Enums.wanzi1] = 1
        player2.cards[Enums.wanzi2] = 3
        player2.cards[Enums.shuzi1] = 3
        player2.cards[Enums.shuzi3] = 3
        player2.cards[Enums.shuzi8] = 3

        player3.cards = new Array(38).fill(0)
        player3.cards[Enums.wanzi1] = 1
        player3.cards[Enums.wanzi2] = 3
        player3.cards[Enums.shuzi1] = 3
        player3.cards[Enums.shuzi3] = 3
        player3.cards[Enums.shuzi8] = 3

        player4.cards = new Array(38).fill(0)

        player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)

        player2.emitter.emit(Enums.guo, table.turn)
        player3.emitter.emit(Enums.hu, table.turn, Enums.wanzi1)

        const overMessage = last(packets).message
        const winState = overMessage.states[0]
        const hu = winState.events.dianPao[0]
        expect(hu).to.have.property('diHu').with.eq(true)
        const scores = overMessage.states.map(s => s.score)
        expect(scores).to.be.eql([-36, -6, 48, -6])
        expect(overMessage.base).to.be.eql(3)
      })
    })

    describe('1人胡 一人碰 胡取消 可以碰', () => {
      it('bug', () => {
        table.fapai()
        changeCaishen(Enums.dong)

        player1.cards = new Array(38).fill(0)
        player1.cards[Enums.wanzi1] = 1

        player2.cards = new Array(38).fill(0)
        player2.cards[Enums.wanzi1] = 2
        player2.cards[Enums.wanzi3] = 1


        player3.cards = new Array(38).fill(0)
        player3.cards[Enums.wanzi1] = 1
        player3.cards[Enums.wanzi2] = 3
        player3.cards[Enums.shuzi1] = 3
        player3.cards[Enums.shuzi3] = 3
        player3.cards[Enums.shuzi8] = 3

        player4.cards = new Array(38).fill(0)
        player4.cards[Enums.wanzi1] = 0

        player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
        expect(last(packets).message).to.have.properties({hu: true})
        player3.emitter.emit(Enums.guo, table.turn)

        displayMessage()

        player2.emitter.emit(Enums.peng, table.turn, Enums.wanzi1)

        expect(last(packetsTo('testid2')).message).to.have.properties({errorCode: 0})
      })
    })

    it('普通', function () {
      table.fapai()
      changeCaishen(Enums.tongzi2)

      const cards = [
        Enums.zhong, Enums.zhong,
        Enums.xi, Enums.xi,
        Enums.tongzi2, Enums.tongzi2,
        Enums.tongzi5
      ];

      player1.cards = new Array(38).fill(0);
      player1.cards[Enums.tongzi4] = 1
      player2.cards = genAssistList(cards)
      player2.cards['caiShen'] = Enums.tongzi2
      player2.events = []
      player2.events['chi'] = [[Enums.shuzi3, Enums.shuzi4, Enums.shuzi5], [Enums.tongzi5, Enums.tongzi6, Enums.tongzi7]]

      player1.emitter.emit(Enums.da, 1, Enums.tongzi4)
      displayMessage()
    })
  })
})
