import Card, {CardType} from "./card"
import {findFullMatchedPattern, findMatchedPatternByPattern,} from "./patterns"
import {IPattern, PatterNames} from "./patterns/base"
import PlayerState from "./player_state"
import Rule from './Rule'
import Table, {stateGameOver} from './table'
import {GameType} from "@fm/common/constants";
import enums from "./enums";
import Enums from "./enums";
import {service} from "../../service/importService";

function once(target, propertyKey: string, descriptor: PropertyDescriptor) {
  const originCall = descriptor.value
  const key = `__once_${propertyKey}`

  descriptor.value = function (...argv) {
    if (this[key]) {
      return
    } else {
      this[key] = true
      originCall.apply(this, argv)
    }
  }
}

export default class NormalTable extends Table {
  mode: string
  foundFriend: boolean = false
  private readonly settler: () => void = null
  private readonly findFullMatchedPatternImp: (cards: Card[]) => (IPattern | null) = findFullMatchedPattern
  private readonly findMatchedPatternByPatternImp: (pattern: IPattern, cards: Card[], rule: Rule) => Card[][]
    = findMatchedPatternByPattern

  constructor(room, rule: Rule, restJushu) {
    super(room, rule, restJushu)

    this.settler = this.shangYouSettler
  }

  resume(json) {
    super.resume(json)
  }

  toJSON() {
    return super.toJSON()
  }

  name() {
    return GameType.ddz
  }

  async start(payload) {
    await this.fapai(payload)
    this.status.current.seatIndex = -1
    await this.startStateUpdate()
  }

  async startStateUpdate() {
    if (this.room.game.lastWinnerShortId !== -1) {
      // 有上一局赢的人,则赢家先选择地主
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (p.model.shortId === this.room.game.lastWinnerShortId) {
          await this.setFirstDa(i);
          break;
        }
      }
    } else {
      await this.setFirstDa(0);
    }

    // console.warn("firstDa-%s", this.status.current.seatIndex);
    if (this.status.current.seatIndex === -1) {
      return ;
    }

    // 判断是否有用户明牌，取明牌最高倍数
    let maxMultiple = 0;
    for (let i = 0; i < this.openCardPlayers.length; i++) {
      if (this.players[this.openCardPlayers[i]].openMultiple > maxMultiple) {
        maxMultiple = this.players[this.openCardPlayers[i]].openMultiple;
      }
    }
    if (maxMultiple) {
      this.multiple = maxMultiple;
    }

    // 设置用户为不托管
    this.players.map(p => p.onDeposit = false);

    this.broadcastChooseMode();
  }

  broadcastChooseMode() {
    const startChooseModeFunc = async() => {
      this.tableState = '';
      this.room.broadcast('game/startChooseMode', {ok: true, data: {index: this.currentPlayerStep}})

      setTimeout(chooseModeFunc, 1000);
    }

    setTimeout(startChooseModeFunc, 5000);


    const chooseModeFunc = async() => {
      this.state = 1;
      this.players[this.currentPlayerStep].emitter.emit(enums.waitForPlayerChooseMode);
    }
  }

  async setFirstDa(startPlayerIndex: number) {
    this.status.current.seatIndex = startPlayerIndex;
    // 第一个打的
    this.audit.setFirstPlay(this.players[startPlayerIndex].model.shortId);
  }

  isGameOver(): boolean {
    return this.players.some(p => p.cards.length === 0);
  }

  bombScorer(bomb: IPattern): number {
    if (bomb.name !== PatterNames.bomb) return 0
    let bombLen = bomb.cards.length

    if (bomb.cards.every(c => c.type === CardType.Joker)) {
      return 16
    }

    if (bomb.cards.some(c => c.value === 2)) {
      bombLen += 1
    }

    if (bombLen < 5) return 0

    return Math.pow(2, bombLen - 5)
  }

  listenPlayer(player: PlayerState) {
    super.listenPlayer(player)
  }

  async reconnectContent(index, reconnectPlayer: PlayerState) {
    const stateData = this.stateData;
    const juIndex = this.room.game.juIndex;
    const status = [];

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      status.push(p._id.toString() === reconnectPlayer._id.toString() ? await p.statusForSelf(this) : await p.statusForOther(this));
    }
    const currentPlayerIndex = this.status.current.seatIndex;

    return {
      mode: this.mode,
      currentPlayer: currentPlayerIndex,
      lastPattern: this.status.lastPattern,
      lastIndex: this.status.lastIndex,
      from: this.status.from,
      foundFriend: this.foundFriend,
      landlordCards: this.landlordCards,
      isGameRunning: this.state !== stateGameOver,
      index,
      juIndex,
      stateData,
      status
    }
  }

  async onPlayerDa(player: PlayerState, {cards: plainCards}) {
    const cards = plainCards.map(Card.from)
    const isOk = this.playManager.isAllowPlayCard(cards, player.cards);
    if (!isOk) {
      return this.cannotDaPai(player, cards, this.playManager.noPattern);
    }

    await super.onPlayerDa(player, {cards: plainCards})
  }

  async recordRubyReward() {
    if (!this.room.isPublic) {
      return null;
    }
    // 金豆房记录奖励
    await this.getBigWinner();
  }

  async getBigWinner() {
    // 将分数 * 倍率
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
    let times = conf.base * conf.Ante;

    // 查询斗地主的赢家
    const winnerId = this.players.findIndex(p => p.cards.length === 0);
    const winner = this.players[winnerId];
    let winnerUpgradeGold = winner.multiple * times;
    let winnerGold = 0;
    const currency = await this.PlayerGoldCurrency(winner._id);
    if (winnerUpgradeGold > currency) {
      winnerUpgradeGold = currency;
    }

    // 赢家是地主
    if (winner.mode === enums.landlord) {
      for (let i = 0; i < this.players.length; i ++) {
        const p = this.players[i];

        // 赢家是地主
        if (p._id.toString() !== winner._id.toString()) {
          const currency = await this.PlayerGoldCurrency(p._id);
          let changeGold = Math.floor(winnerUpgradeGold * p.multiple / winner.multiple);
          if (changeGold > currency) {
            changeGold = currency;
          }

          p.balance = -changeGold;
          winnerGold += changeGold;
        }
      }

      winner.balance = winnerGold;
    }

    // 赢家是农民
    if (winner.mode === enums.farmer) {
      // 查询地主
      const landloadId = this.players.findIndex(p => p.mode === enums.landlord);
      const landload = this.players[landloadId];
      let landloadUpgradeGold = landload.multiple * times;
      const landloadCurrency = await this.PlayerGoldCurrency(landload._id);
      if (landloadUpgradeGold > landloadCurrency) {
        landloadUpgradeGold = landloadCurrency;
      }
      let landloadDeductGold = 0;

      for (let i = 0; i < this.players.length; i ++) {
        const p = this.players[i];

        // 赢家是地主
        if (p._id.toString() !== landload._id.toString()) {
          const currency = await this.PlayerGoldCurrency(p._id);
          let playerWinnerGold = Math.floor(landloadUpgradeGold * p.multiple / landload.multiple);
          if (playerWinnerGold > currency) {
            playerWinnerGold = currency;
          }
          p.balance = playerWinnerGold;
          landloadDeductGold += playerWinnerGold;
        }
      }

      landload.balance = -landloadDeductGold;
    }
  }

  // 根据币种类型获取币种余额
  async PlayerGoldCurrency(playerId) {
    const model = await service.playerService.getPlayerModel(playerId);

    if (this.rule.currency === Enums.goldCurrency) {
      return model.gold;
    }

    return model.tlGold;
  }

  async gameOver() {
    this.state = 4;

    // 设置剩余牌数
    this.updateRemainCards();

    this.settler();

    await this.recordRubyReward();

    const states = this.players.map(p => {
      const auditInfo = this.audit.currentRound[p.model.shortId];
      return {
        model: p.model,
        index: p.index,
        score: this.room.isPublic ? p.balance : this.getGameMultiple(p),
        multiple: p.multiple,
        detail: p.detailBalance,
        mode: p.mode,
        // 统计信息
        audit: {
          remainCards: auditInfo.remainCards,
          orderList: auditInfo.orderList,
          springScore: auditInfo.springScore,
          antSpringScore: auditInfo.antSpringScore,
          boomTimes: auditInfo.boomTimes,
        },
      }
    })

    const gameOverMsg = {
      states,
      gameType: GameType.ddz,
      juShu: this.restJushu,
      isPublic: this.room.isPublic,
      juIndex: this.room.game.juIndex,
      mode: this.mode,
      creator: this.room.creator.model._id,
    }
    this.room.broadcast('game/gameOverReply', {ok: true, data: gameOverMsg})
    this.stateData.gameOver = gameOverMsg

    let firstPlayer = this.players.find(p => p.cards.length === 0);

    await this.roomGameOver(states, firstPlayer._id);
  }

  getGameMultiple(player) {
    const score = Math.abs(player.balance);
    if (this.rule.capping === -1) {
      return player.balance;
    }

    if (player.mode === enums.landlord) {
      return score > this.rule.capping ? (player.balance > 0 ? this.rule.capping : -this.rule.capping) : player.balance;
    }

    return score > this.rule.capping / 2 ? (player.balance > 0 ? this.rule.capping / 2 : -this.rule.capping / 2) : player.balance;
  }

  private shangYouSettler() {
    const multiples = [];
    const winner = this.players.find(p => p.cards.length === 0);

    this.players.map((v) => {multiples.push({index: v.index, multiple: v.multiple, mode: v.mode})});

    // 如果赢家是地主
    if (winner.mode === enums.landlord) {
      const losers = this.players.filter(p => p.mode === enums.farmer);

      // 判断是否春天
      let isSpring = true;
      for (let i = 0; i < losers.length; i++) {
        if (losers[i].cards.length !== 17) {
          isSpring = false;
        }
      }

      if (isSpring) {
        this.players.map(player => {
          player.multiple *= 2;
          player.sendMessage("game/multipleChange", {ok: true, data: {seatIndex: player.index, multiple: player.multiple, changeMultiple: 2}});
        })

        this.room.broadcast("game/showSpring", {ok: true, data: {}});
      }

      // 计算积分
      losers.map(p => winner.winFrom(p, p.multiple));
    }

    // 如果赢家是农民
    if (winner.mode === enums.farmer) {
      const loser = this.players.find(p => p.mode === enums.landlord);
      const famers = this.players.filter(p => p.mode === enums.farmer);

      // 判断是否反春天
      if (this.audit.currentRound[loser.model.shortId].playTimes === 1) {
        this.players.map(player => {
          player.multiple *= 2;
          player.sendMessage("game/multipleChange", {ok: true, data: {seatIndex: player.index, multiple: player.multiple, changeMultiple: 2}});
        })
        this.room.broadcast("game/showSpring", {ok: true, data: {}});
      }

      // 计算积分
      famers.map(p => p.winFrom(loser, p.multiple));
    }
  }

  findFullMatchedPattern(cards: Card[]): IPattern | null {
    return this.findFullMatchedPatternImp(cards)
  }

  findMatchedPatternByPattern(currentPattern: IPattern, cards: Card[]): Card[][] {
    return this.findMatchedPatternByPatternImp(currentPattern, cards, this.rule)
  }

  // 设置剩余牌
  updateRemainCards() {
    for (const p of this.players) {
      this.audit.setRemainCards(p.model.shortId, p.cards);
    }
  }
};
