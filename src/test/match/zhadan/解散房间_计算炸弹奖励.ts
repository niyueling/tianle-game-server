import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/zhadan/enums'
import NormalTable from "../../../match/zhadan/normalTable";
import {findFullMatchedPattern} from "../../../match/zhadan/patterns";
import PlayerState from "../../../match/zhadan/player_state";
import {Team} from "../../../match/zhadan/table"
import {dissolveScoreString} from '../mockwebsocket'
import setupMatch from './setupMatch'

chai.use(chaiProperties)
const {expect} = chai

describe('牌局解散', () => {

  let room, table: NormalTable, allRule
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState
  let player4: PlayerState
  const playerCount = 4


  beforeEach(async () => {
    const match = setupMatch(playerCount, {jieSanSuanFen: true})
    room = match.room
    table = match.table as NormalTable
    player1 = table.players[0]
    player2 = table.players[1]
    player3 = table.players[2]
    player4 = table.players[3]

    allRule = match.allRule

    table.start()
    table.setFirstDa(0);
    table.mode = 'teamwork'
    player1.team = player2.team = Team.HomeTeam
    player3.team = player4.team = Team.AwayTeam

    table.players.forEach(p => {
      p.unusedJokers = 0
    })

    table.players.forEach(p => p.cards = [])
  })


  it('计算未使用的炸弹分 4个4', async () => {
    player1.cards = [Enums.c4, Enums.c4, Enums.c4, Enums.c4]
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('0,0,0,0')
  })
  it('计算未使用的炸弹分 4个2，相当于5星', async () => {
    player1.cards = [Enums.c2, Enums.c2, Enums.c2, Enums.c2]
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('3,-1,-1,-1')
  })
  it('计算未使用的炸弹分 5个4', async () => {
    player1.cards = [Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4]
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('3,-1,-1,-1')
  })
  it('计算未使用的炸弹分 6个4', async () => {
    player1.cards = [Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4]
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('6,-2,-2,-2')
  })
  it('计算未使用的炸弹分 7个5', async () => {
    player1.cards = [Enums.c5, Enums.c5, Enums.c5, Enums.c5, Enums.c5, Enums.c5, Enums.c5]
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('12,-4,-4,-4')
  })
  it('计算未使用的炸弹分 8个5', async () => {
    player1.cards = [Enums.c5, Enums.c5, Enums.c5, Enums.c5, Enums.c5, Enums.c5, Enums.c5, Enums.c5]
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('24,-8,-8,-8')
  })

  it('计算未使用的炸弹分 8个5 加1个王', async () => {
    player1.cards = [Enums.c5,Enums.c5, Enums.c5, Enums.c5, Enums.c5, Enums.c5, Enums.c5, Enums.c5, Enums.j1]
    player1.unusedJokers = 1
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('48,-16,-16,-16')
  })

  it('计算未使用的炸弹分 - 6个4 带一个王', async () => {
    player1.cards = [Enums.j2, Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4]
    player1.unusedJokers = 1
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('12,-4,-4,-4')
  })

  it('计算未使用的炸弹分 - 6个4+带4个王', async () => {
    player1.cards = [Enums.j1, Enums.j1, Enums.j2, Enums.j2,
      Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4]
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('96,-32,-32,-32')
  })

  it('计算未使用的炸弹分 - 7个4+带4个王', async () => {
    player1.cards = [Enums.j1, Enums.j1, Enums.j2, Enums.j2,
      Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4]
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('192,-64,-64,-64')
  })

  it('计算未使用的炸弹分 - 8个2+带4个王，2特殊，8个2相当于9星', async () => {
    player1.cards = [Enums.j1, Enums.j1, Enums.j2, Enums.j2,
      Enums.c2, Enums.c2, Enums.c2, Enums.c2, Enums.c2, Enums.c2, Enums.c2, Enums.c2]
    player1.unusedJokers = 4
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('768,-256,-256,-256')
  })

  it('计算未使用的炸弹分 - 8个2+带6个王，256封顶', async () => {
    player1.cards = [Enums.j1, Enums.j1, Enums.j1, Enums.j2, Enums.j2, Enums.j2,
      Enums.c2, Enums.c2, Enums.c2, Enums.c2, Enums.c2, Enums.c2, Enums.c2, Enums.c2]
    player1.unusedJokers = 6
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('768,-256,-256,-256')
  })

  it('计算未使用的炸弹分 - 4个k+带6个王，按照6王算，64，勾选了6王', async () => {
    player1.cards = [Enums.j1, Enums.j1, Enums.j1, Enums.j2, Enums.j2, Enums.j2,
      Enums.c13, Enums.c13, Enums.c13, Enums.c13]
    player1.unusedJokers = 6
    //设置6王炸弹
    room.rule.ro.maxJokerBomb = 64;
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('192,-64,-64,-64')
  })

  it('计算未使用的炸弹分 - 4个k+带6个王，按照6王算，64，勾选5王的情况', async () => {
    player1.cards = [Enums.j1, Enums.j1, Enums.j1, Enums.j2, Enums.j2, Enums.j2,
      Enums.c13, Enums.c13, Enums.c13, Enums.c13]
    player1.unusedJokers = 6
    //设置6王炸弹
    room.rule.ro.maxJokerBomb = 32;
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('192,-32,-32,-32')
  })

  it('计算未使用的炸弹分 - 4个k+带6个王，按照6王算，64，没有勾选6王，或者5王的情况', async () => {
    player1.cards = [Enums.j1, Enums.j1, Enums.j1, Enums.j2, Enums.j2, Enums.j2,
      Enums.c13, Enums.c13, Enums.c13, Enums.c13]
    player1.unusedJokers = 6
    //设置6王炸弹
    room.rule.ro.maxJokerBomb = 16;
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('192,-32,-32,-64')
  })

  it('计算未使用的炸弹分 - 4个k+带5个王，按照5王算，32', async () => {
    player1.cards = [Enums.j1, Enums.j1, Enums.j1, Enums.j2, Enums.j2, Enums.j2,
      Enums.c13, Enums.c13, Enums.c13, Enums.c13]
    player1.unusedJokers = 6
    //设置五王炸弹
    room.rule.ro.maxJokerBomb = 32;
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('96,-32,-32,-32')
  })

  it('计算未使用的炸弹分 - 6个k+带6个王，按照12星算，256', async () => {
    player1.cards = [Enums.j1, Enums.j1, Enums.j1, Enums.j2, Enums.j2, Enums.j2,
      Enums.c13, Enums.c13, Enums.c13, Enums.c13,Enums.c13, Enums.c13, Enums.c13, Enums.c13]
    player1.unusedJokers = 6
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('768,-256,-256,-256')
  })

  it('计算未使用的炸弹分 - 8个2+1王，2特殊，8个2相当于9星', async () => {
    player1.cards = [Enums.c2, Enums.c2, Enums.c2, Enums.c2,
      Enums.c2, Enums.c2, Enums.c2, Enums.c2, Enums.j1]
    player1.unusedJokers = 1
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('96,-32,-32,-32')
  })

  it('计算未使用的炸弹分 - 5个2+4王，2特殊，5个2相当于6星', async() => {
    player1.cards = [ Enums.j1, Enums.j1, Enums.j2, Enums.j2,
      Enums.c2, Enums.c2, Enums.c2, Enums.c2, Enums.c2]
    player1.unusedJokers = 4
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('96,-32,-32,-32')
  })

  it('计算未使用的炸弹分 - 5个王+4个2,没有勾选五王炸弹的规则', async() => {
    player1.cards = [ Enums.j1, Enums.j1, Enums.j2, Enums.j2,
      Enums.j1, Enums.c2, Enums.c2, Enums.c2, Enums.c2]
    player1.unusedJokers = 5
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('51,-17,-17,-17')
  })

  it('计算未使用的炸弹分 - 3个王+6个2', async() => {
    player1.cards = [ Enums.j1, Enums.j1, Enums.c2, Enums.c2,
      Enums.j1, Enums.c2, Enums.c2, Enums.c2, Enums.c2]
    player1.unusedJokers = 3
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('96,-32,-32,-32')
  })

  it('计算未使用的炸弹分(3王5个1 ->3王5个2) - 5个1+5个2+3王,按大的算', async () => {
    player1.cards = [ Enums.j1, Enums.j2, Enums.j2,
      Enums.c1, Enums.c1, Enums.c1, Enums.c1, Enums.c1,
      Enums.c2, Enums.c2, Enums.c2, Enums.c2, Enums.c2]
    player1.unusedJokers = 3
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('51,-17,-17,-17')
  })
  it('计算未使用的炸弹分(5王5)', async () => {
    player1.cards = [ Enums.j1, Enums.j2, Enums.j2, Enums.j1, Enums.j2]
    player1.unusedJokers = 5
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('48,-16,-16,-16')
  })

  it('计算已使用的炸弹分', async () => {
    player1.usedBombs = [findFullMatchedPattern([Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4])]
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('6,-2,-2,-2')
  })

  it('计算已使用的炸弹分(5王16)', async () => {
    player1.usedBombs = [findFullMatchedPattern([ Enums.j1, Enums.j1, Enums.j1, Enums.j2, Enums.j2])]
    room.rule.ro.maxJokerBomb = 16;
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('48,-16,-16,-16')
  })

  it('计算已使用的炸弹分(5王32)', async () => {
    player1.usedBombs = [findFullMatchedPattern([ Enums.j1, Enums.j1, Enums.j1, Enums.j2, Enums.j2])]
    room.rule.ro.maxJokerBomb = 32;
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('96,-32,-32,-32')
  })
  it('计算已使用的炸弹分(6王64)', async () => {
    player1.usedBombs = [findFullMatchedPattern([ Enums.j1, Enums.j1, Enums.j1, Enums.j2, Enums.j2, Enums.j2])]
    room.rule.ro.maxJokerBomb = 64;
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('192,-64,-64,-64')
  })
  it('计算已使用的炸弹分(6王64 加4个k，普通的10星)', async () => {
    player1.usedBombs = [findFullMatchedPattern([ Enums.j1, Enums.j1, Enums.j1, Enums.j2, Enums.j2, Enums.j2, Enums.h13, Enums.h13, Enums.c13, Enums.c13])]
    room.rule.ro.maxJokerBomb = 64;
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('96,-32,-32,-32')
  })

  it('计算已使用的炸弹分(5王32 加4个k，普通的9星)', async () => {
    player1.usedBombs = [findFullMatchedPattern([ Enums.j1, Enums.j1, Enums.j1, Enums.j2, Enums.j2, Enums.h13, Enums.h13, Enums.c13, Enums.c13])]
    room.rule.ro.maxJokerBomb = 32;
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('48,-16,-16,-16')
  })

  it('独打烧机需要算分', async () => {

    table.mode = 'solo'

    player1.cards = [Enums.j1]
    player1.unusedJokers = 1
    player2.cards = []
    player3.cards = []
    player4.cards = []
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('-3,1,1,1')
  })


  it('先烧鸡 再解散', async () => {
    table.mode = 'solo'

    player1.cards = [Enums.j1, Enums.j2]
    player1.unusedJokers = 2
    player2.cards = [Enums.c3]
    player3.cards = [Enums.c3]
    player4.cards = [Enums.c3]

    table.onPlayerDa(player1, {cards: [Enums.j1]})
    await room.forceDissolve()
    expect(dissolveScoreString()).to.equal('-6,2,2,2')

  })

})
