import * as THREE from 'three';
import { clamp, lerp, nowSec } from '../core/Utils.js';

export class CameraSystem {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = 0;
    this.pitch = 0.42;
    this.dist = 5.4;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.camera = camera;
    this._faded = new Map();
    this._fadeHold = new Map();
    this.shake = 0;
  }

  update(input, targetPos, dt = 1 / 60) {
    this.yaw -= input.look.x * 0.005;
    this.pitch = clamp(this.pitch + input.look.y * 0.004, -0.15, 1.15);

    const cp = new THREE.Vector3(
      targetPos.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist,
      targetPos.y + 2.0 + Math.sin(this.pitch) * this.dist,
      targetPos.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist
    );
    this.camera.position.lerp(cp, lerp(0.18, 0.5, Math.min(1, this.dist / 6)));
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.24;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.24;
    }
    this.camera.lookAt(targetPos.x, targetPos.y + 1.25, targetPos.z);
    this._updateOcclusion(targetPos);
    this.shake = Math.max(0, this.shake - dt * 0.8);
  }

  addShake(amount) {
    this.shake = Math.min(0.5, this.shake + amount);
  }

  _updateOcclusion(targetPos) {
    if (!this.world?.group) return;
    const from = new THREE.Vector3(targetPos.x, targetPos.y + 1.25, targetPos.z);
    const dir = new THREE.Vector3().subVectors(this.camera.position, from);
    const dist = dir.length();
    dir.normalize();

    this.raycaster.set(from, dir);
    this.raycaster.far = dist;
    const hits = this.raycaster.intersectObjects(this.world.group.children, true);
    const activeHits = new Set();
    const now = nowSec();

    for (const hit of hits) {
      if (hit.distance >= dist - 0.2) continue;
      if (this._canFade(hit.object)) activeHits.add(hit.object);
    }

    // Keep recently occluded meshes transparent for a short moment so edge
    // jitter or camera lerp doesn't make them blink. Held meshes are not
    // refreshed, so they still restore once the hold window expires.
    const keep = new Set();
    for (const mesh of this._faded.keys()) {
      if (activeHits.has(mesh)) continue;
      const lastSeen = this._fadeHold.get(mesh) || 0;
      if (now - lastSeen < 0.1) keep.add(mesh);
    }

    for (const mesh of activeHits) {
      this._fadeHold.set(mesh, now);
      if (this._faded.has(mesh)) continue;
      const original = mesh.material;
      const clone = original.clone();
      clone.transparent = true;
      clone.opacity = 0.22;
      clone.depthWrite = false;
      clone.needsUpdate = true;
      mesh.material = clone;
      this._faded.set(mesh, original);
    }

    for (const [mesh, original] of this._faded) {
      if (activeHits.has(mesh) || keep.has(mesh)) continue;
      if (mesh.material !== original) {
        mesh.material.dispose();
        mesh.material = original;
        original.needsUpdate = true;
      }
      this._faded.delete(mesh);
      this._fadeHold.delete(mesh);
    }
  }

  _canFade(mesh) {
    if (this._faded.has(mesh)) return true;
    if (mesh.isSprite) return false;
    if (!mesh.visible || !mesh.material || Array.isArray(mesh.material)) return false;
    if (mesh.material.type !== 'MeshStandardMaterial' || mesh.material.transparent) return false;
    if (mesh.geometry?.type === 'PlaneGeometry' || mesh.geometry?.type === 'CircleGeometry') return false;
    let node = mesh;
    while (node) {
      const key = node.userData?.assetKey;
      if (key === 'player' || key === 'ghost' ||
          (typeof key === 'string' && key.startsWith('item:'))) {
        return false;
      }
      node = node.parent;
    }
    return true;
  }
}
