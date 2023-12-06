import * as chai from 'chai'
import {last} from 'lodash'
import Enums from '../../../match/shisanshui/enums'
import {displayMessage, packets} from '../mockwebsocket'
import setupMatch from './setupMatch'
import {splitCommit} from "./utils";


const expect = chai.expect

chai.use(require('chai-properties'))

describe('经典 13张', () => {
  let room, table, players, allRule


  const messageFilter = name => packets.filter(p => p.name === name).map(p => p.message)


  const allPlayerSplitCommit = function () {
    players.forEach(p => {
      splitCommit(p, table)
    })
  }

  context('4人局', () => {

    beforeEach(async () => {
      const match = setupMatch(4, {wanFa: 'qiPai'})
      room = match.room
      table = match.table
      players = table.players
      allRule = match.allRule

      // await RoomRecord.remove({}).exec()
    })

    afterEach(async () => {
      // await PlayerModel.remove({})
    })


    it('少打枪', () => {
      table.start()
      table.rule.ro.maPaiArray = [5]

      players[0].cards = [Enums.s12, Enums.s5, Enums.c5,
        Enums.h10, Enums.c10, Enums.h9, Enums.c8, Enums.c7,
        Enums.h4, Enums.c4, Enums.s3, Enums.d3, Enums.d2
      ]
      players[1].cards = [Enums.c13, Enums.c12, Enums.s9,
        Enums.s1, Enums.d1, Enums.s8, Enums.s7, Enums.h3,
        Enums.s11, Enums.h11, Enums.d11, Enums.h6, Enums.d6
      ]
      players[2].cards = [Enums.h8, Enums.d8, Enums.s6,
        Enums.h7, Enums.d7, Enums.s4, Enums.s2, Enums.h2,
        Enums.h1, Enums.h13, Enums.d12, Enums.c11, Enums.d10
      ]
      players[3].cards = [Enums.h12, Enums.h5, Enums.d5,
        Enums.s13, Enums.d13, Enums.s10, Enums.d9, Enums.d4,
        Enums.c1, Enums.c9, Enums.c6, Enums.c3, Enums.c2
      ]

      allPlayerSplitCommit()
      displayMessage()

      const {onTable: states} = last(messageFilter('game/showTime'))
      expect(states.map(s => s.won).join(',')).to.eq('-19,2,9,8')
    })
  })

  context.skip('5人局', () => {
    beforeEach(async () => {
      const match = setupMatch(5, {wanFa: 'jingDian'})
      room = match.room
      table = match.table
      players = table.players
      allRule = match.allRule

      // await RoomRecord.remove({}).exec()
    })

    afterEach(async () => {
      // await PlayerModel.remove({})
    })

    it('bug', () => {


      table.start()
      table.rule.ro.maPaiArray = [5]

      players[0].cards = [Enums.h11, Enums.d11, Enums.c6,
        Enums.c9, Enums.d9, Enums.s7, Enums.c7, Enums.h3,
        Enums.s13, Enums.s13, Enums.c13, Enums.s2, Enums.c2
      ]
      players[1].cards = [Enums.s11, Enums.s6, Enums.d6,
        Enums.s1, Enums.d1, Enums.d10, Enums.c5, Enums.d3,
        Enums.s7, Enums.s6, Enums.s5, Enums.s4, Enums.s3
      ]
      players[2].cards = [Enums.h10, Enums.s9, Enums.d8,
        Enums.h13, Enums.h6, Enums.h5, Enums.s3, Enums.h2,
        Enums.s12, Enums.s11, Enums.s10, Enums.s9, Enums.s8
      ]
      players[3].cards = [Enums.s10, Enums.h9, Enums.h8,
        Enums.s1, Enums.h1, Enums.d7, Enums.d5, Enums.s2,
        Enums.s12, Enums.h12, Enums.c12, Enums.h4, Enums.d4
      ]
      players[4].cards = [Enums.d13, Enums.d12, Enums.h7,
        Enums.s8, Enums.c8, Enums.s5, Enums.s4, Enums.d2,
        Enums.c1, Enums.c11, Enums.c10, Enums.c4, Enums.c3
      ]


      allPlayerSplitCommit()

      const {onTable: states} = last(messageFilter('game/showTime'))
      expect(states.map(s => s.won).join(',')).to.eq('12,42,17,-46,-25')
    })
  });
})
