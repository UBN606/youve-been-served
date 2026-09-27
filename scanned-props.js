import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Staged module only. Main does not import it until derivatives and review exist.
const ROOT = './assets/scanned-props/';
export const SCANNED_PROP_ASSETS = Object.freeze(['wicker_basket_01', 'namaqualand_boulder_03']);
export const SCANNED_PROP_PLACEMENTS = Object.freeze([
  { id: 'basket-west-counter', asset: 'wicker_basket_01', x: -7.50, z: -3.50, y: .015, width: .66, yaw: .20, containment: 'collider' },
  { id: 'basket-east-counter', asset: 'wicker_basket_01', x: 6.50, z: 3.10, y: .015, width: .66, yaw: -.35, containment: 'collider' },
  { id: 'basket-east-market', asset: 'wicker_basket_01', x: 27, z: -.95, y: .015, width: .66, yaw: .65, containment: 'collider' },
  { id: 'boulder-northwest-edge', asset: 'namaqualand_boulder_03', x: -36.2, z: -29.4, y: -.02, width: 2.6, yaw: .42, containment: 'outside-bounds' },
  { id: 'boulder-northeast-edge', asset: 'namaqualand_boulder_03', x: 36.2, z: -24.4, y: -.02, width: 2.4, yaw: -1.12, containment: 'outside-bounds' },
].map(Object.freeze));

export function scannedPropURL(url, mobile = false) {
  // Keep original glTF/bin and maps untouched. Missing derivatives must fail;
  // silently falling back to the 4K scans would defeat the phone budget.
  if (typeof url !== 'string' || !url.startsWith(ROOT)) throw Error('Scanned props require project-local URLs.');
  const file = url.slice(ROOT.length);
  const id = SCANNED_PROP_ASSETS.find(asset => file.startsWith(asset + '/'));
  if (!id) throw Error('Unknown scanned prop asset.');
  if (file === `${id}/${id}_4k.gltf` || file === `${id}/${id}.bin`) return url;
  if (['diff', 'nor_gl', 'arm'].some(map => file === `${id}/textures/${id}_${map}_4k.jpg`)) {
    return url.replace(/_4k\.jpg$/, mobile ? '_1k.jpg' : '_2k.jpg');
  }
  throw Error('Unexpected scanned prop dependency.');
}

function placementFits(box, placement, world) {
  if (placement.containment === 'outside-bounds') {
    const b = world.bounds;
    return box.max.x < b.minX || box.min.x > b.maxX || box.max.z < b.minZ || box.min.z > b.maxZ;
  }
  return world.colliders.some(c => box.min.x >= c.minX && box.max.x <= c.maxX && box.min.z >= c.minZ && box.max.z <= c.maxZ);
}

export function assembleScannedProps(templates, { world, mobile = false } = {}) {
  if (!world?.bounds || !Array.isArray(world.colliders)) throw Error('Pass the actual world to validate prop clearance.');
  const group = new THREE.Group();
  group.name = 'scanned-market-and-edge-props';
  const placements = [];
  let triangles = 0;
  for (const id of SCANNED_PROP_ASSETS) {
    const scene = templates.get(id);
    if (!scene) throw Error('Missing scanned prop template: ' + id);
    scene.updateMatrixWorld(true);
    const meshes = [];
    scene.traverse(node => { if (node.isMesh) meshes.push(node); });
    if (meshes.length !== 1 || meshes[0].isSkinnedMesh || Array.isArray(meshes[0].material)) throw Error('Scanned prop topology changed: ' + id);
    const source = meshes[0], geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z);
    if (!(span > 0) || !Number.isFinite(span)) throw Error('Invalid scanned prop bounds: ' + id);
    geometry.translate(-center.x, -geometry.boundingBox.min.y, -center.z);
    geometry.computeBoundingBox();
    const material = source.material.clone();
    // Poly Haven ARM carries AO in red on the same UV set as roughness.
    if (!material.aoMap && material.roughnessMap) { material.aoMap = material.roughnessMap; material.aoMapIntensity = .7; }
    const items = SCANNED_PROP_PLACEMENTS.filter(p => p.asset === id);
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.name = id;
    mesh.castShadow = !mobile;
    mesh.receiveShadow = true;
    const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
    items.forEach((p, index) => {
      const scale = p.width / span;
      matrix.compose(new THREE.Vector3(p.x, p.y, p.z), rotation.setFromAxisAngle(axis, p.yaw), new THREE.Vector3(scale, scale, scale));
      const box = geometry.boundingBox.clone().applyMatrix4(matrix);
      if (!placementFits(box, p, world)) throw Error('Prop would enter traversal space: ' + p.id);
      mesh.setMatrixAt(index, matrix);
      placements.push({ id: p.id, min: box.min.toArray(), max: box.max.toArray(), containment: p.containment });
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3 * items.length;
    group.add(mesh);
  }
  group.userData = { staged: true, profile: mobile ? 'mobile-1k' : 'desktop-2k', instances: SCANNED_PROP_PLACEMENTS.length, baseDrawCalls: group.children.length, triangles, placements };
  return group;
}

export async function loadScannedProps({ world, mobile = false } = {}) {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => scannedPropURL(url, mobile));
  const loader = new GLTFLoader(manager), templates = new Map();
  for (const id of SCANNED_PROP_ASSETS) {
    const gltf = await loader.loadAsync(`${ROOT}${id}/${id}_4k.gltf`);
    templates.set(id, gltf.scene);
  }
  // Returns a detached group. Caller chooses whether/when to add it to a scene.
  return assembleScannedProps(templates, { world, mobile });
}
