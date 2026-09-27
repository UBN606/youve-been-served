import { Float32BufferAttribute } from 'three';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = vector => {
  const size = Math.hypot(...vector);
  return Number.isFinite(size) && size > 1e-20 ? vector.map(value => value / size) : null;
};

/**
 * Optional static-mesh shading candidate. Returns a cloned geometry and evidence;
 * never welds vertices, changes UVs/indices, or changes the source geometry.
 * Faces must share a geometric edge and fit within the crease angle to smooth.
 * An index already shared across hard corners cannot hold separate normals without
 * splitting topology; those vertices retain their old normals and are counted.
 */
export function smoothGeneratedNormals(geometry, { creaseAngleDegrees = 60, positionEpsilon = 1e-5 } = {}) {
  if (!geometry?.isBufferGeometry) throw new TypeError('Expected a BufferGeometry.');
  if (!Number.isFinite(creaseAngleDegrees) || creaseAngleDegrees < 0 || creaseAngleDegrees >= 90) throw new RangeError('creaseAngleDegrees must be in [0, 90).');
  if (!Number.isFinite(positionEpsilon) || positionEpsilon <= 0) throw new RangeError('positionEpsilon must be positive and finite.');
  const position = geometry.getAttribute('position');
  if (!position || position.itemSize !== 3) throw new TypeError('Geometry needs three-component positions.');
  const oldNormal = geometry.getAttribute('normal');
  const index = geometry.getIndex();
  const elementCount = index?.count ?? position.count;
  if (elementCount % 3) throw new RangeError('Geometry must contain a triangle list.');
  const points = Array.from({ length: position.count }, (_, i) => [position.getX(i), position.getY(i), position.getZ(i)]);
  if (points.some(point => point.some(value => !Number.isFinite(value)))) throw new RangeError('Positions must be finite.');
  const diagnostics = {
    creaseAngleDegrees, positionEpsilon, vertices: position.count, triangles: elementCount / 3,
    positionGroups: 0, duplicatePositionGroups: 0, smoothedPositionGroups: 0,
    creaseSeparatedPositionGroups: 0, disconnectedPositionGroups: 0,
    ambiguousHardCornerVertices: 0, degenerateTriangles: 0, epsilonCollapsedTriangles: 0,
    fallbackVertices: 0, changedNormals: 0, maximumUnitLengthError: 0,
    sourceUnchanged: true, topologyUnchanged: true, tangentsRequireRefresh: false,
  };
  const groups = [], bins = new Map(), groupOf = new Uint32Array(position.count);
  const key = (x, y, z) => `${x},${y},${z}`;
  const epsilonSquared = positionEpsilon ** 2;
  for (let vertex = 0; vertex < points.length; vertex++) {
    const point = points[vertex], cell = point.map(value => Math.floor(value / positionEpsilon));
    let chosen = -1, nearest = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const candidate of bins.get(key(cell[0] + dx, cell[1] + dy, cell[2] + dz)) || []) {
        const delta = subtract(point, groups[candidate].point), distance = dot(delta, delta);
        if (distance <= epsilonSquared && distance < nearest) { chosen = candidate; nearest = distance; }
      }
    }
    if (chosen < 0) {
      chosen = groups.length;
      groups.push({ point, vertices: [], corners: [] });
      const bin = key(...cell);
      if (!bins.has(bin)) bins.set(bin, []);
      bins.get(bin).push(chosen);
    }
    groups[chosen].vertices.push(vertex);
    groupOf[vertex] = chosen;
  }
  const faces = [];
  for (let offset = 0; offset < elementCount; offset += 3) {
    const vertices = [0, 1, 2].map(corner => index ? index.getX(offset + corner) : offset + corner);
    if (vertices.some(vertex => !Number.isInteger(vertex) || vertex < 0 || vertex >= points.length)) throw new RangeError('Triangle index is outside the position buffer.');
    const triangle = vertices.map(vertex => points[vertex]);
    const raw = cross(subtract(triangle[1], triangle[0]), subtract(triangle[2], triangle[0]));
    const normal = unit(raw);
    if (!normal) { diagnostics.degenerateTriangles++; continue; }
    const positionGroups = vertices.map(vertex => groupOf[vertex]);
    if (new Set(positionGroups).size < 3) { diagnostics.epsilonCollapsedTriangles++; continue; }
    const area = Math.hypot(...raw) * .5, face = faces.length;
    faces.push({ normal });
    for (let corner = 0; corner < 3; corner++) {
      const next = (corner + 1) % 3, previous = (corner + 2) % 3;
      const a = subtract(triangle[next], triangle[corner]), b = subtract(triangle[previous], triangle[corner]);
      const angle = Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));
      groups[positionGroups[corner]].corners.push({ face, vertex: vertices[corner], weight: area * angle, neighbors: [positionGroups[next], positionGroups[previous]] });
    }
  }
  const output = new Float32Array(position.count * 3), assigned = new Uint8Array(position.count);
  const previousNormal = vertex => oldNormal && vertex < oldNormal.count ? unit([oldNormal.getX(vertex), oldNormal.getY(vertex), oldNormal.getZ(vertex)]) : null;
  const write = (vertex, normal) => { output.set(normal, vertex * 3); assigned[vertex] = 1; };
  const cosine = Math.cos(creaseAngleDegrees * Math.PI / 180);
  for (const group of groups) {
    const corners = group.corners;
    if (!corners.length) continue;
    const parent = corners.map((_, i) => i), members = corners.map((_, i) => [i]);
    const find = value => { while (parent[value] !== value) { parent[value] = parent[parent[value]]; value = parent[value]; } return value; };
    const edgeBuckets = new Map(), pairs = [], seen = new Set();
    for (let i = 0; i < corners.length; i++) for (const neighbor of corners[i].neighbors) {
      if (!edgeBuckets.has(neighbor)) edgeBuckets.set(neighbor, []);
      const bucket = edgeBuckets.get(neighbor);
      for (const other of bucket) {
        const pairKey = `${other},${i}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const similarity = dot(faces[corners[other].face].normal, faces[corners[i].face].normal);
        pairs.push({ a: other, b: i, similarity });
      }
      bucket.push(i);
    }
    // Merge the most similar adjacent faces first. Complete-link angle checks
    // prevent a chain of soft edges from joining opposite sides of a thin mesh.
    pairs.sort((a, b) => b.similarity - a.similarity || a.a - b.a || a.b - b.b);
    let rejectedCrease = false;
    for (const pair of pairs) {
      const a = find(pair.a), b = find(pair.b);
      if (a === b) continue;
      const compatible = members[a].every(i => members[b].every(j => dot(faces[corners[i].face].normal, faces[corners[j].face].normal) >= cosine - 1e-10));
      if (!compatible) { rejectedCrease = true; continue; }
      parent[b] = a;
      members[a].push(...members[b]);
      members[b] = [];
    }
    const components = new Map(), memberships = new Map();
    for (let i = 0; i < corners.length; i++) {
      const component = find(i), corner = corners[i];
      if (!components.has(component)) components.set(component, { vector: [0, 0, 0], weight: 0, vertices: new Set() });
      const value = components.get(component), normal = faces[corner.face].normal;
      for (let axis = 0; axis < 3; axis++) value.vector[axis] += normal[axis] * corner.weight;
      value.weight += corner.weight;
      value.vertices.add(corner.vertex);
      if (!memberships.has(corner.vertex)) memberships.set(corner.vertex, new Set());
      memberships.get(corner.vertex).add(component);
    }
    if ([...components.values()].some(value => value.vertices.size > 1)) diagnostics.smoothedPositionGroups++;
    if (components.size > 1) {
      if (rejectedCrease) diagnostics.creaseSeparatedPositionGroups++;
      else diagnostics.disconnectedPositionGroups++;
    }
    for (const [vertex, ids] of memberships) {
      const choices = [...ids].map(id => components.get(id)).sort((a, b) => b.weight - a.weight);
      if (ids.size > 1) diagnostics.ambiguousHardCornerVertices++;
      const normal = (ids.size > 1 ? previousNormal(vertex) : null) || unit(choices[0].vector) || faces[corners[0].face].normal;
      write(vertex, normal);
    }
  }
  for (let vertex = 0; vertex < points.length; vertex++) {
    if (!assigned[vertex]) { diagnostics.fallbackVertices++; write(vertex, previousNormal(vertex) || [0, 1, 0]); }
    const value = Array.from(output.subarray(vertex * 3, vertex * 3 + 3));
    diagnostics.maximumUnitLengthError = Math.max(diagnostics.maximumUnitLengthError, Math.abs(Math.hypot(...value) - 1));
    const before = previousNormal(vertex);
    if (!before || Math.hypot(...subtract(value, before)) > 1e-5) diagnostics.changedNormals++;
  }
  diagnostics.positionGroups = groups.length;
  diagnostics.duplicatePositionGroups = groups.filter(group => group.vertices.length > 1).length;
  diagnostics.tangentsRequireRefresh = geometry.hasAttribute('tangent') && diagnostics.changedNormals > 0;
  const candidate = geometry.clone();
  candidate.setAttribute('normal', new Float32BufferAttribute(output, 3));
  return { geometry: candidate, diagnostics };
}
