import * as THREE from 'three';

const smooth = (a, b, value) => THREE.MathUtils.smoothstep(value, a, b);
const vector = new THREE.Vector3();
const IDENTITY = new THREE.Matrix4();

const PROFILES=Object.freeze({
  'meshy-a-pose':Object.freeze({label:'Measured Teacher A-pose, arms about 25 degrees from vertical',armsDown:false}),
  'tripo-arms-down':Object.freeze({label:'Tripo Teacher arms-down pose; native front corrected by minus 90 degrees yaw',armsDown:true}),
});

function addWeight(weights, name, amount) {
  if (amount > 0) weights.set(name, (weights.get(name) || 0) + amount);
}

/**
 * Geometry-only approximation for the measured Teacher A-pose. This is a local
 * rig and procedural motion, never provider skinning or the paid RunFast clip.
 * Coordinates below are metres in a grounded 1.85 m, +Z-facing body space.
 */
function weightsAt(x, y, z, profile) {
  const weights = new Map();
  const down=profile.armsDown;
  const armEdge = down ? .185 + THREE.MathUtils.clamp((1.44-y)/.68,0,1)*.060 : .165 + THREE.MathUtils.clamp((1.43 - y) / .66, 0, 1) * .205;
  const arm = smooth(armEdge - (down?.020:.025), armEdge + (down?.030:.060), Math.abs(x)) * smooth(down?.63:.65, down?.71:.76, y) * (1 - smooth(1.45, 1.52, y));
  const body = 1 - arm;
  if (arm > 0) {
    const side = x >= 0 ? 'L' : 'R';
    const upper = smooth(down?1.02:1.06, down?1.19:1.22, y);
    const hand = 1 - smooth(down?.79:.875, down?.91:1.005, y);
    addWeight(weights, `upperarm_${side}`, arm * upper);
    addWeight(weights, `forearm_${side}`, arm * (1 - upper) * (1 - hand));
    addWeight(weights, `hand_${side}`, arm * (1 - upper) * hand);
  }
  if (body > 0) {
    const footRegion = 1 - smooth(.095, .16, y);
    const left = smooth(-.10, .10, x);
    if (footRegion > 0) {
      const foot = 1 - smooth(.055, .12, y);
      for (const [side, sideWeight] of [['L', left], ['R', 1 - left]]) {
        addWeight(weights, `foot_${side}`, body * footRegion * sideWeight * foot);
        addWeight(weights, `calf_${side}`, body * footRegion * sideWeight * (1 - foot));
      }
    }
    const clothed = body * (1 - footRegion);
    const skirt = 1 - smooth(.72, 1.04, y);
    // The continuous robe follows two mild cloth bones across a broad midline
    // blend, rather than snapping the connected skirt to separate running legs.
    addWeight(weights, 'cloth_L', clothed * skirt * left);
    addWeight(weights, 'cloth_R', clothed * skirt * (1 - left));
    const torso = clothed * (1 - skirt);
    if (torso > 0) {
      const head = smooth(1.46, 1.58, y);
      const neck = smooth(1.40, 1.52, y) * (1 - head);
      const chest = smooth(1.16, 1.38, y) * (1 - head - neck);
      const spine = smooth(.99, 1.21, y) * (1 - head - neck - chest);
      addWeight(weights, 'head', torso * head);
      addWeight(weights, 'neck', torso * neck);
      addWeight(weights, 'chest', torso * chest);
      addWeight(weights, 'spine', torso * spine);
      addWeight(weights, 'pelvis', torso * Math.max(0, 1 - head - neck - chest - spine));
    }
  }
  return weights;
}

function skeletonForHeight(height, profile) {
  const factor = height / 1.85;
  const bones = [], named = new Map(), restPositions = new Map();
  const make = (name, position, parentName) => {
    const bone = new THREE.Bone();
    bone.name = `Local_${name}`;
    const absolute = new THREE.Vector3(...position).multiplyScalar(factor);
    const parent = named.get(parentName);
    bone.position.copy(absolute);
    if (parent) { bone.position.sub(restPositions.get(parentName)); parent.add(bone); }
    named.set(name, bone);
    restPositions.set(name, absolute);
    bones.push(bone);
    return bone;
  };
  const root = make('root', [0, 0, 0]);
  make('pelvis', [0, .96, 0], 'root');
  make('spine', [0, 1.16, 0], 'pelvis');
  make('chest', [0, 1.39, 0], 'spine');
  make('neck', [0, 1.49, .005], 'chest');
  make('head', [0, 1.62, .015], 'neck');
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    make(`clavicle_${side}`, [sign * .12, 1.40, 0], 'chest');
    make(`upperarm_${side}`, [sign * (profile.armsDown?.225:.205), 1.40, 0], `clavicle_${side}`);
    make(`forearm_${side}`, [sign * (profile.armsDown?.285:.345), profile.armsDown?1.09:1.125, .025], `upperarm_${side}`);
    make(`hand_${side}`, [sign * (profile.armsDown?.30:.46), profile.armsDown?.845:.915, .055], `forearm_${side}`);
    make(`thigh_${side}`, [sign * .115, .945, 0], 'pelvis');
    make(`calf_${side}`, [sign * .14, .50, .01], `thigh_${side}`);
    make(`foot_${side}`, [sign * .165, .065, .025], `calf_${side}`);
    make(`cloth_${side}`, [sign * .085, .94, 0], 'pelvis');
  }
  return { root, bones, named, restPositions, factor };
}

function groundContacts(mesh, height) {
  const positions = mesh.geometry.attributes.position;
  const grid = new Map();
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
    if (y > height * .058 || Math.abs(x) < height * .024) continue;
    const key = `${Math.round(x / .012)}:${Math.round(z / .012)}`;
    const previous = grid.get(key);
    if (!previous || y < previous.y) grid.set(key, { index, y });
  }
  return [...grid.values()].map(value => value.index);
}

/**
 * Clone geometry into a new actor while sharing the original PBR materials and
 * textures. Original GLB scene, attributes and files are never modified.
 */
export function createLocalGeneratedRig(source, { height = 1.85, forwardYaw = 0, sourceUrl = null, rigProfile = 'meshy-a-pose' } = {}) {
  const model = source?.scene || source;
  if (!model?.isObject3D) throw new TypeError('A loaded static GLTF scene or Object3D is required.');
  if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(forwardYaw)) throw new RangeError('Height and facing correction must be finite; height must be positive.');
  const profile=PROFILES[rigProfile];
  if(!profile)throw new RangeError('Unknown local rig profile: '+rigProfile);
  const inputMeshes = [];
  model.updateWorldMatrix(true, true);
  model.traverse(object => {
    if (object.isSkinnedMesh) throw new Error('Local rig fallback only accepts static meshes; preserve an existing provider skeleton.');
    if (object.isMesh) inputMeshes.push(object);
  });
  if (!inputMeshes.length) throw new Error('Static model has no meshes to rig.');
  const group = new THREE.Group();
  group.name = 'Generated Teacher with local approximate rig';
  const parentInverse = model.parent ? model.parent.matrixWorld.clone().invert() : IDENTITY;
  const yaw = new THREE.Matrix4().makeRotationY(forwardYaw);
  const copies = inputMeshes.map(mesh => {
    const geometry = mesh.geometry.clone();
    if (!geometry.attributes.position) throw new Error('A model primitive has no positions.');
    const transform = new THREE.Matrix4().multiplyMatrices(yaw, new THREE.Matrix4().multiplyMatrices(parentInverse, mesh.matrixWorld));
    geometry.applyMatrix4(transform);
    geometry.computeBoundingBox();
    return { source: mesh, geometry };
  });
  const bounds = new THREE.Box3();
  for (const copy of copies) bounds.union(copy.geometry.boundingBox);
  const rawHeight = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(rawHeight) || rawHeight <= 0) throw new Error('Static model has invalid bounds.');
  if(profile.armsDown&&(bounds.max.x-bounds.min.x)<(bounds.max.z-bounds.min.z)*1.15)throw new Error('Arms-down profile needs a verified frontal orientation before weighting; this Tripo master uses forwardYaw:-Math.PI/2.');
  const scale = height / rawHeight, centre = bounds.getCenter(new THREE.Vector3());
  const translation = new THREE.Vector3(-centre.x * scale, -bounds.min.y * scale, -centre.z * scale);
  const normalization = new THREE.Matrix4().makeTranslation(...translation.toArray()).multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
  const rig = skeletonForHeight(height, profile);
  group.add(rig.root);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(rig.bones);
  const indicesByName = new Map([...rig.named.keys()].map((name, index) => [name, index]));
  const meshes = [], contacts = [];
  let vertexCount = 0, maxWeightError = 0;
  for (const copy of copies) {
    const geometry = copy.geometry;
    geometry.applyMatrix4(normalization);
    const positions = geometry.attributes.position;
    const indices = new Uint16Array(positions.count * 4), weights = new Float32Array(positions.count * 4);
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index) / rig.factor, y = positions.getY(index) / rig.factor, z = positions.getZ(index) / rig.factor;
      const influences = [...weightsAt(x, y, z, profile)].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = influences.reduce((total, entry) => total + entry[1], 0);
      if (!Number.isFinite(sum) || sum <= 0) throw new Error(`Invalid generated skin weights at vertex ${index}.`);
      for (let slot = 0; slot < influences.length; slot++) {
        indices[index * 4 + slot] = indicesByName.get(influences[slot][0]);
        weights[index * 4 + slot] = influences[slot][1] / sum;
      }
      maxWeightError = Math.max(maxWeightError, Math.abs(weights[index * 4] + weights[index * 4 + 1] + weights[index * 4 + 2] + weights[index * 4 + 3] - 1));
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.SkinnedMesh(geometry, copy.source.material);
    mesh.name = `${copy.source.name || 'Mesh'}_LocalRig`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    mesh.bind(skeleton, IDENTITY);
    meshes.push(mesh);
    contacts.push({ mesh, indices: groundContacts(mesh, height) });
    vertexCount += positions.count;
  }
  group.updateMatrixWorld(true);
  skeleton.update();
  const diagnostics = {
    source: sourceUrl,
    provenance: 'locally-generated-geometric-skinning-and-procedural-motion',
    localGeneratedRig: true,
    providerRigDelivered: false,
    providerAnimationClips: 0,
    rigProfile,profile:profile.label,
    height, rawHeight, normalizationScale: scale, forwardYaw,
    boneCount: rig.bones.length,
    boneNames: rig.bones.map(bone => bone.name),
    vertexCount, skinnedMeshCount: meshes.length, meshCount: meshes.length,
    clips: [], runClip: null, idleClip: null,idleMode:'local-procedural-breathing',
    motionRange:profile.armsDown?'restricted-long-robe-prototype':'original-a-pose-prototype',
    animationMode: 'local-procedural-approximation',
    maxWeightSumError: maxWeightError,
    contactSamples: contacts.reduce((sum, item) => sum + item.indices.length, 0),
    verifiedVisual: false,
    warnings: [
      'This is locally generated skinning and approximate procedural motion, not the provider RunFast animation.',
      'The source has a continuous long robe. Mild cloth bones preserve its connected surface; this is not cloth simulation.',
      'Hands move as rigid hand regions; fingers and facial expressions are not independently rigged.',
      `Joint positions and weights use the explicit ${rigProfile} profile and require visual deformation review.`,
      ...(profile.armsDown?['This generated body stretched at wrists and ankles in full-stride tests. Motion range is restricted; natural running needs cleaner limb/robe topology and fitted weights.']:[]),
    ],
  };
  group.userData.asset = { source: sourceUrl, candidate: true, localGeneratedRig: true, rigProfile,forwardYaw,bones: rig.bones.length, animationMode: diagnostics.animationMode };
  let phase = 0, elapsed = 0, pace = 0, rescue = 0, groundingOffset = 0, disposed = false;
  const pose = (name, x = 0, y = 0, z = 0) => rig.named.get(name).rotation.set(x, y, z, 'XYZ');
  const rest = new Map(rig.bones.map(bone => [bone, bone.position.clone()]));
  function resetBindPose() {
    for (const bone of rig.bones) { bone.quaternion.identity(); bone.position.copy(rest.get(bone)); }
    groundingOffset = 0;
    group.updateMatrixWorld(true);
    skeleton.update();
  }
  function groundFeet() {
    rig.root.position.y = 0;
    group.updateMatrixWorld(true);
    skeleton.update();
    let minimum = Infinity;
    for (const item of contacts) for (const index of item.indices) {
      item.mesh.getVertexPosition(index, vector);
      minimum = Math.min(minimum, vector.y);
    }
    groundingOffset = Number.isFinite(minimum) ? -minimum : 0;
    rig.root.position.y = groundingOffset;
    group.updateMatrixWorld(true);
    skeleton.update();
  }
  return {
    group,
    skeleton,
    skinnedMeshes: meshes,
    diagnostics,
    getDiagnostics() { return { ...diagnostics, pace, rescue, phase, elapsed, groundingOffset, disposed }; },
    resetBindPose,
    update(dt, { time, speed = 0, rescuing = false } = {}) {
      if (disposed) return;
      const safeDt = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, .1) : 0;
      const metresPerSecond = Number.isFinite(speed) ? Math.abs(speed) : 0;
      elapsed = Number.isFinite(time) ? time : elapsed + safeDt;
      pace = THREE.MathUtils.damp(pace, THREE.MathUtils.clamp(metresPerSecond / 6, 0, 1.15), 10, safeDt);
      rescue = THREE.MathUtils.damp(rescue, rescuing ? 1 : 0, rescuing ? 15 : 7, safeDt);
      phase += safeDt * (5 + Math.min(9, metresPerSecond) * 1.65);
      const wave = Math.sin(phase), breath = Math.sin(elapsed * 2.1);
      pose('pelvis', -.015 * pace, wave * pace * .025);
      pose('spine', -.025 * pace, -wave * pace * .025);
      pose('chest', breath * .005, -wave * pace * .02);
      pose('neck', 0, 0, 0);
      pose('head', .012 * pace, breath * .008);
      for (const [side, sign] of [['L', 1], ['R', -1]]) {
        const step = wave * sign;
        const thigh = -step * pace * (profile.armsDown?.15:.49);
        const knee = ((profile.armsDown?.015:.10) + Math.max(0, -step) * (profile.armsDown?.17:.77)) * pace;
        const offer = rescue * (side === 'R' ? 1 : .65);
        pose(`thigh_${side}`, thigh);
        pose(`calf_${side}`, knee);
        pose(`foot_${side}`, -thigh - knee + Math.max(0, -step) * pace * .14);
        pose(`clavicle_${side}`, 0, 0, 0);
        pose(`upperarm_${side}`, step * pace * (profile.armsDown?.06:.60) - offer * (profile.armsDown?.08:1.02), 0, -sign * (profile.armsDown?0:.30) * (1 - offer * .8));
        pose(`forearm_${side}`, -(profile.armsDown?0:.12) - pace * (profile.armsDown?.025:.48) - offer * (profile.armsDown?.025:.22));
        pose(`hand_${side}`, (profile.armsDown?.01:.04) * offer, -sign * (profile.armsDown?0:.18) * (1 - offer), sign * (profile.armsDown?.012:.05) * pace);
        pose(`cloth_${side}`, thigh * (profile.armsDown?.60:.28), 0, -sign * .012 * pace + wave * pace * .008);
      }
      groundFeet();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      skeleton.dispose();
      for (const mesh of meshes) mesh.geometry.dispose();
      // Materials and textures belong to the loaded source model and are shared.
      group.clear();
    },
  };
}
