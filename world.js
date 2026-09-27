import * as THREE from 'three';

// A purpose-built arcade district, inspired by ancient Jerusalem rather than a
// reconstruction. Geometry is deterministic. Locally bundled Poly Haven CC0
// photographs/normal/roughness maps replace the original blockout materials.
const SEED = 260926;
function randomSource(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function canvasTexture(size, draw, repeat = 1) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat); texture.anisotropy = 8;
  return texture;
}

function makeTextures() {
  const rng = randomSource(SEED);
  const stone = canvasTexture(512, (ctx, n) => {
    ctx.fillStyle = '#baaa87'; ctx.fillRect(0, 0, n, n);
    for (let row = 0; row < 6; row++) {
      const h = n / 6;
      for (let column = -1; column < 4; column++) {
        const x = column * 171 + (row % 2) * 85, y = row * h;
        const light = 65 + rng() * 10;
        ctx.fillStyle = `hsl(39,29%,${light}%)`; ctx.fillRect(x + 2, y + 2, 167, h - 4);
        ctx.strokeStyle = 'rgba(255,247,214,.23)'; ctx.lineWidth = 2;
        ctx.strokeRect(x + 4, y + 4, 163, h - 8);
      }
    }
    for (let i = 0; i < 25000; i++) {
      ctx.fillStyle = rng() < .55 ? 'rgba(72,57,35,.075)' : 'rgba(255,250,223,.15)';
      ctx.fillRect(rng() * n, rng() * n, rng() * 3 + .5, rng() * 2 + .5);
    }
  });
  const cobble = canvasTexture(1024, (ctx, n) => {
    ctx.fillStyle = '#8b7d65'; ctx.fillRect(0, 0, n, n);
    for (let row = 0; row < 12; row++) for (let col = -1; col < 11; col++) {
      const width = 104, height = n / 12, x = col * width + (row % 2) * width / 2, y = row * height;
      const light = 49 + rng() * 19;
      ctx.fillStyle = `hsl(${35 + rng() * 7},${15 + rng() * 9}%,${light}%)`;
      ctx.beginPath(); ctx.roundRect(x + 3, y + 3, width - 6, height - 6, 7 + rng() * 9); ctx.fill();
      ctx.strokeStyle = 'rgba(241,227,188,.32)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(48,37,23,.10)'; ctx.fillRect(x + 9, y + height - 10, width - 15, 4);
    }
    for (let i = 0; i < 90000; i++) {
      ctx.fillStyle = rng() < .5 ? 'rgba(19,14,5,.045)' : 'rgba(255,245,222,.08)';
      ctx.fillRect(rng() * n, rng() * n, 2, 2);
    }
  }, 36);
  const cloth = (color) => canvasTexture(256, (ctx, n) => {
    ctx.fillStyle = '#ddd0aa'; ctx.fillRect(0, 0, n, n);
    for (let x = 0; x < n; x += 64) { ctx.fillStyle = color; ctx.fillRect(x, 0, 32, n); }
    for (let i = 0; i < 1600; i++) {
      ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,.08)' : 'rgba(48,29,7,.09)';
      ctx.beginPath(); const y = rng() * n; ctx.moveTo(0, y); ctx.lineTo(n, y); ctx.stroke();
    }
  });
  const bark = (kind) => canvasTexture(256, (ctx, n) => {
    const grain = randomSource(SEED + 717);
    ctx.fillStyle = kind === 'color' ? '#756653' : kind === 'height' ? '#777777' : '#dddddd';
    ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 420; i++) {
      const x = grain() * n, y = grain() * n, value = 35 + grain() * 80, saturation = 12 + grain() * 8;
      ctx.strokeStyle = kind === 'color' ? `hsl(33,${saturation}%,${24 + value * .22}%)`
        : kind === 'height' ? `rgb(${value},${value},${value})` : `rgb(${165 + value * .6},${165 + value * .6},${165 + value * .6})`;
      ctx.lineWidth = .4 + grain() * 2.8;
      ctx.beginPath(); ctx.moveTo(x, y - 30);
      ctx.bezierCurveTo(x + 5, y - 6, x - 4, y + 10, x + grain() * 4, y + 28 + grain() * 35); ctx.stroke();
    }
    // Fine horizontal fissures interrupt the fibres rather than regular rings.
    for (let i = 0; i < 65; i++) {
      const x = grain() * n, y = grain() * n;
      ctx.strokeStyle = kind === 'color' ? '#514a3f' : kind === 'height' ? '#454545' : '#eeeeee';
      ctx.lineWidth = .55; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 3 + grain() * 8, y + grain() * 3); ctx.stroke();
    }
  });
  const barkColor = bark('color'), barkHeight = bark('height'), barkRough = bark('rough');
  barkHeight.colorSpace = barkRough.colorSpace = THREE.NoColorSpace;
  for (const texture of [barkColor, barkHeight, barkRough]) texture.repeat.set(2, 3);
  const timber = (height) => canvasTexture(512, (ctx, n) => {
    const grain = randomSource(SEED + 841);
    ctx.fillStyle = height ? '#888888' : '#b4a18a'; ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 560; i++) {
      const x = grain() * n, y = grain() * n, light = 35 + grain() * 37;
      ctx.strokeStyle = height ? `hsl(0,0%,${light}%)` : `hsl(31,${14 + grain() * 9}%,${light}%)`;
      ctx.lineWidth = .3 + grain() * 1.6;
      ctx.beginPath(); ctx.moveTo(x, y - 160);
      ctx.bezierCurveTo(x + Math.sin(x) * 7, y - 60, x - 3, y + 50, x + 2, y + 170); ctx.stroke();
    }
  });
  const woodColor = timber(false), woodHeight = timber(true); woodHeight.colorSpace = THREE.NoColorSpace;
  return { stone, cobble, barkColor, barkHeight, barkRough, woodColor, woodHeight, teal: cloth('#286b6c'), ochre: cloth('#ae7035'), rust: cloth('#94563c') };
}

export function createWorld(scene) {
  const world = new THREE.Group(); world.name = 'Jerusalem • market quarter'; scene.add(world);
  const rng = randomSource(SEED);
  // Decoration has its own stream so added details cannot move existing art.
  const detailRandom = randomSource(SEED + 493);
  const textures = makeTextures();
  const mat = {
    stone: new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .045, roughness: .98 }),
    pale: new THREE.MeshStandardMaterial({ color: '#d5c3a0', roughness: 1 }),
    roof: new THREE.MeshStandardMaterial({ color: '#b8a482', roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: '#877766', map: textures.woodColor, bumpMap: textures.woodHeight, bumpScale: .012, roughness: .94 }),
    woodLight: new THREE.MeshStandardMaterial({ color: '#d2b99b', map: textures.woodColor, bumpMap: textures.woodHeight, bumpScale: .010, roughness: .96 }),
    teal: new THREE.MeshStandardMaterial({ color: '#316d70', roughness: .96 }),
    dark: new THREE.MeshStandardMaterial({ color: '#392f24', roughness: 1 }),
    terracotta: new THREE.MeshStandardMaterial({ color: '#af7050', roughness: .98 }),
    palePot: new THREE.MeshStandardMaterial({ color: '#c7a272', roughness: .98 }),
    bark: new THREE.MeshStandardMaterial({ map: textures.barkColor, bumpMap: textures.barkHeight, bumpScale: .095, roughnessMap: textures.barkRough, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#909877', side: THREE.DoubleSide, roughness: .72 }),
    palm: new THREE.MeshStandardMaterial({ color: '#6d7c4c', side: THREE.DoubleSide, roughness: .83 }),
    red: new THREE.MeshStandardMaterial({ color: '#b86540', roughness: .8 }),
    green: new THREE.MeshStandardMaterial({ color: '#91a24c', roughness: .8 }),
    yellow: new THREE.MeshStandardMaterial({ color: '#d3a346', roughness: .8 }),
    sack: new THREE.MeshStandardMaterial({ color: '#b8a17c', roughness: 1 }),
    dust: new THREE.MeshStandardMaterial({ color: '#a5a296', roughness: 1, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    water: new THREE.MeshStandardMaterial({ color: '#508b8e', metalness: .3, roughness: .22, transparent: true, opacity: .8 }),
    tealCloth: new THREE.MeshStandardMaterial({ map: textures.teal, roughness: 1, side: THREE.DoubleSide }),
    ochreCloth: new THREE.MeshStandardMaterial({ map: textures.ochre, roughness: 1, side: THREE.DoubleSide }),
    rustCloth: new THREE.MeshStandardMaterial({ map: textures.rust, roughness: 1, side: THREE.DoubleSide }),
  };
  const textureLoads = [];
  function scannedMaterial(material, asset, repeat = 1, normalStrength = 1) {
    // Keep headless geometry/navigation checks independent of the DOM image API.
    if (typeof Image === 'undefined') return;
    const loader = new THREE.TextureLoader();
    const load = (suffix, color = false) => {
      let texture;
      const pending = new Promise((resolve, reject) => {
        texture = loader.load(`./assets/textures/world/${asset}_${suffix}_2k.jpg`, resolve, reject);
      });
      textureLoads.push(pending);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeat, repeat); texture.anisotropy = 8;
      texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return texture;
    };
    material.map = load('diff', true);
    material.normalMap = load('nor_gl');
    material.normalScale.set(normalStrength, normalStrength);
    const arm = load('arm');
    material.aoMap = arm; material.roughnessMap = arm;
    material.aoMapIntensity = .75; material.roughness = 1;
    material.bumpMap = null; material.needsUpdate = true;
  }
  scannedMaterial(mat.stone, 'sandstone_blocks_08', 1, .85);
  // Architectural trim shares the scan instead of smooth, toy-like solid colors.
  if (mat.stone.normalMap) {
    mat.pale.map = mat.stone.map; mat.pale.normalMap = mat.stone.normalMap;
    mat.pale.normalScale.set(.70, .70); mat.pale.roughnessMap = mat.stone.roughnessMap;
    mat.pale.aoMap = mat.stone.aoMap; mat.pale.aoMapIntensity = .65;
    mat.pale.color.set('#fff4dc'); mat.pale.needsUpdate = true;
  }
  // Keep block size in world metres, including long facades and short piers.
  // This avoids the stretched giant bricks produced by ordinary instanced UVs.
  mat.stone.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `
      #include <uv_vertex>
      vec4 stonePosition = vec4(position, 1.0);
      vec3 stoneNormal = normal;
      #ifdef USE_INSTANCING
        stonePosition = instanceMatrix * stonePosition;
        stoneNormal = mat3(instanceMatrix) * stoneNormal;
      #endif
      stonePosition = modelMatrix * stonePosition;
      stoneNormal = abs(normalize(mat3(modelMatrix) * stoneNormal));
      vec2 stoneUv = stoneNormal.y > max(stoneNormal.x, stoneNormal.z)
        ? stonePosition.xz : (stoneNormal.x > stoneNormal.z ? stonePosition.zy : stonePosition.xy);
      #ifdef USE_MAP
        vMapUv = stoneUv * 0.42;
      #endif
      #ifdef USE_BUMPMAP
        vBumpMapUv = stoneUv * 0.42;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = stoneUv * 0.42;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = stoneUv * 0.42;
      #endif
      #ifdef USE_AOMAP
        vAoMapUv = stoneUv * 0.42;
      #endif
    `);
  };
  mat.stone.customProgramCacheKey = () => 'world-metre-limestone-pbr-v2';
  mat.pale.onBeforeCompile = mat.stone.onBeforeCompile;
  mat.pale.customProgramCacheKey = mat.stone.customProgramCacheKey;
  const geo = {
    box: new THREE.BoxGeometry(1, 1, 1),
    wornBlock: (() => {
      const shape = new THREE.Shape();
      shape.moveTo(-.44, -.44); shape.lineTo(.44, -.44); shape.lineTo(.44, .44); shape.lineTo(-.44, .44); shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: .88, bevelEnabled: true, bevelThickness: .06, bevelSize: .06, bevelSegments: 1, steps: 1, curveSegments: 1 });
      g.translate(0, 0, -.44); return g;
    })(),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
    ball: new THREE.SphereGeometry(1, 10, 7),
    leafBall: new THREE.IcosahedronGeometry(1, 1),
    wheel: new THREE.TorusGeometry(1, .10, 5, 14),
    rim: new THREE.TorusGeometry(1, .095, 6, 16),
    basket: new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(.30, 0), new THREE.Vector2(.43, .08),
      new THREE.Vector2(.50, .25), new THREE.Vector2(.48, .28), new THREE.Vector2(.45, .22),
      new THREE.Vector2(.37, .085), new THREE.Vector2(0, .055),
    ], 16),
    sack: (() => {
      const g = new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(.31, .025), new THREE.Vector2(.43, .17),
        new THREE.Vector2(.44, .48), new THREE.Vector2(.34, .76), new THREE.Vector2(.105, .91),
        new THREE.Vector2(.13, .99), new THREE.Vector2(.06, 1.03), new THREE.Vector2(0, 1),
      ], 16);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const wrinkle = 1 + Math.sin(Math.atan2(z, x) * 9 + y * 5) * (.025 + y * .045);
        p.setXYZ(i, x * wrinkle, y, z * wrinkle * .86);
      }
      g.computeVertexNormals(); return g;
    })(),
    dustPatch: (() => {
      // Soft vertex alpha keeps dirt from reading as a rectangular decal.
      const g = new THREE.BufferGeometry(), p = [0, 0, 0], colors = [1, 1, 1, .54], indices = [];
      for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2, radius = (ring ? 1 : .52) * (1 + Math.sin(i * 2.37) * .13);
        p.push(Math.cos(a) * radius, 0, Math.sin(a) * radius); colors.push(1, 1, 1, ring ? 0 : .34);
        const next = (i + 1) % 16;
        if (!ring) indices.push(0, 1 + next, 1 + i);
        else indices.push(1 + i, 17 + next, 17 + i, 1 + i, 1 + next, 17 + next);
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
      g.setIndex(indices); g.computeVertexNormals(); return g;
    })(),
    pot: new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(.26, .02), new THREE.Vector2(.40, .16),
      new THREE.Vector2(.47, .48), new THREE.Vector2(.40, .77), new THREE.Vector2(.24, .93),
      new THREE.Vector2(.23, 1.06), new THREE.Vector2(.29, 1.09), new THREE.Vector2(.29, 1.15),
      new THREE.Vector2(.20, 1.15), new THREE.Vector2(.19, 1.04), new THREE.Vector2(.22, .94),
    ], 16),
    awning: (() => {
      const g = new THREE.PlaneGeometry(1, 1, 10, 8), pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setZ(i, -.075 * Math.cos(y * Math.PI) + .018 * Math.cos(pos.getX(i) * Math.PI * 12)); }
      g.computeVertexNormals(); return g;
    })(),
    branch: (() => {
      const g = new THREE.CylinderGeometry(.66, 1, 1, 10, 4), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const swell = 1 + Math.sin(Math.atan2(z, x) * 5 + y * 2) * .10;
        p.setXYZ(i, x * swell + .025 * Math.sin(y * 7), y, z * swell);
      }
      g.computeVertexNormals(); return g;
    })(),
    oliveLeaf: (() => {
      const g = new THREE.BufferGeometry();
      const positions = [], indices = [];
      for (let i = 0; i <= 5; i++) {
        const t = i / 5, width = Math.sin(t * Math.PI) * .125, curve = -.055 * t * t;
        positions.push(-width, curve, t, 0, curve + Math.sin(t * Math.PI) * .035, t, width, curve, t);
        if (i < 5) { const k = i * 3; indices.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5); }
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
    })(),
    palmLeaflet: (() => {
      const g = new THREE.BufferGeometry(); const positions = [], indices = [];
      for (let i = 0; i <= 5; i++) {
        const t = i / 5, width = Math.pow(Math.sin(t * Math.PI), .65) * .048;
        const bend = -.18 * t * t;
        positions.push(-width, bend, t, 0, bend + Math.sin(t * Math.PI) * .032, t, width, bend, t);
        if (i < 5) { const k = i * 3; indices.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5); }
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
    })(),
  };
  const batches = new Map(); const dummy = new THREE.Object3D();
  function add(type, material, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, tint = 0) {
    const key = `${type}/${material}`;
    if (!batches.has(key)) batches.set(key, []);
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(rx, ry, rz, 'YXZ'); dummy.updateMatrix();
    batches.get(key).push({ matrix: dummy.matrix.clone(), tint });
  }
  const box = (material, x, y, z, sx, sy, sz, ry = 0, rz = 0) => add('box', material, x, y, z, sx, sy, sz, 0, ry, rz);
  function branch(from, to, radius, material = 'bark') {
    const direction = new THREE.Vector3().subVectors(to, from), length = direction.length();
    const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()), 'YXZ');
    const midpoint = new THREE.Vector3().addVectors(from, to).multiplyScalar(.5);
    add('branch', material, midpoint.x, midpoint.y, midpoint.z, radius, length, radius, rotation.x, rotation.y, rotation.z);
  }
  const colliders = [];
  const collision = (x, z, w, d) => colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });

  const groundMaterial = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .012, roughness: 1, color: '#ffffff' });
  // Reuse the existing rectangular stone scan, not the round-pebble scan. A
  // 2.81 m repeat gives roughly 0.5-1 m blocks instead of glittering gravel.
  // Source image files and their provenance stay untouched: grading is material-only.
  scannedMaterial(groundMaterial, 'sandstone_blocks_08', 64, .40);
  groundMaterial.aoMapIntensity = .20;
  groundMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundMetres;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundMetres = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      varying vec2 vGroundMetres;
      float groundHash(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * 0.1031);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }
      float groundNoise(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(groundHash(cell), groundHash(cell + vec2(1.0, 0.0)), f.x),
          mix(groundHash(cell + vec2(0.0, 1.0)), groundHash(cell + vec2(1.0)), f.x), f.y);
      }
    `).replace('#include <map_fragment>', `
      #include <map_fragment>
      // Several-metre dust drifts have soft irregular transitions. Dirt coverage
      // also suppresses the normal map below, rather than merely tinting grooves.
      float drift = groundNoise(vGroundMetres * 0.095 + vec2(17.3, 8.1));
      float brokenEdge = groundNoise(vGroundMetres * 0.31 + vec2(3.7, 27.2));
      float groundDust = 0.16 + 0.80 * smoothstep(0.27, 0.73, drift * 0.73 + brokenEdge * 0.27);
      float largeWear = groundNoise(vGroundMetres * 0.041 + vec2(41.0, 12.0));
      #ifdef USE_MAP
        float stoneLuma = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 mutedStone = mix(vec3(stoneLuma), sampledDiffuseColor.rgb, 0.08);
        mutedStone = (vec3(0.25) + (mutedStone - vec3(0.25)) * 0.60) * vec3(0.94, 0.995, 1.055);
        vec3 dryDust = vec3(0.315, 0.310, 0.295) * (0.94 + largeWear * 0.12);
        diffuseColor.rgb = diffuse * mix(mutedStone, dryDust, groundDust);
      #endif
    `).replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      normal = normalize(mix(nonPerturbedNormal, normal, 1.0 - groundDust * 0.86));
      roughnessFactor = mix(roughnessFactor, 0.98, groundDust);
    `);
  };
  groundMaterial.customProgramCacheKey = () => 'quiet-dusty-stone-paving-v1';
  // Variation lives in the material, so the walking surface needs only two triangles.
  const groundGeometry = new THREE.PlaneGeometry(180, 180);
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.035; ground.receiveShadow = true; world.add(ground);

  function pot(x, z, scale = 1, material = 'terracotta', y = 0) {
    add('pot', material, x, y, z, scale, scale, scale, 0, rng() * 6, 0, rng() * .13);
    for (const side of [-1, 1]) add('rim', material, x + side * .31 * scale, y + .75 * scale, z,
      .18 * scale, .24 * scale, .16 * scale, 0, 0, side * -.22);
  }
  function crate(x, z, w = 1, y = .45) {
    // Open gaps and an actual bottom replace the previous solid cube.
    for (let plank = 0; plank < 4; plank++) box('woodLight', x - w * .37 + plank * w * .247, y - .40, z, w * .22, .07, .78);
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) box('wood', x + side * (w / 2 - .065), y, z + end * .35, .10, .85, .10);
      for (let course = 0; course < 3; course++) {
        box('woodLight', x, y - .25 + course * .27, z + side * .385, w, .19, .055);
        box('woodLight', x + side * (w / 2 - .03), y - .25 + course * .27, z, .06, .19, .75);
      }
    }
  }
  function archedDoor(x, z, height, width, facadeZ) {
    const doorWidth = 1.65, spring = 1.95, radius = doorWidth / 2;
    const available = (width - doorWidth) / 2;
    for (const side of [-1, 1]) {
      const center = x + side * (doorWidth / 2 + available / 2), wx = x + side * width * .30;
      const left = center - available / 2, right = center + available / 2;
      box('stone', center, 1.13, facadeZ, available, 2.26, .5);
      box('stone', center, (height + 3.54) / 2, facadeZ, available, height - 3.54, .5);
      // Leave a 1.01 x 1.28 m aperture instead of painting a window on a wall.
      box('stone', (left + wx - .505) / 2, 2.90, facadeZ, wx - .505 - left, 1.28, .5);
      box('stone', (right + wx + .505) / 2, 2.90, facadeZ, right - wx - .505, 1.28, .5);
    }
    box('stone', x, (height + spring + radius) / 2, facadeZ, doorWidth, height - spring - radius, .5);
    // Individual arch stones frame a true opening with a recessed interior.
    for (let i = 0; i < 9; i++) {
      const a = i / 8 * Math.PI, r = radius + .13;
      box('pale', x + Math.cos(a) * r, spring + Math.sin(a) * r, facadeZ + .045, .34, .38, .65, 0, a - Math.PI / 2);
    }
    for (const side of [-1, 1]) box('pale', x + side * (radius + .17), spring / 2, facadeZ + .035, .31, spring, .63);
    box('dark', x, 1.25, facadeZ - .92, doorWidth + .1, 2.5, .1);
    box('wood', x + .61, 1.14, facadeZ - .36, .13, 2.28, 1.0, -.30);
    box('pale', x, .075, facadeZ + .25, 2.02, .15, .91);
  }
  function building(x, z, w, d, h, index, distant = false) {
    const front = z + d / 2;
    if (!distant) collision(x, z, w + .22, d + .22);
    for (const side of [-1, 1]) {
      const wallX = x + side * (w / 2 - .24), outerX = x + side * w / 2;
      const windowZ = z + (index % 2 ? .70 : -.60), bottom = z - d / 2, top = z + d / 2;
      box('stone', wallX, 1.10, z, .48, 2.20, d);
      box('stone', wallX, (h + 3.20) / 2, z, .48, h - 3.20, d);
      box('stone', wallX, 2.70, (bottom + windowZ - .34) / 2, .48, 1, windowZ - .34 - bottom);
      box('stone', wallX, 2.70, (top + windowZ + .34) / 2, .48, 1, top - windowZ - .34);
      box('dark', outerX - side * .42, 2.70, windowZ, .045, 1.02, .69);
      for (const slat of [-1, 0, 1]) box('wood', outerX - side * .17, 2.70, windowZ + slat * .19, .07, .97, .035);
      add('wornBlock', 'pale', outerX - side * .02, 2.16, windowZ, .48, .15, .95);
      box('wood', outerX - side * .025, 3.24, windowZ, .31, .16, .95);
    }
    box('stone', x, h / 2, z - d / 2 + .24, w, h, .48);
    archedDoor(x, z, h, w, front - .25);
    box('roof', x, h - .10, z, w + .10, .26, d + .10);
    box('pale', x, h + .02, z + d / 2, w + .3, .17, .42);
    box('pale', x, h + .02, z - d / 2, w + .3, .17, .42);
    for (const sx of [-1, 1]) box('stone', x + sx * (w / 2 - .15), h + .30, z, .3, .63, d);
    for (const sz of [-1, 1]) box('stone', x, h + .30, z + sz * (d / 2 - .15), w, .63, .3);
    // Deep reveals, separate hinged shutters and sill returns catch real shadows.
    for (const side of [-1, 1]) {
      const wx = x + side * w * .30;
      box('dark', wx, 2.90, front - .45, 1.04, 1.31, .045);
      for (const hinge of [-1, 1]) {
        const angle = hinge * (index % 3 === 0 ? .42 : .13);
        const sx = wx + hinge * .245;
        box('wood', sx, 2.90, front - .25, .45, 1.14, .045, angle);
        for (let slat = -1; slat <= 1; slat++) box('woodLight', sx + slat * .115, 2.90, front - .214, .017, 1.12, .022, angle);
        for (const rail of [-1, 1]) box('woodLight', sx, 2.90 + rail * .36, front - .20, .43, .06, .035, angle);
      }
      add('wornBlock', 'pale', wx, 2.23, front - .10, 1.29, .18, .65);
      for (const edge of [-1, 1]) add('wornBlock', 'pale', wx + edge * .575, 2.90, front - .035, .13, 1.26, .25);
      box('wood', wx, 3.58, front - .06, 1.29, .18, .36);
    }
    if (!distant) {
      // Raised base courses and irregular quoins stay within the existing solid footprint.
      for (const side of [-1, 1]) {
        add('wornBlock', 'pale', x + side * (w / 2 - .07), .20, z, .30, .38, d + .13, 0, 0, 0, .10);
        add('wornBlock', 'pale', x, .20, z + side * (d / 2 - .07), w + .13, .38, .30, 0, 0, 0, .10);
        for (let course = 0; course < Math.floor(h / .46); course++) {
          const long = course % 2 ? .64 : .37;
          add('wornBlock', 'pale', x + side * (w / 2 - long / 2 + .065), .62 + course * .43, front - .13,
            long, .37, .36, 0, 0, (detailRandom() - .5) * .035, .06 + detailRandom() * .13);
        }
        // A few short beams under the eaves interrupt a perfectly level roof edge.
        for (let beam = -1; beam <= 1; beam++) box('wood', x + beam * w * .27, h - .27, z + side * (d / 2 + .08), .14, .15, .46);
      }
      // Dirt accumulates at walls while the broad center routes remain readable.
      for (let edge = 0; edge < 4; edge++) {
        const alongX = edge < 2, side = edge % 2 ? 1 : -1, length = alongX ? w : d;
        const edgeX = x + (alongX ? 0 : side * (w / 2 + .21));
        const edgeZ = z + (alongX ? side * (d / 2 + .21) : 0);
        for (let patch = 0; patch < 5; patch++) {
          const along = (patch / 4 - .5) * length;
          const px = edgeX + (alongX ? along : 0), pz = edgeZ + (alongX ? 0 : along);
          add('dustPatch', 'dust', px, -.027, pz, 1.1 + detailRandom() * .5, 1, .40 + detailRandom() * .24, 0, alongX ? 0 : Math.PI / 2);
          // These fragments rise no more than 2.5 cm above the walking plane.
          for (let stone = 0; stone < 3; stone++) {
            const offset = (detailRandom() - .5) * .85;
            add('box', 'pale', px + (alongX ? offset : detailRandom() * .24), -.005, pz + (alongX ? detailRandom() * .24 : offset),
              .06 + detailRandom() * .11, .026 + detailRandom() * .02, .055 + detailRandom() * .10, 0, detailRandom() * Math.PI, 0, .10 + detailRandom() * .18);
          }
        }
      }
    }
    // Roof details stay below the camera's route view.
    if (index % 2 === 0) {
      for (let j = 0; j < 3; j++) pot(x - w * .25 + j * .6, z - .5, .55 + rng() * .18, 'palePot', h + .04);
      box('wood', x + w * .26, h + .7, z - d * .20, .12, 1.35, .12);
      box('wood', x - w * .20, h + .7, z - d * .20, .12, 1.35, .12);
      box('wood', x + w * .03, h + 1.34, z - d * .20, w * .5, .09, .10);
      add('awning', index % 4 ? 'tealCloth' : 'ochreCloth', x + w * .03, h + .97, z - d * .20, w * .4, .64, 1, 0, 0, 0);
    }
    if (!distant && index % 3 === 0) {
      pot(x - w / 2 - .55, front - .6, .67, 'terracotta');
      pot(x - w / 2 - .65, front - 1.4, .45, 'palePot');
    }
  }

  // Four quarters give wide, legible routes and a clear central crossroads.
  let buildingIndex = 0;
  const buildingHeights = new Map();
  for (const row of [-27, -13, 13, 27]) for (const column of [-28, -14, 14, 28]) {
    const w = Math.abs(column) === 28 ? 8.4 : 9.0;
    const h = row > 0 ? 3.85 + rng() * .85 : 4.4 + rng() * 1.05;
    buildingHeights.set(`${column},${row}`, h);
    building(column, row, w, row > 0 ? 7.8 : 8.2, h, buildingIndex++);
  }
  // Narrow facade extensions provide variation without closing the alleys.
  for (const [x, z] of [[-14, -13], [28, 13], [-28, 27], [14, -27]]) {
    const h = buildingHeights.get(`${x},${z}`);
    box('roof', x + 1.3, h + .55, z - 1.7, 3.1, 1.1, 2.8);
    box('pale', x + 1.3, h + 1.15, z - 1.7, 3.32, .16, 3.0);
  }

  function stall(x, z, width, depth, material, orientation = 0) {
    // Rotate the whole stall's local coordinates around its anchor.
    const local = (lx, lz) => [x + lx * Math.cos(orientation) + lz * Math.sin(orientation), z - lx * Math.sin(orientation) + lz * Math.cos(orientation)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const [px, pz] = local(sx * width / 2, sz * depth / 2);
      add('cylinder', 'wood', px, 1.33, pz, .055, 2.66, .055);
    }
    add('awning', material, x, 2.76, z, width + .4, depth + .40, 1, -Math.PI / 2 + .13, orientation, 0);
    const [fx, fz] = local(0, depth / 2 + .07);
    box(material, fx, 2.58, fz, width + .4, .29, .045, orientation);
    const [tx, tz] = local(0, .12);
    box('woodLight', tx, .99, tz, width - .30, .15, depth - .2, orientation);
    for (const sx of [-1, 1]) {
      const [px, pz] = local(sx * (width / 2 - .27), .10);
      box('wood', px, .5, pz, .13, .96, depth - .5, orientation);
    }
    for (let section = -1; section <= 1; section++) {
      const [bx, bz] = local(section * width * .28, .13);
      const basketWidth = width * .245, basketDepth = depth * .62;
      add('basket', 'woodLight', bx, 1.055, bz, basketWidth, .75, basketDepth, 0, orientation);
      for (let weave = 0; weave < 5; weave++) {
        const radius = .36 + weave * .032;
        add('rim', 'woodLight', bx, 1.09 + weave * .031, bz, radius * basketWidth, radius * basketDepth, .21,
          Math.PI / 2, orientation, 0, .05 + weave * .025);
      }
      for (let p = 0; p < 14; p++) {
        const [px, pz] = local(section * width * .28 + (rng() - .5) * width * .19, .12 + (rng() - .5) * depth * .46);
        add('ball', ['red', 'yellow', 'green'][section + 1], px, 1.22 + rng() * .11, pz,
          .087 + detailRandom() * .03, section === 0 ? .065 : .092 + detailRandom() * .025, section === 0 ? .15 : .10,
          detailRandom() * .3, detailRandom() * 6, detailRandom() * .2, detailRandom() * .21);
      }
    }
    // Open storage below the counter, with a few tied sacks inside its footprint.
    for (const side of [-1, 1]) {
      const [sx, sz] = local(side * width * .22, -.18);
      add('sack', 'sack', sx, .025, sz, .56, .71, .60, 0, orientation + side * .18, side * .045, .04 + detailRandom() * .13);
      add('rim', 'woodLight', sx, .67, sz, .065, .065, .10, Math.PI / 2);
    }
    add('dustPatch', 'dust', x, -.026, z, width * .63, 1, depth * .87, 0, orientation);
    collision(x, z, orientation ? depth + .1 : width + .1, orientation ? width + .1 : depth + .1);
    const [px, pz] = local(width / 2 + .5, -.25); pot(px, pz, .72);
  }
  stall(-7.0, -3.5, 3.6, 2.0, 'tealCloth', Math.PI / 2);
  stall(7.0, 3.1, 3.8, 2.0, 'ochreCloth', Math.PI / 2);
  stall(-27, .3, 4.1, 2.1, 'ochreCloth');
  stall(27, -.4, 4.3, 2.2, 'tealCloth');
  stall(13.1, -19.6, 3.6, 1.6, 'rustCloth');
  stall(-13.8, 19.5, 3.9, 1.8, 'tealCloth');

  function cart(x, z, orientation = 0) {
    box('woodLight', x, .73, z, 1.8, .16, 2.7, orientation);
    for (const side of [-1, 1]) {
      box('wood', x + side * .89, 1.03, z, .11, .56, 2.68, orientation);
      add('wheel', 'wood', x + side * 1.01, .58, z + .17, .58, .58, .58, 0, Math.PI / 2, 0);
      for (let a = 0; a < 4; a++) add('box', 'woodLight', x + side * 1.02, .58, z + .17, .05, 1.0, .075, a * Math.PI / 4, 0, 0);
    }
    box('wood', x, .57, z + .17, 2.15, .11, .11);
    box('wood', x, 1.03, z - 1.30, 1.8, .55, .10);
    for (const side of [-1, 1]) box('wood', x + side * .56, .72, z + 2.2, .075, .08, 2.1);
    for (let p = 0; p < 3; p++) {
      add('sack', 'sack', x + (p - 1) * .40, .83, z - .50 + p * .45, .80, .88, 1.12, 0, p * .43, (p - 1) * .11);
      add('rim', 'woodLight', x + (p - 1) * .40, 1.65, z - .50 + p * .45, .075, .075, .10, Math.PI / 2);
    }
    collision(x, z + .35, 2.3, 3.8);
  }
  cart(-21.3, -9.0); cart(21.1, 10.5);

  function olive(x, z, scale = 1) {
    const leafRandom = randomSource(SEED + Math.round(x * 317 + z * 997));
    const point = (px, py, pz) => new THREE.Vector3(x + px * scale, py * scale, z + pz * scale);
    const trunk = [point(0, 0, 0), point(.10, .86, -.03), point(-.07, 1.66, .06), point(.08, 2.29, .01)];
    for (let i = 0; i < trunk.length - 1; i++) branch(trunk[i], trunk[i + 1], (.21 - i * .043) * scale);
    // Uneven forks and individually paired narrow leaves leave real sky gaps.
    // All 1,152 leaves per olive share one instanced draw call across the district.
    for (let limb = 0; limb < 6; limb++) {
      const angle = limb / 6 * Math.PI * 2 + leafRandom() * .36;
      const radius = .9 + leafRandom() * .42;
      const start = point(.02, 1.58 + limb * .11, .02);
      const end = point(Math.sin(angle) * radius, 2.65 + leafRandom() * .80, Math.cos(angle) * radius);
      branch(start, end, (.058 + leafRandom() * .025) * scale);
      for (let shoot = 0; shoot < 4; shoot++) {
        const direction = angle + (shoot - 1.5) * .44 + (leafRandom() - .5) * .3;
        const shootStart = new THREE.Vector3().lerpVectors(start, end, .50 + shoot * .14);
        const shootEnd = end.clone().add(new THREE.Vector3(Math.sin(direction) * (.5 + leafRandom() * .42), (leafRandom() - .18) * .53, Math.cos(direction) * (.5 + leafRandom() * .42)).multiplyScalar(scale));
        branch(shootStart, shootEnd, .023 * scale);
        for (let twig = 0; twig < 4; twig++) {
          const twigAngle = direction + (twig % 2 ? -.75 : .75) + (leafRandom() - .5) * .40;
          const twigStart = new THREE.Vector3().lerpVectors(shootStart, shootEnd, .32 + twig * .20);
          const twigEnd = twigStart.clone().add(new THREE.Vector3(Math.sin(twigAngle) * (.48 + leafRandom() * .28), (leafRandom() - .30) * .40, Math.cos(twigAngle) * (.48 + leafRandom() * .28)).multiplyScalar(scale));
          branch(twigStart, twigEnd, .008 * scale);
          for (let pair = 0; pair < 6; pair++) for (const side of [-1, 1]) {
            const p = new THREE.Vector3().lerpVectors(twigStart, twigEnd, .12 + pair * .165);
            p.x += Math.cos(twigAngle) * side * .014 * scale;
            p.z -= Math.sin(twigAngle) * side * .014 * scale;
            const leafSize = (.17 + leafRandom() * .10) * scale;
            add('oliveLeaf', 'leaf', p.x, p.y, p.z, leafSize * (.80 + leafRandom() * .3), leafSize, leafSize,
              -.58 + leafRandom() * .95, twigAngle + side * (.70 + leafRandom() * .40), (leafRandom() - .5) * 1.40, .05 + leafRandom() * .34);
          }
        }
      }
    }
    collision(x, z, .65 * scale, .65 * scale);
    box('pale', x, .16, z, 1.25 * scale, .32, 1.25 * scale);
  }
  function palm(x, z, scale = 1) {
    const palmRandom = randomSource(SEED + Math.round(x * 721 + z * 319));
    const trunk = (t) => new THREE.Vector3(x + .23 * t * t * scale, 5.4 * t * scale, z - .12 * t * scale);
    for (let segment = 0; segment < 5; segment++) branch(trunk(segment / 5), trunk((segment + 1) / 5), (.20 - segment * .008) * scale);
    for (let scar = 0; scar < 23; scar++) {
      const p = trunk((scar + .5) / 24);
      add('rim', 'bark', p.x, p.y, p.z, .178 * scale, .178 * scale, .13 * scale, Math.PI / 2 + .07, 0, scar * .11);
    }
    const crown = trunk(1);
    for (let frond = 0; frond < 12; frond++) {
      const angle = frond / 12 * Math.PI * 2 + palmRandom() * .18;
      const length = (2.6 + palmRandom() * .72) * scale;
      const lift = (.52 + (frond % 3) * .34) * scale;
      const at = (t) => crown.clone().add(new THREE.Vector3(Math.sin(angle) * length * t, Math.sin(t * Math.PI * .83) * lift - t * t * .70 * scale, Math.cos(angle) * length * t));
      for (let rib = 0; rib < 7; rib++) branch(at(rib / 7), at((rib + 1) / 7), (.026 - rib * .0025) * scale, 'palm');
      // Feathered date-palm silhouette: independently tapered paired leaflets.
      for (let pair = 0; pair < 22; pair++) {
        const t = .10 + pair / 22 * .86, p = at(t);
        const leafletLength = (.22 + Math.pow(Math.sin(t * Math.PI), .75) * .68) * scale;
        for (const side of [-1, 1]) {
          add('palmLeaflet', 'palm', p.x, p.y, p.z,
            leafletLength, leafletLength, leafletLength,
            .05 + t * .70 + (palmRandom() - .5) * .14,
            angle + side * (1.10 - t * .38), side * (.10 + palmRandom() * .20), .02 + palmRandom() * .30);
        }
      }
    }
    collision(x, z, .60 * scale, .60 * scale);
  }
  olive(-7.6, 7.2, .87); olive(7.7, -7.0, .82);
  olive(-31.9, -5.7, .85); olive(31.5, 5.7, .9);
  palm(-7.7, -19.4, .95); palm(7.7, 19.4, .91);
  palm(-33.0, 20.0, .85); palm(32.7, -20, .9);

  // A modest public well beside the plaza, leaving the central run lane open.
  const wellX = -5.3, wellZ = 2.7;
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * Math.PI * 2;
    box('stone', wellX + Math.sin(angle) * .82, .48, wellZ + Math.cos(angle) * .82, .44, .85, .36, angle);
  }
  add('cylinder', 'water', wellX, .17, wellZ, .69, .04, .69);
  for (const side of [-1, 1]) box('wood', wellX + side * 1.06, 1.46, wellZ, .13, 2.92, .13);
  box('wood', wellX, 2.84, wellZ, 2.48, .17, .16);
  add('cylinder', 'woodLight', wellX + .12, 2.07, wellZ, .022, 1.30, .022);
  pot(wellX + 1.25, wellZ + .2, .43, 'palePot');
  collision(wellX, wellZ, 2.3, 2.2);

  // Resting goods and pottery are placed against architecture, away from paths.
  for (const [x, z] of [[-18.9, -26], [18.9, -12], [-18.9, 13], [31.8, 26], [-31.7, -12], [18.8, 26]]) {
    crate(x, z, .85); pot(x, z + 1.18, .64); pot(x + .1, z + 1.88, .43, 'palePot');
  }

  // Distant city enclosure and the broad northern gate anchor the skyline.
  const wallZ = -40;
  for (const side of [-1, 1]) {
    box('stone', side * 25.6, 3.4, wallZ, 42.0, 6.8, 1.8);
    for (let i = 0; i < 21; i++) box('pale', side * (5.6 + i * 2), 7.12, wallZ, .92, .83, 1.9);
  }
  for (const x of [-7.0, 7.0]) {
    box('stone', x, 4.4, wallZ, 4.6, 8.8, 5.1);
    for (const sx of [-1.6, 0, 1.6]) for (const sz of [-1.8, 1.8]) box('pale', x + sx, 9.08, wallZ + sz, .9, .85, 1.0);
    box('pale', x, 8.25, wallZ, 4.88, .25, 5.35);
  }
  box('stone', 0, 6.52, wallZ, 9.4, 1.28, 2.2);
  for (let i = 0; i <= 10; i++) {
    const a = i / 10 * Math.PI;
    box('pale', Math.cos(a) * 4.7, 2.75 + Math.sin(a) * 3.0, wallZ + .10, .72, .64, 2.45, 0, a - Math.PI / 2);
  }
  for (const x of [-40, 40]) {
    box('stone', x, 2.7, 0, 1.8, 5.4, 79);
    for (let z = -36; z < 39; z += 2.1) box('pale', x, 5.72, z, 1.95, .72, .9);
  }
  for (const [x, z, w, d, h] of [[-27, -48, 13, 9, 8.0], [-13, -51, 9, 8, 6.0], [16, -52, 13, 11, 9.2], [31, -49, 11, 9, 7.2], [-46, -17, 9, 10, 7.8], [47, -11, 10, 10, 7.0]]) {
    building(x, z, w, d, h, buildingIndex++, true);
  }
  // Distant terraced hills use the same warm limestone palette.
  for (let i = 0; i < 12; i++) add('leafBall', 'roof', (i - 5.5) * 16, -1.3, -80 - rng() * 10, 17 + rng() * 7, 6 + rng() * 8, 17, 0, rng(), 0, .08);

  for (const [key, items] of batches) {
    const [geometry, material] = key.split('/');
    const mesh = new THREE.InstancedMesh(geo[geometry], mat[material], items.length);
    mesh.name = `District ${geometry} • ${material}`;
    items.forEach((item, index) => {
      mesh.setMatrixAt(index, item.matrix);
      if (item.tint) mesh.setColorAt(index, new THREE.Color().setRGB(1 - item.tint, 1 - item.tint * .85, 1 - item.tint * .7));
    });
    mesh.castShadow = material !== 'water' && material !== 'dust'; mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); world.add(mesh);
  }

  const rescueSpawns = [
    { x: 1.4, z: 15.6, kind: 'fallen', label: 'Help the traveler' },
    { x: -2.9, z: 8.3, kind: 'weary', label: 'Lift their spirits' },
    { x: 3.0, z: .1, kind: 'fallen', label: 'A helping hand' },
    { x: .0, z: -9.0, kind: 'weary', label: 'Bring hope' },
    { x: -1.8, z: -20.0, kind: 'fallen', label: 'Help the traveler' },
    { x: 2.8, z: -30.0, kind: 'weary', label: 'Lift their spirits' },
    { x: 13.0, z: -33.2, kind: 'fallen', label: 'A helping hand' },
    { x: 21.1, z: -24.7, kind: 'weary', label: 'Bring hope' },
    { x: 26.8, z: -19.0, kind: 'fallen', label: 'Help the traveler' },
    { x: 20.9, z: -5.5, kind: 'weary', label: 'Lift their spirits' },
    { x: 13.6, z: 2.2, kind: 'fallen', label: 'A helping hand' },
    { x: 21.3, z: 20.0, kind: 'weary', label: 'Bring hope' },
    { x: 12.9, z: 33.5, kind: 'fallen', label: 'Help the traveler' },
    { x: -13.1, z: 33.5, kind: 'weary', label: 'Lift their spirits' },
    { x: -21.1, z: 22.1, kind: 'fallen', label: 'A helping hand' },
    { x: -20.9, z: 3.4, kind: 'weary', label: 'Bring hope' },
    { x: -21.0, z: -19.9, kind: 'fallen', label: 'Help the traveler' },
    { x: -12.9, z: -33.5, kind: 'weary', label: 'Lift their spirits' },
  ];
  const bounds = { minX: -34, maxX: 34, minZ: -34, maxZ: 34 };
  const assetsReady = Promise.allSettled(textureLoads).then((results) => {
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) console.error('World PBR maps failed to load:', failures.length);
    return { maps: results.length, failures: failures.length };
  });
  return { colliders, rescueSpawns, spawn: { x: 0, z: 22 }, bounds, assetsReady, update() {} };
}
