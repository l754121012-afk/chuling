import * as CANNON from 'cannon-es';

export const GROUPS = {
  WORLD: 1,
  PLAYER: 2,
  GHOST: 4,
  ITEM: 8,
  TRAP: 16,
  PROP: 32
};

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0)
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.world.solver.iterations = 8;
    // Character controllers drive velocity directly; keep contact friction low
    // so the solver doesn't kill player/ghost movement on the floor.
    this.world.defaultContactMaterial.friction = 0.03;
    this.world.defaultContactMaterial.restitution = 0.08;
  }

  add(body) {
    this.world.addBody(body);
  }

  remove(body) {
    this.world.removeBody(body);
  }

  step(dt) {
    this.world.step(1 / 60, dt, 3);
  }

  raycastClosest(from, to, mask) {
    const result = new CANNON.RaycastResult();
    this.world.raycastClosest(
      from,
      to,
      { collisionFilterMask: mask, skipBackfaces: true, checkCollisionResponse: false },
      result
    );
    return result.hasHit ? result : null;
  }
}

export function v3(x, y, z) {
  return new CANNON.Vec3(x, y, z);
}

export function syncMeshToBody(mesh, body) {
  mesh.position.set(body.position.x, body.position.y, body.position.z);
  mesh.quaternion.set(
    body.quaternion.x,
    body.quaternion.y,
    body.quaternion.z,
    body.quaternion.w
  );
}

export function makeBody({
  shape,
  position,
  mass = 0,
  group = GROUPS.WORLD,
  mask = 0xffffffff,
  fixedRotation = false,
  gravityScale = 1,
  material = null,
  type = null
}) {
  const body = new CANNON.Body({
    mass,
    shape,
    position: new CANNON.Vec3(position.x, position.y, position.z),
    material,
    collisionFilterGroup: group,
    collisionFilterMask: mask,
    fixedRotation,
    gravityScale
  });
  if (type) body.type = type;
  return body;
}
