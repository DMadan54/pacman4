require('fast-text-encoding');
require('aframe');
require('aframe-extras');
require('aframe-particle-system-component');

import {intersections, maze} from './config.js';
import {Howl} from 'howler';

const pillDuration = 70;
const chaseDuration = 80;
const scatterDuration = 90;
const flashDuration = 20;

const startX = -6.4;
const startZ = -7.3;
const y = 0.8;
const step = .515;
const radius = .1;
const row = 29;
const col = 26;
const P = {
  WALL: -1,
  ROAD: 0,
  PELLET: 1,
  POWERPILL: 2 
};
const pColor = '#FFB897';
const gColor = 0x2121DE;
const playerSpeed = 0.7;
const playerBoostSpeed = 1.5;
const gFrenzySpeed = 1.8;
const eventInterval = 240; // ticks between events (~1 min at 250ms/tick)
const events = ['speedBoost', 'ghostFrenzy', 'starPower', 'doublePoints', 'speedBoost', 'ghostFrenzy', 'starPower', 'doublePoints', 'chaosMode'];
const eventDurations = {speedBoost: 120, ghostFrenzy: 120, starPower: 120, doublePoints: 120, chaosMode: 60};
const starColor = 0xFFD700; // gold
const turboColor = 0xFF4500; // orange-red
const gTurboSpeed = 3.5;
const gNormSpeed = 0.65;
const gSlowSpeed = 0.2;
const gFastSpeed = 1.5;
const gCollideDist = 0.6;
const pelletScore = 10;
const pillScore = 50;
const ghostScore = 200;
const cherryScore = 100;
const HALLOWEEN_THEME = {
  mazeOpacity: 1,
  mazeColor: 0xFF0000,
  pumpkinColor: 0xFF7A00,
  skyColor: '#000000',
  floorColor: '#000000',
  fog: '',
  logo: 'assets/images/halloween-logo.png'
};
const NORMAL_THEME = {
  mazeOpacity: 0.75,
  mazeColor: 0xFF69B4,
  skyColor: 'blue',
  floorColor: 'purple',
  logo: 'assets/images/logo.png'
};

let path = [];
let cherryEls = [];
let cherryPositions = [];
let halloweenPumpkinEls = [];
let halloweenPumpkinPositions = [];
let themeState = 'normal';
let blackFruitEl = null;
let blackFruitCollected = false;
let purpleFruitEl = null;
let pumpkinPellets = []; // stores {pumpkin, sphere, id} pairs for theme swaps
const FRUIT_POS = { x: startX + 17 * step, y, z: startZ + 22 * step };
// Pumpkin model is authored with an internal +Y offset, so compensate at placement.
const PUMPKIN_MODEL_Y_OFFSET = 2.2159;
let pCnt = 0;
let totalP = 0;
let targetPos;
let playerWorldPos = null;
let playerYaw = 0;
let dead = true;
let lifeCnt = 3;
let highScore;
let score = 0;
let pillCnt = 0;
let soundCtrl = true;

const siren = new Howl({
  src: ['assets/sounds/siren.mp3'],
  loop: true
});

const ghostEaten = new Howl({
  src: 'assets/sounds/ghost-eaten.mp3',
  loop: true
});

const waza = new Howl({
  src: 'assets/sounds/waza.mp3',
  loop: true
});

const ready = new Howl({
  src: ['assets/sounds/ready.mp3'],
  onend: () => {
    ready.stop();
    siren.play();
  }
});

const eating = new Howl({src: 'assets/sounds/eating.mp3'});
const eatPill = new Howl({src: 'assets/sounds/eatpill2.wav'});
const eatGhost = new Howl({src: 'assets/sounds/eat-ghost.mp3'});
const die = new Howl({src: 'assets/sounds/die.mp3'});

AFRAME.registerComponent('maze', {
  init: function () {
    this.el.addEventListener('model-loaded', () => {
      this.initSoundControl();
      this.initScene();
      this.initStartButton();

      // Cached high score
      let hs = localStorage.getItem('highscore');
      highScore = hs? parseInt(hs): 0;
      document.querySelector('#highscore').setAttribute('text', {
        'value': highScore
      });
    });
  },
  initLife: function () {
    lifeCnt = 3;
    renderLife(lifeCnt);
  },
  initSoundControl: function () {
    let soundEl = document.getElementById('sound');
    soundEl.addEventListener('click', () => {
      soundCtrl = !soundCtrl;
      let off = 'fa-volume-off';
      let on = 'fa-volume-up';
      soundEl.className = soundEl.className.replace(soundCtrl ? off : on, soundCtrl ? on : off);
      ready.mute(!soundCtrl);
      siren.mute(!soundCtrl);
      ghostEaten.mute(!soundCtrl);
      waza.mute(!soundCtrl);
      eating.mute(!soundCtrl);
      eatGhost.mute(!soundCtrl);
      eatPill.mute(!soundCtrl);
      die.mute(!soundCtrl);
    });
  },
  initScene: function () {
    // Ensure scene starts in normal theme.
    setOpacity(this.el, NORMAL_THEME.mazeOpacity);
    setMeshColor(this.el, NORMAL_THEME.mazeColor);
    const sceneEl = this.el.sceneEl;
    const skyEl = document.getElementById('sky') || document.querySelector('a-sky');
    if (skyEl) skyEl.setAttribute('color', NORMAL_THEME.skyColor);
    const floorEl = document.getElementById('floor') || document.querySelector('a-plane');
    if (floorEl) floorEl.setAttribute('color', NORMAL_THEME.floorColor);
    if (sceneEl) sceneEl.removeAttribute('fog');

    let cnt = 0;
    let line = [];
    
    sceneEl.addEventListener('enter-vr', () => {
      document.getElementById('sound').style.display = 'none';
      document.getElementById('github').style.display = 'none';
      let button = document.getElementById("start");
      if (button.innerHTML.indexOf('START') > -1 && button.style.display !== 'none') {
        button.style.display = 'none';
        this.start();
      }
    });
    sceneEl.addEventListener('exit-vr', () => {
      document.getElementById('sound').style.display = 'block';
      document.getElementById('github').style.display = 'block';
    });

    // Create pellets and power pills
    for (let i = 0; i < maze.length; i++) {
      let x = startX + i %  col * step; 
      let z = startZ + Math.floor(i / col) * step;
      if (maze[i] >= P.PELLET) {
        pCnt++;

        let sphere = document.createElement('a-sphere');
        sphere.setAttribute('color', pColor);
        sphere.setAttribute('radius', radius * maze[i]);
        sphere.setAttribute('position', `${x} ${y} ${z}`);
        sphere.setAttribute('id', `p${i}`);
        sphere.setAttribute('pellet', '');
        
        if (maze[i] >= P.POWERPILL) {
          let animation = document.createElement('a-animation');
          animation.setAttribute("attribute", "material.color");
          animation.setAttribute("from", pColor);
          animation.setAttribute("to", "white");
          animation.setAttribute("dur","500");
          animation.setAttribute("repeat","indefinite");
          sphere.appendChild(animation);
        }
        sceneEl.appendChild(sphere);

        // Pre-create pumpkin counterpart so theme swap is instant and reliable.
        const isPowerPill = maze[i] >= P.POWERPILL;
        const pumpkin = document.createElement('a-entity');
        pumpkin.setAttribute('gltf-model', '#pumpkin');
        pumpkin.setAttribute('position', `${x} ${y - PUMPKIN_MODEL_Y_OFFSET} ${z}`);
        pumpkin.setAttribute('id', `p${i}_pumpkin`);
        pumpkin.setAttribute('scale', isPowerPill ? '0.08 0.08 0.08' : '0.05 0.05 0.05');
        pumpkin.setAttribute('visible', false);
        tintEntityModel(pumpkin, HALLOWEEN_THEME.pumpkinColor);
        sceneEl.appendChild(pumpkin);
        pumpkinPellets.push({pumpkin, sphere, id: `p${i}`});
      }
      
      // Store positions in path
      line.push(maze[i] >= 0 ? [x, y, z, maze[i] > 0 ? i : P.WALL, maze[i]] : []); 
      cnt++;    
      if (cnt > (col - 1)) {
        path.push(line);
        line = [];
        cnt = 0;
      }
    }
    totalP = pCnt;
    this.initCherries();
    this.initHalloweenPumpkins();
    this.initThemeFruits();
  },
  initHalloweenPumpkins: function () {
    let sceneEl = this.el.sceneEl;
    const positions = [
      {x: startX + 15 * step, z: startZ + 22 * step}, // near player start
      {x: startX + 21 * step, z: startZ +  4 * step}, // top-right
      {x: startX +  1 * step, z: startZ + 18 * step}, // left-middle
    ];
    positions.forEach(({x: px, z: pz}, idx) => {
      let pumpkin = document.createElement('a-entity');
      pumpkin.setAttribute('halloween-trigger', '');
      pumpkin.setAttribute('gltf-model', '#pumpkin');
      pumpkin.setAttribute('position', `${px} ${y - PUMPKIN_MODEL_Y_OFFSET} ${pz}`);
      pumpkin.setAttribute('scale', '0.08 0.08 0.08');
      pumpkin.setAttribute('id', `halloween-pumpkin-${idx}`);
      tintEntityModel(pumpkin, HALLOWEEN_THEME.pumpkinColor);
      sceneEl.appendChild(pumpkin);
      halloweenPumpkinEls.push(pumpkin);
      halloweenPumpkinPositions.push({x: px, z: pz});
    });
  },
  initThemeFruits: function () {
    window._mazeEl = this.el;
    let sceneEl = this.el.sceneEl;

    blackFruitEl = document.createElement('a-sphere');
    blackFruitEl.setAttribute('color', '#111111');
    blackFruitEl.setAttribute('radius', '0.2');
    blackFruitEl.setAttribute('position', `${FRUIT_POS.x} ${FRUIT_POS.y} ${FRUIT_POS.z}`);
    blackFruitEl.setAttribute('id', 'black-fruit');
    blackFruitEl.setAttribute('visible', false);
    sceneEl.appendChild(blackFruitEl);

    purpleFruitEl = document.createElement('a-sphere');
    purpleFruitEl.setAttribute('color', '#800080');
    purpleFruitEl.setAttribute('radius', '0.2');
    purpleFruitEl.setAttribute('position', `${FRUIT_POS.x} ${FRUIT_POS.y} ${FRUIT_POS.z}`);
    purpleFruitEl.setAttribute('id', 'purple-fruit');
    purpleFruitEl.setAttribute('visible', false);
    sceneEl.appendChild(purpleFruitEl);
  },
  initCherries: function () {
    let sceneEl = this.el.sceneEl;
    const positions = [
      {x: startX + 14 * step, z: startZ + 22 * step}, // near player start
      {x: startX + 20 * step, z: startZ +  3 * step}, // top-right
      {x: startX +  0 * step, z: startZ + 19 * step}, // left-middle
    ];
    positions.forEach(({x: cx, z: cz}) => {
      let sphere = document.createElement('a-sphere');
      sphere.setAttribute('cherry', '');
      sphere.setAttribute('color', 'red');
      sphere.setAttribute('radius', '0.2');
      sphere.setAttribute('position', `${cx} ${y} ${cz}`);
      sceneEl.appendChild(sphere);
      cherryEls.push(sphere);
      cherryPositions.push({x: cx, z: cz});
    });
  },
  initStartButton: function () {
    let button = document.getElementById("start");
    if (button) {
      button.addEventListener('click', this.start.bind(this));
      button.innerHTML = "START";
      button.disabled = false;
    }
  },
  start: function () {
    this.initLife();
    blackFruitCollected = false;

    // Reset theme before restoring pellets (switchToNormal restores sphere elements)
    if (themeState === 'halloween' && window._mazeEl) switchToNormal(window._mazeEl);

    const allPellets = document.querySelectorAll('[pellet]');
    allPellets.forEach(p => p.setAttribute('visible', true));
    pCnt = totalP;
    // TESTING: leave only the pellet closest to player spawn
    let closest = null, closestDist = Infinity;
    allPellets.forEach(p => {
      const pos = p.getAttribute('position');
      const d = Math.sqrt(pos.x * pos.x + (pos.z - 4) * (pos.z - 4));
      if (d < closestDist) { closestDist = d; closest = p; }
    });
    allPellets.forEach(p => { if (p !== closest) p.setAttribute('visible', false); });
    pCnt = 1;
    cherryEls.forEach(c => c.setAttribute('visible', true));
    halloweenPumpkinEls.forEach(p => p.setAttribute('visible', true));

    if (blackFruitEl) blackFruitEl.setAttribute('visible', true);
    if (purpleFruitEl) purpleFruitEl.setAttribute('visible', false);

    document.getElementById("logo").style.display = 'none';
    document.getElementById("start").style.display = 'none';
    document.getElementById("gameover").style.display = 'none';
    document.getElementById("ready").style.display = 'block';

    score = 0;
    document.querySelector('#score').setAttribute('text', {
      'value': score
    });

    ready.play();
    restart(3000);
  }
});

AFRAME.registerComponent('player', {
  init: function () {
    this.tick = AFRAME.utils.throttleTick(this.tick, 250, this);
    this.waveCnt = 0;
    this.eventTimer = eventInterval;
    this.eventDuration = 0;
    this.currentEvent = null;
    this.starPowerActive = false;
    this.doublePoints = false;
    this.scoreFrenzy = false;
    this.turboGhostEl = null;
    this.hitGhosts = [];
    this.ghosts = document.querySelectorAll('[ghost]');
    const personalities = ['blinky', 'pinky', 'inky', 'clyde'];
    // Scatter corners: each ghost retreats to their own maze corner in scatter mode
    const scatterCorners = [
      new THREE.Vector3(startX + 25 * step, 0, startZ),                  // Blinky: top-right
      new THREE.Vector3(startX,             0, startZ),                   // Pinky:  top-left
      new THREE.Vector3(startX + 25 * step, 0, startZ + 28 * step),      // Inky:   bottom-right
      new THREE.Vector3(startX,             0, startZ + 28 * step),       // Clyde:  bottom-left
    ];
    let blinkyGhost = null;
    this.ghosts.forEach((g, i) => {
      g.personality    = personalities[i % personalities.length];
      g.scatterCorner  = scatterCorners[i % scatterCorners.length];
      if (g.personality === 'blinky') blinkyGhost = g;
    });
    // Give Inky a reference to Blinky so it can use his position for targeting
    this.ghosts.forEach(g => { g.blinkyRef = blinkyGhost; });
    this.player = document.querySelector('[player]');
    this.currentBg = siren;
    this.nextBg = siren;
  },
  tick: function () {
    if (!dead && path.length >= row){
      if (themeState === 'halloween') applyThemeVisuals('halloween');
      this.nextBg = siren;

      let position = this.el.getAttribute('position');
      let x = position.x;
      let y = position.y;
      let z = position.z;
      playerWorldPos = new THREE.Vector3(x, y, z);

      this.updatePlayerDest(x, y, z);
      this.onCollideWithPellets(x, z);
      this.onCollideWithCherry(x, z);
      this.onCollideWithHalloweenPumpkin(x, z);
      this.onCollideWithFruit(x, z);
      this.updateGhosts(x, z);
      this.updateMode(position);
      this.updateEvent();
      
      // Update score
      document.querySelector('#score').setAttribute('text', {
        value: score
      });

      // Update background sound
      if (this.nextBg && this.currentBg != this.nextBg) {
        this.currentBg.stop();
        this.nextBg.play();
        this.currentBg = this.nextBg;
      } 
    }
  },
  updatePlayerDest: function (x, y, z) {
    let camera = document.querySelector("a-camera");
    const lookControls = camera.components['look-controls'];
    const yaw = lookControls && lookControls.yawObject ? lookControls.yawObject.rotation.y : 0;
    playerYaw = yaw;

    let _z = step * Math.cos(yaw);
    let _x = step * Math.sin(yaw);
    let z_ = Math.round((z - _z - startZ)/step);
    let x_ = Math.round((x - _x - startX)/step);
    let i = z_ > row - 1 ? row - 1: z_ < 0 ? 0 : z_;
    let j = x_ > col - 1 ? col - 1 : x_ < 0 ? 0 : x_;

    if (i === 13 && j === 0) // Tunnel
      this.el.object3D.position.set(path[13][24][0], y, path[13][24][2]);
    else if (i === 13 && j === 25)
      this.el.object3D.position.set(path[13][1][0], y, path[13][1][2]);
    else {
      let newPos = path[i][j];
      if (newPos && newPos.length > 0)
        updateAgentDest(this.player, new THREE.Vector3(newPos[0], 0, newPos[2]));
    }
  },
  updateGhosts: function (x, z) {
    let ghosts = this.ghosts;
    for (var i = 0; i < ghosts.length; i++) {
      if (ghosts[i].dead) this.nextBg = ghostEaten;

      this.onCollideWithGhost(ghosts[i], x, z, i);

      if (ghosts[i].slow) {
        if (pillCnt === 1) { // Leave pill mode
          updateGhostColor(ghosts[i].object3D, ghosts[i].defaultColor);

          ghosts[i].slow = false;
          ghosts[i].setAttribute('nav-agent', {
            speed: gNormSpeed
          });
        } else if (pillCnt > 1) {
          if (pillCnt < flashDuration && pillCnt % 2 === 0) // Flash
            updateGhostColor(ghosts[i].object3D, 0xFFFFFF);
          else
            updateGhostColor(ghosts[i].object3D, gColor);
        }
      }
    }
  },
  updateMode: function (position) {
    targetPos = null;
    if (pillCnt > 0) {
      pillCnt--;
      if (this.nextBg != ghostEaten) this.nextBg = waza;
    } else {
      // Scatter and chase
      this.waveCnt = this.waveCnt > (chaseDuration + scatterDuration) ? 0: this.waveCnt + 1;
      if (this.waveCnt > scatterDuration) 
        targetPos = position;
    }
  },
  onGameOver: function (win) {
    this.nextBg = undefined;
    siren.stop();
    waza.stop();
    ghostEaten.stop();
    
    this.el.sceneEl.exitVR();

    let gameoverEl = document.getElementById("gameover");
    gameoverEl.innerHTML = win ? 'YOU WIN' : 'GAME OVER';
    if (win) 
      gameoverEl.classList.add("blink");
    else
      gameoverEl.classList.remove("blink");
    gameoverEl.style.display = 'block';

    let startEl = document.getElementById("start");
    startEl.innerHTML = 'RESTART';
    startEl.style.display = 'block';
  },
  onCollideWithGhost: function (ghost, x, z, i) {
    let ghostX = ghost.getAttribute('position').x;
    let ghostZ = ghost.getAttribute('position').z;

    if (Math.abs(ghostX - x) < gCollideDist && Math.abs(ghostZ - z) < gCollideDist) {
      if (!ghost.dead){
        if (ghost.slow || this.starPowerActive) {
          eatGhost.play();

          this.hitGhosts.push(i);
          ghost.dead = true;
          ghost.slow = false;

          // Move to ghost house
          ghost.setAttribute('nav-agent', {
            active: false,
            speed: gFastSpeed,
          });
          updateAgentDest(ghost, ghost.defaultPos);

          setOpacity(ghost, 0.3);
          score += ghostScore * this.hitGhosts.length * (this.doublePoints ? 2 : 1) * (this.scoreFrenzy ? 4 : 1);
        } else if (!this.starPowerActive) {
          this.onDie();
          return;
        }
      }
    }
  },
  onCollideWithPellets: function (x, z) {
    let i = Math.round((z - startZ)/step);
    let j = Math.round((x - startX)/step);
    let currentP = path[i > row - 1 ? row - 1 : i < 0 ? 0 : i][j > col - 1 ? col - 1 : j < 0 ? 0 : j];

    if (currentP && currentP[4] >= P.PELLET) {
      let pellet = document.querySelector(`#p${currentP[3]}`);
      if (pellet && pellet.getAttribute('visible')) {
        pCnt--;
        pellet.setAttribute('visible', false);

        // Power pill
        if (currentP[4] >= P.POWERPILL) {
          eatPill.play();
          score += pillScore * (this.doublePoints ? 2 : 1) * (this.scoreFrenzy ? 4 : 1);
          this.onEatPill();
        } else {
          eating.play();
          score += pelletScore * (this.doublePoints ? 2 : 1) * (this.scoreFrenzy ? 4 : 1);
        }
      }
      if (pCnt < 1) this.onWin();
    }
  },
  onCollideWithCherry: function (x, z) {
    for (let i = 0; i < cherryEls.length; i++) {
      if (!cherryEls[i].object3D.visible) continue;
      let pos = cherryPositions[i];
      if (Math.abs(pos.x - x) < 0.5 && Math.abs(pos.z - z) < 0.5) {
        cherryEls[i].setAttribute('visible', false);
        score += cherryScore * (this.doublePoints ? 2 : 1) * (this.scoreFrenzy ? 4 : 1);
        eating.play();
      }
    }
  },
  onCollideWithHalloweenPumpkin: function (x, z) {
    for (let i = 0; i < halloweenPumpkinEls.length; i++) {
      if (!halloweenPumpkinEls[i].object3D.visible) continue;
      let pos = halloweenPumpkinPositions[i];
      if (Math.abs(pos.x - x) < 0.5 && Math.abs(pos.z - z) < 0.5) {
        halloweenPumpkinEls[i].setAttribute('visible', false);
        score += cherryScore * (this.doublePoints ? 2 : 1) * (this.scoreFrenzy ? 4 : 1);
        eating.play();
        break;
      }
    }
  },
  onCollideWithFruit: function (x, z) {
    if (blackFruitEl && blackFruitEl.object3D && blackFruitEl.object3D.visible) {
      const pos = blackFruitEl.getAttribute('position');
      if (Math.abs(pos.x - x) < 0.5 && Math.abs(pos.z - z) < 0.5) {
        blackFruitEl.setAttribute('visible', false);
        blackFruitCollected = true;
        eating.play();
        switchToHalloween(window._mazeEl);
      }
    }
    if (purpleFruitEl && purpleFruitEl.object3D && purpleFruitEl.object3D.visible) {
      const pos = purpleFruitEl.getAttribute('position');
      if (Math.abs(pos.x - x) < 0.5 && Math.abs(pos.z - z) < 0.5) {
        eating.play();
        switchToNormal(window._mazeEl);
      }
    }
  },
  onEatPill: function () {
    pillCnt = pillDuration;
    this.hitGhosts = [];
    this.ghosts.forEach(ghost => {
      updateGhostColor(ghost.object3D, gColor);
      ghost.slow = true;
      ghost.setAttribute('nav-agent', {
        speed: gSlowSpeed
      });
    });
  },
  onWin: function () {
    this.stop();
    const savedScore = score;
    playCutscene(() => {
      document.querySelector('[maze]').components.maze.start();
      // Preserve score across levels
      score = savedScore;
      document.querySelector('#score').setAttribute('text', {value: score});
    });
  },
  onDie: function () {
    die.play();

    this.stop();

    // Rotate replayer
    let player = this.player;
    player.setAttribute('nav-agent', {
      active: false
    });
    let animation = document.createElement('a-animation');
    animation.setAttribute("attribute","rotation");
    animation.setAttribute("to", "0 720 0");
    animation.setAttribute("dur","2000");
    animation.setAttribute("easing", "linear");
    animation.setAttribute("repeat","0");
    player.appendChild(animation);

    setTimeout(() => {
      // Restart
      if(lifeCnt > 0) {
        player.removeChild(animation);
        restart(1500);
      } else 
        this.onGameOver(false);
    }, 1000);
  },
  updateEvent: function () {
    const countdown = document.getElementById('event-countdown');
    if (this.eventDuration > 0) {
      this.eventDuration--;
      const secs = Math.ceil(this.eventDuration / 4);
      const eventLabel = this.currentEvent === 'speedBoost' ? '⚡ BOOST'
        : this.currentEvent === 'ghostFrenzy' ? '👻 FRENZY'
        : this.currentEvent === 'starPower' ? '⭐ STAR POWER'
        : this.currentEvent === 'doublePoints' ? '2X POINTS'
        : this.currentEvent === 'chaosMode' ? '🔥 CHAOS'
        : '⚡ EVENT';
      countdown.innerHTML = eventLabel + ': ' + secs + 's';
      if (this.eventDuration === 0) this.onEventEnd();
    } else {
      this.eventTimer--;
      const secsToNext = Math.ceil(this.eventTimer / 4);
      countdown.innerHTML = 'EVENT IN: ' + secsToNext + 's';
      countdown.style.display = 'block';
      if (this.eventTimer <= 0) {
        this.eventTimer = eventInterval;
        this.onEventStart(); // sets this.eventDuration internally
      }
    }
  },
  onEventStart: function () {
    this.currentEvent = events[Math.floor(Math.random() * events.length)];
    this.eventDuration = eventDurations[this.currentEvent];
    const banner = document.getElementById('event-banner');

    if (this.currentEvent === 'speedBoost') {
      this.player.setAttribute('nav-agent', {speed: playerBoostSpeed});
      banner.innerHTML = '⚡ SPEED BOOST!';
      banner.style.color = 'cyan';
    } else if (this.currentEvent === 'ghostFrenzy') {
      this.ghosts.forEach(g => g.setAttribute('nav-agent', {speed: gFrenzySpeed}));
      banner.innerHTML = '👻 GHOST FRENZY!';
      banner.style.color = 'red';
    } else if (this.currentEvent === 'starPower') {
      this.starPowerActive = true;
      this.ghosts.forEach(g => {
        if (!g.dead) {
          updateGhostColor(g.object3D, starColor);
          g.setAttribute('nav-agent', {speed: gSlowSpeed});
        }
      });
      banner.innerHTML = '⭐ STAR POWER!';
      banner.style.color = 'gold';
    } else if (this.currentEvent === 'doublePoints') {
      this.doublePoints = true;
      banner.innerHTML = '2X POINTS!';
      banner.style.color = '#00FF88';
    } else if (this.currentEvent === 'chaosMode') {
      this.scoreFrenzy = true;
      const alive = Array.from(this.ghosts).filter(g => !g.dead);
      if (alive.length > 0) {
        this.turboGhostEl = alive[Math.floor(Math.random() * alive.length)];
        updateGhostColor(this.turboGhostEl.object3D, turboColor);
        this.turboGhostEl.setAttribute('nav-agent', {speed: gTurboSpeed});
      }
      banner.innerHTML = '🔥 CHAOS MODE!';
      banner.style.color = 'orangered';
    }

    banner.style.display = 'block';
    setTimeout(() => banner.style.display = 'none', 2000);
  },
  onEventEnd: function () {
    if (this.currentEvent === 'speedBoost') {
      this.player.setAttribute('nav-agent', {speed: playerSpeed});
    } else if (this.currentEvent === 'ghostFrenzy') {
      this.ghosts.forEach(g => g.setAttribute('nav-agent', {speed: gNormSpeed}));
    } else if (this.currentEvent === 'starPower') {
      this.starPowerActive = false;
      this.ghosts.forEach(g => {
        if (!g.dead) {
          updateGhostColor(g.object3D, g.defaultColor);
          g.setAttribute('nav-agent', {speed: gNormSpeed});
        }
      });
    } else if (this.currentEvent === 'doublePoints') {
      this.doublePoints = false;
    } else if (this.currentEvent === 'chaosMode') {
      this.scoreFrenzy = false;
      if (this.turboGhostEl && !this.turboGhostEl.dead) {
        updateGhostColor(this.turboGhostEl.object3D, this.turboGhostEl.defaultColor);
        this.turboGhostEl.setAttribute('nav-agent', {speed: gNormSpeed});
      }
      this.turboGhostEl = null;
    }
    this.currentEvent = null;
    document.getElementById('event-banner').style.display = 'none';
  },
  stop: function () {
    disableCamera();
    dead = true;
    pillCnt = 0;
    this.waveCnt = 0;
    this.eventTimer = eventInterval;
    this.eventDuration = 0;
    this.currentEvent = null;
    this.starPowerActive = false;
    this.doublePoints = false;
    this.scoreFrenzy = false;
    if (this.turboGhostEl && !this.turboGhostEl.dead) {
      updateGhostColor(this.turboGhostEl.object3D, this.turboGhostEl.defaultColor);
    }
    this.turboGhostEl = null;
    document.getElementById('event-banner').style.display = 'none';
    document.getElementById('event-countdown').style.display = 'none';
    this.player.setAttribute('nav-agent', {speed: playerSpeed});
    this.ghosts.forEach(g => g.setAttribute('nav-agent', {speed: gNormSpeed}));

    // Update score
    if (score > highScore) {
      highScore = score;
      document.querySelector('#highscore').setAttribute('text', {
        'value': highScore
      });
      localStorage.setItem('highscore', highScore);
    }

    // Stop ghosts
    this.ghosts.forEach(ghost => {
      ghost.setAttribute('nav-agent', {
        active: false,
        speed: gNormSpeed
      });
    });

    // Move ghosts to ghost house
    this.ghosts.forEach(ghost => {
      ghost.dead = false;
      ghost.slow = false;
      updateGhostColor(ghost.object3D, ghost.defaultColor);
      setOpacity(ghost, 1);
      ghost.object3D.position.set(ghost.defaultPos.x, ghost.defaultPos.y, ghost.defaultPos.z);
    });
  }
});

AFRAME.registerComponent('ghost', {
  schema: {type: 'string'}, 
  init: function () {
    let el = this.el;
    let pos = el.getAttribute('position');
    el.defaultPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    el.defaultColor = this.data;
    el.addEventListener('model-loaded', () => updateGhostColor(el.object3D, el.defaultColor));
    el.addEventListener('navigation-end', this.onNavEnd.bind(this));
  },
  onNavEnd: function () {
    let el = this.el;
    if (el.dead) {
      el.dead = false;
      el.slow = false;
      setOpacity(el, 1);
      updateGhostColor(el.object3D, el.defaultColor);
      el.setAttribute('nav-agent', {
        speed: gNormSpeed
      });
    }
    updateAgentDest(el, computeGhostTarget(el));
  }
}); 

function playCutscene(onComplete) {
  const overlay = document.getElementById('cutscene-overlay');
  const video   = document.getElementById('cutscene-video');
  const skip    = document.getElementById('cutscene-skip');
  let finished  = false;

  overlay.style.display = 'block';
  video.currentTime = 0;
  video.play();

  const done = () => {
    if (finished) return;
    finished = true;
    overlay.style.display = 'none';
    video.pause();
    video.currentTime = 0;
    video.removeEventListener('ended', done);
    overlay.removeEventListener('click', done);
    document.removeEventListener('keydown', done);
    onComplete();
  };

  video.addEventListener('ended', done);
  overlay.addEventListener('click', done);
  document.addEventListener('keydown', done);
}

// Classic Pac-Man ghost AI — each ghost has a distinct targeting personality
function randomIntersection() {
  const p = Math.floor(Math.random() * intersections.length);
  return new THREE.Vector3(startX + intersections[p][0] * step, 0, startZ + intersections[p][1] * step);
}

function computeGhostTarget(ghost) {
  if (!playerWorldPos) return randomIntersection();

  // Scatter mode: every ghost retreats to their dedicated maze corner
  if (!targetPos) return ghost.scatterCorner ? ghost.scatterCorner.clone() : randomIntersection();

  switch (ghost.personality) {
    case 'blinky':
      // Shadow — direct pursuit, always targets the player's exact position
      return playerWorldPos.clone();

    case 'pinky': {
      // Speedy — ambush, targets 4 tiles ahead of the player's facing direction
      const ahead = 4 * step;
      return new THREE.Vector3(
        playerWorldPos.x + Math.sin(playerYaw) * ahead,
        0,
        playerWorldPos.z + Math.cos(playerYaw) * ahead
      );
    }

    case 'inky': {
      // Bashful — the most complex: uses Blinky's position as a reference.
      // 1. Find the point 2 tiles ahead of the player.
      // 2. Draw a vector from Blinky to that point and double it.
      // This creates an unpredictable flanking effect that depends on where Blinky is.
      const pivot = new THREE.Vector3(
        playerWorldPos.x + Math.sin(playerYaw) * 2 * step,
        0,
        playerWorldPos.z + Math.cos(playerYaw) * 2 * step
      );
      const bPos = (ghost.blinkyRef && !ghost.blinkyRef.dead)
        ? ghost.blinkyRef.object3D.position
        : playerWorldPos;
      return new THREE.Vector3(
        pivot.x + (pivot.x - bPos.x),
        0,
        pivot.z + (pivot.z - bPos.z)
      );
    }

    case 'clyde': {
      // Pokey — chases when far (> 8 tiles), retreats to his corner when close.
      // Prevents him from being a reliable threat and creates herding pressure.
      const gPos = ghost.object3D.position;
      const dx = gPos.x - playerWorldPos.x;
      const dz = gPos.z - playerWorldPos.z;
      if (Math.sqrt(dx * dx + dz * dz) < 8 * step)
        return ghost.scatterCorner ? ghost.scatterCorner.clone() : randomIntersection();
      return playerWorldPos.clone();
    }

    default:
      return playerWorldPos.clone();
  }
}

function setOpacity(object, opacity) {
  const mesh = object.getObject3D('mesh');
  if (!mesh) return;
  mesh.traverse(node => {
    if (node.isMesh) {
      node.material.opacity = opacity;
      node.material.transparent = opacity < 1.0;
      node.material.needsUpdate = true;
    }
  });
}

function setMeshColor(object, colorHex) {
  const mesh = object.getObject3D('mesh');
  if (!mesh) return;
  mesh.traverse(node => {
    if (!node.isMesh || !node.material) return;
    const applyToMat = (mat) => {
      if (!mat) return;
      if (mat.color && typeof mat.color.setHex === 'function') mat.color.setHex(colorHex);
      if (mat.emissive && typeof mat.emissive.setHex === 'function') mat.emissive.setHex(0x000000);
      if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0;
      mat.needsUpdate = true;
    };
    if (Array.isArray(node.material)) node.material.forEach(applyToMat);
    else applyToMat(node.material);
  });
}

function setSolidMeshColor(object, colorHex) {
  const mesh = object.getObject3D('mesh');
  if (!mesh) return;
  mesh.traverse(node => {
    if (!node.isMesh || !node.material) return;
    const applyToMat = (mat) => {
      if (!mat) return;
      if ('map' in mat) mat.map = null;
      if ('emissiveMap' in mat) mat.emissiveMap = null;
      if (mat.color && typeof mat.color.setHex === 'function') mat.color.setHex(colorHex);
      if (mat.emissive && typeof mat.emissive.setHex === 'function') mat.emissive.setHex(0x000000);
      if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0;
      if ('metalness' in mat) mat.metalness = 0;
      if ('roughness' in mat) mat.roughness = 1;
      mat.needsUpdate = true;
    };
    if (Array.isArray(node.material)) node.material.forEach(applyToMat);
    else applyToMat(node.material);
  });
}

function tintEntityModel(entity, colorHex) {
  const tint = () => {
    const model = entity.getObject3D('mesh');
    if (!model) return;
    model.traverse(node => {
      if (!node.isMesh || !node.material) return;
      const applyToMat = (mat) => {
        if (!mat) return;
        if ('map' in mat) mat.map = null;
        if ('emissiveMap' in mat) mat.emissiveMap = null;
        if (mat.color && typeof mat.color.setHex === 'function') mat.color.setHex(colorHex);
        if (mat.emissive && typeof mat.emissive.setHex === 'function') mat.emissive.setHex(0x000000);
        if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0;
        if ('metalness' in mat) mat.metalness = 0;
        if ('roughness' in mat) mat.roughness = 1;
        mat.needsUpdate = true;
      };
      if (Array.isArray(node.material)) node.material.forEach(applyToMat);
      else applyToMat(node.material);
    });
  };

  tint();
  entity.addEventListener('model-loaded', tint, {once: true});
}

function applyThemeVisuals(mode) {
  const isHalloween = mode === 'halloween';
  const theme = isHalloween ? HALLOWEEN_THEME : NORMAL_THEME;
  const mazeEl = window._mazeEl;

  if (mazeEl) {
    setOpacity(mazeEl, theme.mazeOpacity);
    if (isHalloween) setSolidMeshColor(mazeEl, theme.mazeColor);
    else setMeshColor(mazeEl, theme.mazeColor);
  }

  const skyEl = document.getElementById('sky') || document.querySelector('a-sky');
  if (skyEl) skyEl.setAttribute('color', theme.skyColor);

  const floorEl = document.getElementById('floor') || document.querySelector('a-plane');
  if (floorEl) floorEl.setAttribute('color', theme.floorColor);
}

function switchToHalloween(mazeEl) {
  if (!mazeEl || themeState === 'halloween') return;
  themeState = 'halloween';
  applyThemeVisuals('halloween');

  const sceneEl = document.querySelector('a-scene');
  if (sceneEl) sceneEl.removeAttribute('fog');

  const logoEl = document.getElementById('logo');
  if (logoEl) logoEl.src = HALLOWEEN_THEME.logo;

  // Re-apply after a short delay to avoid model/material timing races.
  setTimeout(() => applyThemeVisuals('halloween'), 50);

  // Swap pre-built sphere pellets to pumpkin pellets.
  pumpkinPellets.forEach(({pumpkin, sphere, id}) => {
    const isVisible = sphere.getAttribute('visible') !== false;
    pumpkin.setAttribute('id', id);
    pumpkin.setAttribute('pellet', '');
    pumpkin.setAttribute('visible', isVisible);
    sphere.setAttribute('id', `${id}_orig`);
    sphere.removeAttribute('pellet');
    sphere.setAttribute('visible', false);
  });

  cherryEls.forEach(c => c.setAttribute('visible', false));
  if (blackFruitEl) blackFruitEl.setAttribute('visible', false);
  if (purpleFruitEl) purpleFruitEl.setAttribute('visible', true);
}

function switchToNormal(mazeEl) {
  if (!mazeEl || themeState === 'normal') return;
  themeState = 'normal';
  applyThemeVisuals('normal');

  const sceneEl = document.querySelector('a-scene');
  if (sceneEl) sceneEl.removeAttribute('fog');

  const logoEl = document.getElementById('logo');
  if (logoEl) logoEl.src = NORMAL_THEME.logo;

  // Restore sphere pellets and hide pumpkin counterparts.
  pumpkinPellets.forEach(({pumpkin, sphere, id}) => {
    const isVisible = pumpkin.getAttribute('visible') !== false;
    sphere.setAttribute('id', id);
    sphere.setAttribute('pellet', '');
    sphere.setAttribute('visible', isVisible);
    pumpkin.setAttribute('id', `${id}_pumpkin`);
    pumpkin.removeAttribute('pellet');
    pumpkin.setAttribute('visible', false);
  });

  cherryEls.forEach(c => {
    if (c.object3D && c.object3D.visible) c.setAttribute('visible', true);
  });
  // Pumpkin pickups behave like cherries: remain collectable across themes unless eaten.
  if (purpleFruitEl) purpleFruitEl.setAttribute('visible', false);
  if (blackFruitEl) blackFruitEl.setAttribute('visible', !blackFruitCollected);
}

function updateAgentDest(object, dest) {
  object.setAttribute('nav-agent', {
    active: true,
    destination: dest
  });
}

function updateGhostColor(ghost, color) {
  ghost.traverse(child => {
    if (child instanceof THREE.Mesh && child.material.name === 'ghostmat')
      child.material.color.setHex(color);
  });
}

function movePlayerToDefaultPosition() {
  const player = document.querySelector('[player]');
  player.object3D.position.set(0, 0, 4);
  player.object3D.rotation.set(0, 0, 0);
}

function disableCamera() {
  const camera = document.querySelector("a-camera");
  camera.removeAttribute('look-controls');
  camera.setAttribute('look-controls', {
    'enabled': false
  });
}

function enableCamera() {
  const camera = document.querySelector("a-camera");
  camera.removeAttribute('look-controls');
  camera.setAttribute('look-controls', {
    'pointerLockEnabled': true
  });
}

function updateLife() {  
  if (lifeCnt > 0) {
    lifeCnt--;
    renderLife(lifeCnt);
  }
}

function renderLife(cnt) {
  let lifeEls = document.querySelectorAll("[life]");
  for (let i = 0; i < cnt; i++) {
    lifeEls[i].setAttribute('visible', true);
  }
  for (let i = lifeEls.length - 1; i >= cnt; i--) {
    lifeEls[i].setAttribute('visible', false);
  }
}

function restart(timeout) {
  movePlayerToDefaultPosition();
  setTimeout(() => {
    document.getElementById("ready").style.display = 'none';
    document.querySelectorAll('[ghost]')
      .forEach(ghost => updateAgentDest(ghost, ghost.defaultPos));
    dead = false;
    updateLife();
    enableCamera();
  }, timeout);    
}
