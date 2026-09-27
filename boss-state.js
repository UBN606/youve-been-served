/** Nonviolent encounter: influence is control over the arena, never bodily health. */
export const BOSS_RULES = Object.freeze({
  phaseSeconds: 5, tellSeconds: 1, maxStep: .1,
  guardSeconds: 4, exposedSeconds: 8, grayCooldownSeconds: 8,
  grayUltimate: 25, hitInfluence: 7, hitUltimate: 10, ultimateRequired: 100,
});

const PHASE_COLORS = { LoveBomb: '#f4ba85', Mirror: '#a2e7ee', FakeBond: '#e8ca9c', Devalue: '#b691d5', Discard: '#9ab4c3', SmearCampaign: '#bbb3d9', Hoover: '#e5b3bf' };
const phase = (id, name, tell, line, pattern, vectors) => Object.freeze({
  id, name, label: name, tell, line, pattern, kind: pattern, color: PHASE_COLORS[id],
  vectors: Object.freeze(vectors.map(([x, z]) => Object.freeze({ x, z }))),
});

/** Vectors are local visual directions; the game owns world position and aiming. */
export const BOSS_ATTACKS = Object.freeze([
  phase('LoveBomb', 'Love Bomb', 'Golden hearts gather around him.', "You're perfect. Please applaud immediately.", 'ring', [[0,1],[1,0],[0,-1],[-1,0]]),
  phase('Mirror', 'Mirror', 'A silver reflection copies your stance.', 'Funny, I also love whatever you love.', 'mirror', [[-1,0],[1,0]]),
  phase('FakeBond', 'Fake Bond', 'Two glowing threads twist together.', 'We have so much in common. I checked.', 'tether', [[0,1]]),
  phase('Devalue', 'Devalue', 'A violet spotlight narrows toward you.', 'You were more impressive before boundaries.', 'cone', [[0,1]]),
  phase('Discard', 'Discard', 'An empty spotlight swings away.', "You're dismissed. Please notice dramatically.", 'push', [[0,-1]]),
  phase('SmearCampaign', 'Smear Campaign', 'Whispering clouds circle the arena.', 'Everyone agrees with me. I asked me.', 'orbit', [[1,0],[0,1],[-1,0],[0,-1]]),
  phase('Hoover', 'Hoover', 'An inviting spiral curls inward.', "I've changed! Since that last sentence.", 'pull', [[0,1]]),
]);

const EPSILON = 1e-9;
const countdown = (value, dt) => value - dt > EPSILON ? value - dt : 0;

export class BossEncounter {
  constructor({ name = 'Caligastia', influencePerAttack = 6, phaseSeconds = BOSS_RULES.phaseSeconds, counterplay = false } = {}) {
    if (typeof name !== 'string' || !name.trim()) throw new TypeError('Boss name must be nonempty.');
    if (!Number.isFinite(influencePerAttack) || influencePerAttack < 0 || influencePerAttack > 100) throw new RangeError('influencePerAttack must be between 0 and 100.');
    if(!Number.isFinite(phaseSeconds)||phaseSeconds<BOSS_RULES.phaseSeconds)throw new RangeError('Phase duration must be at least five seconds.');
    this.phaseSeconds=phaseSeconds;this.counterplay=counterplay;
    this.name = name.trim();
    // Set to zero if the caller owns all incoming influence effects.
    this.influencePerAttack = influencePerAttack;
    this.reset();
  }

  get attack() { return BOSS_ATTACKS[this.phaseIndex]; }
  get tellLeft() { return this.active ? Math.max(0, BOSS_RULES.tellSeconds - this.phaseElapsed) : 0; }

  reset() {
    this.active = false;
    this.defeated = false;
    this.elapsed = 0;
    this.influence = 100;
    this.ultimate = 0;
    this.guardLeft = 0;
    this.exposedLeft = 0;
    this.grayCooldown = 0;
    this.phaseIndex = 0;
    this.phaseElapsed = 0;
    this.attackFired = false;this.countered=false;
    this.events = [];
    return this;
  }

  start() {
    if (this.active || this.defeated) return false;
    this.active = true;
    this._announcePhase();
    return true;
  }

  _announcePhase() {
    this.events.push({ type: 'attackchange', phaseIndex: this.phaseIndex, attack: this.attack,
      name: this.attack.name, tell: this.attack.tell, line: this.attack.line,
      duration: this.phaseSeconds, tellSeconds: BOSS_RULES.tellSeconds });
  }

  /** Caller supplies playing time only; no wall clock or independent timer runs. */
  update(dt) {
    if (!this.active) return;
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(BOSS_RULES.maxStep, dt)) : 0;
    if (!step) return;
    const guardBefore = this.guardLeft, phaseBefore = this.phaseElapsed;
    this.elapsed += step;
    this.phaseElapsed += step;
    this.guardLeft = countdown(this.guardLeft, step);
    this.exposedLeft = countdown(this.exposedLeft, step);
    this.grayCooldown = countdown(this.grayCooldown, step);
    if (!this.attackFired && this.phaseElapsed + EPSILON >= BOSS_RULES.tellSeconds) {
      this.attackFired = true;
      if (this.influencePerAttack > 0) {
        const pulseOffset = Math.max(0, BOSS_RULES.tellSeconds - phaseBefore);
        if (guardBefore - pulseOffset > EPSILON) {
          this.events.push({ type: 'blocked', source: 'boss', reason: 'gray-rock', attack: this.attack,
            influence: this.influence, line: 'No reaction. No invitation.' });
        } else {
          this.influence = Math.min(100, this.influence + this.influencePerAttack);
        }
      }
    }
    if (this.phaseElapsed + EPSILON >= this.phaseSeconds) {
      this.phaseElapsed = Math.max(0, this.phaseElapsed - this.phaseSeconds);
      this.phaseIndex = (this.phaseIndex + 1) % BOSS_ATTACKS.length;
      this.attackFired = false;
      this.countered=false;this._announcePhase();
    }
  }

  grayRock() {
    if (!this.active || this.grayCooldown > 0) return false;
    this.guardLeft = BOSS_RULES.guardSeconds;
    this.exposedLeft = this.counterplay?0:BOSS_RULES.exposedSeconds;
    this.grayCooldown = BOSS_RULES.grayCooldownSeconds;
    this.ultimate = Math.min(BOSS_RULES.ultimateRequired, this.ultimate + (this.counterplay?0:BOSS_RULES.grayUltimate));
    this.events.push({ type: 'grayrock', guardLeft: this.guardLeft, exposedLeft: this.exposedLeft,
      cooldown: this.grayCooldown, ultimate: this.ultimate, line: 'Calm. Clear. Unavailable for drama.' });
    return true;
  }

  counter() {
    if(!this.active||this.guardLeft<=0||this.countered)return false;
    this.countered=true;this.exposedLeft=BOSS_RULES.exposedSeconds;
    this.ultimate=Math.min(100,this.ultimate+25);
    this.influence=Math.max(0,this.influence-10);
    this.events.push({type:'counter',line:'BAIT DECLINED · INFLUENCE EXPOSED'});
    return true;
  }

  hit() {
    if (!this.active) return false;
    if (this.exposedLeft <= 0) {
      this.events.push({ type: 'blocked', source: 'player', reason: 'not-exposed', attack: this.attack,
        influence: this.influence, line: 'Gray Rock makes the influence vulnerable.' });
      return false;
    }
    this.influence = Math.max(0, this.influence - BOSS_RULES.hitInfluence);
    this.ultimate = Math.min(BOSS_RULES.ultimateRequired, this.ultimate + (this.counterplay?0:BOSS_RULES.hitUltimate));
    this.events.push({ type: 'bosshit', influence: this.influence, ultimate: this.ultimate, attack: this.attack });
    return true;
  }

  noContact() {
    if (!this.active || this.ultimate < BOSS_RULES.ultimateRequired) return false;
    this.influence = 0;
    this.ultimate = 0;
    this.active = false;
    this.defeated = true;
    this.guardLeft = this.exposedLeft = this.grayCooldown = 0;
    this.events.push({ type: 'no-contact', defeated: true, influence: 0,
      spentUltimate: BOSS_RULES.ultimateRequired, line: 'No contact. No audience. No influence.' });
    return true;
  }

  consumeEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }
}
