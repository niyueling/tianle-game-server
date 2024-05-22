'use strict'

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/pcmajiang/enums'
import {last, nth} from 'lodash'
import {packets, displayMessage, clearMessage, packetsWithMessageName}  from './mockwebsocket'
import setupMatch, {cardsFromArray}  from './setupMatch'
import TableState from "../../../match/pcmajiang/table_state";
import PlayerState from "../../../match/pcmajiang/player_state";


const {expect} = chai
chai.use(chaiProperties);

let sleepDur = 10
let sleep = function (time) {
  return new Promise((resolve) => {
    setTimeout(resolve, time)
  })
}

describe('结算', () => {

  let room, table: TableState;
  let player1: PlayerState, player2: PlayerState, player3: PlayerState, player4: PlayerState;
  let changeCaishen

  const scoreString = () => table.players.map(p => p.balance).join()

  beforeEach(async function () {
    let match = await setupMatch()
    table = match.table
    room = match.room
    player1 = match.players[0]
    player2 = match.players[1]
    player3 = match.players[2]
    player4 = match.players[3]
    changeCaishen = match.changeCaishen
  });

  it('平胡点炮', async () => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([Enums.tongzi1]);
    player2.cards = cardsFromArray([
      Enums.tongzi1, Enums.tongzi2, Enums.tongzi3,
      Enums.wanzi3, Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi5, Enums.wanzi5, Enums.wanzi5,
      Enums.wanzi7, Enums.wanzi7, Enums.wanzi7,
      Enums.tongzi1
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    changeCaishen(Enums.slotNoCard)

    player1.emitter.emit(Enums.da, table.turn, Enums.tongzi1)
    player2.emitter.emit(Enums.hu, table.turn, Enums.tongzi1)

    await sleep(sleepDur);

    let state = last(packetsWithMessageName('game/game-over')).message.states[1]

    const huState = state.events.hu[0];

    expect(huState.diHu).not.ok
    expect(scoreString()).to.equal('-1,1,0,0')
  });

  it('平胡自摸', async() => {
    await table.fapai({cards: [
        [Enums.wanzi2],
        [
          Enums.tongzi1, Enums.tongzi2, Enums.tongzi3,
          Enums.wanzi3, Enums.wanzi3, Enums.wanzi3,
          Enums.wanzi5, Enums.wanzi5, Enums.wanzi5,
          Enums.wanzi7, Enums.wanzi7, Enums.wanzi7,
          Enums.wanzi2
        ],
        [],
        []
      ]});
    table.turn = 1;
    changeCaishen(Enums.slotNoCard);

    table.cards = [
      Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1
    ];
    table.remainCards = table.cards.length;

    player1.emitter.emit(Enums.da, table.turn, Enums.wanzi2)
    player2.emitter.emit(Enums.hu, table.turn, Enums.wanzi2)

    await sleep(sleepDur);

    let state = last(packetsWithMessageName('game/game-over')).message.states[1]
    console.warn(state)

    expect(scoreString()).to.equal('-2,6,-2,-2')

  });


  it('七小对 点炮', async () => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([Enums.tongzi1]);
    player2.cards = cardsFromArray([
      Enums.tongzi2, Enums.tongzi2,
      Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi5, Enums.wanzi5,
      Enums.wanzi7, Enums.wanzi7,
      Enums.shuzi1, Enums.shuzi1,
      Enums.shuzi6, Enums.shuzi6,
      Enums.tongzi1
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    changeCaishen(Enums.slotNoCard)

    player1.emitter.emit(Enums.da, table.turn, Enums.tongzi1)
    player2.emitter.emit(Enums.hu, table.turn, Enums.tongzi1)

    await sleep(sleepDur);
    let state = last(packetsWithMessageName('game/game-over')).message.states[1]

    const huState = state.events.hu[0];

    expect(huState.diHu).to.not.ok
    expect(scoreString()).to.equal('-6,6,0,0')
  });

  it('豪七对 点炮', async () => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([Enums.tongzi1]);
    player2.cards = cardsFromArray([
      Enums.tongzi2, Enums.tongzi2,
      Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi5, Enums.wanzi5,
      Enums.wanzi7, Enums.wanzi7,
      Enums.shuzi6, Enums.shuzi6,
      Enums.shuzi6, Enums.shuzi6,
      Enums.tongzi1
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    changeCaishen(Enums.slotNoCard)

    player1.emitter.emit(Enums.da, table.turn, Enums.tongzi1)
    player2.emitter.emit(Enums.hu, table.turn, Enums.tongzi1)

    await sleep(sleepDur);

    displayMessage()
    let state = last(packetsWithMessageName('game/game-over')).message.states[1]

    const huState = state.events.hu[0];

    expect(huState.diHu).to.not.ok
    expect(scoreString()).to.equal('-12,12,0,0')
  });

  it('清一色 七小对 自摸', async () => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([Enums.wanzi1]);
    player2.cards = cardsFromArray([
      Enums.tongzi1, Enums.tongzi1,
      Enums.tongzi2, Enums.tongzi2,
      Enums.tongzi4, Enums.tongzi4,
      Enums.tongzi5, Enums.tongzi5,
      Enums.tongzi7,
      Enums.tongzi8, Enums.tongzi8,
      Enums.tongzi9,Enums.tongzi9,
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    changeCaishen(Enums.slotNoCard)

    table.cards = [
      Enums.tongzi7, Enums.tongzi7, Enums.tongzi7, Enums.tongzi7, Enums.tongzi7, Enums.tongzi7, Enums.tongzi7
    ]
    table.remainCards = table.cards.length

    player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
    player2.emitter.emit(Enums.hu, table.turn, Enums.tongzi7)

    await sleep(sleepDur);

    displayMessage()
    let state = last(packetsWithMessageName('game/game-over')).message.states[1]

    const huState = state.events.hu[0];

    expect(huState.diHu).to.not.ok
    expect(scoreString()).to.equal('-16,48,-16,-16')
  });

  it('清一色 七小对 点炮', async () => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([Enums.tongzi7]);
    player2.cards = cardsFromArray([
      Enums.tongzi1, Enums.tongzi1,
      Enums.tongzi2, Enums.tongzi2,
      Enums.tongzi4, Enums.tongzi4,
      Enums.tongzi5, Enums.tongzi5,
      Enums.tongzi7,
      Enums.tongzi8, Enums.tongzi8,
      Enums.tongzi9,Enums.tongzi9,
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    changeCaishen(Enums.slotNoCard)

    player1.emitter.emit(Enums.da, table.turn, Enums.tongzi7)
    player2.emitter.emit(Enums.hu, table.turn, Enums.tongzi7)

    await sleep(sleepDur);

    displayMessage()
    let state = last(packetsWithMessageName('game/game-over')).message.states[1]

    const huState = state.events.hu[0];

    expect(huState.diHu).to.not.ok
    expect(scoreString()).to.equal('-24,24,0,0')
  });

  it('清一色 豪七对 自摸', async () => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([Enums.wanzi1]);
    player2.cards = cardsFromArray([
      Enums.tongzi1, Enums.tongzi1,
      Enums.tongzi2, Enums.tongzi2,
      Enums.tongzi4, Enums.tongzi4,
      Enums.tongzi7, Enums.tongzi7,Enums.tongzi7,
      Enums.tongzi8, Enums.tongzi8,
      Enums.tongzi9,Enums.tongzi9,
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    changeCaishen(Enums.slotNoCard)

    table.cards = [
      Enums.tongzi7, Enums.tongzi7, Enums.tongzi7, Enums.tongzi7, Enums.tongzi7, Enums.tongzi7, Enums.tongzi7
    ]
    table.remainCards = table.cards.length

    player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
    player2.emitter.emit(Enums.hu, table.turn, Enums.tongzi7)

    await sleep(sleepDur);

    displayMessage()

    let state = last(packetsWithMessageName('game/game-over')).message.states[1]

    const huState = state.events.hu[0];

    expect(huState.diHu).to.not.ok
    expect(huState.qiDui).to.not.true
    expect(huState.haoQi).to.be.true
    expect(huState.qingYiSe).to.be.true
    expect(huState.huType).to.be.equal("qiDui")

    expect(scoreString()).to.equal('-32,96,-32,-32')
  });

  it('清一色 豪七对 点炮', async () => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([Enums.tongzi7]);
    player2.cards = cardsFromArray([
      Enums.tongzi1, Enums.tongzi1,
      Enums.tongzi2, Enums.tongzi2,
      Enums.tongzi4, Enums.tongzi4,
      Enums.tongzi7, Enums.tongzi7,Enums.tongzi7,
      Enums.tongzi8, Enums.tongzi8,
      Enums.tongzi9,Enums.tongzi9,
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    changeCaishen(Enums.slotNoCard)

    player1.emitter.emit(Enums.da, table.turn, Enums.tongzi7)
    player2.emitter.emit(Enums.hu, table.turn, Enums.tongzi7)

    await sleep(sleepDur);

    displayMessage()
    let state = last(packetsWithMessageName('game/game-over')).message.states[1]

    const huState = state.events.hu[0];

    expect(huState.diHu).to.not.ok
    expect(huState.qiDui).to.not.true
    expect(huState.haoQi).to.be.true
    expect(huState.qingYiSe).to.be.true
    expect(scoreString()).to.equal('-48,48,0,0')
  });


  it('七小对 自摸', async() => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([Enums.dong]);
    player2.cards = cardsFromArray([
      Enums.tongzi2, Enums.tongzi2,
      Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi5, Enums.wanzi5,
      Enums.wanzi7, Enums.wanzi7,
      Enums.shuzi1, Enums.shuzi1,
      Enums.shuzi6, Enums.shuzi6,
      Enums.tongzi1
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    changeCaishen(Enums.slotNoCard)

    table.cards = [
      Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1
    ]
    table.remainCards = table.cards.length

    player1.emitter.emit(Enums.da, table.turn, Enums.dong)
    player2.emitter.emit(Enums.hu, table.turn, Enums.tongzi1)

    await sleep(sleepDur);
    let state = last(packetsWithMessageName('game/game-over')).message.states[1]

    const huState = state.events.hu[0];

    expect(huState.diHu).to.be.not.ok
    expect(scoreString()).to.equal('-4,12,-4,-4')
  });


  it('大对碰 自摸', async() => {
    table.fapai([])
    table.turn = 10

    player1.cards = cardsFromArray([Enums.dong]);
    player2.cards = cardsFromArray([
      Enums.tongzi2, Enums.tongzi2, Enums.tongzi2,
      Enums.wanzi3, Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi5, Enums.wanzi5, Enums.wanzi5,
      Enums.shuzi6, Enums.shuzi6, Enums.shuzi6,
      Enums.tongzi1
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    changeCaishen(Enums.slotNoCard)

    table.cards = [
      Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1
    ]
    table.remainCards = table.cards.length

    player1.emitter.emit(Enums.da, table.turn, Enums.dong)
    player2.emitter.emit(Enums.hu, table.turn, Enums.tongzi1)

    await sleep(sleepDur);

    let state = last(packetsWithMessageName('game/game-over')).message.states[1]

    const huState = state.events.hu[0];

    expect(huState.diHu).to.be.is.not.ok
    expect(huState.pengPengHu).to.be.true
    expect(scoreString()).to.equal('-4,12,-4,-4')
  });


  it('大对碰 点炮', async() => {
    table.fapai([])
    table.turn = 10

    player1.cards = cardsFromArray([Enums.tongzi1]);
    player2.cards = cardsFromArray([
      Enums.tongzi2, Enums.tongzi2, Enums.tongzi2,
      Enums.wanzi5, Enums.wanzi5, Enums.wanzi5,
      Enums.wanzi3, Enums.wanzi3, Enums.wanzi3,
      Enums.shuzi6, Enums.shuzi6, Enums.shuzi6,
      Enums.tongzi1
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    changeCaishen(Enums.slotNoCard)

    table.cards = [
      Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1
    ]
    table.remainCards = table.cards.length

    player1.emitter.emit(Enums.da, table.turn, Enums.tongzi1)
    player2.emitter.emit(Enums.hu, table.turn, Enums.tongzi1)

    await sleep(sleepDur);

    let state = last(packetsWithMessageName('game/game-over')).message.states[1]

    const huState = state.events.hu[0];

    expect(huState.diHu).to.be.not.ok
    expect(huState.pengPengHu).to.be.true
    expect(scoreString()).to.equal('-6,6,0,0')
  })

  it('清一色 大对碰 自摸', async() => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([Enums.wanzi1]);
    player2.cards = cardsFromArray([
      Enums.tongzi2, Enums.tongzi2, Enums.tongzi2,
      Enums.tongzi3, Enums.tongzi3, Enums.tongzi3,
      Enums.tongzi4, Enums.tongzi4, Enums.tongzi4,
      Enums.tongzi5, Enums.tongzi5, Enums.tongzi5,
      Enums.tongzi1
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    changeCaishen(Enums.slotNoCard)

    table.cards = [
      Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1
    ]
    table.remainCards = table.cards.length

    player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
    player2.emitter.emit(Enums.hu, table.turn, Enums.tongzi1)

    await sleep(sleepDur);

    let state = last(packetsWithMessageName('game/game-over')).message.states[1]

    const huState = state.events.hu[0];

    expect(huState.diHu).to.be.not.ok
    expect(huState.pengPengHu).to.be.true
    expect(scoreString()).to.equal('-16,48,-16,-16')
  })

  it('清一色 大对碰 点炮', async() => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([Enums.tongzi1]);
    player2.cards = cardsFromArray([
      Enums.tongzi2, Enums.tongzi2, Enums.tongzi2,
      Enums.tongzi3, Enums.tongzi3, Enums.tongzi3,
      Enums.tongzi4, Enums.tongzi4, Enums.tongzi4,
      Enums.tongzi5, Enums.tongzi5, Enums.tongzi5,
      Enums.tongzi1
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    changeCaishen(Enums.slotNoCard)

    player1.emitter.emit(Enums.da, table.turn, Enums.tongzi1)
    player2.emitter.emit(Enums.hu, table.turn, Enums.tongzi1)

    await sleep(sleepDur);

    let state = last(packetsWithMessageName('game/game-over')).message.states[1]

    const huState = state.events.hu[0];

    expect(huState.diHu).to.be.not.ok
    expect(huState.pengPengHu).to.be.true
    expect(scoreString()).to.equal('-24,24,0,0')
  })

  it('清一色 自摸', async() => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([Enums.dong]);
    player2.cards = cardsFromArray([
      Enums.tongzi2, Enums.tongzi2, Enums.tongzi2,
      Enums.tongzi3, Enums.tongzi4, Enums.tongzi5,
      Enums.tongzi4, Enums.tongzi5, Enums.tongzi6,
      Enums.tongzi7, Enums.tongzi8, Enums.tongzi9,
      Enums.tongzi1
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    changeCaishen(Enums.slotNoCard)

    table.cards = [
      Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1
    ]
    table.remainCards = table.cards.length

    player1.emitter.emit(Enums.da, table.turn, Enums.dong)
    player2.emitter.emit(Enums.hu, table.turn, Enums.tongzi1)

    await sleep(sleepDur);
    let state = last(packetsWithMessageName('game/game-over')).message.states[1]

    const huState = state.events.hu[0];

    expect(huState.diHu).to.be.not.ok
    expect(huState.qingYiSe).to.be.true
    expect(scoreString()).to.equal('-8,24,-8,-8')
  })


  it('清一色 点炮', async() => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([Enums.tongzi1]);
    player2.cards = cardsFromArray([
      Enums.tongzi2, Enums.tongzi2, Enums.tongzi2,
      Enums.tongzi3, Enums.tongzi4, Enums.tongzi5,
      Enums.tongzi4, Enums.tongzi5, Enums.tongzi6,
      Enums.tongzi7, Enums.tongzi8, Enums.tongzi9,
      Enums.tongzi1
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    changeCaishen(Enums.slotNoCard)

    table.cards = [
      Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1
    ]
    table.remainCards = table.cards.length

    player1.emitter.emit(Enums.da, table.turn, Enums.tongzi1)
    player2.emitter.emit(Enums.hu, table.turn, Enums.tongzi1)

    await sleep(sleepDur);

    let state = last(packetsWithMessageName('game/game-over')).message.states[1]

    const huState = state.events.hu[0];

    expect(huState.diHu).to.be.not.true
    expect(huState.qingYiSe).to.be.true
    expect(scoreString()).to.equal('-12,12,0,0')
  })


  context('胡的玩家带杠', () => {

    it('点炮', async() => {
      table.fapai({})
      table.turn = 10

      player1.cards = cardsFromArray([Enums.tongzi1]);
      player2.cards = cardsFromArray([
        Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
        Enums.tongzi4, Enums.tongzi5, Enums.tongzi6,
        Enums.tongzi7, Enums.tongzi8, Enums.tongzi9,
        Enums.tongzi1
      ])
      player2.events.mingGang = [Enums.tongzi2]

      player3.cards = cardsFromArray()
      player4.cards = cardsFromArray()

      player1.requestAction(Enums.da, table.turn, Enums.tongzi1)
      player2.requestAction(Enums.hu, table.turn, Enums.tongzi1)

      await sleep(sleepDur);
      displayMessage()

      expect(scoreString()).to.equal('-1,1,0,0')
    })

    it('自摸', async() => {
      table.fapai({})
      table.turn = 10

      player1.cards = cardsFromArray([Enums.shuzi1]);
      player2.cards = cardsFromArray([
        Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
        Enums.tongzi4, Enums.tongzi5, Enums.tongzi6,
        Enums.tongzi7, Enums.tongzi8, Enums.tongzi9,
        Enums.tongzi1
      ])
      player2.events.anGang = [Enums.tongzi2]

      player3.cards = cardsFromArray()
      player4.cards = cardsFromArray()

      table.cards = [
        Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1, Enums.tongzi1
      ]
      table.remainCards = table.cards.length

      player1.requestAction(Enums.da, table.turn, Enums.shuzi1)
      player2.requestAction(Enums.hu, table.turn, Enums.tongzi1)

      await sleep(sleepDur);
      displayMessage()

      expect(scoreString()).to.equal('-4,12,-4,-4')
    })

    it('放杠 额外结算', async() => {

      table.fapai({})
      table.turn = 10

      player1.cards = cardsFromArray([Enums.tongzi1]);
      player2.cards = cardsFromArray([
        Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
        Enums.tongzi4, Enums.tongzi5, Enums.tongzi6,
        Enums.tongzi7, Enums.tongzi8, Enums.tongzi9,
        Enums.tongzi1
      ])
      player2.events.mingGang = [Enums.tongzi2]
      player2.gangFrom = [player3]

      player3.cards = cardsFromArray()
      player4.cards = cardsFromArray()

      player1.requestAction(Enums.da, table.turn, Enums.tongzi1)
      player2.requestAction(Enums.hu, table.turn, Enums.tongzi1)

      await sleep(sleepDur);
      displayMessage()

      expect(scoreString()).to.equal('-1,4,-3,0')
    })

    it('bug-1', () => {

      table.fapai({})
      table.turn = 10

      player1.cards = cardsFromArray([Enums.tongzi1]);
      player1.events.mingGang = [Enums.wanzi2]
      player1.gangFrom = [player2]


      player2.cards = cardsFromArray([
        Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
        Enums.tongzi4, Enums.tongzi5, Enums.tongzi6,
        Enums.tongzi7, Enums.tongzi8, Enums.tongzi9,
        Enums.tongzi1
      ])
      player2.events.mingGang = [Enums.wanzi2]
      player2.gangFrom = [player1]


      player3.cards = cardsFromArray()
      player3.events.buGang = [Enums.wanzi1]


      player4.cards = cardsFromArray()
      player4.events.buGang = [Enums.wanzi1]
      player4.takeLastCard = true


      player1.recordGameEvent(Enums.hu, {hu: true, fan: 1});
      player1.recordGameEvent(Enums.zimo, Enums.wanzi1);
      player1.emitter.emit('recordZiMo', {hu: true, fan: 1});

      player1.buyer = [player1, player1, player1]
      player3.buyer = [player1]


      table.gameOver()
      displayMessage()

      expect(scoreString()).to.equal('17,-11,-3,-3')
    })


    it('bug-2', () => {

      table.fapai({})
      table.turn = 10

      player1.cards = cardsFromArray([Enums.tongzi1]);


      player2.cards = cardsFromArray([
        Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
        Enums.tongzi4, Enums.tongzi5, Enums.tongzi6,
        Enums.tongzi7, Enums.tongzi8, Enums.tongzi9,
        Enums.tongzi1
      ])

      player3.cards = cardsFromArray()
      player3.events.mingGang = [Enums.wanzi1]
      player3.gangFrom = [player1]


      player4.cards = cardsFromArray()
      player4.events.mingGang = [Enums.wanzi1]
      player4.gangFrom = [player3]
      player4.takeLastCard = true


      player3.recordGameEvent(Enums.hu, {hu: true, fan: 1});
      player3.recordGameEvent(Enums.zimo, Enums.wanzi1);
      player3.emitter.emit('recordZiMo', {hu: true, fan: 1});

      player1.buyer = [player1]
      player2.buyer = [player1]
      player3.buyer = [player1]
      player4.buyer = [player1]


      table.gameOver()
      displayMessage()

      expect(scoreString()).to.equal('-10,-4,12,2')
    })


    it('bug-3 (table中niaos存储内容修改)', () => {

      table.fapai({})
      table.turn = 10

      player1.cards = cardsFromArray([
        Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
        Enums.tongzi4, Enums.tongzi5, Enums.tongzi6,
        Enums.tongzi7, Enums.tongzi8, Enums.tongzi9,
        Enums.tongzi1,
        Enums.shuzi3
      ]);
      player1.events.mingGang = [Enums.wanzi1]
      player1.gangFrom = [player2]


      player2.cards = cardsFromArray([Enums.tongzi1])

      player3.cards = cardsFromArray()
      player4.cards = cardsFromArray()
      table.rule.ro.feiNiao = 3
      table.cards.push(...[Enums.wanzi1,Enums.wanzi1,Enums.wanzi1,Enums.wanzi1])
      table.remainCards = table.cards.length

      player1.requestAction(Enums.da,table.turn ,Enums.shuzi3)
      player2.requestAction(Enums.da,table.turn ,Enums.tongzi1)
      player1.requestAction(Enums.hu,table.turn ,Enums.tongzi1)

      expect(table.niaos).to.have.properties([{testid1: [ 1, 1, 1 ]}])
      expect(scoreString()).to.equal('16,-16,0,0')
    })


  })

});
