import * as chai from 'chai'
import Analyzer from "../../../match/shisanshui/analyzer"
import Combo from "../../../match/shisanshui/combo"
import Enums from "../../../match/shisanshui/enums"
import Room from "../../../match/shisanshui/room"
import Table from "../../../match/shisanshui/table"
import setupMatch from "./setupMatch"

const expect = chai.expect

chai.use(require('chai-properties'))


describe('同花(4人以上对子)', () => {
  let table: Table, room: Room, players


  beforeEach(() => {
    const match = setupMatch(6, {wanFa: 'luoSong'})
    room = match.room
    table = match.table
    players = table.players
  })


  it('六人', () => {
    table.start();
    let card1 = [Enums.c5, Enums.c6, Enums.c9, Enums.c4, Enums.c4]
    let card11 = [Enums.s5, Enums.s6, Enums.s9, Enums.s4, Enums.s4]
    let card2 = [Enums.h5, Enums.h7, Enums.h10, Enums.h11, Enums.h13]
    const max = (combos: Combo[]) => combos.sort((a, b) => b.score - a.score)[0]

    const card1Result = max(new Analyzer(card1).analyze())
    const card11Result = max(new Analyzer(card11).analyze())
    const card2Result = max(new Analyzer(card2).analyze())

    expect(card1Result.score).greaterThan(card2Result.score)
    expect(card11Result.score).greaterThan(card2Result.score)
  })
})
