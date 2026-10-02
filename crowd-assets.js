import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const robeColors = ['#9d6750','#647989','#a38f64','#787253','#8b6c79','#a28162','#587772','#a05f49'];
const scarfColors = ['#b2a184','#9c896b','#c1b193','#7f8076','#a8977c'];
const CROWD_ASSET_DIRECTORY='./assets/crowd/rigged-v3';
let templatesPromise;

// Deterministic per-actor jitter so the crowd looks the same every run.
const hash01 = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function actorFromTemplate(template, index) {
  const group = new THREE.Group();
  group.name = `Anatomical citizen ${index + 1}`;
  const model = cloneSkeleton(template);
  group.add(model);
  const bones = new Map(), materials = new Map();
  model.traverse(object => {
    if (object.isBone) bones.set(object.name, { bone: object });
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const recolor = material => {
      const kind = material.name.match(/^Crowd (robe|trim|scarf|male skin|female skin)(?:\.\d+)?$/)?.[1];
      if (!kind) return material;
      if (materials.has(material)) return materials.get(material);
      const variant = material.clone();
      if (kind === 'robe') {
        variant.color.set(robeColors[index % robeColors.length]);
        variant.color.offsetHSL((hash01(index + 7) - .5) * .02, (hash01(index + 13) - .5) * .07, (hash01(index + 29) - .5) * .06);
      } else if (kind === 'scarf') {
        variant.color.set(scarfColors[index % scarfColors.length]);
        variant.color.offsetHSL((hash01(index + 41) - .5) * .02, 0, (hash01(index + 43) - .5) * .05);
      } else if (kind === 'male skin' || kind === 'female skin') {
        // Keep the authored base tone; jitter it so neighbors are not clones.
        variant.color.offsetHSL((hash01(index + 53) - .5) * .025, (hash01(index + 59) - .5) * .09, (hash01(index + 61) - .5) * .10);
      } else {
        variant.color.set('#66513a');
      }
      materials.set(material, variant);
      return variant;
    };
    object.material = Array.isArray(object.material) ? object.material.map(recolor) : recolor(object.material);
  });
  for (const name of ['head','upperarm_l','upperarm_r','thigh_l','thigh_r']) {
    if (!bones.has(name)) throw new Error(`Crowd GLB is missing required bone: ${name}`);
  }
  model.updateMatrixWorld(true);
  function alignBone(name, childName, direction) {
    const bone = bones.get(name)?.bone, child = bones.get(childName)?.bone;
    if (!bone || !child) return;
    const current = child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
    const world = new THREE.Quaternion().setFromUnitVectors(current, direction.normalize()).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
    model.updateMatrixWorld(true);
  }
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    alignBone(`upperarm_${side}`, `lowerarm_${side}`, new THREE.Vector3(sign * .13, -.99, 0));
    alignBone(`lowerarm_${side}`, `hand_${side}`, new THREE.Vector3(sign * .09, -.98, .16));
  }
  model.traverse(object => { if (object.isSkinnedMesh) object.skeleton.update(); });
  const bounds = new THREE.Box3().setFromObject(model, true);
  if (!Number.isFinite(bounds.max.y - bounds.min.y) || bounds.max.y <= bounds.min.y) throw new Error('Crowd GLB has invalid standing bounds.');
  const height = (index % 2 ? 1.69 : 1.78) + (index % 4) * .022 + hash01(index + 71) * .03;
  const scale = height / (bounds.max.y - bounds.min.y);
  // Subtle build variation: broader or slimmer shoulders, same height.
  const build = 1 + (hash01(index * 3 + 5) - .5) * .08;
  model.scale.set(scale * build, scale, scale * (2 - build));
  model.position.y = -bounds.min.y * scale;
  const floor = model.position.y;
  model.updateMatrixWorld(true);
  // Share the entire actor's generous animation envelope, not each mesh's rest
  // bounds. Three transforms these mesh-local spheres with current matrixWorld,
  // so chasing, turning and bobbing keep the envelope attached to the actor.
  const cullingSphere = new THREE.Sphere(bounds.getCenter(new THREE.Vector3()).multiplyScalar(scale).add(model.position), height * 1.5);
  model.traverse(object => {
    if (!object.isSkinnedMesh) return;
    object.boundingSphere = cullingSphere.clone().applyMatrix4(new THREE.Matrix4().copy(object.matrixWorld).invert());
    object.frustumCulled = true;
  });
  for (const item of bones.values()) {
    item.rest = item.bone.quaternion.clone();
    const inverse = item.bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    item.x = new THREE.Vector3(1, 0, 0).applyQuaternion(inverse);
    item.y = new THREE.Vector3(0, 1, 0).applyQuaternion(inverse);
    item.z = new THREE.Vector3(0, 0, 1).applyQuaternion(inverse);
  }
  const rotation = new THREE.Quaternion();
  function pose(name, x = 0, y = 0, z = 0) {
    const item = bones.get(name);
    if (!item) return;
    item.bone.quaternion.copy(item.rest);
    for (const [axis, angle] of [[item.x,x],[item.y,y],[item.z,z]]) if (angle) item.bone.quaternion.multiply(rotation.setFromAxisAngle(axis,angle));
  }
  let savedState = false, relief = 0, pace = 0, phase = index * 1.173;
  group.userData.asset = { source: `citizen-${index % 2 ? 'female' : 'male'}.glb`, bones: bones.size, anatomical: true };
  const authoredClips=template.animations||[];
  const mixer=authoredClips.length?new THREE.AnimationMixer(model):null;
  const findClip=name=>authoredClips.find(c=>c.name===name);
  const runAction=findClip('Run')&&mixer?mixer.clipAction(findClip('Run')).play():null;
  const walkAction=findClip('Walk')&&mixer?mixer.clipAction(findClip('Walk')).play():null;
  const idleAction=findClip('Idle')&&mixer?mixer.clipAction(findClip('Idle')).play():null;
  // Every neighbor dances to their own clock: without this the whole crowd
  // marches in perfect lockstep because all mixers start on the same frame.
  if(mixer)mixer.setTime(index*0.617+(index%2)*1.31);
  let locomotionWeight=0,runMix=0;
  group.userData.asset.clips=authoredClips.map(c=>c.name);
  const actor = {
    group,
    setSaved(value = true) { savedState = Boolean(value); },
    update(dt, { time = 0, speed = 0, saved } = {}) {
      if (saved !== undefined) savedState = Boolean(saved);
      const safeDt = Math.min(.1, Math.max(0, dt));
      const safeSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
      if(mixer){
        locomotionWeight=THREE.MathUtils.damp(locomotionWeight,!savedState&&safeSpeed>.1?1:0,12,safeDt);
        // Citizens stroll toward the hero; save the run for real speed.
        runMix=THREE.MathUtils.damp(runMix,THREE.MathUtils.clamp((safeSpeed-2)/.6,0,1),8,safeDt);
        const idleW=1-locomotionWeight;
        if(idleAction)idleAction.setEffectiveWeight(idleW);
        if(walkAction){walkAction.setEffectiveWeight(locomotionWeight*(1-runMix));walkAction.setEffectiveTimeScale(THREE.MathUtils.clamp(safeSpeed/1.25,.5,2));}
        if(runAction){runAction.setEffectiveWeight(locomotionWeight*(walkAction?runMix:1));runAction.setEffectiveTimeScale(THREE.MathUtils.clamp(safeSpeed/1.37,.1,3.5));}
        mixer.update(safeDt);return;
      }
      relief = THREE.MathUtils.damp(relief, savedState ? 1 : 0, 5, safeDt);
      pace = THREE.MathUtils.damp(pace, savedState ? 0 : THREE.MathUtils.clamp(safeSpeed / 2.5, 0, 1.25), 11, safeDt);
      phase += safeDt * safeSpeed * Math.PI * 2 / 1.5;
      const wave = Math.sin(phase), cheer = Math.sin(time * 5.7 + index);
      model.position.y = floor + Math.abs(Math.cos(phase)) * pace * .046 + Math.max(0, cheer) * relief * .028;
      pose('pelvis', pace * .038, wave * pace * .032);
      pose('spine_03', pace * .052 - relief * .045, -wave * pace * .055);
      pose('head', -pace * .07 + relief * Math.sin(time * 2.7 + index) * .045, relief * Math.sin(time + index) * .16);
      for (const [side, sign] of [['l', 1], ['r', -1]]) {
        const step = wave * sign;
        pose(`thigh_${side}`, step * pace * .73);
        pose(`calf_${side}`, Math.max(0, -step) * pace * 1.17);
        pose(`foot_${side}`, -Math.max(0, step) * pace * .16);
        pose(`upperarm_${side}`, -step * pace * .74 - relief * (side === 'l' ? 1.35 : 1.05), 0, sign * relief * (.45 + cheer * .06));
        pose(`lowerarm_${side}`, -pace * .44 - relief * (.38 + cheer * .12), relief * cheer * .15);
        pose(`hand_${side}`, 0, relief * cheer * .22);
      }
    },
  };
  actor.update(1 / 60, { time: 0, speed: 0 });
  return actor;
}

/** Two geometry/skin templates, cloned skeletons, shared mesh buffers/textures. */
export async function loadCitizens(count = 18) {
  if (!Number.isInteger(count) || count < 0 || count > 100) throw new RangeError('Citizen count must be an integer from 0 to 100.');
  if (count === 0) return [];
  if (!templatesPromise) {
    const loader = new GLTFLoader();
    templatesPromise = Promise.all(['male','female'].map(type => loader.loadAsync(`${CROWD_ASSET_DIRECTORY}/citizen-${type}.glb`).then(result => {result.scene.animations=result.animations;return result.scene;}))).then(templates => {
      // The two self-contained GLBs embed the same eye map; share it at runtime.
      let eyeMap;
      for (const template of templates) template.traverse(object => {
        if (!object.isMesh) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material.map) material.map.anisotropy = 4;
          if (material.name.includes('high-poly') && material.map) {
            if (eyeMap) material.map = eyeMap;
            else eyeMap = material.map;
          }
        }
      });
      return templates;
    }).catch(error => { templatesPromise = undefined; throw error; });
  }
  const templates = await templatesPromise;
  return Array.from({ length: count }, (_, index) => actorFromTemplate(templates[index % 2], index));
}
