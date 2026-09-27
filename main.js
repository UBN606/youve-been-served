import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {createWorld} from './world.js';
import {lightCourtyard,createContactShadows} from './courtyard-lighting.js';
import {loadCitizens} from './crowd-assets.js';
import {GameSession,RULES,slideMove,CounterFlow} from './game-state.js';
import {ArcadeAudio,BossConversation} from './audio.js';
import {createNavigation} from './navigation.js';
import {loadMeshyTeacher} from './meshy-teacher-asset.js';
import {BossEncounter} from './boss-state.js';
import {createBossView} from './boss-view.js';
import {createControllerInput,readGamepads} from './controller-input.js';
import {installEducation} from './education-ui.js';
import {loadScannedProps} from './scanned-props.js';

const $=id=>document.getElementById(id);const audio=new ArcadeAudio({onPlaybackError:()=>{$('audio').textContent='TAP FOR VOICES';showToast('Tap SOUND to enable voices');}});
const conversation=new BossConversation(audio,subtitle);
const boss=new BossEncounter({phaseSeconds:10,counterplay:true}),controller=createControllerInput();let bossView,bossWinDelay=0,contactCooldown=0;
const phoneProfile=matchMedia('(pointer:coarse)').matches&&Math.min(innerWidth,innerHeight)<800;
const keys=new Set();let touch={x:0,y:0};let frameTime=0,worldTime=0,savePose=0,toastLife=0,uiTick=0,mapTick=0,gamepadSave=false,gamepadDash=false,gamepadWave=false;
let contactShadows,renderer,composer,scene,camera,world,teacher,session,citizens,particles,particlePositions,particleColors,particleData=[],particleCursor=0,ao,bloom;
let cameraMode='chase',cameraYaw=0,cameraPitch=.32,drag=null,lastFrame=performance.now(),quality=true,lastMotion=new THREE.Vector3(0,0,-1),velocity=0;
const combat=new CounterFlow();let practice=-1,practiceClock=0;
let fallingStones=[],stoneClock=5;const stoneGeometry=new THREE.IcosahedronGeometry(.85,1),stoneMaterial=new THREE.MeshStandardMaterial({color:'#aa9275',roughness:.92,metalness:0});
let ripples=[],floaters=[],markers=[],timeSamples=[],fps=60,best=0;
let navigation,bolts=[],shotCooldown=0,mouseFire=false,voiceClock=0,quipIndex=0,pleaIndex=0,dialogueLife=0,releaseRanks=[];
const boltGeometry=new THREE.SphereGeometry(.17,12,8),boltMaterial=new THREE.MeshBasicMaterial({color:'#fff5bf'});
const SHOT_RANGE=12;
try{best=Math.max(0,Number(localStorage.getItem('mercy-run-best')||0));}catch{}
const tmp=new THREE.Vector3(),cameraTarget=new THREE.Vector3(),camDesired=new THREE.Vector3();
const colors={gold:new THREE.Color('#ffd06e'),mint:new THREE.Color('#b7ffe0'),sand:new THREE.Color('#dcc494')};
// Transparent glow cards should not become solid rectangles in the AO buffer.
class GameAO extends GTAOPass{_overrideVisibility(){super._overrideVisibility();this.scene.traverse(o=>{if(o.visible&&(o.isSprite||(o.material?.transparent&&!o.material?.alphaTest))){o.visible=false;this._visibilityCache.push(o);}});}}

function fatal(error){console.error(error);$('loading').classList.add('hidden');$('fatal').classList.remove('hidden');$('error-message').textContent='The 3D renderer could not start. Try a current browser with hardware acceleration, then reload. '+(error?.message||'');}
function texture(draw,size=128){const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
const glowTexture=texture((c,s)=>{const g=c.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.8)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,s,s);});
function markerTexture(saved=false,hostile=false){return texture((c,s)=>{c.shadowColor=saved?'#7fffc5':'#ffe6a1';c.shadowBlur=9;c.fillStyle=saved?'#94ffd0':hostile?'#dc9cff':'#ffd272';c.beginPath();c.moveTo(s/2,12);c.lineTo(s-14,s/2);c.lineTo(s/2,s-12);c.lineTo(14,s/2);c.closePath();c.fill();c.shadowBlur=0;c.fillStyle='#204b3b';c.font='bold 67px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(saved?'✓':hostile?'!':'+',s/2,s/2+2);});}
const pendingTexture=markerTexture(),savedTexture=markerTexture(true),hostileTexture=markerTexture(false,true);
const hostileId=id=>id%3===2;let foeShots=[];const foeMaterial=new THREE.MeshBasicMaterial({color:'#d89aff'});

async function init(){
  const loadingText=$('loading').querySelector('small');
  THREE.DefaultLoadingManager.onProgress=(_url,loaded)=>{loadingText.textContent=`Preparing characters and scenery: ${loaded} files loaded.`;};
  renderer=new THREE.WebGLRenderer({canvas:$('game'),antialias:!phoneProfile,powerPreference:'high-performance'});
  quality=!phoneProfile;renderer.setPixelRatio(Math.min(devicePixelRatio,phoneProfile?1:1.75));renderer.setSize(innerWidth,innerHeight);$('quality').textContent=quality?'HIGH':'SMOOTH';
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.info.autoReset=false;
  scene=new THREE.Scene();
  lightCourtyard(scene,renderer,{mobile:phoneProfile});
  camera=new THREE.PerspectiveCamera(49,innerWidth/innerHeight,.12,220);
  world=createWorld(scene,{compact:true});navigation=createNavigation(world.colliders,world.bounds);teacher=await loadMeshyTeacher(phoneProfile?'./assets/muapi-teacher/tripo-detailed-v1/derivatives-v2/teacher-mobile.glb':'./assets/muapi-teacher/tripo-detailed-v1/derivatives-v2/teacher-desktop.glb',{localRig:true,rigProfile:'tripo-arms-down',forwardYaw:-Math.PI/2});scene.add(teacher.group);teacher.group.position.set(world.spawn.x,0,world.spawn.z);teacher.group.rotation.y=Math.PI;const maps=await world.assetsReady;if(maps.failures)throw new Error('City material files failed to load.');
  try{const scans=await loadScannedProps({world,mobile:phoneProfile});scans.userData.staged=false;scene.add(scans);world.scannedProps=scans.userData;}catch(error){console.warn('Optional scanned scenery unavailable:',error.message);}
  session=new GameSession(world.rescueSpawns,{finalBoss:true});bossView=await createBossView(scene);$('total').textContent=session.people.length;$('intro-total').textContent=session.people.length;
  const releaseOrder=[...session.spawns].sort((a,b)=>Math.hypot(a.x-world.spawn.x,a.z-world.spawn.z)-Math.hypot(b.x-world.spawn.x,b.z-world.spawn.z));for(let rank=0;rank<releaseOrder.length;rank++)releaseRanks[releaseOrder[rank].id]=rank;
  citizens=await loadCitizens(session.people.length);
  for(let i=0;i<citizens.length;i++){const p=session.people[i],actor=citizens[i];actor.group.position.set(p.x,0,p.z);actor.group.rotation.y=(i*2.399)%6.28;scene.add(actor.group);}
  contactShadows=createContactShadows(scene,[teacher,...citizens]);
  markers=session.people.map((p,i)=>{
    const mat=new THREE.SpriteMaterial({map:hostileId(i)?hostileTexture:pendingTexture,transparent:true,depthWrite:false});const sprite=new THREE.Sprite(mat);sprite.position.set(p.x,3.1,p.z);sprite.scale.set(.68,.68,1);scene.add(sprite);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.57,.64,40),new THREE.MeshBasicMaterial({color:'#ffe2a0',transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(p.x,.035,p.z);scene.add(ring);
    return {sprite,ring,savedAt:-100};
  });
  // Thin player compass keeps the controlled figure legible against stone.
  const playerRing=new THREE.Mesh(new THREE.RingGeometry(.53,.58,48),new THREE.MeshBasicMaterial({color:'#e8f7db',transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false}));playerRing.rotation.x=-Math.PI/2;playerRing.position.y=.027;teacher.group.add(playerRing);
  const n=700;particlePositions=new Float32Array(n*3);particleColors=new Float32Array(n*3);particlePositions.fill(-1000);particleData=Array.from({length:n},()=>({life:0,vx:0,vy:0,vz:0}));const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(particlePositions,3));pg.setAttribute('color',new THREE.BufferAttribute(particleColors,3));particles=new THREE.Points(pg,new THREE.PointsMaterial({size:.22,map:glowTexture,vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));particles.frustumCulled=false;scene.add(particles);
  const target=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{samples:phoneProfile?2:4});composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));ao=new GameAO(scene,camera,innerWidth,innerHeight);ao.blendIntensity=.95;ao.updateGtaoMaterial({radius:1.1,distanceExponent:1.5,thickness:1,distanceFallOff:1});composer.addPass(ao);bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.16,.45,1.4);bloom.enabled=quality;composer.addPass(bloom);composer.addPass(new OutputPass());
  scene.traverse(o=>{if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.map)m.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}});
  camera.position.set(9,10,30);camera.lookAt(-2,1,17);renderer.compile(scene,camera);
  ao.enabled=quality;resize();bindInputs();installEducation({isPlaying:()=>session.phase==='playing',togglePause:pause});clearTimeout(window.__gameBootTimer);$('fatal').classList.add('hidden');$('loading').classList.add('hidden');lastFrame=performance.now();requestAnimationFrame(frame);
  window.__mercy={snapshot:()=>({audio:{enabled:audio.enabled,state:audio.context?.state??'locked',speaking:audio.speaking,error:audio.lastError,played:[...audio.playCounts.keys()]},practice,blocks:combat.blocks,counters:combat.counters,guard:combat.guard,counterWindow:combat.window,phase:session.phase,composure:session.composure,conversation:conversation.active,score:session.score,saved:session.saved,total:session.people.length,timeLeft:session.timeLeft,combo:session.combo,grace:session.grace,position:{x:teacher.group.position.x,z:teacher.group.position.z},nearest:session.nearest(teacher.group.position.x,teacher.group.position.z),cameraMode,fps:Math.round(fps),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,renderSize:{width:renderer.domElement.width,height:renderer.domElement.height},renderProfile:{phone:phoneProfile,quality:quality?'high':'smooth',pixelRatio:renderer.getPixelRatio(),antialias:renderer.getContext().getContextAttributes().antialias,samples:composer.renderTarget1.samples,shadows:renderer.shadowMap.enabled,ambientOcclusion:ao.enabled,bloom:bloom.enabled},scannedProps:world.scannedProps,people:session.people.map(p=>({id:p.id,x:p.x,z:p.z,saved:p.saved})),bolts:bolts.length,colliders:world.colliders.length,worldSeed:260926,stage:session.stage,boss:{active:boss.active,defeated:boss.defeated,influence:boss.influence,ultimate:boss.ultimate,grayCooldown:boss.grayCooldown,attack:boss.attack.name},teacher:teacher.group.userData.asset,voiceClips:audio.clips.size,version:'0.5.2'})};
}
function emit(x,y,z,count,color,force=1){for(let j=0;j<count;j++){const i=particleCursor++%particleData.length,p=particleData[i];p.life=.5+Math.random()*.65;p.max=p.life;p.vx=(Math.random()-.5)*force*3;p.vy=(.6+Math.random()*2)*force;p.vz=(Math.random()-.5)*force*3;particlePositions[i*3]=x;particlePositions[i*3+1]=y;particlePositions[i*3+2]=z;particleColors[i*3]=color.r;particleColors[i*3+1]=color.g;particleColors[i*3+2]=color.b;}}
function pulse(e){const r=new THREE.Mesh(new THREE.RingGeometry(.94,1,80),new THREE.MeshBasicMaterial({color:e.wave?'#b9ffe1':'#ffde8a',transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false}));r.rotation.x=-Math.PI/2;r.position.set(e.x,.06,e.z);scene.add(r);ripples.push({mesh:r,life:0,max:e.wave?.95:.5,radius:e.radius});emit(e.x,.3,e.z,e.wave?65:18,e.wave?colors.mint:colors.gold,e.wave?2.2:1);savePose=.55;if(e.wave)audio.wave();else if(!e.hits)audio.pulse();}
function subtitle(line){if(!line)return;$('dialogue').textContent=`${line.speaker}: “${line.text}”`;$('dialogue').classList.add('show');dialogueLife=line.duration||4;}
function say(id){return audio.say(id,subtitle);}
function sayCategory(category,options={}){return audio.sayCategory(category,{...options,onSubtitle:subtitle});}
function citizenVoice(id){return {gender:id%2?'female':'male',speakerId:`citizen-${id}`,persona:id===4?'donkey-owner':id===6?'donkey-borrower':id%5===0?'self-reflecting':'seeking-help'};}
function reaction(id){const voice=citizenVoice(id);if(['seeking-help','donkey-owner'].includes(voice.persona))voice.persona='grateful';return sayCategory('citizenreaction',voice).then(played=>!played&&voice.persona==='donkey-borrower'?sayCategory('citizenreaction',{...voice,persona:'grateful'}):played);}
function ambientDialogue(){
  const nearby=session.people.filter(p=>!p.saved&&session.available(p)&&!['self-reflecting','donkey-borrower'].includes(citizenVoice(p.id).persona)).sort((a,b)=>Math.hypot(a.x-teacher.group.position.x,a.z-teacher.group.position.z)-Math.hypot(b.x-teacher.group.position.x,b.z-teacher.group.position.z));
  if(pleaIndex++%3===2||!nearby.length)sayCategory('hero_reflection');
  else sayCategory('citizenplea',citizenVoice(nearby[Math.floor(pleaIndex/3)%Math.min(3,nearby.length)].id));
}
function clearSight(a,b){const distance=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(distance/.35);for(let i=1;i<steps;i++){const f=i/steps,x=a.x+(b.x-a.x)*f,z=a.z+(b.z-a.z)*f;if(world.colliders.some(o=>x>o.minX&&x<o.maxX&&z>o.minZ&&z<o.maxZ))return false;}return true;}
function rescue(wave=false){
  if(session?.phase!=='playing'||boss.active&&conversation.active)return;
  if(wave){
    if(practice>=0||!boss.active){if(combat.defend()){if(practice>=0){combat.guard=2;combat.cooldown=1.4;}pulse({x:teacher.group.position.x,z:teacher.group.position.z,radius:2,wave:true,hits:0});actionText('GRAY ROCK',teacher.group.position);}return;}
    if(boss.active){if(boss.grayRock()){pulse({x:teacher.group.position.x,z:teacher.group.position.z,radius:8.2,wave:true,hits:0});say('hero-grayrock');}return;}
    const charged=session.grace>=100;session.rescue(teacher.group.position.x,teacher.group.position.z,true);if(charged)sayCategory('hero_rescue');return;
  }
  if(shotCooldown>0)return;shotCooldown=.34;savePose=.32;
  const pos=teacher.group.position;const reserved=new Set(bolts.map(b=>b.target));
  const targets=session.people.filter(p=>!p.saved&&(practice>=0?p.id===0:session.available(p))&&!reserved.has(p.id)&&Math.hypot(p.x-pos.x,p.z-pos.z)<SHOT_RANGE&&clearSight(pos,p));
  targets.sort((a,b)=> (combat.window>0?Number(b.id===combat.owner)-Number(a.id===combat.owner):0)||Math.hypot(a.x-pos.x,a.z-pos.z)-Math.hypot(b.x-pos.x,b.z-pos.z));
  const target=boss.active&&Math.hypot(bossView.group.position.x-pos.x,bossView.group.position.z-pos.z)<SHOT_RANGE&&clearSight(pos,bossView.group.position)?{id:'boss',...bossView.group.position}:targets[0];const direction=target?new THREE.Vector3(target.x-pos.x,0,target.z-pos.z).normalize():new THREE.Vector3(-Math.sin(cameraYaw),0,-Math.cos(cameraYaw));
  if(target&&velocity<.1)teacher.group.rotation.y=Math.atan2(direction.x,direction.z);
  const mesh=new THREE.Mesh(boltGeometry,boltMaterial);mesh.position.copy(pos).addScaledVector(direction,.65);mesh.position.y=1.35;
  const aura=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color:'#ffcc57',transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));aura.scale.set(1.35,1.35,1);mesh.add(aura);scene.add(mesh);bolts.push({mesh,target:target?.id,direction,life:1.45});audio.shot();
}
function dash(){if(session?.dash())audio.dash();}
function noContact(){if(session?.phase!=='playing'||!boss.noContact())return;conversation.reset();audio.stopSpeech({resetCooldowns:true});say('hero-nocontact');showToast('YOU ARE IN QUARANTINE.');pulse({x:teacher.group.position.x,z:teacher.group.position.z,radius:32,wave:true,hits:1});bossWinDelay=2.4;session.timeLeft=Math.max(5,session.timeLeft);session.score+=1500;}
function showToast(message){$('toast').textContent=message;$('toast').classList.add('show');toastLife=1.35;}
function start(skipPractice=false){practice=skipPractice===true?-1:0;practiceClock=0;combat.reset();for(const stone of fallingStones){scene.remove(stone.mesh,stone.ring);stone.ring.geometry.dispose();stone.ring.material.dispose();}fallingStones=[];stoneClock=5;audio.unlock();audio.stopSpeech({resetCooldowns:true});conversation.reset();session.reset();boss.reset();bossView.clear();bossWinDelay=0;contactCooldown=0;$('boss-hud').classList.add('hidden');$('chapter').innerHTML='<span>01 / LOVE BOMB</span><small>Read the spread. Dash through the gap.</small>';controller.reset();keys.clear();touch={x:0,y:0};mouseFire=false;shotCooldown=0;voiceClock=0;quipIndex=0;pleaIndex=0;dialogueLife=0;$('dialogue').classList.remove('show');for(const b of bolts){scene.remove(b.mesh);b.mesh.children[0].material.dispose();}bolts=[];teacher.group.position.set(world.spawn.x,0,world.spawn.z);teacher.group.rotation.y=Math.PI;cameraYaw=0;lastMotion.set(0,0,-1);velocity=0;savePose=0;toastLife=0;
  for(const b of foeShots)scene.remove(b.mesh);foeShots=[];for(const c of citizens)c.setSaved?.(false);for(const [i,m] of markers.entries()){m.savedAt=-100;m.sprite.material.map=hostileId(i)?hostileTexture:pendingTexture;m.sprite.material.opacity=1;m.ring.visible=true;}
  for(const r of ripples){scene.remove(r.mesh);r.mesh.geometry.dispose();r.mesh.material.dispose();}ripples=[];
  for(const f of floaters)f.el.remove();floaters=[];for(const p of particleData)p.life=0;
  for(const id of ['intro','results','pause-screen'])$(id).classList.add('hidden');for(const id of ['hud','bottom','map-wrap','chapter','mobile'])$(id).classList.remove('hidden');$('app').classList.add('playing');$('game').focus();if(practice>=0){session.people[0].x=0;session.people[0].z=16;practiceHint();say('hero_serve');}else{showToast('ENCOUNTER 1 · LOVE BOMB');say('hero_serve');conversation.start({id:'LoveBomb'});}updateHUD();
}
function actionText(text,pos){const el=document.createElement('div');el.className='floating';el.textContent=text;$('floaters').appendChild(el);floaters.push({el,x:pos.x,z:pos.z,y:2.2,life:1.5});}
function practiceHint(){$('chapter').innerHTML='<span>PRACTICE · TIMER PAUSED</span><small>'+['Serve the marked neighbor. Space / A / SERVE.','Block incoming bait just before impact. Q / Y / GRAY ROCK.','Block again if needed, then SERVE within 3 seconds.'][practice]+'</small>';}
function practiceUpdate(dt){practiceClock+=dt;if(practice>0&&practiceClock>2.8){practiceClock=0;const p=session.people[0],hero=teacher.group.position,angle=Math.atan2(hero.x-p.x,hero.z-p.z);const mesh=new THREE.Mesh(boltGeometry,foeMaterial);mesh.position.set(p.x,1.1,p.z);scene.add(mesh);foeShots.push({mesh,owner:0,life:8,speed:3,dx:Math.sin(angle),dz:Math.cos(angle)});}}
function pause(){if(!session)return;const phase=session.togglePause();$('pause-screen').classList.toggle('hidden',phase!=='paused');keys.clear();mouseFire=false;touch={x:0,y:0};audio.pauseSpeech(phase!=='playing');if(phase==='playing')$('game').focus();}
function finish(e){keys.clear();touch={x:0,y:0};audio.finish(e.won);best=Math.max(best,session.score);try{localStorage.setItem('mercy-run-best',String(best));}catch{}
  $('result-kicker').textContent=e.won?'EVERYONE REACHED. EVERY SECOND MATTERED.':'ROUND COMPLETE';$('result-title').innerHTML=e.won?'THAT\'S A CITY<br>FULL OF HOPE.':'YOU MADE<br>A DIFFERENCE.';$('result-summary').textContent=`${session.saved} of ${session.people.length} neighbors saved. ${e.won?`${e.bonus.toLocaleString()} time-bonus points. `:''}${session.saved===0?'Follow a golden beacon, get close, then press Space.':'Every one of them counts.'}`;$('final-score').textContent=session.score.toLocaleString();$('final-streak').textContent=session.bestCombo;$('final-blocks').textContent=combat.blocks;$('final-counters').textContent=combat.counters;$('best-score').textContent=best.toLocaleString();$('results').classList.remove('hidden');$('again').focus();}
function handleEvents(){for(const e of session.consumeEvents()){
  if(e.type==='pulse')pulse(e);
  if(e.type==='saved'){
    if(session.stage==='rescue'){
      const wave=Math.min(2,Math.floor(session.saved/RULES.waveSize));
      if(session.saved%RULES.waveSize===0)conversation.start({id:['LoveBomb','Mirror','SmearCampaign'][wave]});
      $('chapter').innerHTML=['<span>01 / LOVE BOMB</span><small>Read the spread. Dash through the gap.</small>','<span>02 / MIRROR</span><small>It aims where you were. Change direction.</small>','<span>03 / SMEAR CAMPAIGN</span><small>A wide barrage. Keep your distance.</small>'][wave];
    }citizens[e.id].setSaved?.(true);markers[e.id].savedAt=worldTime;markers[e.id].sprite.material.map=savedTexture;markers[e.id].ring.visible=false;emit(e.x,1.5,e.z,35,colors.gold,1.5);audio.save(e.combo);showToast(e.combo>=3?`${e.combo} SERVED IN A ROW!`:'YOU\'VE BEEN SERVED!');if(!audio.speaking){if(++quipIndex%4===0)sayCategory('hero_rescue',{context:citizenVoice(e.id).persona==='self-reflecting'?'obstruction':'general'});else reaction(e.id);}const el=document.createElement('div');el.className='floating';el.textContent=`SERVED! +${e.points}`;$('floaters').appendChild(el);floaters.push({el,x:e.x,z:e.z,y:2.8,life:1.5});}
  if(e.type==='hurt'){actionText('−30 PATIENCE',teacher.group.position);showToast('COMPOSURE HIT · '+e.composure+'/6 · DASH TO EVADE');$('app').animate([{filter:'brightness(1.5) saturate(.4)'},{filter:'none'}],{duration:220});}
  if(e.type==='finish')finish(e);
  if(e.type==='boss-start'){
    boss.start();teacher.group.position.set(0,0,12);teacher.group.rotation.y=Math.PI;cameraYaw=0;session.timeLeft=Math.max(70,session.timeLeft);
    $('boss-hud').classList.remove('hidden');$('chapter').innerHTML='<span>04 / CALIGASTIA</span><small>Gray Rock. Break influence. No Contact.</small>';showToast('CALIGASTIA · THE MAIN CHARACTER SYNDROME');
    audio.stopSpeech();voiceClock=0;
  }
}}
function updateHUD(){$('app').classList.toggle('practice',practice>=0);$('composure').textContent='PATIENCE '+session.composure*30+'/180';const time=Math.ceil(session.timeLeft);$('score').textContent=String(session.score).padStart(5,'0');$('timer').textContent=practice>=0?'LEARN':`${Math.floor(time/60)}:${String(time%60).padStart(2,'0')}`;$('timer-fill').style.transform=`scaleX(${session.timeLeft/RULES.duration})`;$('saved').textContent=session.saved;$('app').classList.toggle('urgent',session.timeLeft<=15&&session.phase==='playing');$('combo').classList.toggle('hidden',session.combo<2||session.phase!=='playing'||session.stage==='boss');$('combo-count').textContent=session.combo;$('combo-fill').style.transform=`scaleX(${Math.max(0,1-(session.elapsed-session.lastSave)/RULES.comboWindow)})`;$('grace-fill').style.width=(1-combat.cooldown/2.4)*100+'%';$('grace-label').textContent=combat.guard>0?'BLOCKING':combat.cooldown>0?combat.cooldown.toFixed(1)+'s':'READY · Q / Y';$('touch-wave').style.opacity=combat.cooldown>0?'.45':'1';
  const near=session.nearest(teacher.group.position.x,teacher.group.position.z);const ready=near&&near.distance<=SHOT_RANGE&&clearSight(teacher.group.position,near);$('hint').classList.toggle('ready',Boolean(ready));$('hint').lastElementChild.textContent=near?(ready?'Hold to serve · auto aim':`Find the next crowd · ${Math.ceil(near.distance)}m`):'Everyone has been served';
  if(session.stage==='boss'){
    $('boss-influence').style.width=boss.influence+'%';$('boss-phase').textContent=boss.defeated?'INFLUENCE BROKEN':boss.attack.name.toUpperCase();
    $('boss-tell').textContent=boss.defeated?'No contact. No audience. No influence.':boss.guardLeft>0?'GRAY ROCK: INTERCEPT A PROJECTILE':boss.attack.tell;
    $('grace-fill').style.width=(1-boss.grayCooldown/8)*100+'%';$('grace-label').textContent=boss.grayCooldown>0?`${boss.grayCooldown.toFixed(1)}s`:'READY · Q / Y';$('touch-wave').style.opacity=boss.grayCooldown>0?'.5':'1';
    $('hint').lastElementChild.textContent=boss.ultimate>=100?'NO CONTACT READY · R / X':boss.exposedLeft>0?'Influence exposed · hold to serve':'Dodge or intercept bait with Q / Y';
  }
  $('contact-fill').style.width=boss.ultimate+'%';$('contact-label').textContent=boss.ultimate>=100?'READY · R / X':session.stage==='boss'?Math.floor(boss.ultimate)+'%':'Unlock in the final encounter';$('touch-contact').disabled=boss.ultimate<100;
}
function drawMap(){const c=$('map').getContext('2d'),s=180,toX=x=>(x-world.bounds.minX)/(world.bounds.maxX-world.bounds.minX)*s,toY=z=>(z-world.bounds.minZ)/(world.bounds.maxZ-world.bounds.minZ)*s;c.clearRect(0,0,s,s);c.fillStyle='#d3bd8322';for(const b of world.colliders)c.fillRect(toX(b.minX),toY(b.minZ),(b.maxX-b.minX)/(world.bounds.maxX-world.bounds.minX)*s,(b.maxZ-b.minZ)/(world.bounds.maxZ-world.bounds.minZ)*s);
  for(const p of session.people){c.fillStyle=p.saved?'#97d8b34d':'#f4cc73';c.beginPath();c.arc(toX(p.x),toY(p.z),p.saved?1.5:3,0,Math.PI*2);c.fill();}
  c.save();c.translate(toX(teacher.group.position.x),toY(teacher.group.position.z));c.rotate(-teacher.group.rotation.y);c.fillStyle='#fff8df';c.beginPath();c.moveTo(0,5);c.lineTo(-3.6,-3.4);c.lineTo(3.6,-3.4);c.closePath();c.fill();c.restore();
}
function bindInputs(){
  $('copy-link').onclick=async()=>{const link='https://ubn606.github.io/youve-been-served/';$('share-status').textContent=link;try{await navigator.clipboard.writeText(link);$('share-status').textContent='Link copied. Send it with your score!';}catch{$('share-status').textContent=link;}};$('save-card').onclick=saveCard;
  $('start').onclick=start;$('again').onclick=()=>start(true);$('restart-pause').onclick=()=>start(true);$('resume').onclick=pause;$('pause').onclick=pause;
  $('audio').onclick=()=>{audio.unlock();if(audio.lastError){audio.enabled=true;const id=audio.lastFailedLine;audio.lastError=null;audio.lastFailedLine=null;if(id)audio.say(id,subtitle);$('audio').textContent='SOUND ON';}else $('audio').textContent=audio.toggle()?'SOUND ON':'SOUND OFF';};
  $('quality').onclick=()=>{quality=!quality;$('quality').textContent=quality?'HIGH':'SMOOTH';renderer.setPixelRatio(Math.min(devicePixelRatio,quality?1.75:1));composer.setPixelRatio(renderer.getPixelRatio());renderer.shadowMap.enabled=quality;ao.enabled=quality;bloom.enabled=quality;resize();};
  window.addEventListener('resize',resize);window.addEventListener('blur',()=>{keys.clear();if(session.phase==='playing')pause();});document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();timeSamples=[];if(document.hidden&&session.phase==='playing')pause();});
  document.addEventListener('keydown',e=>{if(!$('education').classList.contains('hidden'))return;if(e.code==='Escape'||e.code==='KeyP'){if(!e.repeat)pause();e.preventDefault();return;}if(session.phase!=='playing')return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE','ShiftLeft','ShiftRight','KeyQ','KeyR','KeyC'].includes(e.code)){e.preventDefault();keys.add(e.code);if(!e.repeat){if(e.code==='Space'||e.code==='KeyE')rescue();if(e.code.startsWith('Shift'))dash();if(e.code==='KeyQ')rescue(true);if(e.code==='KeyR')noContact();if(e.code==='KeyC')cameraMode=cameraMode==='chase'?'arcade':'chase';}}});
  document.addEventListener('keyup',e=>keys.delete(e.code));
  $('game').addEventListener('pointerdown',e=>{if(session.phase==='playing'){if(e.button===0&&e.pointerType==='mouse'){mouseFire=true;rescue();}else drag={x:e.clientX,y:e.clientY,id:e.pointerId};$('game').setPointerCapture(e.pointerId);}});
  $('game').addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;cameraYaw-=(e.clientX-drag.x)*.005;cameraPitch=THREE.MathUtils.clamp(cameraPitch+(e.clientY-drag.y)*.003,.08,.8);drag.x=e.clientX;drag.y=e.clientY;});
  for(const type of ['pointerup','pointercancel'])$('game').addEventListener(type,()=>{drag=null;mouseFire=false;});$('game').addEventListener('contextmenu',e=>e.preventDefault());
  $('touch-save').onpointerdown=e=>{e.preventDefault();audio.unlock();mouseFire=true;$('touch-save').setPointerCapture(e.pointerId);rescue();};$('touch-save').onpointerup=()=>{mouseFire=false;};$('touch-save').onpointercancel=()=>{mouseFire=false;};$('touch-dash').onpointerdown=e=>{e.preventDefault();dash();};$('touch-wave').onpointerdown=e=>{e.preventDefault();rescue(true);};
  $('touch-contact').onpointerdown=e=>{e.preventDefault();noContact();};
  let stickPointer=null;const stick=$('stick');function moveStick(e){const rect=stick.getBoundingClientRect();let x=(e.clientX-rect.left-rect.width/2)/42,y=(e.clientY-rect.top-rect.height/2)/42;const len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}touch={x,y};$('knob').style.transform=`translate(${x*34}px,${y*34}px)`;}
  stick.onpointerdown=e=>{e.preventDefault();stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);};stick.onpointermove=e=>{if(e.pointerId===stickPointer)moveStick(e);};const resetStick=()=>{stickPointer=null;touch={x:0,y:0};$('knob').style.transform='';};stick.onpointerup=resetStick;stick.onpointercancel=resetStick;
}
function resize(){if(!renderer)return;renderer.setSize(innerWidth,innerHeight);composer?.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
function frame(now){requestAnimationFrame(frame);const raw=(now-lastFrame)/1000;lastFrame=now;const dt=Math.min(Math.max(raw,.001),.1);worldTime+=dt;frameTime+=dt;
  const pad=controller.update(readGamepads(),{phase:session.phase,focused:document.hasFocus()&&!document.hidden&&$('education').classList.contains('hidden')});
  if(pad.actions.start||pad.actions.restart)start();if(pad.actions.pause)pause();
  const playing=session.phase==='playing';document.body.classList.toggle('controller',pad.connected);
  if(raw>0&&Number.isFinite(raw)&&!document.hidden){timeSamples.push(raw);if(timeSamples.length>90)timeSamples.shift();fps=1/(timeSamples.reduce((a,b)=>a+b,0)/timeSamples.length);}
  if(playing){combat.tick(dt);if(practice>=0){const remaining=session.timeLeft,elapsed=session.elapsed;session.tick(dt);session.timeLeft=remaining;session.elapsed=elapsed;}else session.tick(boss.active&&conversation.active?0:dt);let ix=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;let iz=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+touch.y;
    if(pad.connected){ix+=pad.move.x;iz+=pad.move.y;cameraYaw-=pad.look.x*dt*2;cameraPitch=THREE.MathUtils.clamp(cameraPitch+pad.look.y*dt,.08,.8);if(pad.held.serve)rescue();if(pad.actions.dash)dash();if(pad.actions.grayRock)rescue(true);if(pad.actions.noContact)noContact();}
    const len=Math.hypot(ix,iz);if(len>1){ix/=len;iz/=len;}tmp.set(ix*Math.cos(cameraYaw)+iz*Math.sin(cameraYaw),0,-ix*Math.sin(cameraYaw)+iz*Math.cos(cameraYaw));if(tmp.lengthSq()>.015)lastMotion.copy(tmp).normalize();if(session.dashLeft>0&&tmp.lengthSq()<.01)tmp.copy(lastMotion);
    const desiredSpeed=session.dashLeft>0?RULES.dashSpeed:RULES.walkSpeed;const movement=slideMove(teacher.group.position,tmp.x*desiredSpeed*dt,tmp.z*desiredSpeed*dt,world.colliders,world.bounds);const dx=movement.x-teacher.group.position.x,dz=movement.z-teacher.group.position.z;velocity=Math.hypot(dx,dz)/dt;teacher.group.position.x=movement.x;teacher.group.position.z=movement.z;
    if(velocity>.1){const targetYaw=Math.atan2(dx,dz);teacher.group.rotation.y+=Math.atan2(Math.sin(targetYaw-teacher.group.rotation.y),Math.cos(targetYaw-teacher.group.rotation.y))*Math.min(1,dt*16);if(frameTime>.052){emit(movement.x,.08,movement.z,session.dashLeft>0?5:1,session.dashLeft>0?colors.gold:colors.sand,.35);frameTime=0;}}
    shotCooldown=Math.max(0,shotCooldown-dt);if(keys.has('Space')||keys.has('KeyE')||mouseFire)rescue();
    if(practice>=0)practiceUpdate(dt);else {updateCrowd(dt);updateStones(dt);}updateFoes(dt);updateBolts(dt);handleEvents();
    voiceClock+=dt;if(practice<0&&!boss.active&&!boss.defeated&&!audio.speaking&&voiceClock>7){ambientDialogue();voiceClock=0;}
    contactCooldown=Math.max(0,contactCooldown-dt);conversation.update(dt);if(!conversation.active)boss.update(dt);
    for(const e of boss.consumeEvents()){
      if(e.type==='attackchange'){showToast(e.name.toUpperCase());conversation.start(e.attack);}
      if(e.type==='grayrock')showToast('GRAY ROCK · INTERCEPT THE BAIT');
      if(e.type==='counter')showToast(e.line);
      if(e.type==='bosshit'){emit(bossView.group.position.x,1.8,bossView.group.position.z,12,colors.gold,1.5);session.score+=30;}
      if(e.type==='blocked'&&e.source==='player')showToast('GRAY ROCK OPENS THE WINDOW · Q / Y');
    }
    bossView.update(conversation.active?0:dt,worldTime,boss,teacher.group.position,(blocked,pos)=>{emit(pos.x,pos.y,pos.z,14,blocked?colors.mint:new THREE.Color('#bd86ca'),1);if(!blocked&&contactCooldown===0){session.takeHit();contactCooldown=.6;}else if(blocked){combat.blocks++;actionText('BLOCKED',pos);if(boss.counter()){combat.counters++;session.composure=Math.min(6,session.composure+1);session.score+=300;actionText('3× COUNTER +300',bossView.group.position);}}});
    if(bossWinDelay>0){bossWinDelay-=dt;if(bossWinDelay<=0){session.finish(true);handleEvents();}}
  }else velocity=0;
  savePose=Math.max(0,savePose-dt);teacher.update(dt,{time:worldTime,speed:velocity,rescuing:savePose>0,saved:false});
  for(let i=0;i<citizens.length;i++){const p=session.people[i],m=markers[i];const available=practice>=0?i===0:session.available(p);citizens[i].group.visible=available&&(!p.saved||worldTime-m.savedAt<8);m.sprite.visible=available;if(!p.saved)m.ring.visible=available;citizens[i].group.position.set(p.x,0,p.z);if(citizens[i].group.visible)citizens[i].update(dt,{time:worldTime,speed:playing?(p.speed||0):0,rescuing:false,saved:p.saved});m.sprite.position.set(p.x,(p.saved?2.9:3.15)+Math.sin(worldTime*2+i)*.10,p.z);m.ring.position.set(p.x,.035,p.z);m.sprite.material.opacity=p.saved?Math.max(.25,1-(worldTime-m.savedAt)*.3):.9;m.sprite.scale.setScalar(p.saved?.49:.64+Math.sin(worldTime*2+i)*.025);m.ring.material.opacity=.4+Math.sin(worldTime*2+i)*.16;}
  world.update?.(dt,worldTime);contactShadows.update();
  for(let i=0;i<particleData.length;i++){const p=particleData[i];if(p.life<=0){particlePositions[i*3+1]=-1000;continue;}p.life-=dt;particlePositions[i*3]+=p.vx*dt;particlePositions[i*3+1]+=p.vy*dt;particlePositions[i*3+2]+=p.vz*dt;p.vy-=dt*1.2;const f=Math.max(0,p.life/p.max);particleColors[i*3]*=1-dt*.55;particleColors[i*3+1]*=1-dt*.55;particleColors[i*3+2]*=1-dt*.55;}
  particles.geometry.attributes.position.needsUpdate=true;particles.geometry.attributes.color.needsUpdate=true;
  for(let i=ripples.length-1;i>=0;i--){const r=ripples[i];r.life+=dt;const t=r.life/r.max;r.mesh.scale.setScalar(.15+r.radius*t);r.mesh.material.opacity=(1-t)*.8;if(t>=1){scene.remove(r.mesh);r.mesh.geometry.dispose();r.mesh.material.dispose();ripples.splice(i,1);}}
  if(session.phase==='ready'){
    const t=worldTime*.065;camera.position.set(9+Math.sin(t)*2,6.2,world.spawn.z+8.5);camera.lookAt(-1.7,1.7,world.spawn.z-1);teacher.group.rotation.y=Math.PI*.27;
  }else{
    cameraTarget.copy(teacher.group.position);cameraTarget.y=1.45;
    if(cameraMode==='chase'){cameraTarget.add(new THREE.Vector3(-Math.sin(cameraYaw)*1.5,0,-Math.cos(cameraYaw)*1.5));const distance=phoneProfile?6.2:5.8;camDesired.set(Math.sin(cameraYaw)*distance,.85+cameraPitch*1.3,Math.cos(cameraYaw)*distance);}
    else camDesired.set(Math.sin(cameraYaw+.55)*21,22,Math.cos(cameraYaw+.55)*21);
    camDesired.add(cameraTarget);
    // Keep the chase camera out of opaque building volumes using segment tests.
    if(cameraMode==='chase'){const delta=camDesired.clone().sub(cameraTarget);for(let f=.12;f<=1;f+=.055){const q=cameraTarget.clone().addScaledVector(delta,f);if(world.colliders.some(b=>q.y<(b.height||6.3)&&q.x>b.minX-.15&&q.x<b.maxX+.15&&q.z>b.minZ-.15&&q.z<b.maxZ+.15)){camDesired.copy(cameraTarget).addScaledVector(delta,Math.max(.22,f-.08));break;}}}
    camera.position.lerp(camDesired,1-Math.exp(-dt*8));camera.lookAt(cameraTarget);
  }
  for(let i=floaters.length-1;i>=0;i--){const f=floaters[i];f.life-=dt;f.y+=dt*.7;tmp.set(f.x,f.y,f.z).project(camera);f.el.style.left=(tmp.x*.5+.5)*innerWidth+'px';f.el.style.top=(-tmp.y*.5+.5)*innerHeight+'px';f.el.style.opacity=Math.max(0,Math.min(1,f.life));if(f.life<=0){f.el.remove();floaters.splice(i,1);}}
  if(toastLife>0){toastLife-=dt;if(toastLife<=0)$('toast').classList.remove('show');}
  uiTick+=dt;mapTick+=dt;if(uiTick>.07&&session.phase!=='ready'){updateHUD();uiTick=0;}if(mapTick>.1){drawMap();mapTick=0;}
  if(dialogueLife>0&&session.phase!=='paused'){dialogueLife-=dt;if(dialogueLife<=0)$('dialogue').classList.remove('show');}
  audio.update(playing);renderer.info.reset();composer.render();
}
function updateCrowd(dt){
  const hero=teacher.group.position;navigation.updateTarget(hero.x,hero.z);
  for(const p of session.people){p.speed=0;if(p.saved||!session.available(p)||session.elapsed<3)continue;const dist=Math.hypot(p.x-hero.x,p.z-hero.z);if(dist<1.8)continue;
    let dir=dist<6&&clearSight(p,hero)?{x:(hero.x-p.x)/dist,z:(hero.z-p.z)/dist}:navigation.direction(p.x,p.z);
    let sx=0,sz=0;for(const other of session.people){if(other===p||other.saved)continue;const d=Math.hypot(p.x-other.x,p.z-other.z);if(d>.01&&d<1){sx+=(p.x-other.x)/d*(1-d);sz+=(p.z-other.z)/d*(1-d);}}
    const x=dir.x+sx*.8,z=dir.z+sz*.8,len=Math.hypot(x,z);if(len<.05)continue;const speed=1.9+(p.id%4)*.20;
    const result=slideMove(p,x/len*speed*dt,z/len*speed*dt,world.colliders,world.bounds);const dx=result.x-p.x,dz=result.z-p.z;p.speed=Math.hypot(dx,dz)/dt;p.x=result.x;p.z=result.z;
    if(p.speed>.1)citizens[p.id].group.rotation.y=Math.atan2(dx,dz);
  }
}
function updateBolts(dt){for(let i=bolts.length-1;i>=0;i--){const b=bolts[i],target=b.target==='boss'&&boss.active?{...bossView.group.position,id:'boss'}:session.people[b.target];b.life-=dt;
  if(target&&!target.saved){tmp.set(target.x,1.25,target.z).sub(b.mesh.position);const d=tmp.length();if(d<dt*24+.35){if(clearSight(b.mesh.position,target)){if(practice>=0){if(practice===0){practice=1;practiceClock=0;practiceHint();actionText('HIT ✓',target);}else if(practice===2&&combat.counter(target.id)){actionText('3× COUNTER',target);start(true);return;}}else if(target.id==='boss')boss.hit();else if(combat.counter(target.id)){target.influenceBroken=true;const before=session.score;session.serve(target.id);const bonus=(session.score-before)*2;session.score+=bonus;actionText('3× COUNTER +'+bonus,target);}else if(hostileId(target.id)&&!target.influenceBroken){target.influenceBroken=true;markers[target.id].sprite.material.map=pendingTexture;showToast('INFLUENCE BROKEN · SERVE AGAIN');}else session.serve(target.id);emit(target.x,1.2,target.z,20,colors.mint,1.1);}b.life=0;}else b.direction.copy(tmp).normalize();}
  const previous=b.mesh.position.clone();b.mesh.position.addScaledVector(b.direction,24*dt);emit(b.mesh.position.x,b.mesh.position.y,b.mesh.position.z,3,colors.gold,.18);
  if(!clearSight(previous,b.mesh.position))b.life=0;
  if(b.life<=0){scene.remove(b.mesh);b.mesh.children[0].material.dispose();bolts.splice(i,1);}
}}
init().catch(fatal);

function updateFoes(dt){
  const hero=teacher.group.position;
  if(practice<0&&!boss.active)for(const p of session.people){
    if(p.saved||p.influenceBroken||!hostileId(p.id)||!session.available(p)||session.elapsed<3)continue;
    p.attackWait=(p.attackWait??(3+p.id%3))-dt;
    const distance=Math.hypot(p.x-hero.x,p.z-hero.z);
    if(p.attackWait<=0&&distance<12&&distance>2&&clearSight(p,hero)){
      const kind=p.wave??0;p.attackWait=kind===1?3.8:5;
      const count=kind===0?3:kind===2?5:1,spread=kind===2?.32:.20;
      for(let shot=0;shot<count;shot++){
        const angle=Math.atan2(hero.x-p.x,hero.z-p.z)+(shot-(count-1)/2)*spread;
        const mesh=new THREE.Mesh(boltGeometry,foeMaterial);mesh.position.set(p.x,1.1,p.z);scene.add(mesh);
        foeShots.push({mesh,owner:p.id,life:5,speed:kind===1?5:3,dx:Math.sin(angle),dz:Math.cos(angle)});
      }
    }
  }
  for(let i=foeShots.length-1;i>=0;i--){const b=foeShots[i],previous=b.mesh.position.clone();b.life-=dt;b.mesh.position.x+=b.dx*dt*b.speed;b.mesh.position.z+=b.dz*dt*b.speed;
    if(session.people[b.owner].saved||boss.active||!clearSight(previous,b.mesh.position))b.life=0;
    if(Math.hypot(b.mesh.position.x-hero.x,b.mesh.position.z-hero.z)<.65){if(combat.block(b.owner)){actionText('BLOCKED',b.mesh.position);if(practice===1){practice=2;practiceHint();}}else if(practice>=0){actionText('TRY GRAY ROCK AT IMPACT',hero);}else if(contactCooldown<=0){session.takeHit();contactCooldown=1;}b.life=0;}
    if(b.life<=0){scene.remove(b.mesh);foeShots.splice(i,1);}
  }
}

function saveCard(){const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1080;const c=canvas.getContext('2d');c.fillStyle='#123c38';c.fillRect(0,0,1080,1080);c.strokeStyle='#efc875';c.lineWidth=4;c.strokeRect(45,45,990,990);c.fillStyle='#efc875';c.font='bold 64px sans-serif';c.fillText("YOU’VE BEEN SERVED",85,165);c.fillStyle='#fff4dd';c.font='36px sans-serif';c.fillText(session.won?'CITY SAVED. BOUNDARIES INTACT.':'EVERY ACT OF SERVICE COUNTS.',85,250);c.font='bold 128px sans-serif';c.fillText(session.score.toLocaleString(),85,455);c.font='36px sans-serif';c.fillText('POINTS',85,515);c.fillText(combat.blocks+' BLOCKS    '+combat.counters+' COUNTERS',85,640);c.fillText(session.saved+' / 18 PEOPLE SERVED',85,720);c.font='27px sans-serif';c.fillText('ubn606.github.io/youve-been-served/',85,930);canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='youve-been-served-score.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);});}

function updateStones(dt){
  if(boss.active){for(const stone of fallingStones){scene.remove(stone.mesh,stone.ring);stone.ring.geometry.dispose();stone.ring.material.dispose();}fallingStones=[];return;}
  stoneClock-=dt;
  if(stoneClock<=0){stoneClock=7;const hero=teacher.group.position;const owner=session.people.find(p=>!p.saved&&session.available(p)&&hostileId(p.id));if(owner){
    const mesh=new THREE.Mesh(stoneGeometry,stoneMaterial);mesh.castShadow=true;mesh.position.set(hero.x,10,hero.z);scene.add(mesh);
    const ring=new THREE.Mesh(new THREE.RingGeometry(1.45,1.65,48),new THREE.MeshBasicMaterial({color:'#ffb65c',side:THREE.DoubleSide,transparent:true,opacity:.8,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(hero.x,.055,hero.z);scene.add(ring);fallingStones.push({mesh,ring,age:0,owner:owner.id});actionText('LOOK OUT · STONEFALL',hero);
  }}
  for(let i=fallingStones.length-1;i>=0;i--){const stone=fallingStones[i];stone.age+=dt;stone.ring.material.opacity=.5+.4*Math.sin(stone.age*16);const fall=Math.max(0,(stone.age-1.8)/.55);stone.mesh.position.y=Math.max(.5,10-9.5*fall*fall);stone.mesh.rotation.x+=dt*.8;stone.mesh.rotation.z+=dt*.4;
    if(stone.age>=2.35){const pos=stone.mesh.position;emit(pos.x,.3,pos.z,45,colors.sand,1.6);pulse({x:pos.x,z:pos.z,radius:1.65,wave:false,hits:0});if(Math.hypot(pos.x-teacher.group.position.x,pos.z-teacher.group.position.z)<1.65){if(combat.block(stone.owner)){actionText('BLOCKED · COUNTER THE SENDER',pos);}else if(session.takeHit())actionText('STONEFALL',pos);}scene.remove(stone.mesh,stone.ring);stone.ring.geometry.dispose();stone.ring.material.dispose();fallingStones.splice(i,1);}
  }
}
