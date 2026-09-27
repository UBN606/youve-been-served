import * as THREE from 'three';

// One lighting rig for the compact arena. The shadow camera is fitted to the
// playable district instead of spending most of its texels on the old city.
export function lightCourtyard(scene, renderer, { mobile = false } = {}) {
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMappingExposure = 1.08;
  scene.background = new THREE.Color('#a9bfce');
  scene.fog = new THREE.FogExp2('#c9c0ab', .009);
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d'), sky = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [stop, color] of [[0,'#668ead'],[.40,'#c5d6dd'],[.50,'#f1dcc0'],[.56,'#9c876b'],[1,'#453b32']]) sky.addColorStop(stop,color);
  ctx.fillStyle = sky; ctx.fillRect(0,0,512,256);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace; map.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer), environment = pmrem.fromEquirectangular(map);
  scene.environment = environment.texture; scene.environmentIntensity = .65;
  map.dispose(); pmrem.dispose();
  const hemisphere = new THREE.HemisphereLight('#cfdfec','#73553b',.48);
  const sun = new THREE.DirectionalLight('#ffe1b1',3.0);
  sun.position.set(-25,32,-14); sun.target.position.set(0,0,5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);
  Object.assign(sun.shadow.camera,{left:-28,right:28,top:32,bottom:-27,near:1,far:100});
  sun.shadow.normalBias = .012; sun.shadow.bias = -.00008;
  const fill = new THREE.DirectionalLight('#a8c4e1',.22); fill.position.set(15,8,25);
  scene.add(hemisphere,sun,sun.target,fill);
  return { sun, dispose(){environment.dispose();scene.remove(hemisphere,sun,sun.target,fill);} };
}

// Grounding survives the phone's low-cost profile. These are soft ambient
// contact patches, not a replacement for directional cast shadows.
export function createContactShadows(scene, actors) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'rgba(38,27,17,.42)');
  gradient.addColorStop(.35,'rgba(38,27,17,.28)');
  gradient.addColorStop(1,'rgba(38,27,17,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const geometry=new THREE.PlaneGeometry(1,1);geometry.rotateX(-Math.PI/2);
  const material=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  const mesh=new THREE.InstancedMesh(geometry,material,actors.length);
  mesh.name='Character ambient contact shadows';mesh.frustumCulled=false;mesh.renderOrder=1;
  const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3(),position=new THREE.Vector3();
  scene.add(mesh);
  return {update(){
    for(let i=0;i<actors.length;i++){
      const actor=actors[i].group;
      position.set(actor.position.x,.012,actor.position.z);
      scale.set(actor.visible?.85:0,1,actor.visible?.65:0);
      matrix.compose(position,rotation,scale);mesh.setMatrixAt(i,matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
  },dispose(){scene.remove(mesh);geometry.dispose();material.dispose();map.dispose();}};
}
