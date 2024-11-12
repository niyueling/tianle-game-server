import {GameType, RobotStep, TianleErrorCode} from "@fm/common/constants";
import {service} from "../../service/importService";
import Card, {CardType} from "./card";
import {arraySubtract, IPattern, PatterNames} from "./patterns/base";
import PlayerState from "./player_state";
import Table from "./table";
import Enums from "./enums";

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
  selectModeTimeout: NodeJS.Timeout

  private nextAction: () => void = null

  name() {
    return "guandan"
  }

  async start(payload) {
    this.faPaiPayload = payload;

    const faPaiFunc = async() => {
      if (this.rule.allowDouble) {
        await this.broadcastModeRequest();
      } else {
        await this.startFaPai(payload);
        this.nextAction = this.startTeamworkGame;
        this.next();
      }

      await this.room.robotManager.setCardReady(this.rule.allowDouble);
    }

    setTimeout(faPaiFunc, 1000);
  }

  async startFaPai(payload) {
    if (this.rule.shuffleType === 2) {
      // 不洗牌
      await this.publicRoomFapai();
    } else {
      // 随机发牌
      await this.fapai(payload);
    }

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      // 判断是否使用记牌器
      const cardRecorderStatus = await this.getCardRecorder(p);
      p.onShuffle(0, this.restJushu, p.cards, i, this.room.game.juIndex, this.room.shuffleData.length > 0,
        cardRecorderStatus, {homeTeamCard: this.room.homeTeamCard, awayTeamCard: this.room.awayTeamCard, currentLevelCard: this.room.currentLevelCard});
    }

    const sendLevelCardFunc = async() => {
      this.room.broadcast("game/openLevelCard", {ok: true, data: {currentLevelCard: this.room.currentLevelCard, homeTeamCard: this.room.homeTeamCard, awayTeamCard: this.room.awayTeamCard}})
    }

    setTimeout(sendLevelCardFunc, 200);

    const shuffleData = this.room.shuffleData.map(x => {
      const p = this.players.find(y => y.model._id === x);
      return p.index;
    })
    this.shuffleDelayTime = Date.now() + this.room.shuffleData.length * 5000;
    this.room.broadcast('game/shuffleData', {ok: true, data: {shuffleData}});
    this.status.current.seatIndex = -1;
    // 金豆房扣除开局金豆
    if (this.room.gameRule.isPublic) {
      await this.room.payRubyForStart();
    }
  }

  resume(json) {
    super.resume(json)
  }

  toJSON() {
    if (this.state === 'gameOver') return null
    // return Object.assign(superJSON, {test: 'test1'})
    return super.toJSON()
  }

  private async broadcastModeRequest() {
    this.tableState = 'selectMode';
    for (const player of this.players) {
      if (!player.isChooseMode) {
        // player.msgDispatcher.on('game/chooseMultiple', async ({double}) => {
        //   await this.onSelectMode(player, double);
        //   this.room.emit('selectMode', {});
        // })

        player.sendMessage('game/startChooseMultiple', {ok: true, data: {}})
        this.autoCommitFunc();
      }
    }
  }

  @once
  private next() {

    clearTimeout(this.selectModeTimeout)
    for (const p of this.players) {
      p.msgDispatcher.removeAllListeners('game/chooseMultiple')
    }

    this.tableState = '';
    this.room.emit('selectMode', {});
    this.nextAction();

    this.autoCommitFunc()
  }

  async onSelectMode(player: PlayerState, multiple = 1) {
    const index = this.players.findIndex(p => p._id.toString() === player._id.toString());
    player.multiple = multiple;
    player.isChooseMode = true;
    this.multiple += (multiple === 1 ? 0 : 1);
    player.record(`select-mode-${multiple}`, []);
    this.room.broadcast("game/chooseMultipleReply", {ok: true, data: {seatIndex: index, isMultiple: player.isChooseMode, double: player.multiple, gameMultiple: this.multiple}});
    // console.warn("index %s multiple %s isChooseMode %s", index, player.multiple, player.isChooseMode);
    const isOk = await this.canStartGame();
    if (isOk) {
      this.next()
    }
  }

  async onPayTribute(player: PlayerState, msg) {
    // 如果用户不需要进贡
    if (!player.payTributeState) {
      return player.sendMessage("game/payTributeReply", {ok: false, info: TianleErrorCode.isNeverPayTribute});
    }

    // 如果手牌种没有用户进贡的牌
    const index = player.cards.findIndex(c => c.type === msg.card.type && c.point === msg.card.point);
    if (index === -1) {
      return player.sendMessage("game/payTributeReply", {ok: false, info: TianleErrorCode.cardIsNotExists});
    }

    const cardSlices = player.cards.slice();
    const sortCard = cardSlices.sort((grp1, grp2) => {
      return grp2.point - grp1.point
    });
    const caiShen = cardSlices.filter(c => c.type === CardType.Heart && c.value === this.room.currentLevelCard);
    const subtractCards = arraySubtract(sortCard.slice(), caiShen);

    // 如果手牌中去掉癞子，进贡的牌不是剩下的牌最大的牌，则进贡失败
    if (msg.card.point < subtractCards[0].point) {
      return player.sendMessage("game/payTributeReply", {ok: false, info: TianleErrorCode.cardIsNotMax});
    }

    player.payTributeCard = msg.card;
    this.players[player.seatIndex > 0 ? player.seatIndex - 1 : 3].payTributeCard = msg.card;
    player.record(`pay-tribute`, [msg.card]);
    this.room.broadcast("game/payTributeReply", {ok: true, data: {seatIndex: player.seatIndex, card: msg.card}});

    const isOk = await this.canPayAndReturnTribute();
    if (isOk) {
      this.nextToStartGame()
    }
  }

  async onReturnTribute(player: PlayerState, msg) {
    // 如果用户不需要还贡
    if (!player.returnTributeState) {
      return player.sendMessage("game/returnTributeReply", {ok: false, info: TianleErrorCode.isNeverReturnTribute});
    }

    // 如果手牌没有用户进贡的牌
    const index = player.cards.findIndex(c => c.type === msg.card.type && c.point === msg.card.point);
    if (index === -1) {
      return player.sendMessage("game/returnTributeReply", {ok: false, info: TianleErrorCode.cardIsNotExists});
    }

    const isLevelCard = CardType.Heart === msg.card.type && this.room.currentLevelCard === msg.card.value;

    // 规则设置任意牌可还贡，不能还癞子。设置还贡10以下，不能还贡10以上牌型
    if ((msg.card.point > 10 && this.rule.resoreTribute === 1) || (isLevelCard && this.rule.resoreTribute === 2)) {
      return player.sendMessage("game/returnTributeReply", {ok: false, info: TianleErrorCode.cardIsInvaid});
    }

    player.returnTributeCard = msg.card;
    this.players[player.seatIndex < 3 ? player.seatIndex + 1 : 0].returnTributeCard = msg.card;
    player.record(`return-tribute`, [msg.card]);
    this.room.broadcast("game/returnTributeReply", {ok: true, data: {seatIndex: player.seatIndex, card: msg.card}});

    const isOk = await this.canPayAndReturnTribute();
    if (isOk) {
      this.nextToStartGame()
    }
  }

  nextToStartGame() {
    // 执行换牌逻辑
    for (const player of this.players) {
      if (player.payTributeState || player.returnTributeState) {
        console.warn("payTributeState %s returnTributeState %s payTributeCard %s returnTributeCard %s",
          player.payTributeState, player.returnTributeState, JSON.stringify(player.payTributeCard), JSON.stringify(player.returnTributeCard));

        if (player.payTributeState) {
          const payTributeCardIndex = player.cards.findIndex(c => c.type === player.payTributeCard.type && c.point === player.payTributeCard.point);
          player.cards.splice(payTributeCardIndex, 1);
          player.cards.push(player.returnTributeCard);
        }

        if (player.returnTributeState) {
          const returnTributeCardIndex = player.cards.findIndex(c => c.type === player.returnTributeCard.type && c.point === player.returnTributeCard.point);
          player.cards.splice(returnTributeCardIndex, 1);
          player.cards.push(player.payTributeCard);
        }

        this.room.broadcast("game/payAndReturnCards", {ok: true, data: {player: player.seatIndex, type: player.payTributeState ? "pay" : "return",
            payTributeCard: player.payTributeCard, returnTributeCard: player.returnTributeCard, cards: player.cards.length}});
      }
    }
    const startFunc = async () => {
      this.tableState = '';
      this.room.robotManager.model.step = RobotStep.running;
      this.setTeamMate();
      this.setFirstDa(0);
      this.mode = 'teamwork';
      this.broadcastFirstDa();
    }

    setTimeout(startFunc, 1500);
  }

  async canPayAndReturnTribute(): Promise<boolean> {
    for (const player of this.players) {
      if ((player.payTributeState && !player.payTributeCard) || (player.returnTributeState && !player.returnTributeCard)) {
        return false;
      }
    }

    return true
  }

  listenPlayer(player) {
    super.listenPlayer(player);
    this.listenerOn.push('game/chooseMultiple');
    this.listenerOn.push('game/payTribute');
    this.listenerOn.push('game/returnTribute');

    player.msgDispatcher.on('game/chooseMultiple', async ({double}) => {
      await this.onSelectMode(player, double);
      this.room.emit('selectMode', {});
    })

    player.msgDispatcher.on('game/payTribute', async (msg) => {
      await this.onPayTribute(player, msg);
      this.room.emit('payTribute', {});
    })

    player.msgDispatcher.on('game/returnTribute', async (msg) => {
      await this.onReturnTribute(player, msg);
      this.room.emit('returnTribute', {});
    })
  }

  async canStartGame(): Promise<boolean> {
    for (const player of this.players) {
      if (!player.isChooseMode) {
        return false;
      }
    }

    await this.startFaPai(this.faPaiPayload);
    this.nextAction = this.startTeamworkGame;

    return true
  }

  broadcastFirstDa() {
    this.room.broadcast('game/startDa', {ok: true, data: {index: this.currentPlayerStep}});
  }

  private beTeamMate(team: PlayerState[]) {
    team[0].teamMate = team[1].index;
    team[1].teamMate = team[0].index;
  }

  setTeamMate() {
    this.beTeamMate(this.homeTeamPlayers());
    this.beTeamMate(this.awayTeamPlayers());
  }

  startTeamworkGame() {
    // 如果非第一局，需要处理进还贡
    if (this.room.game.juIndex > 1) {
      let isAllTribute = false;
      let kangTribute = [];

      // 判断上一把头游用户
      const team = this.room.winOrderLists.find(w => w.winOrder === 1).team;
      const winPlayerPlayer = this.room.winOrderLists.filter(p => p.team === team);

      if (winPlayerPlayer[1].winOrder === 2) {
        isAllTribute = true;
      }

      for (const player of this.players) {
        const winOrderPlayer = this.room.winOrderLists.find(p => p.playerId.toString() === player._id.toString());

        // 双下，两个末游要向两个头游进贡一张，单下，末游向头游进贡一张
        if ((isAllTribute && winOrderPlayer.winOrder > 2) || (!isAllTribute && winOrderPlayer.winOrder === 99)) {
          // 如果用户有两个大王可抗贡
          const maxJokerCount = player.cards.filter(c => c.type === CardType.Joker && c.point === 17).length;
          if (maxJokerCount === 2) {
            kangTribute.push(player._id);
            this.room.broadcast('game/conflicteTribute', {ok: true, data: {index: player.seatIndex}});
          } else {
            player.payTributeState = true;
            this.room.broadcast('game/startPayTribute', {ok: true, data: {index: player.seatIndex}});

            if (isAllTribute) {
              // 向上游进贡
              const winPlayer = this.players[player.seatIndex > 0 ? player.seatIndex - 1 : 3];
              winPlayer.returnTributeState = true;
              this.room.broadcast('game/startReturnTribute', {ok: true, data: {index: winPlayer.seatIndex}});
            } else {
              // 查询头游玩家
              const firstOrderPlayer = this.room.winOrderLists.find(p => p.winOrder === 1);
              const firstPlayer = this.players.find(p => p._id.toString() === firstOrderPlayer.playerId.toString());
              firstPlayer.returnTributeState = true;
              this.room.broadcast('game/startReturnTribute', {ok: true, data: {index: firstPlayer.seatIndex}});
            }
          }
        }
      }

      const payAndReturnState = this.players.findIndex(p => p.payTributeState || p.returnTributeState);
      if (payAndReturnState !== -1) {
        this.tableState = "returnTribute";
        this.room.robotManager.model.step = RobotStep.returnTribute;
        return this.autoCommitFunc();
      }
    }

    this.nextToStartGame()
  }

  isGameOver(): boolean {
    return super.isGameOver();
  }

  bombScorer = (bomb: IPattern) => {
    if (this.room.gameRule.isPublic) {
      return this.rubyRoomBoomScorer(bomb);
    }
    if (!bomb) return 0;

    if (bomb.name !== PatterNames.bomb) return 0;
    let bombLen = bomb.cards.length;

    if (bomb.cards.every(c => c.type === CardType.Joker)) {
      const jokerBombScore = Math.pow(2, bombLen);
      if (this.rule.ro.maxJokerBomb > 16) {
        return Math.min(this.rule.ro.maxJokerBomb, jokerBombScore);
      }
      return 16;
    }

    if (bombLen < 5) return 0;

    if (this && this.rule.ro.maxBombLevel && bombLen > this.rule.ro.maxBombLevel) {
      bombLen = this.rule.ro.maxBombLevel;
    }
    if (bombLen > 13) {
      bombLen = 13;
    }

    return Math.pow(2, bombLen - 5);
  }

  // 金豆房炸弹计分
  rubyRoomBoomScorer(bomb: IPattern) {
    if (!bomb) return 0;

    if (bomb.name !== PatterNames.bomb) return 0;
    let bombLen = bomb.cards.length;

    if (bomb.cards.every(c => c.type === CardType.Joker)) {
      return Math.pow(2, bombLen);
    }

    if (bombLen < 5) return 0;
    return Math.pow(2, bombLen - 5);
  }

  async reconnectContent(index, reconnectPlayer: PlayerState) {
    const stateData = this.stateData
    const juIndex = this.room.game.juIndex
    const status = [];

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      status.push(p._id.toString() === reconnectPlayer._id.toString() ? {
          ...await p.statusForSelf(this),
          teamMateCards: this.teamMateCards(p)
        } : await p.statusForOther(this));
    }

    return {
      mode: this.mode,
      currentPlayer: this.status.current.seatIndex,
      lastPattern: this.status.lastPattern,
      isGameRunning: this.state === 'gameOver',
      lastIndex: this.status.lastIndex,
      from: this.status.from,
      foundFriend: this.foundFriend,
      index,
      juIndex,
      stateData,
      status,
    }
  }

  @once
  showFriend() {
    if (this.mode === 'solo') return

    this.foundFriend = true

    this.players.forEach(ps => {
      ps.foundFriend = true
    })
    this.room.broadcast('game/showFriend', {ok: true, data: {
        homeTeam: this.homeTeamPlayers().map(p => p.index),
        awayTeam: this.awayTeamPlayers().map(p => p.index)
      }})
  }

  daPai(player: PlayerState, cards: Card[], pattern: IPattern, onDeposit?) {
    if (this.friendCard && player.index !== 0) {
      if (cards.find(c => Card.compare(c, this.friendCard) === 0)) {
        this.showFriend()
      }
    }

    return super.daPai(player, cards, pattern, onDeposit)
  }

  teamWorkGameOver() {
    const playersInWinOrder = this.players.slice().sort((p1, p2) => p1.winOrder - p2.winOrder);
    const teamOrder = playersInWinOrder.map(p => p.team);
    const winTeam = teamOrder[0];

    let score = 1;
    if (teamOrder[0] === teamOrder[1]) {
      score = (this.rule.upgrade === 1 ? 3 : 4);
    }

    if (teamOrder[0] === teamOrder[2]) {
      score = 2;
    }

    this.room.upgradeMultiple = score;

    this.room.winTeamPlayers = this.players.filter(p => p.team === winTeam).map(p => p.seatIndex);
    this.room.loseTeamPlayers = this.players.filter(p => p.team !== winTeam).map(p => p.seatIndex);

    console.warn("score %s winTeamPlayers %s loseTeamPlayers %s", score, JSON.stringify(this.room.winTeamPlayers), JSON.stringify(this.room.loseTeamPlayers));
  }

  async gameOver() {
    if (this.state === 'gameOver') {
      return
    }

    this.state = 'gameOver';

    if (this.mode === 'teamwork') {
      this.teamWorkGameOver();
    }

    // 计算金豆
    await this.recordRubyReward();
    const states = [];
    for (const p of this.players) {
      states.push({
        model: p.model,
        index: p.index,
        score: p.balance,
        winOrder: p.winOrder,
        detail: p.detailBalance,
        mode: p.mode,
        // 是否破产
        isBroke: p.isBroke,
        // mvp 次数
        mvpTimes: 0,
      })
    }
    const gameOverMsg = {
      states,
      // 金豆奖池
      rubyReward: 0,
      juShu: this.restJushu,
      isPublic: this.room.isPublic,
      juIndex: this.room.game.juIndex,
      gameType: GameType.guandan,
      mode: this.mode,
      homeTeam: this.homeTeamPlayers().map(p => p.index),
      awayTeam: this.awayTeamPlayers().map(p => p.index),
      creator: this.room.creator.model._id,
    }
    this.room.broadcast('game/gameOverReply', {ok: true, data: gameOverMsg});
    this.stateData.gameOver = gameOverMsg;
    const firstPlayer = this.players.slice().sort((p1, p2) => p1.winOrder - p2.winOrder)[0];
    await this.roomGameOver(states, firstPlayer._id);
  }

  destroy() {
    super.destroy()
    this.state = 'gameOver';
  }

  // 记录金豆
  async recordRubyReward() {
    if (!this.room.isPublic) {
      // 计算好友房分数
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (p) {
          const base = this.room.winTeamPlayers.includes(p.seatIndex) ? 1 : -1;
          // 基础倍率
          p.balance = base * this.multiple * this.room.upgradeMultiple;
        }
      }

      return null;
    }

    // 金豆房记录奖励
    await this.getBigWinner();
  }
  async getBigWinner() {
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
    let times = conf.base * conf.Ante;
    let winRuby = 0;
    let lostRuby = 0;
    let maxBalance = 0;
    let maxLostBalance = 0;
    const winnerList = [];
    const lostList = [];
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p) {
        const base = this.room.winTeamPlayers.includes(p.seatIndex) ? 1 : -1;
        console.warn("index %s base %s times %s winTeamPlayers %s", p.seatIndex, base, times);
        // 基础倍率
        p.balance = base * times * this.multiple * this.room.upgradeMultiple;

        if (p.balance > 0) {
          const currency = await this.PlayerGoldCurrency(p._id);
          if (p.balance > currency) {
            console.warn("winner balance-%s currency-%s", p.balance, currency);
            p.balance = currency;
          }

          winnerList.push(p);
          winRuby += p.balance;
          maxBalance += p.balance;
        } else {
          const currency = await this.PlayerGoldCurrency(p._id);
          if (currency < -p.balance) {
            console.warn("loser balance-%s currency-%s", p.balance, currency);
            p.balance = -currency;
          }

          lostList.push(p);
          maxLostBalance += p.balance;
          lostRuby += p.balance;
        }
      }
    }

    if (winRuby > -lostRuby) {
      winRuby = -lostRuby;
    }

    if (-lostRuby > winRuby) {
      lostRuby = -winRuby;
    }

    if (isNaN(winRuby)) {
      winRuby = 0;
    }
    if (isNaN(lostRuby)) {
      lostRuby = 0;
    }

    console.log('win ruby', winRuby, 'lost ruby', lostRuby, 'maxBalance', maxBalance, 'maxLostBalance', maxLostBalance);

    if (winRuby > 0) {
      for (const p of winnerList) {
        const oldBalance = p.balance;
        p.balance = Math.floor(p.balance / maxBalance * winRuby);
        console.log('winner after balance %s oldBalance %s shortId %s', p.balance, oldBalance, p.model.shortId)
      }
    }

    if (lostRuby < 0) {
      for (const p of lostList) {
        const oldBalance = p.balance;
        p.balance = Math.floor(p.balance / maxLostBalance * lostRuby);
        console.log('lost after balance %s oldBalance %s shortId %s', p.balance, oldBalance, p.model.shortId)
      }
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

  getPlayerByShortId(shortId) {
    for (const p of this.players) {
      if (p && p.model.shortId === shortId) {
        return p;
      }
    }
    return null;
  }
};
