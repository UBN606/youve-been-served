import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { smoothGeneratedNormals } from './generated-normals.js';
import { createLocalGeneratedRig } from './local-generated-rig.js';

const DEFAULTS = {
  height: 1.85,
  forwardYaw: 0,
  fadeSeconds: .22,
  movingThreshold: .12,
  runSpeed: 6,
  idleFallback: 'hold-run-frame',
  idleFrameTime: 0,
  centerHorizontal: true,
};

function selectClip(clips, requested, pattern, role) {
  if (requested !== undefined && requested !== null) {
    const clip = Number.isInteger(requested) ? clips[requested] : clips.find(item => item.name === requested);
    if (!clip) throw new Error(`Requested ${role} clip was not found: ${requested}`);
    return clip;
  }
  return clips.find(clip => pattern.test(clip.name)) || null;
}

function heldFrame(clip, time) {
  const sampleTime = THREE.MathUtils.clamp(time, 0, clip.duration);
  const tracks = clip.tracks.map(track => {
    // Sampling handles ordinary and GLTF cubic-spline tracks. A fresh constant
    // track holds the sampled pose without manipulating unknown skeleton bones.
    const sample = Array.from(track.createInterpolant().evaluate(sampleTime));
    return new track.constructor(track.name, [0, .5], [...sample, ...sample], THREE.InterpolateLinear);
  });
  return new THREE.AnimationClip('Loader_HeldRunFrame_NotAuthoredIdle', .5, tracks);
}

function rootTranslationEvidence(clips, model, scale) {
  const result = [];
  for (const clip of clips) for (const track of clip.tracks) {
    const binding = THREE.PropertyBinding.parseTrackName(track.name);
    if (binding.propertyName !== 'position' || track.ValueTypeName !== 'vector') continue;
    const node = THREE.PropertyBinding.findNode(model, binding.nodeName);
    // A locomotion pelvis may sit below a BoneRoot or other bone. Inspect every
    // resolved position track; topology alone cannot certify absence of drift.
    // Limb-local travel can also appear here, so findings are candidate evidence,
    // never a claim that this track is necessarily character root motion.
    if (!node) continue;
    const possibleRoot = !node.isBone || !node.parent?.isBone;
    const interpolant = track.createInterpolant();
    const start = Array.from(interpolant.evaluate(0));
    let maxHorizontal = 0;
    for (let i = 1; i <= 12; i++) {
      const value = interpolant.evaluate(clip.duration * i / 12);
      maxHorizontal = Math.max(maxHorizontal, Math.hypot(value[0] - start[0], value[2] - start[2]) * scale);
    }
    if (maxHorizontal > .025) result.push({
      clip: clip.name,
      track: track.name,
      node: node.name,
      nodeType: node.isBone ? 'bone' : node.type,
      parentBone: node.parent?.isBone ? node.parent.name : null,
      rootLikeTopology: possibleRoot,
      evidence: 'sampled-horizontal-local-track-translation',
      estimatedHorizontalTravelMetres: maxHorizontal,
    });
  }
  return result;
}

/**
 * Build an actor from a loaded GLTF; also usable for offline integration checks.
 * Actor group translation/yaw belongs entirely to the game. No bone-name-based
 * posing or retargeting is performed. Unknown clips remain unchanged.
 */
export function createMeshyTeacherActor(gltf, options = {}) {
  if (!gltf?.scene?.isObject3D) throw new TypeError('A parsed GLTF scene is required.');
  const settings = { ...DEFAULTS, ...options };
  for (const key of ['height', 'fadeSeconds', 'runSpeed']) {
    if (!Number.isFinite(settings[key]) || settings[key] <= 0) throw new RangeError(`${key} must be positive and finite.`);
  }
  for (const key of ['forwardYaw', 'movingThreshold', 'idleFrameTime']) {
    if (!Number.isFinite(settings[key])) throw new RangeError(`${key} must be finite.`);
  }
  if (!['rest', 'hold-run-frame'].includes(settings.idleFallback)) throw new RangeError('idleFallback must be rest or hold-run-frame.');
  const group = new THREE.Group();
  group.name = 'Teacher generated GLTF candidate';
  const normalized = new THREE.Group();
  const facing = new THREE.Group();
  facing.rotation.y = settings.forwardYaw;
  group.add(normalized);
  normalized.add(facing);
  const model = gltf.scene;
  facing.add(model);
  const boneNames = [], warnings = [];
  let meshCount = 0, skinnedMeshCount = 0;
  model.traverse(object => {
    if (object.isBone) boneNames.push(object.name);
    if (!object.isMesh) return;
    meshCount++;
    if (settings.smoothNormals) {
      const smooth = smoothGeneratedNormals(object.geometry);
      object.geometry = smooth.geometry;
      object.userData.normalSmoothing = smooth.diagnostics;
    }
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.isSkinnedMesh) {
      skinnedMeshCount++;
      object.frustumCulled = false;
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material?.map) material.map.anisotropy = 8;
    }
  });
  if (!meshCount) throw new Error('Generated GLTF contains no renderable meshes.');
  const sourceClips = [...(gltf.animations || [])];
  const idleClip = selectClip(sourceClips, settings.idleClip, /idle|standing|breath|rest/i, 'idle');
  let runClip = selectClip(sourceClips, settings.runClip, /run|jog|sprint/i, 'run');
  if (!runClip && sourceClips.length === 1 && sourceClips[0] !== idleClip) {
    runClip = sourceClips[0];
    warnings.push('The sole unnamed-motion clip is selected for movement; verify it is the requested run animation.');
  }
  if (runClip === idleClip && runClip) throw new Error('Run and idle must use different clips.');
  const mixer = new THREE.AnimationMixer(model);
  let idleMode = idleClip ? 'authored-idle' : 'source-rest-pose';
  const fallback = !idleClip && runClip && settings.idleFallback === 'hold-run-frame' ? heldFrame(runClip, settings.idleFrameTime) : null;
  if (fallback) {
    idleMode = 'held-run-frame';
    warnings.push('No authored idle clip: idle holds a sampled run frame. It is not an authored breathing/standing animation.');
  } else if (!idleClip) {
    warnings.push('No authored idle clip: idle uses the source rest pose, which may be an A or T pose.');
  }
  if (!runClip) warnings.push(sourceClips.length ? 'No run clip was selected; movement remains visually idle until a clip is explicitly selected.' : 'This asset has no animation clips; it remains static.');
  const runAction = runClip ? mixer.clipAction(runClip).setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(0).play() : null;
  const idleAction = idleClip || fallback ? mixer.clipAction(idleClip || fallback).setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).play() : null;
  mixer.update(0);
  group.updateMatrixWorld(true);
  model.traverse(object => { if (object.isSkinnedMesh) object.skeleton.update(); });
  const bounds = new THREE.Box3().setFromObject(facing, true);
  const rawHeight = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(rawHeight) || rawHeight <= 0) throw new Error('Generated GLTF has invalid visible height.');
  const scale = settings.height / rawHeight;
  normalized.scale.setScalar(scale);
  const centre = bounds.getCenter(new THREE.Vector3());
  normalized.position.set(settings.centerHorizontal ? -centre.x * scale : 0, -bounds.min.y * scale, settings.centerHorizontal ? -centre.z * scale : 0);
  group.updateMatrixWorld(true);
  const rootMotion = rootTranslationEvidence(sourceClips, model, scale);
  if (rootMotion.length) warnings.push('Significant horizontal translation is present in animation position tracks, including nested bones when applicable. These are candidate root-motion findings; local limb motion may also appear. Clips are unchanged; verify drift before game promotion.');
  const diagnostics = {
    source: settings.source || null,
    height: settings.height,
    rawHeight,
    normalizationScale: scale,
    forwardYaw: settings.forwardYaw,
    boneCount: boneNames.length,
    boneNames,
    meshCount,
    skinnedMeshCount,
    clips: sourceClips.map(clip => ({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length })),
    runClip: runClip?.name ?? null,
    idleClip: idleClip?.name ?? null,
    idleMode,
    rootMotion,
    rootMotionAssessment: 'Candidate evidence from sampled local position tracks only; absence of findings does not verify an in-place animation.',
    warnings,
    verifiedVisual: false,
  };
  group.userData.asset = { source: diagnostics.source, bones: boneNames.length, clips: diagnostics.clips.map(clip => clip.name), candidate: true, animationMode: runClip ? 'authored-run-clip' : 'no-run-clip' };
  let runWeight = 0, moving = false, disposed = false;
  return {
    group,
    mixer,
    diagnostics,
    getDiagnostics() { return { ...diagnostics, moving, runWeight, playbackTime: mixer.time, disposed }; },
    update(dt, { speed = 0 } = {}) {
      if (disposed) return;
      const safeDt = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, .1) : 0;
      const metresPerSecond = Number.isFinite(speed) ? Math.abs(speed) : 0;
      moving = metresPerSecond > settings.movingThreshold;
      runWeight = THREE.MathUtils.damp(runWeight, moving && runAction ? 1 : 0, 4 / settings.fadeSeconds, safeDt);
      if (runAction) {
        runAction.setEffectiveWeight(runWeight);
        runAction.setEffectiveTimeScale(moving ? THREE.MathUtils.clamp(metresPerSecond / settings.runSpeed, .45, 1.8) : 1);
      }
      if (idleAction) idleAction.setEffectiveWeight(1 - runWeight);
      mixer.update(safeDt);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
      model.traverse(object => {
        if (!object.isMesh) return;
        geometries.add(object.geometry);
        if (object.isSkinnedMesh) skeletons.add(object.skeleton);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
      });
      for (const skeleton of skeletons) skeleton.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      group.remove(normalized);
    },
  };
}

/** Loading only; call sites decide when a reviewed candidate replaces the hero. */
export async function loadMeshyTeacher(url, options = {}) {
  if (typeof url !== 'string' || !url.trim()) throw new TypeError('An explicit candidate GLB URL is required.');
  if(options.rigProfile&&!options.localRig)throw new Error('An explicit rigProfile requires localRig:true; it is not an authored provider animation.');
  const gltf = await new GLTFLoader().loadAsync(url);
  if (options.localRig) {
    if (options.smoothNormals) gltf.scene.traverse(object => {
      if (object.isMesh) object.geometry = smoothGeneratedNormals(object.geometry).geometry;
    });
    const actor = createLocalGeneratedRig(gltf.scene, {...options, sourceUrl:url});
    const get = actor.getDiagnostics.bind(actor);
    actor.getDiagnostics = () => {const info=get();return {...info, runWeight:info.pace, playbackTime:info.elapsed};};
    return actor;
  }
  return createMeshyTeacherActor(gltf, { ...options, source: url });
}
