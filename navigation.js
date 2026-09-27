import { canStand } from './game-state.js';

// One shared flow field lets a crowd find the player without running a separate
// path search for every citizen. The field is rebuilt only on target-cell changes.
export function createNavigation(colliders, bounds, radius = .43, cellSize = 1) {
  if (!(radius > 0) || !(cellSize > 0) || !Number.isFinite(radius + cellSize)) throw new RangeError('Navigation radius and cell size must be positive finite numbers.');
  const minX = bounds.minX + radius, maxX = bounds.maxX - radius;
  const minZ = bounds.minZ + radius, maxZ = bounds.maxZ - radius;
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || maxX <= minX || maxZ <= minZ) throw new RangeError('Navigation bounds must contain the actor.');
  const cols = Math.ceil((maxX - minX) / cellSize) + 1;
  const rows = Math.ceil((maxZ - minZ) / cellSize) + 1;
  const stepX = (maxX - minX) / (cols - 1), stepZ = (maxZ - minZ) / (rows - 1);
  const count = cols * rows, open = new Uint8Array(count), edges = new Uint8Array(count);
  const distance = new Int32Array(count), queue = new Int32Array(count);
  const offsets = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
  const px = index => minX + index % cols * stepX;
  const pz = index => minZ + Math.floor(index / cols) * stepZ;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const indexAt = (x, z) => Math.round(clamp((x - minX) / stepX, 0, cols - 1)) + cols * Math.round(clamp((z - minZ) / stepZ, 0, rows - 1));
  function clearSegment(ax, az, bx, bz) {
    const samples = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / Math.min(radius * .35, cellSize * .25)));
    for (let i = 0; i <= samples; i++) {
      const x = ax + (bx - ax) * i / samples, z = az + (bz - az) * i / samples;
      if (x < minX - 1e-8 || x > maxX + 1e-8 || z < minZ - 1e-8 || z > maxZ + 1e-8 || !canStand(x, z, colliders, radius)) return false;
    }
    return true;
  }
  for (let i = 0; i < count; i++) open[i] = Number(canStand(px(i), pz(i), colliders, radius));
  for (let i = 0; i < count; i++) {
    if (!open[i]) continue;
    const column = i % cols, row = Math.floor(i / cols);
    for (let k = 0; k < offsets.length; k++) {
      const [dx, dz] = offsets[k], c = column + dx, r = row + dz;
      if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
      const next = r * cols + c;
      if (!open[next]) continue;
      // A diagonal may not cut between blocked cardinal neighbors. Swept checks
      // also catch thin walls that fall entirely between sampled grid centers.
      if (dx && dz && (!open[row * cols + c] || !open[r * cols + column])) continue;
      if (clearSegment(px(i), pz(i), px(next), pz(next))) edges[i] |= 1 << k;
    }
  }
  let target = -1, targetX = 0, targetZ = 0;
  distance.fill(-1);
  function updateTarget(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    targetX = clamp(x, minX, maxX); targetZ = clamp(z, minZ, maxZ);
    let next = indexAt(targetX, targetZ);
    if (!open[next] || !clearSegment(px(next), pz(next), targetX, targetZ)) {
      const candidates = [];
      for (let i = 0; i < count; i++) {
        if (!open[i]) continue;
        const d = (px(i) - targetX) ** 2 + (pz(i) - targetZ) ** 2;
        candidates.push({ index: i, distance: d });
      }
      // Test nearest candidates first instead of casting thousands of long
      // segments across town when the player stands beside a facade.
      candidates.sort((a, b) => a.distance - b.distance);
      const visible = canStand(targetX, targetZ, colliders, radius)
        ? candidates.find(c => clearSegment(px(c.index), pz(c.index), targetX, targetZ)) : null;
      next = visible?.index ?? candidates[0]?.index ?? -1;
    }
    if (next === target) return false;
    target = next; distance.fill(-1);
    if (target < 0) return true;
    let head = 0, tail = 1; queue[0] = target; distance[target] = 0;
    while (head < tail) {
      const current = queue[head++];
      for (let k = 0; k < offsets.length; k++) {
        if (!(edges[current] & 1 << k)) continue;
        const [dx, dz] = offsets[k], nextCell = current + dx + dz * cols;
        if (distance[nextCell] !== -1) continue;
        distance[nextCell] = distance[current] + 1; queue[tail++] = nextCell;
      }
    }
    return true;
  }
  function direction(x, z) {
    if (target < 0 || !Number.isFinite(x) || !Number.isFinite(z)) return { x: 0, z: 0 };
    let current = indexAt(x, z);
    // Near a facade, the rounded grid center may itself be blocked. Pick a
    // visible neighboring center in the target's reachable component.
    if (distance[current] < 0 || !clearSegment(x, z, px(current), pz(current))) {
      const column = current % cols, row = Math.floor(current / cols);
      let best = Infinity, replacement = -1;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const c = column + dx, r = row + dz;
        if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
        const candidate = r * cols + c;
        if (distance[candidate] < 0) continue;
        const d = (px(candidate) - x) ** 2 + (pz(candidate) - z) ** 2;
        if (d < best && clearSegment(x, z, px(candidate), pz(candidate))) { best = d; replacement = candidate; }
      }
      if (replacement < 0) return { x: 0, z: 0 };
      current = replacement;
    }
    let goalX = px(current), goalZ = pz(current);
    if (current === target && clearSegment(x, z, targetX, targetZ)) {
      goalX = targetX; goalZ = targetZ;
    } else {
      let best = Infinity;
      for (let k = 0; k < offsets.length; k++) {
        if (!(edges[current] & 1 << k)) continue;
        const [dx, dz] = offsets[k], next = current + dx + dz * cols;
        if (distance[next] >= distance[current] || distance[next] < 0) continue;
        const d = (px(next) - x) ** 2 + (pz(next) - z) ** 2;
        if (d < best && clearSegment(x, z, px(next), pz(next))) { best = d; goalX = px(next); goalZ = pz(next); }
      }
    }
    const dx = goalX - x, dz = goalZ - z, length = Math.hypot(dx, dz);
    return length < .08 ? { x: 0, z: 0 } : { x: dx / length, z: dz / length };
  }
  return { updateTarget, direction };
}
