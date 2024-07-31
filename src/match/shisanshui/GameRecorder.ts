import {last} from 'lodash'

export interface IGameRecorder {
  recordUserEvent (player: any, event: string, card?: number): void;
  getEvents(): Array<any>;
}


class GameRecorder implements  IGameRecorder{

  events: any[]
  game: any

  constructor(game) {
    this.game = game
    this.events = []
  }

  recordUserEvent(player, event, card) {
    const cards = player.getCardsArray()
    const index = player.seatIndex
    const suits = []
    const eventRecord = {
      index,
      info: {cards, card, suits, chiCombol: []},
      type: event
    }

    if (event === 'chi') {
      const lastChi = last(player.events.chi)
      eventRecord.info.chiCombol = [lastChi[1], lastChi[2]]
    }

    for (const event of player.events.chiPengGang || []) {
      const [action, info] = event
      switch (action) {
        case 'chi':
          suits.push(info)
          break;
        case 'peng':
          suits.push(new Array(3).fill(info))
          break;
        case 'mingGang':
        case 'anGang':
          suits.push(new Array(4).fill(info))
          break;
      }
    }

    if (player.events.hu) {
      // TODO put hu cards
    }

    this.events.push(eventRecord)
  }

  getEvents() {
    return this.events
  }

  resetEvents() {
    this.events = []
  }
}

export default GameRecorder

export class DummyRecorder implements IGameRecorder {

  // tslint:disable-next-line:no-empty
  recordUserEvent(player, event, card) {
  }

  getEvents() {
    return []
  }

}
