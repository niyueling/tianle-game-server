import {index, prop, Typegoose} from 'pshu-typegoose'
import {nowDate} from "./utils";


export class RedPocketRecord extends Typegoose {

  @prop({required: true, ref: {name: 'Player'}})
  player: string

  @prop({required: true})
  from: string

  @prop({required: true})
  amountInFen: number

  @prop({default: nowDate, required: true})
  createAt: Date
}

export enum RedPocketWithDrawState {
  init = 'init',
  finished = 'finished',
  error = 'error'
}

@index({player: 1, createAt: -1})
export class RedPocketWithdrawRecord extends Typegoose {
  @prop({required: true, ref: {name: 'Player'}})
  player: string

  @prop({required: true})
  amountInFen: number

  @prop({required: true})
  state: RedPocketWithDrawState

  @prop({default: nowDate, required: true})
  createAt: Date

  @prop({})
  info: string

  @prop({})
  paymentId: string
}

export const RedPocketRecordModel = new RedPocketRecord().getModelForClass(RedPocketRecord)
export const RedPocketWithdrawRecordModel = new RedPocketWithdrawRecord().getModelForClass(RedPocketWithdrawRecord)

