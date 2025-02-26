import Card from "./card";

export interface IGameRecorder {
  recordUserEvent (player: any, event: string, cards?: Card[], pattern?: object, playerIndexs?: number[]): void;

  getEvents(): Array<any>;
}


class GameRecorder implements IGameRecorder {

  events: any[]
  game: any

  constructor(game) {
    this.game = game
    this.events = []
  }

  recordUserEvent(player, event, actionCards, pattern = {}, playerIndexs = []) {
    let cards = [];
    let index = -1;
    if (player) {
      cards = player.getCardsArray();
      index = player.seatIndex;
    }


    if (actionCards.length) {
      actionCards = actionCards.sort((a, b) => a.point - b.point);
    }

    const eventRecord = {
      index,
      info: {cards, actionCards, pattern, playerIndexs},
      type: event
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
