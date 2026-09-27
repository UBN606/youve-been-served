import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {createWorld} from './world.js';
import {loadCitizens} from './crowd-assets.js';
import {GameSession,RULES,slideMove} from './game-state.js';
import {ArcadeAudio,BossConversation} from './audio.js';
import {createNavigation} from './navigation.js';
import {loadMeshyTeacher} from './meshy-teacher-asset.js';
import {BossEncounter} from './boss-state.js';
import {createBossView} from './boss-view.js';
import {createControllerInput,readGamepads} from './controller-input.js';
import {installEducation} from './education-ui.js';
import {loadScannedProps} from './scanned-props.js';

const $=id=>document.getElementById(id);const audio=new ArcadeAudio();
const conversation=new BossConversation(audio,subtitle);
const boss=new BossEncounter({phaseSeconds:10,counterplay:true}),controller=createControllerInput();let bossView,bossWinDelay=0,contactCooldown=0;
const phoneProfile=matchMedia('(pointer:coarse)').matches&&Math.min(innerWidth,innerHeight)<800;
const keys=new Set();let touch={x:0,y:0};let frameTime=0,worldTime=0,savePose=0,toastLife=0,uiTick=0,mapTick=0,gamepadSave=false,gamepadDash=false,gamepadWave=false;
let renderer,composer,scene,camera,world,teacher,session,citizens,particles,particlePositions,particleColors,particleData=[],particleCursor=0,ao,bloom;
let cameraMode='chase',cameraYaw=0,cameraPitch=.32,drag=null,lastFrame=performance.now(),quality=true,lastMotion=new THREE.Vector3(0,0,-1),velocity=0;
let ripples=[],floaters=[],markers=[],timeSamples=[],fps=60,best=0;
let navigation,bolts=[],shotCooldown=0,mouseFire=false,voiceClock=0,quipIndex=0,pleaIndex=0,dialogueLife=0,releaseRanks=[];
const boltGeometry=new THREE.SphereGeometry(.17,12,8),boltMaterial=new THREE.MeshBasicMaterial({color:'#fff5bf'});
const SHOT_RANGE=24;
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
  renderer.shadowMap.enabled=quality;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.info.autoReset=false;
  scene=new THREE.Scene();scene.background=new THREE.Color('#e4cfac');scene.fog=new THREE.FogExp2('#e4cfac',.0038);
  // Broad sky reflections supply material-aware fill without flattening the sun shadows.
  const skyCanvas=document.createElement('canvas');skyCanvas.width=256;skyCanvas.height=128;
  const skyContext=skyCanvas.getContext('2d'),skyGradient=skyContext.createLinearGradient(0,0,0,128);
  skyGradient.addColorStop(0,'#6f9fce');skyGradient.addColorStop(.48,'#e8ddc2');skyGradient.addColorStop(.52,'#a18b67');skyGradient.addColorStop(1,'#514535');
  skyContext.fillStyle=skyGradient;skyContext.fillRect(0,0,256,128);
  const skyTexture=new THREE.CanvasTexture(skyCanvas);skyTexture.colorSpace=THREE.SRGBColorSpace;skyTexture.mapping=THREE.EquirectangularReflectionMapping;
  const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(skyTexture).texture;scene.environmentIntensity=.35;skyTexture.dispose();pmrem.dispose();
  camera=new THREE.PerspectiveCamera(54,innerWidth/innerHeight,.12,220);
  const hemi=new THREE.HemisphereLight('#d8e9f4','#7c6146',.85);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#ffe3a9',3.4);sun.position.set(-30,27,-18);sun.castShadow=true;sun.shadow.mapSize.set(phoneProfile?1024:4096,phoneProfile?1024:4096);Object.assign(sun.shadow.camera,{left:-44,right:44,top:44,bottom:-44,near:1,far:130});sun.shadow.normalBias=.018;sun.shadow.bias=-.00015;sun.shadow.radius=2;scene.add(sun);
  const fill=new THREE.DirectionalLight('#bfd6ed',.35);fill.position.set(12,15,25);scene.add(fill);
  world=createWorld(scene);navigation=createNavigation(world.colliders,world.bounds);teacher=await loadMeshyTeacher(phoneProfile?'./assets/muapi-teacher/tripo-detailed-v1/derivatives-v2/teacher-mobile.glb':'./assets/muapi-teacher/tripo-detailed-v1/derivatives-v2/teacher-desktop.glb',{localRig:true,rigProfile:'tripo-arms-down',forwardYaw:-Math.PI/2});scene.add(teacher.group);teacher.group.position.set(world.spawn.x,0,world.spawn.z);teacher.group.rotation.y=Math.PI;const maps=await world.assetsReady;if(maps.failures)throw new Error('City material files failed to load.');
  try{const scans=await loadScannedProps({world,mobile:phoneProfile});scans.userData.staged=false;scene.add(scans);world.scannedProps=scans.userData;}catch(error){console.warn('Optional scanned scenery unavailable:',error.message);}
  session=new GameSession(world.rescueSpawns,{finalBoss:true});bossView=await createBossView(scene);$('total').textContent=session.people.length;$('intro-total').textContent=session.people.length;
  const releaseOrder=[...session.spawns].sort((a,b)=>Math.hypot(a.x-world.spawn.x,a.z-world.spawn.z)-Math.hypot(b.x-world.spawn.x,b.z-world.spawn.z));for(let rank=0;rank<releaseOrder.length;rank++)releaseRanks[releaseOrder[rank].id]=rank;
  citizens=await loadCitizens(session.people.length);
  for(let i=0;i<citizens.length;i++){const p=session.people[i],actor=citizens[i];actor.group.position.set(p.x,0,p.z);actor.group.rotation.y=(i*2.399)%6.28;scene.add(actor.group);}
  markers=session.people.map((p,i)=>{
    const mat=new THREE.SpriteMaterial({map:hostileId(i)?hostileTexture:pendingTexture,transparent:true,depthWrite:false});const sprite=new THREE.Sprite(mat);sprite.position.set(p.x,3.1,p.z);sprite.scale.set(.68,.68,1);scene.add(sprite);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.57,.64,40),new THREE.MeshBasicMaterial({color:'#ffe2a0',transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(p.x,.035,p.z);scene.add(ring);
    return {sprite,ring,savedAt:-100};
  });
  // Thin player compass keeps the controlled figure legible against stone.
  const playerRing=new THREE.Mesh(new THREE.RingGeometry(.53,.58,48),new THREE.MeshBasicMaterial({color:'#e8f7db',transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false}));playerRing.rotation.x=-Math.PI/2;playerRing.position.y=.027;teacher.group.add(playerRing);
  const n=700;particlePositions=new Float32Array(n*3);particleColors=new Float32Array(n*3);particlePositions.fill(-1000);particleData=Array.from({length:n},()=>({life:0,vx:0,vy:0,vz:0}));const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(particlePositions,3));pg.setAttribute('color',new THREE.BufferAttribute(particleColors,3));particles=new THREE.Points(pg,new THREE.PointsMaterial({size:.22,map:glowTexture,vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));particles.frustumCulled=false;scene.add(particles);
  const target=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{samples:phoneProfile?0:4});composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));ao=new GameAO(scene,camera,innerWidth,innerHeight);ao.blendIntensity=.95;ao.updateGtaoMaterial({radius:1.1,distanceExponent:1.5,thickness:1,distanceFallOff:1});composer.addPass(ao);bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.16,.45,1.4);bloom.enabled=quality;composer.addPass(bloom);composer.addPass(new OutputPass());
  scene.traverse(o=>{if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.map)m.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}});
  camera.position.set(9,10,30);camera.lookAt(-2,1,17);renderer.compile(scene,camera);
  ao.enabled=quality;resize();bindInputs();installEducation({isPlaying:()=>session.phase==='playing',togglePause:pause});clearTimeout(window.__gameBootTimer);$('fatal').classList.add('hidden');$('loading').classList.add('hidden');lastFrame=performance.now();requestAnimationFrame(frame);
  window.__mercy={snapshot:()=>({phase:session.phase,composure:session.composure,conversation:conversation.active,score:session.score,saved:session.saved,total:session.people.length,timeLeft:session.timeLeft,combo:session.combo,grace:session.grace,position:{x:teacher.group.position.x,z:teacher.group.position.z},nearest:session.nearest(teacher.group.position.x,teacher.group.position.z),cameraMode,fps:Math.round(fps),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,renderSize:{width:renderer.domElement.width,height:renderer.domElement.height},renderProfile:{phone:phoneProfile,quality:quality?'high':'smooth',pixelRatio:renderer.getPixelRatio(),antialias:renderer.getContext().getContextAttributes().antialias,samples:composer.renderTarget1.samples,shadows:renderer.shadowMap.enabled,ambientOcclusion:ao.enabled,bloom:bloom.enabled},scannedProps:world.scannedProps,people:session.people.map(p=>({id:p.id,x:p.x,z:p.z,saved:p.saved})),bolts:bolts.length,colliders:world.colliders.length,worldSeed:260926,stage:session.stage,boss:{active:boss.active,defeated:boss.defeated,influence:boss.influence,ultimate:boss.ultimate,grayCooldown:boss.grayCooldown,attack:boss.attack.name},teacher:teacher.group.userData.asset,voiceClips:audio.clips.size,version:'0.4.0'})};
}
function emit(x,y,z,count,color,force=1){for(let j=0;j<count;j++){const i=particleCursor++%particleData.length,p=particleData[i];p.life=.5+Math.random()*.65;p.max=p.life;p.vx=(Math.random()-.5)*force*3;p.vy=(.6+Math.random()*2)*force;p.vz=(Math.random()-.5)*force*3;particlePositions[i*3]=x;particlePositions[i*3+1]=y;particlePositions[i*3+2]=z;particleColors[i*3]=color.r;particleColors[i*3+1]=color.g;particleColors[i*3+2]=color.b;}}
function pulse(e){const r=new THREE.Mesh(new THREE.RingGeometry(.94,1,80),new THREE.MeshBasicMaterial({color:e.wave?'#b9ffe1':'#ffde8a',transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false}));r.rotation.x=-Math.PI/2;r.position.set(e.x,.06,e.z);scene.add(r);ripples.push({mesh:r,life:0,max:e.wave?.95:.5,radius:e.radius});emit(e.x,.3,e.z,e.wave?65:18,e.wave?colors.mint:colors.gold,e.wave?2.2:1);savePose=.55;if(e.wave)audio.wave();else if(!e.hits)audio.pulse();}
function subtitle(line){if(!line)return;$('dialogue').textContent=`${line.speaker}: “${line.text}”`;$('dialogue').classList.add('show');dialogueLife=line.duration||4;}
function say(id){return audio.say(id,subtitle);}
function sayCategory(category,options={}){return audio.sayCategory(category,{...options,onSubtitle:subtitle});}
function citizenVoice(id){return {gender:id%2?'female':'male',speakerId:`citizen-${id}`,persona:id===4?'donkey-owner':id===6?'donkey-borrower':id%5===0?'self-reflecting':'seeking-help'};}
function reaction(id){const voice=citizenVoice(id);if(['seeking-help','donkey-owner'].includes(voice.persona))voice.persona='grateful';return sayCategory('citizenreaction',voice);}
function ambientDialogue(){
  const nearby=session.people.filter(p=>!p.saved&&!['self-reflecting','donkey-borrower'].includes(citizenVoice(p.id).persona)).sort((a,b)=>Math.hypot(a.x-teacher.group.position.x,a.z-teacher.group.position.z)-Math.hypot(b.x-teacher.group.position.x,b.z-teacher.group.position.z));
  if(pleaIndex++%3===2||!nearby.length)sayCategory('hero_reflection');
  else sayCategory('citizenplea',citizenVoice(nearby[Math.floor(pleaIndex/3)%Math.min(3,nearby.length)].id));
}
function clearSight(a,b){const distance=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(distance/.35);for(let i=1;i<steps;i++){const f=i/steps,x=a.x+(b.x-a.x)*f,z=a.z+(b.z-a.z)*f;if(world.colliders.some(o=>x>o.minX&&x<o.maxX&&z>o.minZ&&z<o.maxZ))return false;}return true;}
function rescue(wave=false){
  if(session?.phase!=='playing'||boss.active&&conversation.active)return;
  if(wave){
    if(boss.active){if(boss.grayRock()){pulse({x:teacher.group.position.x,z:teacher.group.position.z,radius:8.2,wave:true,hits:0});say('hero-grayrock');}return;}
    const charged=session.grace>=100;session.rescue(teacher.group.position.x,teacher.group.position.z,true);if(charged)sayCategory('hero_rescue');return;
  }
  if(shotCooldown>0)return;shotCooldown=.34;savePose=.32;
  const pos=teacher.group.position;const reserved=new Set(bolts.map(b=>b.target));
  const targets=session.people.filter(p=>!p.saved&&!reserved.has(p.id)&&Math.hypot(p.x-pos.x,p.z-pos.z)<SHOT_RANGE&&clearSight(pos,p));
  targets.sort((a,b)=>Math.hypot(a.x-pos.x,a.z-pos.z)-Math.hypot(b.x-pos.x,b.z-pos.z));
  const target=boss.active&&Math.hypot(bossView.group.position.x-pos.x,bossView.group.position.z-pos.z)<SHOT_RANGE&&clearSight(pos,bossView.group.position)?{id:'boss',...bossView.group.position}:targets[0];const direction=target?new THREE.Vector3(target.x-pos.x,0,target.z-pos.z).normalize():new THREE.Vector3(-Math.sin(cameraYaw),0,-Math.cos(cameraYaw));
  if(target&&velocity<.1)teacher.group.rotation.y=Math.atan2(direction.x,direction.z);
  const mesh=new THREE.Mesh(boltGeometry,boltMaterial);mesh.position.copy(pos).addScaledVector(direction,.65);mesh.position.y=1.35;
  const aura=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color:'#ffcc57',transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));aura.scale.set(1.35,1.35,1);mesh.add(aura);scene.add(mesh);bolts.push({mesh,target:target?.id,direction,life:1.45});audio.shot();
}
function dash(){if(session?.dash())audio.dash();}
function noContact(){if(session?.phase!=='playing'||!boss.noContact())return;conversation.reset();audio.stopSpeech({resetCooldowns:true});say('hero-nocontact');showToast('NO CONTACT. ALL PEACE.');pulse({x:teacher.group.position.x,z:teacher.group.position.z,radius:32,wave:true,hits:1});bossWinDelay=2.4;session.timeLeft=Math.max(5,session.timeLeft);session.score+=1500;}
function showToast(message){$('toast').textContent=message;$('toast').classList.add('show');toastLife=1.35;}
function start(){audio.unlock();audio.stopSpeech({resetCooldowns:true});conversation.reset();session.reset();boss.reset();bossView.clear();bossWinDelay=0;contactCooldown=0;$('boss-hud').classList.add('hidden');$('chapter').innerHTML='<span>01 / MARKET QUARTER</span><small>They rush you. You rescue them.</small>';controller.reset();keys.clear();touch={x:0,y:0};mouseFire=false;shotCooldown=0;voiceClock=0;quipIndex=0;pleaIndex=0;dialogueLife=0;$('dialogue').classList.remove('show');for(const b of bolts){scene.remove(b.mesh);b.mesh.children[0].material.dispose();}bolts=[];teacher.group.position.set(world.spawn.x,0,world.spawn.z);teacher.group.rotation.y=Math.PI;cameraYaw=0;lastMotion.set(0,0,-1);velocity=0;savePose=0;toastLife=0;
  for(const b of foeShots)scene.remove(b.mesh);foeShots=[];for(const c of citizens)c.setSaved?.(false);for(const [i,m] of markers.entries()){m.savedAt=-100;m.sprite.material.map=hostileId(i)?hostileTexture:pendingTexture;m.sprite.material.opacity=1;m.ring.visible=true;}
  for(const r of ripples){scene.remove(r.mesh);r.mesh.geometry.dispose();r.mesh.material.dispose();}ripples=[];
  for(const f of floaters)f.el.remove();floaters=[];for(const p of particleData)p.life=0;
  for(const id of ['intro','results','pause-screen'])$(id).classList.add('hidden');for(const id of ['hud','bottom','map-wrap','chapter','mobile'])$(id).classList.remove('hidden');$('app').classList.add('playing');$('game').focus();showToast('THE SECOND COMING. FIRST CLASS SERVICE.');say('hero_serve');updateHUD();
}
function pause(){if(!session)return;const phase=session.togglePause();$('pause-screen').classList.toggle('hidden',phase!=='paused');keys.clear();mouseFire=false;touch={x:0,y:0};audio.pauseSpeech(phase!=='playing');if(phase==='playing')$('game').focus();}
function finish(e){keys.clear();touch={x:0,y:0};audio.finish(e.won);best=Math.max(best,session.score);try{localStorage.setItem('mercy-run-best',String(best));}catch{}
  $('result-kicker').textContent=e.won?'EVERYONE REACHED. EVERY SECOND MATTERED.':'ROUND COMPLETE';$('result-title').innerHTML=e.won?'THAT\'S A CITY<br>FULL OF HOPE.':'YOU MADE<br>A DIFFERENCE.';$('result-summary').textContent=`${session.saved} of ${session.people.length} neighbors saved. ${e.won?`${e.bonus.toLocaleString()} time-bonus points. `:''}${session.saved===0?'Follow a golden beacon, get close, then press Space.':'Every one of them counts.'}`;$('final-score').textContent=session.score.toLocaleString();$('final-streak').textContent=session.bestCombo;$('best-score').textContent=best.toLocaleString();$('results').classList.remove('hidden');$('again').focus();}
function handleEvents(){for(const e of session.consumeEvents()){
  if(e.type==='pulse')pulse(e);
  if(e.type==='saved'){citizens[e.id].setSaved?.(true);markers[e.id].savedAt=worldTime;markers[e.id].sprite.material.map=savedTexture;markers[e.id].ring.visible=false;emit(e.x,1.5,e.z,35,colors.gold,1.5);audio.save(e.combo);showToast(e.combo>=3?`${e.combo} SERVED IN A ROW!`:'YOU\'VE BEEN SERVED!');if(!audio.speaking){if(++quipIndex%4===0)sayCategory('hero_rescue',{context:citizenVoice(e.id).persona==='self-reflecting'?'obstruction':'general'});else reaction(e.id);}const el=document.createElement('div');el.className='floating';el.textContent=`SERVED! +${e.points}`;$('floaters').appendChild(el);floaters.push({el,x:e.x,z:e.z,y:2.8,life:1.5});}
  if(e.type==='hurt'){showToast('COMPOSURE HIT · '+e.composure+'/6 · DASH TO EVADE');$('app').animate([{filter:'brightness(1.5) saturate(.4)'},{filter:'none'}],{duration:220});}
  if(e.type==='finish')finish(e);
  if(e.type==='boss-start'){
    boss.start();teacher.group.position.set(0,0,12);teacher.group.rotation.y=Math.PI;cameraYaw=0;session.timeLeft=Math.max(70,session.timeLeft);
    $('boss-hud').classList.remove('hidden');$('chapter').innerHTML='<span>02 / REBELLION TESTED</span><small>Gray Rock. Break influence. No Contact.</small>';showToast('CALIGASTIA · THE MAIN CHARACTER SYNDROME');
    audio.stopSpeech();voiceClock=0;
  }
}}
function updateHUD(){$('composure').textContent='COMPOSURE '+session.composure+'/6';const time=Math.ceil(session.timeLeft);$('score').textContent=String(session.score).padStart(5,'0');$('timer').textContent=`${Math.floor(time/60)}:${String(time%60).padStart(2,'0')}`;$('timer-fill').style.transform=`scaleX(${session.timeLeft/RULES.duration})`;$('saved').textContent=session.saved;$('app').classList.toggle('urgent',session.timeLeft<=15&&session.phase==='playing');$('combo').classList.toggle('hidden',session.combo<2||session.phase!=='playing'||session.stage==='boss');$('combo-count').textContent=session.combo;$('combo-fill').style.transform=`scaleX(${Math.max(0,1-(session.elapsed-session.lastSave)/RULES.comboWindow)})`;$('grace-fill').style.width=session.grace+'%';$('grace-label').textContent=session.grace>=100?'READY! Press Q':'Save people to charge';$('touch-wave').style.opacity=session.grace>=100?'1':'.45';
  const near=session.nearest(teacher.group.position.x,teacher.group.position.z);const ready=near&&near.distance<=SHOT_RANGE&&clearSight(teacher.group.position,near);$('hint').classList.toggle('ready',Boolean(ready));$('hint').lastElementChild.textContent=near?(ready?'Hold to serve · auto aim':`Find the next crowd · ${Math.ceil(near.distance)}m`):'Everyone has been served';
  if(session.stage==='boss'){
    $('boss-influence').style.width=boss.influence+'%';$('boss-phase').textContent=boss.defeated?'INFLUENCE BROKEN':boss.attack.name.toUpperCase();
    $('boss-tell').textContent=boss.defeated?'No contact. No audience. No influence.':boss.guardLeft>0?'GRAY ROCK: INTERCEPT A PROJECTILE':boss.attack.tell;
    $('grace-fill').style.width=(1-boss.grayCooldown/8)*100+'%';$('grace-label').textContent=boss.grayCooldown>0?`${boss.grayCooldown.toFixed(1)}s`:'READY · Q / Y';$('touch-wave').style.opacity=boss.grayCooldown>0?'.5':'1';
    $('hint').lastElementChild.textContent=boss.ultimate>=100?'NO CONTACT READY · R / X':boss.exposedLeft>0?'Influence exposed · hold to serve':'Dodge or intercept bait with Q / Y';
  }
  $('contact-fill').style.width=boss.ultimate+'%';$('contact-label').textContent=boss.ultimate>=100?'READY · R / X':session.stage==='boss'?Math.floor(boss.ultimate)+'%':'Unlock in the final encounter';$('touch-contact').disabled=boss.ultimate<100;
}
function drawMap(){const c=$('map').getContext('2d'),s=180,toX=x=>(x+36)/72*s,toY=z=>(z+36)/72*s;c.clearRect(0,0,s,s);c.fillStyle='#d3bd8322';for(const b of world.colliders)c.fillRect(toX(b.minX),toY(b.minZ),(b.maxX-b.minX)/72*s,(b.maxZ-b.minZ)/72*s);
  for(const p of session.people){c.fillStyle=p.saved?'#97d8b34d':'#f4cc73';c.beginPath();c.arc(toX(p.x),toY(p.z),p.saved?1.5:3,0,Math.PI*2);c.fill();}
  c.save();c.translate(toX(teacher.group.position.x),toY(teacher.group.position.z));c.rotate(-teacher.group.rotation.y);c.fillStyle='#fff8df';c.beginPath();c.moveTo(0,5);c.lineTo(-3.6,-3.4);c.lineTo(3.6,-3.4);c.closePath();c.fill();c.restore();
}
function bindInputs(){
  $('start').onclick=start;$('again').onclick=start;$('restart-pause').onclick=start;$('resume').onclick=pause;$('pause').onclick=pause;
  $('audio').onclick=()=>{audio.unlock();$('audio').textContent=audio.toggle()?'SOUND ON':'SOUND OFF';};
  $('quality').onclick=()=>{quality=!quality;$('quality').textContent=quality?'HIGH':'SMOOTH';renderer.setPixelRatio(Math.min(devicePixelRatio,quality?1.75:1));composer.setPixelRatio(renderer.getPixelRatio());renderer.shadowMap.enabled=quality;ao.enabled=quality;bloom.enabled=quality;resize();};
  window.addEventListener('resize',resize);window.addEventListener('blur',()=>{keys.clear();if(session.phase==='playing')pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&session.phase==='playing')pause();});
  document.addEventListener('keydown',e=>{if(!$('education').classList.contains('hidden'))return;if(e.code==='Escape'||e.code==='KeyP'){if(!e.repeat)pause();e.preventDefault();return;}if(session.phase!=='playing')return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE','ShiftLeft','ShiftRight','KeyQ','KeyR','KeyC'].includes(e.code)){e.preventDefault();keys.add(e.code);if(!e.repeat){if(e.code.startsWith('Shift'))dash();if(e.code==='KeyQ')rescue(true);if(e.code==='KeyR')noContact();if(e.code==='KeyC')cameraMode=cameraMode==='chase'?'arcade':'chase';}}});
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
  if(raw>0&&raw<.2){timeSamples.push(raw);if(timeSamples.length>90)timeSamples.shift();fps=1/(timeSamples.reduce((a,b)=>a+b,0)/timeSamples.length);}
  if(playing){session.tick(boss.active&&conversation.active?0:dt);let ix=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;let iz=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+touch.y;
    if(pad.connected){ix+=pad.move.x;iz+=pad.move.y;cameraYaw-=pad.look.x*dt*2;cameraPitch=THREE.MathUtils.clamp(cameraPitch+pad.look.y*dt,.08,.8);if(pad.held.serve)rescue();if(pad.actions.dash)dash();if(pad.actions.grayRock)rescue(true);if(pad.actions.noContact)noContact();}
    const len=Math.hypot(ix,iz);if(len>1){ix/=len;iz/=len;}tmp.set(ix*Math.cos(cameraYaw)+iz*Math.sin(cameraYaw),0,-ix*Math.sin(cameraYaw)+iz*Math.cos(cameraYaw));if(tmp.lengthSq()>.015)lastMotion.copy(tmp).normalize();if(session.dashLeft>0&&tmp.lengthSq()<.01)tmp.copy(lastMotion);
    const desiredSpeed=session.dashLeft>0?RULES.dashSpeed:RULES.walkSpeed;const movement=slideMove(teacher.group.position,tmp.x*desiredSpeed*dt,tmp.z*desiredSpeed*dt,world.colliders,world.bounds);const dx=movement.x-teacher.group.position.x,dz=movement.z-teacher.group.position.z;velocity=Math.hypot(dx,dz)/dt;teacher.group.position.x=movement.x;teacher.group.position.z=movement.z;
    if(velocity>.1){const targetYaw=Math.atan2(dx,dz);teacher.group.rotation.y+=Math.atan2(Math.sin(targetYaw-teacher.group.rotation.y),Math.cos(targetYaw-teacher.group.rotation.y))*Math.min(1,dt*16);if(frameTime>.052){emit(movement.x,.08,movement.z,session.dashLeft>0?5:1,session.dashLeft>0?colors.gold:colors.sand,.35);frameTime=0;}}
    shotCooldown=Math.max(0,shotCooldown-dt);if(keys.has('Space')||keys.has('KeyE')||mouseFire)rescue();
    updateCrowd(dt);updateFoes(dt);updateBolts(dt);handleEvents();
    voiceClock+=dt;if(!boss.active&&!boss.defeated&&!audio.speaking&&voiceClock>7){ambientDialogue();voiceClock=0;}
    contactCooldown=Math.max(0,contactCooldown-dt);conversation.update(dt);if(!conversation.active)boss.update(dt);
    for(const e of boss.consumeEvents()){
      if(e.type==='attackchange'){showToast(e.name.toUpperCase());conversation.start(e.attack);}
      if(e.type==='grayrock')showToast('GRAY ROCK · INTERCEPT THE BAIT');
      if(e.type==='counter')showToast(e.line);
      if(e.type==='bosshit'){emit(bossView.group.position.x,1.8,bossView.group.position.z,12,colors.gold,1.5);session.score+=30;}
      if(e.type==='blocked'&&e.source==='player')showToast('GRAY ROCK OPENS THE WINDOW · Q / Y');
    }
    bossView.update(conversation.active?0:dt,worldTime,boss,teacher.group.position,(blocked,pos)=>{emit(pos.x,pos.y,pos.z,14,blocked?colors.mint:new THREE.Color('#bd86ca'),1);if(!blocked&&contactCooldown===0){session.takeHit();contactCooldown=.6;}else if(blocked){boss.counter();}});
    if(bossWinDelay>0){bossWinDelay-=dt;if(bossWinDelay<=0){session.finish(true);handleEvents();}}
  }else velocity=0;
  savePose=Math.max(0,savePose-dt);teacher.update(dt,{time:worldTime,speed:velocity,rescuing:savePose>0,saved:false});
  for(let i=0;i<citizens.length;i++){const p=session.people[i],m=markers[i];citizens[i].group.position.set(p.x,0,p.z);citizens[i].update(dt,{time:worldTime,speed:playing?(p.speed||0):0,rescuing:false,saved:p.saved});m.sprite.position.set(p.x,(p.saved?2.9:3.15)+Math.sin(worldTime*2+i)*.10,p.z);m.ring.position.set(p.x,.035,p.z);m.sprite.material.opacity=p.saved?Math.max(.25,1-(worldTime-m.savedAt)*.3):.9;m.sprite.scale.setScalar(p.saved?.49:.64+Math.sin(worldTime*2+i)*.025);m.ring.material.opacity=.4+Math.sin(worldTime*2+i)*.16;}
  world.update?.(dt,worldTime);
  for(let i=0;i<particleData.length;i++){const p=particleData[i];if(p.life<=0){particlePositions[i*3+1]=-1000;continue;}p.life-=dt;particlePositions[i*3]+=p.vx*dt;particlePositions[i*3+1]+=p.vy*dt;particlePositions[i*3+2]+=p.vz*dt;p.vy-=dt*1.2;const f=Math.max(0,p.life/p.max);particleColors[i*3]*=1-dt*.55;particleColors[i*3+1]*=1-dt*.55;particleColors[i*3+2]*=1-dt*.55;}
  particles.geometry.attributes.position.needsUpdate=true;particles.geometry.attributes.color.needsUpdate=true;
  for(let i=ripples.length-1;i>=0;i--){const r=ripples[i];r.life+=dt;const t=r.life/r.max;r.mesh.scale.setScalar(.15+r.radius*t);r.mesh.material.opacity=(1-t)*.8;if(t>=1){scene.remove(r.mesh);r.mesh.geometry.dispose();r.mesh.material.dispose();ripples.splice(i,1);}}
  if(session.phase==='ready'){
    const t=worldTime*.065;camera.position.set(9+Math.sin(t)*2,6.2,world.spawn.z+8.5);camera.lookAt(-1.7,1.7,world.spawn.z-1);teacher.group.rotation.y=Math.PI*.27;
  }else{
    cameraTarget.copy(teacher.group.position);cameraTarget.y=1.45;
    if(cameraMode==='chase'){cameraTarget.add(new THREE.Vector3(-Math.sin(cameraYaw)*1.5,0,-Math.cos(cameraYaw)*1.5));const distance=7;camDesired.set(Math.sin(cameraYaw)*distance,1.6+cameraPitch*2,Math.cos(cameraYaw)*distance);}
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
  for(const p of session.people){p.speed=0;if(p.saved||session.elapsed<8+Math.floor(releaseRanks[p.id]/3)*10)continue;const dist=Math.hypot(p.x-hero.x,p.z-hero.z);if(dist<1.8)continue;
    let dir=dist<6&&clearSight(p,hero)?{x:(hero.x-p.x)/dist,z:(hero.z-p.z)/dist}:navigation.direction(p.x,p.z);
    let sx=0,sz=0;for(const other of session.people){if(other===p||other.saved)continue;const d=Math.hypot(p.x-other.x,p.z-other.z);if(d>.01&&d<1){sx+=(p.x-other.x)/d*(1-d);sz+=(p.z-other.z)/d*(1-d);}}
    const x=dir.x+sx*.8,z=dir.z+sz*.8,len=Math.hypot(x,z);if(len<.05)continue;const speed=1.9+(p.id%4)*.20;
    const result=slideMove(p,x/len*speed*dt,z/len*speed*dt,world.colliders,world.bounds);const dx=result.x-p.x,dz=result.z-p.z;p.speed=Math.hypot(dx,dz)/dt;p.x=result.x;p.z=result.z;
    if(p.speed>.1)citizens[p.id].group.rotation.y=Math.atan2(dx,dz);
  }
}
function updateBolts(dt){for(let i=bolts.length-1;i>=0;i--){const b=bolts[i],target=b.target==='boss'&&boss.active?{...bossView.group.position,id:'boss'}:session.people[b.target];b.life-=dt;
  if(target&&!target.saved){tmp.set(target.x,1.25,target.z).sub(b.mesh.position);const d=tmp.length();if(d<dt*24+.35){if(clearSight(b.mesh.position,target)){if(target.id==='boss')boss.hit();else if(hostileId(target.id)&&!target.influenceBroken){target.influenceBroken=true;markers[target.id].sprite.material.map=pendingTexture;showToast('INFLUENCE BROKEN · SERVE AGAIN');}else session.serve(target.id);emit(target.x,1.2,target.z,20,colors.mint,1.1);}b.life=0;}else b.direction.copy(tmp).normalize();}
  const previous=b.mesh.position.clone();b.mesh.position.addScaledVector(b.direction,24*dt);emit(b.mesh.position.x,b.mesh.position.y,b.mesh.position.z,3,colors.gold,.18);
  if(!clearSight(previous,b.mesh.position))b.life=0;
  if(b.life<=0){scene.remove(b.mesh);b.mesh.children[0].material.dispose();bolts.splice(i,1);}
}}
init().catch(fatal);

function updateFoes(dt){
  const hero=teacher.group.position;
  if(!boss.active)for(const p of session.people){
    if(p.saved||p.influenceBroken||!hostileId(p.id)||session.elapsed<8+Math.floor(releaseRanks[p.id]/3)*10)continue;
    p.attackWait=(p.attackWait??(3+p.id%3))-dt;
    const distance=Math.hypot(p.x-hero.x,p.z-hero.z);
    if(p.attackWait<=0&&distance<12&&distance>2&&clearSight(p,hero)){
      p.attackWait=6;const mesh=new THREE.Mesh(boltGeometry,foeMaterial);mesh.position.set(p.x,1.1,p.z);scene.add(mesh);
      foeShots.push({mesh,owner:p.id,life:4,dx:(hero.x-p.x)/distance,dz:(hero.z-p.z)/distance});
    }
  }
  for(let i=foeShots.length-1;i>=0;i--){const b=foeShots[i],previous=b.mesh.position.clone();b.life-=dt;b.mesh.position.x+=b.dx*dt*3;b.mesh.position.z+=b.dz*dt*3;
    if(session.people[b.owner].saved||boss.active||!clearSight(previous,b.mesh.position))b.life=0;
    if(Math.hypot(b.mesh.position.x-hero.x,b.mesh.position.z-hero.z)<.65){if(contactCooldown<=0){session.takeHit();contactCooldown=1;}b.life=0;}
    if(b.life<=0){scene.remove(b.mesh);foeShots.splice(i,1);}
  }
}
