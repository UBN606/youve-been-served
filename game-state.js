export const RULES=Object.freeze({duration:90,waveSize:6,rescueRadius:3.6,waveRadius:8.2,rescueCooldown:.48,comboWindow:7,dashDuration:.24,dashCooldown:1.05,walkSpeed:4.2,dashSpeed:12,radius:.43});
export function canStand(x,z,colliders,radius=RULES.radius){
  return !colliders.some(b=>{const qx=Math.max(b.minX,Math.min(x,b.maxX)),qz=Math.max(b.minZ,Math.min(z,b.maxZ));return (x-qx)**2+(z-qz)**2<radius**2;});
}
export function slideMove(pos,dx,dz,colliders,bounds,radius=RULES.radius){
  // Substeps preserve collisions even during a dash or a slow frame.
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/(.35*radius)));
  let {x,z}=pos;
  for(let i=0;i<steps;i++){
    const nx=Math.max(bounds.minX+radius,Math.min(bounds.maxX-radius,x+dx/steps));
    if(canStand(nx,z,colliders,radius))x=nx;
    const nz=Math.max(bounds.minZ+radius,Math.min(bounds.maxZ-radius,z+dz/steps));
    if(canStand(x,nz,colliders,radius))z=nz;
  }
  return {x,z};
}
// A block opens a short, single-use counter opportunity against its sender.
export class CounterFlow{
  constructor(){this.reset();}
  reset(){this.guard=0;this.cooldown=0;this.window=0;this.owner=null;this.blocks=0;this.counters=0;}
  tick(dt){for(const key of ['guard','cooldown','window'])this[key]=Math.max(0,this[key]-Math.max(0,dt));}
  defend(){if(this.cooldown>0)return false;this.guard=.9;this.cooldown=2.4;return true;}
  block(owner){if(this.guard<=0)return false;this.blocks++;this.owner=owner;this.window=3;return true;}
  counter(owner){if(this.window<=0||owner!==this.owner)return false;this.window=0;this.counters++;return true;}
}
export class GameSession{
  constructor(spawns,{finalBoss=false}={}){this.finalBoss=finalBoss;this.spawns=spawns.map((s,i)=>({...s,id:i}));this.phase='ready';this.reset();this.phase='ready';}
  reset(){this.composure=6;this.hurtCooldown=0;this.stage='rescue';this.people=this.spawns.map(p=>({...p,saved:false}));this.won=false;this.timeLeft=RULES.duration;this.elapsed=0;this.score=0;this.saved=0;this.combo=0;this.bestCombo=0;this.lastSave=-Infinity;this.cooldown=0;this.dashLeft=0;this.dashCooldown=0;this.grace=0;this.events=[];this.phase='playing';}
  tick(dt){if(this.phase!=='playing')return;dt=Math.max(0,Math.min(dt,.1));this.hurtCooldown=Math.max(0,this.hurtCooldown-dt);this.elapsed+=dt;this.timeLeft=Math.max(0,this.timeLeft-dt);this.cooldown=Math.max(0,this.cooldown-dt);this.dashLeft=Math.max(0,this.dashLeft-dt);this.dashCooldown=Math.max(0,this.dashCooldown-dt);if(this.elapsed-this.lastSave>RULES.comboWindow)this.combo=0;if(this.timeLeft<=0)this.finish(false);}
  takeHit(){
    if(this.phase!=='playing'||this.hurtCooldown>0||this.dashLeft>0)return false;
    this.composure=Math.max(0,this.composure-1);this.hurtCooldown=1.5;this.combo=0;
    this.events.push({type:'hurt',composure:this.composure});
    if(this.composure===0)this.finish(false);
    return true;
  }
  togglePause(){if(this.phase==='playing')this.phase='paused';else if(this.phase==='paused')this.phase='playing';return this.phase;}
  dash(){if(this.phase!=='playing'||this.dashCooldown>0)return false;this.dashLeft=RULES.dashDuration;this.dashCooldown=RULES.dashCooldown;this.events.push({type:'dash'});return true;}
  rescue(x,z,wave=false){
    if(this.phase!=='playing'||this.cooldown>0||wave&&this.grace<100)return [];
    if(wave)this.grace=0;
    this.cooldown=wave?.9:RULES.rescueCooldown;
    const radius=wave?RULES.waveRadius:RULES.rescueRadius;
    const hits=this.people.filter(p=>!p.saved&&this.available(p)&&Math.hypot(p.x-x,p.z-z)<=radius);
    this.events.push({type:'pulse',x,z,radius,wave,hits:hits.length});
    return this._save(hits);
  }
  available(person){return person.wave===undefined||person.wave<=Math.floor(this.saved/RULES.waveSize);}
  serve(id){if(this.phase!=='playing')return [];const person=this.people.find(p=>p.id===id&&!p.saved&&this.available(p));return this._save(person?[person]:[]);}
  _save(hits){
    for(const p of hits){
      this.combo=this.elapsed-this.lastSave<=RULES.comboWindow?this.combo+1:1;this.lastSave=this.elapsed;
      const multiplier=Math.min(5,1+Math.floor((this.combo-1)/3));const points=100*multiplier;
      p.saved=true;this.saved++;this.score+=points;this.bestCombo=Math.max(this.bestCombo,this.combo);this.grace=Math.min(100,this.grace+20);
      this.timeLeft=Math.min(RULES.duration,this.timeLeft+1.5);
      this.events.push({type:'saved',id:p.id,x:p.x,z:p.z,label:p.label,points,combo:this.combo,multiplier});
    }
    if(this.saved===this.people.length&&this.people.length>0&&this.stage==='rescue'){
      if(this.finalBoss){this.stage='boss';this.composure=6;this.timeLeft=Math.max(70,this.timeLeft);this.grace=100;this.events.push({type:'boss-start'});}
      else this.finish(true);
    }
    return hits;
  }
  finish(won){if(this.phase!=='playing')return;this.phase='finished';this.won=won;const bonus=won?Math.floor(this.timeLeft)*20:0;this.score+=bonus;this.events.push({type:'finish',won,bonus});}
  nearest(x,z){let nearest=null,distance=Infinity;for(const p of this.people){if(p.saved||!this.available(p))continue;const d=Math.hypot(p.x-x,p.z-z);if(d<distance){nearest=p;distance=d;}}return nearest?{...nearest,distance}:null;}
  consumeEvents(){const events=this.events;this.events=[];return events;}
}
