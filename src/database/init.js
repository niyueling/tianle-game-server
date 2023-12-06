/**
 * Created by comet on 16/10/15.
 */
import GlobalModel from './models/global';

// 用户 id 从7位数开始
export function initPlayerShortId() {
  return GlobalModel.findOrCreate({ _id: 'player', shortIdCounter: 1000000 });
}

// 新用户 id
export async function getNewShortPlayerId() {
  const updater = {$inc: {shortIdCounter: 1}}
  const options = { new: true }
  const global = await GlobalModel.findOneAndUpdate({ _id: 'player' }, updater, options)
  return global.shortIdCounter;
}

// 初始化战队 id
export function initClubShortId() {
  return GlobalModel.findOrCreate({ _id: 'club', shortIdCounter: 100000 });
}

// 初始化邀请码
export function initPlayerInviteCode() {
  return GlobalModel.findOrCreate({ _id: 'playerInviteCode', shortIdCounter: 100000 });
}

// 获取新战队 id
export async function getNewShortClubId() {
  const updater = {$inc: {shortIdCounter: 1}}
  const options = { new: true }
  const global = await GlobalModel.findOneAndUpdate({ _id: 'club' }, updater, options)
  return global.shortIdCounter;
}

export async function getNewPlayerInviteCode() {
  const updater = {$inc: {shortIdCounter: 1}}
  const options = { new: true }
  const global = await GlobalModel.findOneAndUpdate({ _id: 'playerInviteCode' }, updater, options)
  return global.shortIdCounter;
}
