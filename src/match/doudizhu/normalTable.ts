import Card, {CardType} from "./card"
import {
  findFullMatchedPattern,
  findMatchedPatternByPattern,
} from "./patterns"
import {IPattern, PatterNames} from "./patterns/base"
import PlayerState from "./player_state"
import Rule from './Rule'
import Table from './table'
import {GameType} from "@fm/common/constants";
import enums from "./enums";

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
    this.startStateUpdate()
  }

  startStateUpdate() {
    if (this.room.game.lastWinnerShortId !== -1) {
      // 有上一局赢的人,则赢家先选择地主
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (p.model.shortId === this.room.game.lastWinnerShortId) {
          this.setFirstDa(i);
          break;
        }
      }
    } else {
      this.setFirstDa(0);
    }

    // 测试多人明牌
    // for (let i = 0; i < this.players.length; i++) {
    //   this.players[i].emitter.emit(enums.openDeal, {multiple: i + 3});
    // }

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

    // 设置状态为抢地主
    this.state = 1;
    // 设置用户为不托管
    this.players.map(p => p.onDeposit = false);

    // 如果已经重新叫地主第三轮，则设置0号位为地主，直接开局
    if (this.resetCount === 2) {
      this.broadcastLandlordAndPlayer();
    } else {
      this.broadcastChooseMode();
    }

  }

  broadcastLandlordAndPlayer() {
    // 庄家成为地主
    this.zhuang.mode = enums.landlord;
    // 将地主牌发给用户
    const cards = this.cardManager.getLandlordCard();
    this.zhuang.cards = [...this.zhuang.cards, ...cards];
    this.room.broadcast("game/openLandlordCard", {ok: true, data: {seatIndex: this.zhuang.index, landlordCards: cards, cards: this.zhuang.cards}});

    const startDaFunc = async() => {
      this.status.current.seatIndex = this.zhuang.index;
      // 设置状态为选择翻倍
      this.state = 2;
      // 设置用户为不托管
      this.players.map(p => p.onDeposit = false);

      // 下发开始翻倍消息
      this.room.broadcast('game/startChooseMultiple', {ok: true, data: {}});

      // 托管状态自动选择不翻倍
      this.players.map(p => this.depositForPlayerChooseMultiple(p));
    }

    setTimeout(startDaFunc, 500);
  }

  broadcastChooseMode() {
    const startChooseModeFunc = async() => {
      this.tableState = ''
      this.room.broadcast('game/startChooseMode', {ok: true, data: {index: this.currentPlayerStep}})

      setTimeout(chooseModeFunc, 1000);
    }

    setTimeout(startChooseModeFunc, 5000);


    const chooseModeFunc = async() => {
      this.players[this.currentPlayerStep].emitter.emit(enums.waitForPlayerChooseMode);
    }
  }

  setFirstDa(startPlayerIndex: number) {
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

  reconnectContent(index, reconnectPlayer: PlayerState) {
    const stateData = this.stateData;
    const juIndex = this.room.game.juIndex;

    const status = this.players.map(player => {
      return player._id.toString() === reconnectPlayer._id.toString() ? {
        ...player.statusForSelf(this),
        teamMateCards: this.teamMateCards(player)
      } : player.statusForOther(this)
    })
    const currentPlayerIndex = this.status.current.seatIndex;

    return {
      mode: this.mode,
      currentPlayer: currentPlayerIndex,
      lastPattern: this.status.lastPattern,
      lastIndex: this.status.lastIndex,
      from: this.status.from,
      foundFriend: this.foundFriend,
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

  async gameOver() {
    // 设置剩余牌数
    this.updateRemainCards();

    this.settler();
    // console.warn("settler-%s", JSON.stringify(this.settler));

    // this.audit.print();
    const states = this.players.map(p => {
      const auditInfo = this.audit.currentRound[p.model.shortId];
      return {
        model: p.model,
        index: p.index,
        score: p.balance,
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

    let firstPlayer = this.players.find(p => p.cards.length === 0)

    await this.roomGameOver(states, firstPlayer._id);
  }

  private shangYouSettler() {
    const multiples = [];
    const winner = this.players.find(p => p.cards.length === 0);

    // console.warn("winner-%s, losers-%s", JSON.stringify(winner), JSON.stringify(losers));
    this.players.map((v) => {multiples.push({index: v.index, multiple: v.multiple, mode: v.mode})});
    const springPlayers = this.audit.isSpring();
    console.warn("multiples-%s, springPlayers-%s", JSON.stringify(multiples), JSON.stringify(springPlayers));

    // 如果赢家是地主
    if (winner.mode === enums.landlord) {
      const losers = this.players.filter(p => p.mode === enums.farmer);

      // 判断是否春天
      let isSpring = true;
      let fanShu = 1;
      const springIds = [];
      for (let i = 0; i < losers.length; i++) {
        if (losers[i].cards.length !== 17) {
          isSpring = false;
        }
      }

      if (isSpring) {
        fanShu = 2;
        this.room.broadcast("game/showSpring", {ok: true, data: {}});
      }

      // 计算积分
      losers.map(p => winner.winFrom(p, p.multiple * fanShu));
    }

    // 如果赢家是农民
    if (winner.mode === enums.farmer) {
      const loser = this.players.find(p => p.mode === enums.landlord);
      const famers = this.players.filter(p => p.mode === enums.farmer);
      let fanShu = 1;

      // 判断是否反春天
      if (this.audit.currentRound[loser.model.shortId].playTimes === 1) {
        fanShu = 2;
        this.room.broadcast("game/showSpring", {ok: true, data: {}});
      }

      // 计算积分
      famers.map(p => p.winFrom(loser, p.multiple * fanShu));
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

  // 更新炸弹分
  updateBoomScore() {
    let score;
    for (const p of this.players) {
      for (const pp of this.players) {
        if (p.model.shortId !== pp.model.shortId) {
          score = this.audit.boomScore(p.model.shortId);
          if (score > 0) {
            p.winFrom(pp, score);
          }
        }
      }
    }
  }
};
