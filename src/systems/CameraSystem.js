import * as THREE from 'three';
import { clamp, lerp } from '../core/Utils.js';

export class CameraSystem {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.42;
    this.dist = 5.4;
  }

  update(input, targetPos) {
    this.yaw -= input.look.x * 0.005;
    this.pitch = clamp(this.pitch - input.look.y * 0.004, -0.15, 1.15);
    this.dist = clamp(this.dist + input.zoom * 0.012, 2.6, 9.5);

    const cp = new THREE.Vector3(
      targetPos.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist,
      targetPos.y + 2.0 + Math.sin(this.pitch) * this.dist,
      targetPos.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist
    );
    this.camera.position.lerp(cp, lerp(0.18, 0.5, Math.min(1, this.dist / 6)));
    this.camera.lookAt(targetPos.x, targetPos.y + 1.25, targetPos.z);
  }
}
