import {last} from 'lodash'
import {length} from "moment";

export interface IGameRecorder {
  recordUserEvent (player: any, event: string, card?: any, cards?: any): void;
  getEvents(): any[];
}

class GameRecorder implements  IGameRecorder {

  events: any[]
  game: any

  constructor(game) {
    this.game = game
    this.events = []
  }

  recordUserEvent(player, event, card, cards) {
    if (!cards.length) {
      cards = player.getCardsArray();
    }

    if (card && !Array.isArray(card)) {
      card  = [card];
    }

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

    for (const eventItem of player.events.chiPengGang || []) {
      const [action, info] = eventItem
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

  recordUserEvent(player, event, card) {
    return;
  }

  getEvents() {
    return []
  }

}
