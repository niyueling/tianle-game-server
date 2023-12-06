import {index, prop, Typegoose} from 'pshu-typegoose'

class ContestConfig extends Typegoose {
  @prop({required: true, default: 'zhadan'})
  gameType: string

  @prop({required: true, default: 4})
  nPlayersToKnockOut: number

  @prop({required: true, default: 4})
  nPlayersToEnd: number

  @prop({required: true, default: 1})
  entryFee: number

  @prop({required: true, default: 'battle'})
  contestType: string

  @prop({required: true, default: 8})
  queueLimit: number

  @prop({required: true, default: 4})
  playerCounter: number

  @prop({required: true})
  rule: any
}

export const ContestConfigModel = new ContestConfig().getModelForClass(ContestConfig)
