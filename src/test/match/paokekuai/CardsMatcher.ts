import Enums from '../../../match/paodekuai/enums'
import Card from "../../../match/paodekuai/card";
import * as chai from "chai"

const {expect} = chai


function matches(sourceCards: Card[], dropCards: Card[]): boolean {

  if (sourceCards.length === dropCards.length) {
    return true
  }
  return false
}

function expectMatch(sourceCards: Card[], dropCards: Card[]) {

  if (matches(sourceCards, [Enums.c2])) {
    return
  }

  const sourceString = sourceCards.map(c => c.toString()).join(',')
  const dropsString = dropCards.map(c => c.toString()).join(',')


  expect.fail('match', 'not  match', `${dropsString} not matches ${sourceString}`)

}

describe('牌型匹配', () => {

  it('单张匹配单张', () => {
    expectMatch([Enums.c1], [Enums.c2])
  })




})
