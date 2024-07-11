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
    if (!cards) {
      cards = player.getCardsArray();
    }

    if (card && !Array.isArray(card)) {
      card  = [card];
    }

    const index = player.seatIndex
    const suits = {chi: [], peng: [], anGang: [], jieGang: []}
    const eventRecord = {
      index,
      info: {cards, card, suits, chiCombol: []},
      type: event
    }

    if (event === 'chi') {
      eventRecord.info.chiCombol = last(player.events.chi);
    }

    for (const eventItem of player.events.chiPengGang || []) {
      const [action, info] = eventItem
      switch (action) {
        case 'chi':
          suits.chi.push(info)
          break;
        case 'peng':
          suits.peng.push(new Array(3).fill(info))
          break;
        case 'mingGang':
          suits.jieGang.push(new Array(4).fill(info))
          break;
        case 'anGang':
          suits.anGang.push(new Array(4).fill(info))
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
