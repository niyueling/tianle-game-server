import {last} from 'lodash'
import Card from "./card";

export interface IGameRecorder {
  recordUserEvent (player: any, event: string, cards?: Card[]): void;

  getEvents(): Array<any>;
}


class GameRecorder implements IGameRecorder {

  events: any[]
  game: any

  constructor(game) {
    this.game = game
    this.events = []
  }

  recordUserEvent(player, event, actionCards) {
    const cards = player.getCardsArray()
    const index = player.seatIndex

    const eventRecord = {
      index,
      info: {cards, actionCards},
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
