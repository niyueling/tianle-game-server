import * as mongoose from 'mongoose'
import {prop, Typegoose} from 'pshu-typegoose'

export enum RuleType {
  // 公共房规则
  public= 1,
  // 金币房规则
  gold = 2,
}

// 俱乐部规则配置表
export class ClubRule extends Typegoose {

  // 俱乐部 id
  @prop({required: true})
  clubId: mongoose.Types.ObjectId

  // 游戏类型
  @prop({required: true})
  gameType: string

  @prop({required: true, enum: RuleType})
  ruleType: RuleType

  // 每局人数
  @prop({required: true})
  playerCount: number

  // 详细规则
  @prop({required: false})
  rule: any
}

// mongo日志
// mongoose.set('debug', true);
export const ClubRuleModel = new ClubRule().getModelForClass(ClubRule)

// 创建战队规则
export async function createClubRule(clubId: mongoose.Types.ObjectId, gameType: string, playerCount,
                                     ruleType: RuleType, rule: any): Promise<{ isNew: boolean, model: ClubRule }> {
  let model = await ClubRuleModel.findOne({ clubId, gameType, ruleType, playerCount, "rule.juShu": rule.juShu });
  let isNew: boolean = false;
  if (model) {
    model.rule = rule;
  } else {
    isNew = true;
    model = new ClubRuleModel({ clubId, gameType, ruleType, playerCount, rule });
  }
  await model.save();

  return {isNew, model};
}
