import * as fs from 'fs'
import * as path from 'path'
import BaseService from "./base";
import CardsService from "./cards";
import ClubService from "./club";
import GameConfig from "./gameConfig";
import Lottery from "./lottery";
import MedalService from "./medal";
import PlayerService from "./playerService";
import QianService from "./qian";
import RoomRegister from "./roomRegister";
import RubyReward from "./rubyReward";
import TimesService from "./times";
import UtilsService from "./utils";
import ItemService from "./item";
export interface ServiceType {
  // 文件名：函数名
  base: BaseService,
  roomRegister: RoomRegister,
  utils: UtilsService,
  playerService: PlayerService,
  medal: MedalService,
  lottery: Lottery,
  gameConfig: GameConfig,
  rubyReward: RubyReward,
  club: ClubService,
  qian: QianService,
  times: TimesService,
  cards: CardsService,
  item: ItemService
}
// 导出 service 目录下的所有 service
// @ts-ignore
export const service: ServiceType = {}
const files = fs.readdirSync(__dirname).filter(
  filename => !filename.startsWith('importService') && (filename.endsWith('.ts') || filename.endsWith('.js'))
);

const requires = {};
files.map(f => {
  const moduleName = f.slice(0, -3);
  requires[moduleName] = require(path.join(__dirname, f));
});

for (const k of Object.keys(requires)) {
  const mod = requires[k];
  if (mod.default) {
    // 使用 default 导出
    // FIXME 处理 static 函数调用
    if (mod.default instanceof Function) {
      service[k] = new mod.default();
    }
  } else {
    // 简单处理
    throw new Error('使用 default 导出 service')
  }
}
