import * as mongoose from 'mongoose'
import {prop, Typegoose} from 'pshu-typegoose'

export enum MailType {
  MESSAGE = 'message',
  NOTICE = 'notice',
  GIFT = 'gift',
  NOTICEGIFT = 'noticeGift',
}

export enum MailState {
  UNREAD = 1,
  READ = 2,
  DELETE = 3,
}

export enum GiftState {
  AVAILABLE = 1,
  REQUESTED = 2
}

export class Mail extends Typegoose {
  @prop()
  title: string;

  @prop({required: true})
  content: string;

  @prop({required: true, ref: {name: 'Player'}, index: true})
  to: string

  @prop({required: true, default: Date.now})
  createAt: Date;

  @prop({enum: MailType, default: MailType.MESSAGE, required: true})
  type: string;

  @prop({enum: MailState, default: MailState.UNREAD})
  state: number

  @prop() /* gem:number ruby:number gold:number */
  gift: any

  @prop({enum: GiftState, default: GiftState.AVAILABLE})
  giftState: number
}

export class PublicMail extends Typegoose {
  @prop()
  title: string;

  @prop({required: true})
  content: string;

  @prop({required: true, default: Date.now})
  createAt: Date;

  @prop({enum: MailType, default: MailType.NOTICE, required: true})
  type: string;

  @prop() /* gem:number ruby:number gold:number */
  gift: any

}

export class PublicMailRecord extends Typegoose {

  @prop({index: true})
  player: string;

  @prop({index: true})
  // mail: mongoose.Schema.Types.ObjectId;
  mail: mongoose.Types.ObjectId;

  @prop({enum: MailState, default: MailState.READ})
  state: number;

  @prop({enum: GiftState, default: GiftState.AVAILABLE})
  giftState: number
}

export const MailModel = new Mail().getModelForClass(Mail);

export const PublicMailModel = new PublicMail().getModelForClass(PublicMail)

export const PublicMailRecordModel = new PublicMailRecord().getModelForClass(PublicMailRecord)

export default MailModel
