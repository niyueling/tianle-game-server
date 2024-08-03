export interface IGameRecorder {
  recordUserEvent (player: any, event: string, card?: any, cards?: any): void;
  getEvents(): Array<any>;
}


class GameRecorder implements  IGameRecorder{

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
    const suits = []
    const eventRecord = {
      index,
      info: {cards, card, suits, chiCombol: []},
      type: event
    }

    for (const eventItem of player.events.chiPengGang || []) {
      const [action, info] = eventItem
      switch (action) {
        case 'peng':
          suits.push(["peng", info]);
          break;
        case 'mingGang':
          suits.push(["jieGang", info]);
          break;
        case 'anGang':
          suits.push(["anGang", info]);
          break;
      }
    }

    if (player.events.hu) {
      //TODO put hu cards
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
  }

  getEvents() {
    return []
  }

}
