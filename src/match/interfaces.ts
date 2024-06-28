import * as EventEmitter from "events";

export interface SimplePlayer {
  _id: string
  model: any
  room: any
  seatIndex: number

  sendMessage(name: string, message: any): void

  isRobot(): boolean

  addGold(gold: number)

  on(event: string, func)

  removeAllListeners(): void
}

export interface IRoom extends EventEmitter {
  players: SimplePlayer[]
  creator: SimplePlayer
  creatorName: string
  emitter: any

  gameState?: any
  clubMode: boolean
  _id: string | number

  disconnectCallback(json: any): void

  broadcast(messageName: string, message: any)

  broadcastRejoin(player: SimplePlayer): void

  indexOf(player: SimplePlayer): number

  isFull(player: SimplePlayer): boolean

  join(player: SimplePlayer)

  leave(player: SimplePlayer)

  canJoin(p: SimplePlayer): boolean

  ready(p: SimplePlayer): void

  nextGame(p: SimplePlayer): Promise<boolean>

  onRequestDissolve(player: SimplePlayer)

  onAgreeDissolve(player: SimplePlayer)

  onDisagreeDissolve(player: SimplePlayer)

  dissolve(player: SimplePlayer)

  forceDissolve()

  exchangeLiveGift(player: SimplePlayer, msg: any)
}

export interface ITable {
  destroy(): void

  start(payload): void
}
export interface IGame {
  juIndex: number
  juShu: number
  rule: any
  isAllOver(): boolean
  startGame(room: any): ITable
}
