const ALIASES = Object.freeze({hero_served:'hero-served',hero_serve:'hero-serve',hero_worry:'hero-help',hero_selfish:'hero-selfish',citizen_saved:'citizen-saved',citizen_thanks:'citizen-thanks',citizen_else:'citizen-somebody',citizen_me:'citizen-aboutme',plea_boyfriend:'citizen-boyfriend',plea_girlfriend:'citizen-girlfriend','hero-grayrock':'hero-v3-grayrock','hero-nocontact':'hero-v3-nocontact'});
const LEGACY = Object.freeze({
  'hero-served':{category:'hero_rescue'},'hero-serve':{category:'hero_reflection'},
  'hero-selfish':{category:'hero_reflection'},'hero-help':{category:'hero_rescue'},
  'citizen-saved':{category:'citizenreaction',gender:'male'},
  'citizen-thanks':{category:'citizenreaction',gender:'female'},
  'citizen-boyfriend':{category:'citizenplea',gender:'female'},
  'citizen-girlfriend':{category:'citizenplea',gender:'male'},
  'citizen-somebody':{category:'citizenreaction',gender:'female',persona:'self-reflecting'},
  'citizen-aboutme':{category:'citizenreaction',gender:'male',persona:'self-reflecting'},
});

// Shared by playback and activation. Context keeps jokes about a changed selfish
// character out of a survivor's gratitude pool. Unspecified routing stays kind.
export function dialogueContextForClip(clip) {
  const legacy=LEGACY[clip.id]||{};
  const category=clip.category||legacy.category||null;
  let persona=clip.role==='hero'?'hero':category==='citizenplea'?'seeking-help':'grateful';
  if(legacy.persona)persona=legacy.persona;
  if(['citizen-v3-feelings','citizen-v3-dramatic-exit'].includes(clip.id))persona='self-reflecting';
  if(clip.id==='citizen-v3-donkey')persona='donkey-owner';
  if(clip.id==='citizen-v3-return-donkey')persona='donkey-borrower';
  return {category,gender:clip.gender||legacy.gender||(clip.role==='hero'?'male':null),
    persona:clip.persona||persona,context:clip.context||(clip.id==='hero-v3-rescue-coming-through'?'obstruction':'general')};
}

export class ArcadeAudio{
  constructor(options={}){
    this.enabled=true;this.context=null;this.nextBeat=0;this.beat=0;
    this.clips=new Map();this.speaking=false;this.voice=null;this.paused=false;
    this.onSubtitle=options.onSubtitle||null;
    this.now=options.now||(()=>performance.now()/1000);
    this.random=options.random||Math.random;
    this.audioFactory=options.audioFactory||(url=>new Audio(url));
    this.cooldowns={global:options.globalCooldown??.7,line:options.lineCooldown??35,category:options.categoryCooldown??3,speaker:options.speakerCooldown??4};
    this.nextSpeechAt=-Infinity;this.lineHistory=new Map();this.categoryHistory=new Map();this.speakerHistory=new Map();this.lastByPool=new Map();this.playCounts=new Map();this.token=0;
    const source=options.manifest?Promise.resolve(options.manifest):(options.fetcher||fetch)(options.manifestUrl||'./audio/dialogue-manifest.json').then(r=>{if(!r.ok)throw new Error('Dialogue unavailable');return r.json();});
    this.loaded=source.then(manifest=>{
      if(!Array.isArray(manifest.clips))throw new Error('Dialogue clips unavailable');
      for(const clip of manifest.clips){
        if(!clip.id||typeof clip.text!=='string'||!/^audio\/[\w./-]+$/.test(clip.file||'')||clip.file.split('/').includes('..')||!Number.isFinite(clip.durationSeconds)||clip.durationSeconds<=0)continue;
        this.clips.set(clip.id,{...clip,...dialogueContextForClip(clip)});
      }
      return this.clips.size;
    }).catch(error=>{console.warn(error.message);return 0;});
  }
  get playing(){return this.speaking&&!this.paused;}
  unlock(){if(!this.context){const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;this.context=new Context();this.master=this.context.createGain();this.master.gain.value=.35;this.master.connect(this.context.destination);}this.context.resume().catch(()=>{});}
  toggle(){this.enabled=!this.enabled;if(this.master)this.master.gain.setTargetAtTime(this.enabled?.35:0,this.context.currentTime,.05);if(this.voice)this.voice.muted=!this.enabled;return this.enabled;}
  _speakerKey(line,options){return options.speakerId?String(options.speakerId):`${line.role}:${line.gender||'any'}:${line.persona}`;}
  _eligible(line,options,now){
    const categoryWait=line.category==='hero_reflection'?Math.max(18,this.cooldowns.category):this.cooldowns.category;
    return now>=(this.lineHistory.get(line.id)??-Infinity)+this.cooldowns.line
      &&now>=(this.categoryHistory.get(line.category)??-Infinity)+categoryWait
      &&now>=(this.speakerHistory.get(this._speakerKey(line,options))??-Infinity)+this.cooldowns.speaker;
  }
  async say(id,onLine){
    const requestToken=this.token;
    await this.loaded;
    if(requestToken!==this.token)return false;
    const options=typeof onLine==='function'?{onSubtitle:onLine}:(onLine||{});
    const line=this.clips.get(this.clips.has(id)?id:(ALIASES[id]||id));
    if(!line||!this._eligible(line,options,this.now()))return false;
    return this._play(line,options);
  }
  async sayCategory(category,options={},onLine){
    const requestToken=this.token;
    await this.loaded;
    if(requestToken!==this.token)return false;
    if(typeof options==='function')options={onSubtitle:options};
    if(onLine)options={...options,onSubtitle:onLine};
    if(this.speaking||this.paused||this.now()<this.nextSpeechAt)return false;
    const persona=options.persona||options.speakerPersona||(category==='citizenplea'?'seeking-help':category==='citizenreaction'?'grateful':'hero');
    const context=options.context||'general';
    const now=this.now();
    let pool=[...this.clips.values()].filter(line=>line.category===category&&line.persona===persona
      &&(!options.gender||line.gender===options.gender)
      &&(line.context==='general'||line.context===context)&&this._eligible(line,options,now));
    if(!pool.length)return false;
    const poolKey=[category,persona,options.gender||'any',context].join(':');
    const last=this.lastByPool.get(poolKey);
    const withoutLast=pool.filter(line=>line.id!==last);
    if(withoutLast.length)pool=withoutLast;
    // Least-played selection cycles through eligible lines before repeating.
    const least=Math.min(...pool.map(line=>this.playCounts.get(line.id)||0));
    pool=pool.filter(line=>(this.playCounts.get(line.id)||0)===least);
    const sample=Math.min(.999999,Math.max(0,this.random()));
    return this._play(pool[Math.floor(sample*pool.length)],{...options,poolKey});
  }
  async _play(line,options){
    if(this.speaking||this.paused||this.now()<this.nextSpeechAt)return false;
    const token=++this.token;
    this.speaking=true;
    let voice;
    const finish=(cooldown=true)=>{
      if(token!==this.token)return;
      this.speaking=false;this.voice=null;
      if(cooldown)this.nextSpeechAt=this.now()+this.cooldowns.global;
    };
    try{
      voice=this.audioFactory(new URL(line.file, document.baseURI).href);this.voice=voice;
      voice.volume=.8;voice.muted=!this.enabled;
      voice.onended=()=>finish();voice.onerror=()=>finish(false);
      await voice.play();
      if(token!==this.token||this.voice!==voice)return false;
      if(this.paused)voice.pause();
      const now=this.now();
      this.lineHistory.set(line.id,now);this.categoryHistory.set(line.category,now);
      this.speakerHistory.set(this._speakerKey(line,options),now);
      this.playCounts.set(line.id,(this.playCounts.get(line.id)||0)+1);
      if(options.poolKey)this.lastByPool.set(options.poolKey,line.id);
      const subtitle={speaker:line.role==='hero'?'JESUS':'CITIZEN',text:line.text,duration:line.durationSeconds+.45,
        id:line.id,category:line.category,gender:line.gender,persona:line.persona,speakerId:options.speakerId||null};
      try{(options.onSubtitle||this.onSubtitle)?.(subtitle);}catch(error){console.warn('Subtitle callback failed:',error.message);}
      return true;
    }catch{if(voice&&token===this.token)voice.pause();finish(false);return false;}
  }
  stopSpeech({resetCooldowns=false}={}){
    this.token++;
    if(this.voice){this.voice.onended=null;this.voice.onerror=null;this.voice.pause();this.voice.currentTime=0;}
    this.voice=null;this.speaking=false;this.paused=false;this.nextSpeechAt=this.now();
    if(resetCooldowns){this.lineHistory.clear();this.categoryHistory.clear();this.speakerHistory.clear();this.lastByPool.clear();this.playCounts.clear();}
  }
  pauseSpeech(paused){
    this.paused=Boolean(paused);
    if(!this.voice||!this.speaking)return;
    const token=this.token;
    if(this.paused)this.voice.pause();else this.voice.play().catch(()=>{if(token===this.token){this.speaking=false;this.voice=null;}});
  }
  shot(){if(!this.context||!this.enabled)return;const t=this.context.currentTime,o=this.context.createOscillator(),g=this.context.createGain();o.type='sine';o.frequency.setValueAtTime(650,t);o.frequency.exponentialRampToValueAtTime(105,t+.25);g.gain.setValueAtTime(.16,t);g.gain.exponentialRampToValueAtTime(.001,t+.29);o.connect(g);g.connect(this.master);o.start();o.stop(t+.3);this.tone(1300,.13,.07,'triangle');}
  tone(freq,duration=.2,volume=.12,type='sine',delay=0){if(!this.enabled||!this.context)return;const t=this.context.currentTime+delay;const o=this.context.createOscillator(),g=this.context.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.009);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.01);}
  save(combo){this.tone(587.33,.42,.16,'triangle');this.tone(739.99,.4,.10,'sine',.06);this.tone(combo>=3?1174.66:880,.6,.13,'sine',.12);}
  pulse(){this.tone(220,.18,.07,'sine');this.tone(440,.3,.06,'triangle',.03);}
  dash(){if(!this.enabled||!this.context)return;const t=this.context.currentTime;const b=this.context.createBuffer(1,this.context.sampleRate*.17,this.context.sampleRate),data=b.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);const s=this.context.createBufferSource(),g=this.context.createGain(),f=this.context.createBiquadFilter();f.type='bandpass';f.frequency.value=1300;g.gain.value=.18;s.buffer=b;s.connect(f);f.connect(g);g.connect(this.master);s.start(t);}
  wave(){[293.66,369.99,440,587.33,739.99,880].forEach((f,i)=>this.tone(f,1,.12,'triangle',i*.055));}
  finish(won){(won?[293.66,369.99,440,587.33,880]:[293.66,349.23,440,587.33]).forEach((f,i)=>this.tone(f,1,.17,'triangle',i*.14));}
  update(playing){if(!playing||!this.context||!this.enabled)return;const t=this.context.currentTime;if(t<this.nextBeat)return;this.nextBeat=t+.28;const notes=[146.83,0,220,0,174.61,0,261.63,220,146.83,0,293.66,0,196,220,174.61,0];const n=notes[this.beat++%notes.length];if(n)this.tone(n,.26,.035,'triangle');if(this.beat%4===0)this.tone(73.42,.13,.06,'sine');}
}
