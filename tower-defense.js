'use strict';

const colors = {
  background:    '#cfd8dc',
  boardbg1:      '#7e919c',
  boardbg2:      '#546e7a',
  boardlines:    '#263238',

  invader:       '#ffd740',
  invaderhp:     'rgb(244, 67, 54)',
  invaderdmg:    'rgba(244, 67, 54, 0.2)',
  invaderstun:   '#0097a7',

  turret:        '#f44336',
  stunner:       '#1976d2',
  bomb:          '#263238',
  towercooldown: '#0097a7',
  rangeoverlay:  'rgba(255, 240, 00, 0.5)',
  rangeoutline:  '#ff9800',

  lowlife:       '#c1180c',

  text:          '#000000',
}

const INITIAL_GOLD             = 500;
const INITIAL_LIFE             = 100;
const INITIAL_INCOME           = 10;
const INITIAL_MAXBOOST         = 0;
const INCOME_INTERVAL          = 10;
const INCOME_INCREASE_INTERVAL = 100;
const BUILD_COST_INFLATION         = 10;
const BUILD_COST_INFLATION_RATIO   = 1.0;
const UPGRADE_COST_INFLATION       = 5;
const UPGRADE_COST_INFLATION_RATIO = 1.5;

const MAX_GAME_LEN = 100000;
const LOW_LIFE_THRESHOLD = 15;

const BASE_HP   = 10;
const HP_COST   = 1;
const DEF_COST  = 10;
const RES_COST  = 10;
const BASE_INVADER_COST = 10;
const KILL_GOLD_RATIO = 0.1;

const BASE_BUILD_COST   = 50;
const BASE_UPGRADE_COST = 75;
const BUILD_TIME        = 10;
const UPGRADE_TIME      = 10;
const BOMB_COOLDOWN     = 5;

const LEFT  = 0;
const RIGHT = 1;

class Invader {
  constructor(hp, defense, stunRes) {
    this.pos      = 0;
    this.hp       = hp;
    this.maxhp    = hp;
    this.defense  = defense || 0;
    this.stunRes  = stunRes || 0;
    this.stunTime = 0;
  }

  damage(power) {
    this.hp -= Math.max(power - this.defense, 1);
    return this.hp <= 0; // return true if it should die
  }

  stun(power) {
    this.stunTime = Math.max(power - this.stunRes, 0);
  }

  killReward() {
    return (this.maxhp + DEF_COST * this.defense + RES_COST * this.stunRes) * KILL_GOLD_RATIO | 0;
  }

  invadeReward() {
    return this.hp / this.maxhp;
  }
}

class Tower {
  constructor(pos) {
    this.level    = 1;
    this.pos      = pos;
    this.power    = 1;
    this.range    = 1;
    this.cooldown = BUILD_TIME;
    this.type     = null;
  }

  upgrade(stat) {
    switch (stat) {
      case 'power':
      case 'range':
        this.level++;
        this[stat]++;
        this.cooldown = UPGRADE_TIME;
      default:
    }
  }

  attack(invaders) {
    if (this.cooldown) {
      this.cooldown--;
      return false;
    }
    else return true;
  }
}

class Turret extends Tower {
  constructor(pos) {
    super(pos);
    this.type = 'turret';
  }

  attack(invaders) {
    if (super.attack(invaders)) {
      for (let i = this.pos + this.range; i >= this.pos - this.range; i--) {
        let invader = invaders[i];
        if (invader) {
          if (invader.damage(this.power)) {
            invaders[i] = null;
            return invader.killReward();
          }
          else {
            return 0;
          }
        }
      }
    }
    return 0;
  }
}

class Stunner extends Tower {
  constructor(pos) {
    super(pos);
    this.range = 0;
    this.power = 3;
    this.type = 'stunner';
  }

  attack(invaders) {
    if (super.attack(invaders)) {
      for (let i = this.pos + this.range; i >= this.pos - this.range; i--) {
        let invader = invaders[i];
        if (invader && invader.stunTime === 0) {
          invader.stun(this.power);
          this.cooldown = this.power + 1;
          break;
        }
      }
    }
    return 0;
  }
}

class Bomb extends Tower {
  constructor(pos) {
    super(pos);
    this.range = 2;
    this.power = 2;
    this.type = 'bomb';
  }

  attack(invaders) {
    let reward = 0;
    if (super.attack(invaders)) {
      if (invaders[this.pos]) { // Only explodes if there is an invader immediately in front of it
        for (let i = this.pos - this.range; i <= this.pos + this.range; i++) {
          let invader = invaders[i];
          if (invader) {
            if (invader.damage(this.power)) {
              invaders[i] = null;
              reward += invader.killReward();
            }
          }
        }
        this.cooldown = BOMB_COOLDOWN;
      }
    }
    return reward;
  }
}

const TOWER_TYPES = {
  turret:  Turret,
  bomb:    Bomb,
  stunner: Stunner,
};

class Board {
  constructor(side) {
    this.side = side;
    this.invaders = new Array(100);
    this.towers   = new Array(100);
  }

  step() {
    let goldEarned = 0;
    let invaded = 0;
    // Attack invaders
    for (let tower of this.towers) {
      if (tower) {
        goldEarned += tower.attack(this.invaders);
      }
    }
    // Move invaders
    for (let i = 99; i >= 0; i--) {
      let invader = this.invaders[i];
      if (invader) {
        if (invader.stunTime > 0) {
          invader.stunTime--;
          continue;
        }
        if (!this.invaders[i + 1]) {
          this.invaders[i] = null;
          if (i === 99) {
            invaded = invader.invadeReward();
          }
          else {
            this.invaders[++invader.pos] = invader;
          }
        }
      }
    }

    return {
      goldEarned: goldEarned,
      invaded:    invaded
    }
  }
}

class Player {
  constructor() {
    this.gold      = INITIAL_GOLD;
    this.income    = INITIAL_INCOME;
    this.boostMax  = INITIAL_MAXBOOST;
    this.life      = INITIAL_LIFE;
    this.inflation = 0;
  }

  get buildCost() {
    return BASE_BUILD_COST + this.inflation * BUILD_COST_INFLATION_RATIO | 0;
  }

  get upgradeCost() {
    return BASE_UPGRADE_COST + this.inflation * UPGRADE_COST_INFLATION_RATIO | 0;
  }
}

class Game {
  constructor(leftName, leftBot, rightName, rightBot) {
    this.turnNumber = 0;
    this.gameOver = false;

    this.boards  = [new Board(LEFT), new Board(RIGHT)];
    this.players = [new Player(), new Player()];
    this.bots    = [leftBot, rightBot];

    this.canvas = document.getElementById('viewport');
    this.canvasContext = this.canvas.getContext('2d');

    this.hud = {
      turnNumber: document.getElementById('turn-number'),
      hoverStats: document.getElementById('hover-stats'),
      players: [
        {
          name:    document.getElementById('left-name'),
          gold:    document.getElementById('left-gold'),
          build:   document.getElementById('left-build'),
          upgrade: document.getElementById('left-upgrade'),
          income:  document.getElementById('left-income'),
          boost:   document.getElementById('left-boost'),
          life:    document.getElementById('left-life'),
        },
        {
          name:    document.getElementById('right-name'),
          gold:    document.getElementById('right-gold'),
          build:   document.getElementById('right-build'),
          upgrade: document.getElementById('right-upgrade'),
          income:  document.getElementById('right-income'),
          boost:   document.getElementById('right-boost'),
          life:    document.getElementById('right-life'),
        }
      ]
    }
    this.hoverPlaceholder = this.hud.hoverStats.innerHTML;
    this.hud.players[LEFT].name.innerText  = leftName;
    this.hud.players[RIGHT].name.innerText = rightName;

    this.selectedEntity = null;
    this.selectedIndex = null;
    this.selectedSide = null;

    this.frameQueued = null;

    this.mouseX = 0;
    this.mouseY = 0;

    let self = this;
    this.canvas.addEventListener("mousemove", function(event) {
      self.mouseX = event.clientX - self.canvas.offsetLeft;
      self.mouseY = event.clientY - self.canvas.offsetTop;

      self.determineSelectedEntity();
      self.updateHUD();
      self.queueDraw();
    });
  }

  spawnInvader(who, {hp, defense, stunRes}) {
    let board  = this.boards[who];
    let player = this.players[who];
    hp = Math.max(hp || 0, 0);
    defense = Math.max(defense || 0, 0);
    stunRes = Math.max(stunRes || 0, 0);
    let cost = BASE_INVADER_COST + hp + defense * DEF_COST + stunRes * RES_COST;
    let totalBoost = hp + defense + stunRes;
    if (
      !board.invaders[0]
      && player.gold >= cost
      && totalBoost <= player.boostMax
    ) {
      let spawnHP = (BASE_HP + hp);
      let invader = new Invader(spawnHP, defense, stunRes);
      board.invaders[0] = invader;
      player.gold -= cost;
      return invader;
    }
  }

  buildTower(who, {type, pos}) {
    let board  = this.boards[1 - who];
    let player = this.players[who];
    if (
      pos != null && pos >= 0 && pos < 100 && !board.towers[pos]
      && type && TOWER_TYPES[type]
      && player.gold >= player.buildCost
    ) {
      let tower = new TOWER_TYPES[type](pos);
      board.towers[pos] = tower;
      player.gold -= player.buildCost;
      player.inflation += BUILD_COST_INFLATION;
      return tower;
    }
  }

  upgradeTower(who, {pos, stat}) {
    let board  = this.boards[1 - who];
    let player = this.players[who];
    if (
      board.towers[pos]
      && (stat === 'power' || stat === 'range')
      && player.gold >= player.upgradeCost
    ) {
      board.towers[pos].upgrade(stat);
      player.gold -= player.upgradeCost;
      player.inflation += UPGRADE_COST_INFLATION;
    }
  }

  destroyTower(who, {pos}) {
    let board  = this.boards[1 - who];
    let player = this.players[who];
    if (board.towers[pos]) {
      let tower = board.towers[pos];
      board.towers[pos] = null;
      player.gold += (BUILD_COST + UPGRADE_COST * (tower.level - 1)) / 2 | 0;
      player.inflation -= BUILD_COST_INFLATION + UPGRADE_COST_INFLATION * (tower.level - 1);
    }
  }

  step() {
    if (this.gameOver) return;

    for (let board of this.boards) {
      let result = board.step();
      let attacker = this.players[board.side];
      let defender = this.players[1 - board.side];
      defender.gold += result.goldEarned;
      attacker.gold += result.invaded * attacker.income | 0;
      if (result.invaded) {
        defender.life -= 1;
        attacker.income += 1;
      }
    }

    this.turnNumber++;
    if (this.turnNumber % INCOME_INTERVAL == 0) {
      for (let player of this.players) {
        player.gold += player.income;
      }
    }
    if (this.turnNumber % INCOME_INCREASE_INTERVAL == 0) {
      for (let player of this.players) {
        player.income   += 3;
        player.boostMax += 5;
      }
    }

    for (let me = 0; me < 2; me++) {
      let notme = 1 - me;
      let action = this.bots[me](
        this.turnNumber,
        this.players[me],
        this.players[notme],
        this.boards[me],     // Attacking
        this.boards[notme],  // Defending
      );
      if (action) {
        switch (action.action) {
          case 'spawn':
            this.spawnInvader(me, action);
            break;
          case 'build':
            this.buildTower(me, action);
            break;
          case 'upgrade':
            this.upgradeTower(me, action);
            break;
          case 'destroy':
            this.destroyTower(me, action);
            break;
          default:
            break;
        }
      }
    }

    this.determineSelectedEntity();
    this.updateHUD();

    if (
      this.turnNumber >= MAX_GAME_LEN
      || this.players[0].life <= 0
      || this.players[1].life <= 0
    ) {
      this.gameOver = true;
    }
    return !this.gameOver;
  }

  determineSelectedEntity() {
    let x = this.mouseX;
    let y = this.mouseY;
    let yCenter = this.canvas.height / 2;
    let spaceSize = 12;
    let leftEdge = 40;
    let spaceIndex = (x - leftEdge) / spaceSize | 0;
    let sideCenter = yCenter + (y > yCenter? 1: -1) * this.canvas.height / 4;
    if (y > yCenter) {
      spaceIndex = 99 - spaceIndex;
    }
    let side = y < yCenter? LEFT: RIGHT;

    if (spaceIndex >= 0 && spaceIndex < 100) {
      this.selectedSide = side;
      if (y < sideCenter && y >= sideCenter - spaceSize * 3) {
        this.selectedIndex = spaceIndex;
        this.selectedEntity = this.boards[side].invaders[spaceIndex];
      }
      else if (y >= sideCenter && y < sideCenter + spaceSize * 3) {
        this.selectedIndex = spaceIndex;
        this.selectedEntity = this.boards[side].towers[spaceIndex];
      }
      else {
        this.selectedIndex = null;
      }
    }
    else {
      this.selectedSide = null;
    }
  }

  queueDraw() {
    let self = this;
    window.requestAnimationFrame(() => self.draw());
  }

  draw() {
    this.canvasContext.fillStyle = colors.background;
    this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawSide(this.canvas.height * 0.25 | 0, this.boards[LEFT], LEFT);
    this.drawSide(this.canvas.height * 0.75 | 0, this.boards[RIGHT], RIGHT);
  }

  drawSide(boardCenter, board, side) {
    let ctx = this.canvasContext;
    let mirror = side === RIGHT;

    let yCenter = this.canvas.height / 2;
    let spaceSize = 12;
    let halfSpace = spaceSize / 2;
    let leftEdge = 40;
    let barWidth = spaceSize / 3;
    let hpBarHeight = 40;
    let pieceRadius = 4;
    let heightPerStun = 4;
    let heightPerCooldown = 4;
    let barPadding = 2;
    let pieceXCenterBase = leftEdge + halfSpace;

    ctx.fillStyle = colors.boardbg1;
    for (let i = 0; i < 10; i += 2) {
      ctx.fillRect(
        leftEdge + 10 * spaceSize * i,
        boardCenter - spaceSize,
        10 * spaceSize,
        spaceSize
      );
    }
    ctx.fillStyle = colors.boardbg2;
    for (let i = 1; i < 10; i += 2) {
      ctx.fillRect(
        leftEdge + 10 * spaceSize * i,
        boardCenter - spaceSize,
        10 * spaceSize,
        spaceSize
      );
    }
    ctx.strokeStyle = colors.boardlines;
    for (let i = 0; i < 100; i ++) {
      ctx.strokeRect(
        leftEdge + spaceSize * i,
        boardCenter - spaceSize,
        spaceSize,
        spaceSize
      )
    }

    for (let i = 0; i < 100; i ++) {
      let gridPos = mirror? 99 - i : i;
      let invader = board.invaders[i];
      if (invader) {
        ctx.fillStyle = colors.invader;
        ctx.beginPath();
        ctx.arc(
          pieceXCenterBase + spaceSize * gridPos,
          boardCenter - halfSpace,
          pieceRadius,
          0, 2*Math.PI
        );
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = colors.invaderdmg;
        ctx.fillRect(
          pieceXCenterBase - barWidth + spaceSize * gridPos,
          boardCenter - spaceSize - barPadding - hpBarHeight,
          barWidth,
          hpBarHeight
        );
        ctx.fillStyle = colors.invaderhp;
        let pixhp = hpBarHeight * (invader.hp / invader.maxhp);
        ctx.fillRect(
          pieceXCenterBase - barWidth + spaceSize * gridPos,
          boardCenter - spaceSize - barPadding - pixhp,
          barWidth,
          pixhp
        );
        ctx.fillStyle = colors.invaderstun;
        ctx.fillRect(
          pieceXCenterBase + spaceSize * gridPos,
          boardCenter - spaceSize - barPadding - invader.stunTime * heightPerStun,
          barWidth,
          invader.stunTime * heightPerStun
        );
      }

      let tower = board.towers[i];
      if (tower) {
        ctx.fillStyle = colors[tower.type]
        ctx.beginPath();
        ctx.arc(
          pieceXCenterBase + spaceSize * gridPos,
          boardCenter + halfSpace,
          pieceRadius,
          0, 2*Math.PI
        );
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = colors.towercooldown;
        ctx.fillRect(
          pieceXCenterBase - barWidth / 2 + spaceSize * gridPos,
          boardCenter + spaceSize + barPadding,
          barWidth,
          tower.cooldown * heightPerCooldown
        );
      }
    }

    if (this.selectedSide === side) {
      if (this.selectedEntity instanceof Tower) {
        let tower = this.selectedEntity;
        let gridPos = mirror? 99 - tower.pos : tower.pos;
        let rangeLeftX = Math.max(gridPos - tower.range, 0);
        let rangeRightX = Math.min(gridPos + tower.range + 1, 100);
        ctx.fillStyle = colors.rangeoverlay;
        ctx.strokeStyle = colors.rangeoutline;
        ctx.fillRect(
          leftEdge + rangeLeftX * spaceSize,
          boardCenter - spaceSize,
          (rangeRightX - rangeLeftX) * spaceSize,
          spaceSize,
        )
        ctx.strokeRect(
          leftEdge + rangeLeftX * spaceSize,
          boardCenter - spaceSize,
          (rangeRightX - rangeLeftX) * spaceSize,
          spaceSize,
        )
      }
    }
  }

  updateHUD() {
    if (this.selectedEntity) {
      // TODO: make a table or something prettier and more intelligent
      this.hud.hoverStats.innerText = JSON.stringify(this.selectedEntity);
    }
    else {
      // TODO: make this not use innerHTML and cache DOM nodes or something...
      this.hud.hoverStats.innerHTML = this.hoverPlaceholder;
    }

    this.hud.turnNumber.innerText    = this.turnNumber;
    for (let i = 0; i < 2; i++) {
      let hud = this.hud.players[i];
      let player = this.players[i];
      hud.gold.innerText    = player.gold;
      hud.income.innerText  = player.income;
      hud.build.innerText   = player.buildCost;
      hud.upgrade.innerText = player.upgradeCost;
      hud.boost.innerText   = player.boostMax;
      hud.life.innerText    = player.life;
      if (player.life <= LOW_LIFE_THRESHOLD) {
        hud.life.style.color = colors.lowlife;
      }
    }
  }

  run() {
    let game = this;

    let delay = document.getElementById('turn-delay');
    let pause = document.getElementById('pause-btn');
    let step = document.getElementById('step-btn');

    // Scoping rules with callbacks are weird...
    let runState = {
      turnTimeout: null,
      running:     false,
    };

    function turn() {
      if (runState.running) {
        runState.turnTimeout = window.setTimeout(turn, parseInt(delay.value));
      }
      if (!game.step()) {
        pauseAction();
      }
      game.queueDraw();
    }

    function resumeAction() {
      runState.running = true;
      pause.onclick = pauseAction;
      pause.value = 'Stop';
      turn();
    }

    function pauseAction() {
      if (runState.turnTimeout) {
        window.clearTimeout(runState.turnTimeout)
      }
      runState.running = false;
      pause.onclick = resumeAction;
      pause.value = 'Start';
    }

    function stepAction() {
      pauseAction();
      game.step();
      game.queueDraw();
    }

    pauseAction();
    step.onclick = stepAction;

    this.queueDraw();
  }
}

function simpleTurretBuilder() {
  let pos = 30;
  let built = 0;
  return function decideAction(turnNumber, me, notme, attacking, defending) {
    if (built < 100) {
      if (me.gold >= me.buildCost) {
        let type = 'turret';
        if (pos == 32) {
          type = 'bomb'
        }
        if (pos % 3 == 1 && pos != 31) {
          type = 'stunner'
        }
        let action = {action: 'build', pos: pos, type: type};
        pos = (pos + 1) % 100;
        built ++;
        if (built == 100) {
          pos = 0;
        }
        return action;
      }
    }
    else {
      if (me.gold >= me.upgradeCost) {
        let action = {action: 'upgrade', pos: pos, stat: 'power'};
        pos = (pos + 1) % 100;
        return action;
      }
    }
  }
}

function simpleInvaderArmy() {
  let FIRST_ACTIONS = [
    {action: 'build', type: 'turret', pos: 30},
    {action: 'build', type: 'turret', pos: 32},
    {action: 'build', type: 'stunner', pos: 31},
    null, null, null, null,
    null, null, null, null,
    {action: 'upgrade', stat: 'power', pos: 30},
    {action: 'upgrade', stat: 'power', pos: 32},
  ]
  return function decideAction(turnNumber, me, notme, attacking, defending) {
    // console.log(turnNumber, me, notme, attacking, defending)
    if (turnNumber <= FIRST_ACTIONS.length) {
      return FIRST_ACTIONS[turnNumber - 1];
    }
    // console.log(me.gold, BASE_INVADER_COST, me.boostMax, me.gold >= BASE_INVADER_COST + me.boostMax)
    if (me.gold >= BASE_INVADER_COST + me.boostMax) {
      return {action: 'spawn', hp: me.boostMax};
    }
  }
}

function newGame() {
  let game = new Game(
    "Placeholder (left)", simpleTurretBuilder(),
    "Placeholder (right)", simpleInvaderArmy()
  );
  game.run()
}

document.addEventListener('DOMContentLoaded', newGame, false);
