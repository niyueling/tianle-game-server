import {prop, Typegoose} from 'pshu-typegoose'

export enum RewardType {
  special = 'special',
  lucky = 'lucky'
}

// 红包配置表 rewardconfigs
export class RewardConfig extends Typegoose {

  @prop({required: true})
  game: string

  @prop({required: true, enum: RewardType})
  type: RewardType

  @prop({required: true})
  redPocket: number

  // 概率(小数), 默认为 0
  @prop({required: false})
  probability: number
}

export const RewardConfigModel = new RewardConfig().getModelForClass(RewardConfig)
