import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {default as Table} from "../../../match/paodekuai/table"
import setupMatch from '../setupMatch'
import {displayMessage, packetsTo, packetsWithMessageName, scoreString} from '../mockwebsocket'
import PlayerState from "../../../match/paodekuai/player_state";
import Enums from '../../../match/paodekuai/enums'
import {findMatchedPatternByPattern} from "../../../match/paodekuai/patterns";
import Card from "../../../match/paodekuai/card";

chai.use(chaiProperties)
const {expect} = chai

function expectCardGroupsEqual(grp1: Card[][], grp2: Card[][]) {

  const grp1Str = grp1.map(cards => `[${cards.map(c => c.value).join()}]`).join()
  const grp2Str = grp2.map(cards => `[${cards.map(c => c.value).join()}]`).join()

  expect(grp2Str).to.eq(grp1Str)
}

describe('牌局提示逻辑', () => {

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

  it('提示 单牌 使用AAA炸弹', () => {
    const handCards = [
      Enums.c4, Enums.c1, Enums.d1, Enums.s1,
    ]
    const prompts = findMatchedPatternByPattern(
      {name: 'single', score: 10, cards: [Enums.c10]}, handCards)

    expectCardGroupsEqual([
      [Enums.c1], [Enums.c1, Enums.d1, Enums.s1]
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

  it('提示 王炸弹', () => {
    const handCards = [
      Enums.j1, Enums.j1, Enums.j2, Enums.j2,
    ]
    const prompts = findMatchedPatternByPattern(
      {name: 'bomb', score: 403, cards: [Enums.c3, Enums.d3, Enums.s3, Enums.c3]}, handCards)

    expectCardGroupsEqual([
      [Enums.j1, Enums.j1, Enums.j2, Enums.j2]
    ], prompts)
  })

  it('提示 普通炸弹', () => {
    const handCards = [
      Enums.c3, Enums.d3, Enums.s3, Enums.c3,
      Enums.c4, Enums.d4, Enums.s4, Enums.c4,
      Enums.c6, Enums.d6, Enums.s6, Enums.c6, Enums.c6,
    ]
    const prompts = findMatchedPatternByPattern(
      {name: 'bomb', score: 403, cards: [Enums.c3, Enums.d3, Enums.s3, Enums.c3]}, handCards)

    expectCardGroupsEqual([
      [Enums.c4, Enums.d4, Enums.s4, Enums.c4],
      [Enums.c6, Enums.d6, Enums.s6, Enums.c6, Enums.c6]
    ], prompts)
  })

  it('提示 AAA炸弹', () => {
    const handCards = [
      Enums.c3, Enums.d3, Enums.s3, Enums.c3,
      Enums.c4, Enums.d4, Enums.s4, Enums.c4,
      Enums.c1, Enums.d1, Enums.s1
    ]
    const prompts = findMatchedPatternByPattern(
      {name: 'bomb', score: 403, cards: [Enums.c3, Enums.d3, Enums.s3, Enums.c3]}, handCards)

    expectCardGroupsEqual([
      [Enums.c4, Enums.d4, Enums.s4, Enums.c4],
      [Enums.c1, Enums.d1, Enums.s1]
    ], prompts)
  })

  it('提示 对子', () => {
    const handCards = [
      Enums.c3, Enums.d3,
      Enums.c4, Enums.d4, Enums.d4,
      Enums.c6, Enums.d6,
    ]
    const prompts = findMatchedPatternByPattern(
      {name: 'double', score: 3, cards: [Enums.c3, Enums.d3]}, handCards)

    expectCardGroupsEqual([
      [Enums.c6, Enums.d6],
      [Enums.c4, Enums.d4],
    ], prompts)
  })

  it('提示 三张 无提示结果', () => {
    const prompts = findMatchedPatternByPattern(
      {name: 'triple', score: 4, cards: [Enums.c4, Enums.d4, Enums.s4]}, [])

    expectCardGroupsEqual([], prompts)
  })

  it('提示 三张带二', () => {
    const handCards = [
      Enums.c3, Enums.d3, Enums.c3,
      Enums.c5, Enums.d5, Enums.d5,
      Enums.c6, Enums.d6,
    ]
    const prompts = findMatchedPatternByPattern(
      {name: 'triple++', score: 4, cards: [Enums.c4, Enums.d4, Enums.s4, Enums.c3, Enums.cK]}, handCards)

    expectCardGroupsEqual([
      [Enums.c5, Enums.d5, Enums.d5, Enums.c6, Enums.c6],
    ], prompts)
  })

  it('提示 顺子', () => {
    const handCards = [
      Enums.c4, Enums.d5, Enums.c6,
      Enums.c7, Enums.d8
    ]
    const prompts = findMatchedPatternByPattern(
      {
        name: 'straight_5', score: 3, cards:
          [Enums.c3, Enums.d4, Enums.s5, Enums.c6, Enums.c7]
      }, handCards)

    expectCardGroupsEqual([
      [Enums.c4, Enums.d5, Enums.c6, Enums.c7, Enums.d8]
    ], prompts)
  })

  it('提示 顺子 不能带 2', () => {
    const handCards = [
      Enums.c10, Enums.cJ, Enums.cQ,
      Enums.cK, Enums.d1, Enums.d2
    ]
    const prompts = findMatchedPatternByPattern(
      {
        name: 'straight_5', score: 3, cards:
          [Enums.c3, Enums.d4, Enums.s5, Enums.c6, Enums.c7]
      }, handCards)

    expectCardGroupsEqual([
      [Enums.c10, Enums.cJ, Enums.cQ, Enums.cK, Enums.d1]
    ], prompts)
  })


  it('提示 顺子断开', () => {
    const handCards = [
      Enums.c3, Enums.d5, Enums.c6,
      Enums.c7, Enums.d8, Enums.d9
    ]
    const prompts = findMatchedPatternByPattern(
      {
        name: 'straight_5', score: 3, cards:
          [Enums.c3, Enums.d4, Enums.s5, Enums.c6, Enums.c7]
      }, handCards)

    expectCardGroupsEqual([
      [Enums.c5, Enums.d6, Enums.c7, Enums.c8, Enums.d9]
    ], prompts)
  })

  it('提示不提示小顺子', () => {
    const handCards = [
      Enums.c4, Enums.d5, Enums.c6,
      Enums.c7, Enums.d3
    ]
    const prompts = findMatchedPatternByPattern(
      {
        name: 'straight_5', score: 3, cards:
          [Enums.c3, Enums.d4, Enums.s5, Enums.c6, Enums.c7]
      }, handCards)

    expectCardGroupsEqual([], prompts)
  })

  it('提示 连对', () => {
    const handCards = [
      Enums.c4, Enums.c4,
      Enums.c5, Enums.c5,
      Enums.c6, Enums.c6,
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
      Enums.c6, Enums.c6,
      Enums.c7, Enums.c7,
      Enums.d8, Enums.d8

    ]], prompts)
  })

  it('提示 连对 不能带上 2', () => {
    const handCards = [
      Enums.cJ, Enums.cJ,
      Enums.cQ, Enums.cQ,
      Enums.cK, Enums.cK,
      Enums.cA, Enums.cA,
      Enums.d2, Enums.d2
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

    expectCardGroupsEqual([], prompts)
  })


  it('提示 三连对', () => {
    const handCards = [
      Enums.d4, Enums.d4, Enums.s4,
      Enums.s5, Enums.s5, Enums.c5,
      Enums.c6, Enums.c6, Enums.s6,
      Enums.c7, Enums.c7, Enums.s7,
      Enums.d8, Enums.d8, Enums.d8
    ]
    const prompts = findMatchedPatternByPattern(
      {
        name: 'triples_5', score: 3, cards:
          [
            Enums.c3, Enums.c3, Enums.s3,
            Enums.d4, Enums.d4, Enums.s4,
            Enums.s5, Enums.s5, Enums.c5,
            Enums.c6, Enums.c6, Enums.s6,
            Enums.c7, Enums.c7, Enums.s7
          ]
      }, handCards)

    expectCardGroupsEqual([[
      Enums.d4, Enums.d4, Enums.s4,
      Enums.s5, Enums.s5, Enums.c5,
      Enums.c6, Enums.c6, Enums.s6,
      Enums.c7, Enums.c7, Enums.s7,
      Enums.d8, Enums.d8, Enums.d8
    ]], prompts)
  })

  it('提示 三连对 不能带2', () => {
    const handCards = [
      Enums.c10, Enums.c10, Enums.c10,
      Enums.cJ, Enums.cJ, Enums.cJ,
      Enums.cQ, Enums.cQ, Enums.cQ,
      Enums.cK, Enums.cK, Enums.cK,
      Enums.c1, Enums.c1, Enums.s1,
      Enums.d2, Enums.d2, Enums.d2
    ]
    const prompts = findMatchedPatternByPattern(
      {
        name: 'triples_5', score: 3, cards:
          [
            Enums.c3, Enums.c3, Enums.s3,
            Enums.d4, Enums.d4, Enums.s4,
            Enums.s5, Enums.s5, Enums.c5,
            Enums.c6, Enums.c6, Enums.s6,
            Enums.c7, Enums.c7, Enums.s7
          ]
      }, handCards)

    expectCardGroupsEqual([[
      Enums.c10, Enums.c10, Enums.c10,
      Enums.cJ, Enums.cJ, Enums.cJ,
      Enums.cQ, Enums.cQ, Enums.cQ,
      Enums.cK, Enums.cK, Enums.cK,
      Enums.c1, Enums.c1, Enums.s1,
    ], [Enums.c1, Enums.c1, Enums.s1]], prompts)
  })


  it('提示 飞机', () => {
    const handCards = [
      Enums.d4, Enums.d4, Enums.s4,
      Enums.s5, Enums.s5, Enums.c5,
      Enums.c6, Enums.c6, Enums.s6,
      Enums.c7, Enums.c7,
      Enums.d8, Enums.d8,
      Enums.s9, Enums.d9
    ]
    const prompts = findMatchedPatternByPattern(
      {
        name: 'triples++_3', score: 3, cards:
          [
            Enums.c3, Enums.c3, Enums.s3,
            Enums.d4, Enums.d4, Enums.s4,
            Enums.s5, Enums.s5, Enums.c5,
            Enums.c6, Enums.c6,
            Enums.c7, Enums.c7,
            Enums.c8, Enums.c8,
          ]
      }, handCards)

    expectCardGroupsEqual([[
      Enums.d4, Enums.d4, Enums.s4,
      Enums.s5, Enums.s5, Enums.c5,
      Enums.c6, Enums.c6, Enums.s6,
      Enums.c7, Enums.c7,
      Enums.d8, Enums.d8,
      Enums.s9, Enums.d9
    ]], prompts)
  })

  it('提示 多个飞机', () => {
    const handCards = [
      Enums.d4, Enums.d4, Enums.s4,
      Enums.s5, Enums.s5, Enums.c5,
      Enums.c6, Enums.c6, Enums.s6,
      Enums.c7, Enums.c7, Enums.s7,
      Enums.c8, Enums.c8, Enums.s8,
      Enums.c7, Enums.c7,
      Enums.d8, Enums.d8,
      Enums.s9, Enums.d9
    ]
    const prompts = findMatchedPatternByPattern(
      {
        name: 'triples++_3', score: 3, cards:
          [
            Enums.c3, Enums.c3, Enums.s3,
            Enums.d4, Enums.d4, Enums.s4,
            Enums.s5, Enums.s5, Enums.c5,
            Enums.c6, Enums.c6,
            Enums.c7, Enums.c7,
            Enums.c8, Enums.c8,
          ]
      }, handCards)

    expectCardGroupsEqual([
      [
        Enums.d4, Enums.d4, Enums.s4,
        Enums.s5, Enums.s5, Enums.c5,
        Enums.c6, Enums.c6, Enums.s6,
        Enums.s9, Enums.d9,
        Enums.c7, Enums.c7,
        Enums.c7, Enums.c7,
      ],
      [
        Enums.s5, Enums.s5, Enums.c5,
        Enums.c6, Enums.c6, Enums.s6,
        Enums.d7, Enums.d7, Enums.s7,
        Enums.c7, Enums.c7,
        Enums.s9, Enums.d9,
        Enums.c4, Enums.c4,
      ],
      [
        Enums.c6, Enums.c6, Enums.s6,
        Enums.d7, Enums.d7, Enums.s7,
        Enums.s8, Enums.s8, Enums.c8,
        Enums.c7, Enums.c7,
        Enums.s8, Enums.d8,
        Enums.c9, Enums.c9,
      ],
      [Enums.c7, Enums.c7, Enums.s7, Enums.c7, Enums.c7],
      [Enums.c8, Enums.c8, Enums.s8, Enums.c8, Enums.c8],
    ], prompts)
  })

  it('提示 多个飞机不完整的飞机 ', () => {
    const handCards = [
      Enums.d4, Enums.d4, Enums.s4,
      Enums.s5, Enums.s5, Enums.c5,
      Enums.s6, Enums.s6, Enums.c6,
      Enums.d8, Enums.d8,
      Enums.s9, Enums.d9,
      Enums.s10, Enums.d10,
      Enums.c10,
    ]
    const prompts = findMatchedPatternByPattern(
      {
        name: "triples++_3", score: 3,
        cards:
          [
            Enums.c3, Enums.c3, Enums.s3,
            Enums.d4, Enums.d4, Enums.s4,
            Enums.d5, Enums.d5, Enums.s5
          ]
      }, handCards)

    expectCardGroupsEqual([[
      Enums.d4, Enums.d4, Enums.s4,
      Enums.s5, Enums.s5, Enums.c5,
      Enums.s6, Enums.s6, Enums.c6,
      Enums.d8, Enums.d8,
      Enums.s9, Enums.d9,
      Enums.s10, Enums.d10,
    ]], prompts)
  })


})
