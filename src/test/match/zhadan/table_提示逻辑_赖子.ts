import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Card from "../../../match/zhadan/card";
import Enums from '../../../match/zhadan/enums'
import {findMatchedPatternByPattern} from "../../../match/zhadan/patterns";
import PlayerState from "../../../match/zhadan/player_state";
import {default as Table} from "../../../match/zhadan/table"
import setupMatch from './setupMatch'

chai.use(chaiProperties)
const {expect} = chai

function expectCardGroupsEqual(grp1: Card[][], grp2: Card[][]) {

  const grp1Str = grp1.map(cards => `[${cards.map(c => c.value).join()}]`).join()
  const grp2Str = grp2.map(cards => `[${cards.map(c => c.value).join()}]`).join()

  expect(grp2Str).to.eq(grp1Str)
}

describe.skip('牌局提示逻辑 有赖子', () => {

  let room, table: Table, allRule
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState
  let player4: PlayerState
  const playerCount = 4

  beforeEach(async () => {
    const match = setupMatch(playerCount, {})
    room = match.room
    table = match.table
    player1 = table.players[0]
    player2 = table.players[1]
    player3 = table.players[2]
    player4 = table.players[3]

    allRule = match.allRule
  })


  it('提示 单牌', () => {
    const handCards = [
      Enums.c3,
      Enums.c4, Enums.c4,
      Enums.c5,
      Enums.c7,
    ]

    const prompts = findMatchedPatternByPattern({name: 'single', score: 3, cards: [Enums.c3]}, handCards)

    expectCardGroupsEqual([
      [Enums.c5],
      [Enums.c7],
      [Enums.c4]
    ], prompts)
  })

  it('提示 单牌 使用炸弹', () => {
    const handCards = [
      Enums.c4, Enums.s4, Enums.h4, Enums.d4,
    ]
    const prompts = findMatchedPatternByPattern(
      {name: 'single', score: 10, cards: [Enums.c10]}, handCards)

    expectCardGroupsEqual([
      [Enums.c4, Enums.s4, Enums.h4, Enums.d4]
    ], prompts)
  })

  it('提示 单牌 使用王炸', () => {
    const handCards = [
      Enums.j1, Enums.j1, Enums.j2, Enums.j2,
    ]
    const prompts = findMatchedPatternByPattern(
      {name: 'single', score: 10, cards: [Enums.c10]}, handCards)

    expectCardGroupsEqual([
      [Enums.j1], [Enums.j2],
      [Enums.j1, Enums.j1, Enums.j2, Enums.j2]
    ], prompts)
  })

  it('提示 普通炸弹', () => {
    const handCards = [
      Enums.c3, Enums.d3, Enums.s3, Enums.c3,
      Enums.c4, Enums.d4, Enums.s4, Enums.c4,
      Enums.c6, Enums.d6, Enums.s6, Enums.c6, Enums.c6,
      Enums.j1
    ]
    const prompts = findMatchedPatternByPattern(
      {name: 'bomb', score: 403, cards: [Enums.c3, Enums.d3, Enums.s3, Enums.c3]}, handCards)

    expectCardGroupsEqual([
      [Enums.c4, Enums.d4, Enums.s4, Enums.c4],
      [Enums.c3, Enums.d3, Enums.s3, Enums.c3, Enums.j1],
      [Enums.c4, Enums.d4, Enums.s4, Enums.c4, Enums.j1],
      [Enums.c6, Enums.d6, Enums.s6, Enums.c6, Enums.c6],
      [Enums.c6, Enums.d6, Enums.s6, Enums.c6, Enums.c6, Enums.j1],
    ], prompts)
  })

  it('提示 普通炸弹', () => {
    const handCards = [
      Enums.c3, Enums.d3, Enums.s3, Enums.c3,
      Enums.c4, Enums.d4, Enums.s4, Enums.c4,
      Enums.c6, Enums.d6, Enums.s6, Enums.c6, Enums.c6,
      Enums.j1
    ]
    const prompts = findMatchedPatternByPattern(
      {name: 'bomb', score: 403, cards: [Enums.c3, Enums.d3, Enums.s3, Enums.c3]}, handCards)

    expectCardGroupsEqual([
      [Enums.c4, Enums.d4, Enums.s4, Enums.c4],
      [Enums.c3, Enums.d3, Enums.s3, Enums.c3, Enums.j1],
      [Enums.c4, Enums.d4, Enums.s4, Enums.c4, Enums.j1],
      [Enums.c6, Enums.d6, Enums.s6, Enums.c6, Enums.c6],
      [Enums.c6, Enums.d6, Enums.s6, Enums.c6, Enums.c6, Enums.j1],

    ], prompts)
  })


  it('提示 对子', () => {
    const handCards = [
      Enums.c4, Enums.j1
    ]
    const prompts = findMatchedPatternByPattern(
      {name: 'double', score: 3, cards: [Enums.c3, Enums.d3]}, handCards)

    expectCardGroupsEqual([
      [Enums.c4, Enums.j1],
    ], prompts)
  })

  it('提示 三张 无选项', () => {
    const prompts = findMatchedPatternByPattern(
      {name: 'triple', score: 4, cards: [Enums.c4, Enums.d4, Enums.s4]}, [])

    expectCardGroupsEqual([], prompts)
  })

  it('提示 三张带二', () => {
    const handCards = [
      Enums.c3, Enums.d3, Enums.c3,
      Enums.c5, Enums.d5, Enums.j1,
      Enums.c6, Enums.d6,
    ]
    const prompts = findMatchedPatternByPattern(
      {name: 'triple++', score: 4, cards: [Enums.c4, Enums.d4, Enums.s4, Enums.c3, Enums.cK]}, handCards)

    expectCardGroupsEqual([
      [Enums.c5, Enums.d5, Enums.j1, Enums.c6, Enums.c6],
    ], prompts)
  })

  it('提示 顺子', () => {
    const handCards = [
      Enums.c4, Enums.j1, Enums.c6,
      Enums.c7, Enums.d8
    ]
    const prompts = findMatchedPatternByPattern(
      {
        name: 'straight_5', score: 3, cards:
        [Enums.c3, Enums.d4, Enums.s5, Enums.c6, Enums.c7]
      }, handCards)

    expectCardGroupsEqual([
      [Enums.c4, Enums.j1, Enums.c6, Enums.c7, Enums.d8]
    ], prompts)
  })

  it('提示 顺子断开', () => {
    const handCards = [
      Enums.c3, Enums.d5, Enums.c6,
      Enums.c7, Enums.j1, Enums.d9
    ]
    const prompts = findMatchedPatternByPattern(
      {
        name: 'straight_5', score: 3, cards:
        [Enums.c3, Enums.d4, Enums.s5, Enums.c6, Enums.c7]
      }, handCards)

    expectCardGroupsEqual([
      [Enums.c5, Enums.d6, Enums.c7, Enums.j1, Enums.d9]
    ], prompts)
  })

  it('提示 连对', () => {
    const handCards = [
      Enums.c4, Enums.c4,
      Enums.c5, Enums.c5,
      Enums.j1, Enums.c6,
      Enums.c7, Enums.c7,
      Enums.d8, Enums.d8
    ]
    const prompts = findMatchedPatternByPattern(
      {
        name: 'doubles_5', score: 3, cards:
        [
          Enums.c3, Enums.c3,
          Enums.d4, Enums.d4,
          Enums.s5, Enums.s5,
          Enums.c6, Enums.c6,
          Enums.c7, Enums.c7
        ]
      }, handCards)

    expectCardGroupsEqual([[

      Enums.c4, Enums.c4,
      Enums.c5, Enums.c5,
      Enums.c6, Enums.j1,
      Enums.c7, Enums.c7,
      Enums.d8, Enums.d8

    ]], prompts)
  })

  it('提示 飞机', () => {
    const handCards = [
      Enums.d4, Enums.d4, Enums.s4,
      Enums.s5, Enums.s5, Enums.j1,
      Enums.c6, Enums.c6, Enums.s6,
      Enums.c7, Enums.c7,
      Enums.d8, Enums.d8,
      Enums.s9, Enums.d9
    ]
    const prompts = findMatchedPatternByPattern(
      {
        name: 'triples++_5', score: 3, cards:
        [
          Enums.c3, Enums.c3, Enums.s3,
          Enums.d4, Enums.d4, Enums.s4,
          Enums.s5, Enums.s5, Enums.j1,
          Enums.c6, Enums.c6,
          Enums.c7, Enums.c7,
          Enums.c8, Enums.c8,
        ]
      }, handCards)

    expectCardGroupsEqual([[
      Enums.d4, Enums.d4, Enums.s4,
      Enums.s5, Enums.s5, Enums.j1,
      Enums.c6, Enums.c6, Enums.s6,
      Enums.c7, Enums.c7,
      Enums.d8, Enums.d8,
      Enums.s9, Enums.d9
    ]], prompts)
  })

  it('提示 三带二 当最后3张', () => {
    const handCards = [
      Enums.d4, Enums.d4, Enums.s4, Enums.s5
    ]
    const prompts = findMatchedPatternByPattern(
      {
        name: 'triple++',
        score: 3,
        cards: []
      }, handCards)

    expectCardGroupsEqual([[
      Enums.d4, Enums.d4, Enums.s4, Enums.s5
    ]], prompts)
  })

})
