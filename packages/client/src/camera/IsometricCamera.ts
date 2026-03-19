import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import {
  CAMERA_ALPHA,
  CAMERA_BETA,
  CAMERA_FOLLOW_SPEED,
  CAMERA_RADIUS,
  CAMERA_RADIUS_MAX,
  CAMERA_RADIUS_MIN,
} from "@dungeon/shared";

const FREE_CAM_SPEED = 0.5;

export class IsometricCamera {
  public camera: ArcRotateCamera;
  private freeMode: boolean = false;
  private keysHeld: Set<string> = new Set();
  private keyDownHandler: ((e: KeyboardEvent) => void) | null = null;
  private keyUpHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.camera = new ArcRotateCamera(
      "isoCam",
      CAMERA_ALPHA,
      CAMERA_BETA,
      CAMERA_RADIUS,
      Vector3.Zero(),
      scene,
    );

    // Lock rotation angles
    this.camera.lowerAlphaLimit = this.camera.alpha;
    this.camera.upperAlphaLimit = this.camera.alpha;
    this.camera.lowerBetaLimit = this.camera.beta;
    this.camera.upperBetaLimit = this.camera.beta;

    // Lock zoom range
    this.camera.lowerRadiusLimit = CAMERA_RADIUS_MIN;
    this.camera.upperRadiusLimit = CAMERA_RADIUS_MAX;

    // Disable panning
    this.camera.panningSensibility = 0;

    // Attach for scroll-zoom only
    this.camera.attachControl(canvas, true);
  }

  followTarget(position: Vector3): void {
    Vector3.LerpToRef(this.camera.target, position, CAMERA_FOLLOW_SPEED, this.camera.target);
  }

  setFreeCamera(on: boolean): void {
    this.freeMode = on;
    if (on) {
      this.camera.lowerAlphaLimit = null;
      this.camera.upperAlphaLimit = null;
      this.camera.lowerBetaLimit = 0.1;
      this.camera.upperBetaLimit = Math.PI / 2;
      this.camera.lowerRadiusLimit = 5;
      this.camera.upperRadiusLimit = 50;
      // Enable WASD panning
      this.keyDownHandler = (e: KeyboardEvent) => this.keysHeld.add(e.key.toLowerCase());
      this.keyUpHandler = (e: KeyboardEvent) => this.keysHeld.delete(e.key.toLowerCase());
      window.addEventListener("keydown", this.keyDownHandler);
      window.addEventListener("keyup", this.keyUpHandler);
    } else {
      this.camera.alpha = CAMERA_ALPHA;
      this.camera.beta = CAMERA_BETA;
      this.camera.radius = CAMERA_RADIUS;
      this.camera.lowerAlphaLimit = CAMERA_ALPHA;
      this.camera.upperAlphaLimit = CAMERA_ALPHA;
      this.camera.lowerBetaLimit = CAMERA_BETA;
      this.camera.upperBetaLimit = CAMERA_BETA;
      this.camera.lowerRadiusLimit = CAMERA_RADIUS_MIN;
      this.camera.upperRadiusLimit = CAMERA_RADIUS_MAX;
      // Remove WASD listeners
      if (this.keyDownHandler) window.removeEventListener("keydown", this.keyDownHandler);
      if (this.keyUpHandler) window.removeEventListener("keyup", this.keyUpHandler);
      this.keysHeld.clear();
    }
  }

  /** Call each frame to apply WASD movement in free camera mode */
  updateFreeCamera(): void {
    if (!this.freeMode || this.keysHeld.size === 0) return;

    // Calculate forward/right vectors relative to camera angle
    const forward = new Vector3(Math.sin(this.camera.alpha), 0, Math.cos(this.camera.alpha));
    const right = new Vector3(Math.cos(this.camera.alpha), 0, -Math.sin(this.camera.alpha));

    const move = Vector3.Zero();
    if (this.keysHeld.has("w")) move.addInPlace(forward);
    if (this.keysHeld.has("s")) move.subtractInPlace(forward);
    if (this.keysHeld.has("a")) move.subtractInPlace(right);
    if (this.keysHeld.has("d")) move.addInPlace(right);

    if (move.lengthSquared() > 0) {
      move.normalize().scaleInPlace(FREE_CAM_SPEED);
      this.camera.target.addInPlace(move);
    }
  }
}
