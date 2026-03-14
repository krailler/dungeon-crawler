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

export class IsometricCamera {
  public camera: ArcRotateCamera;

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
    this.camera.target = Vector3.Lerp(this.camera.target, position, CAMERA_FOLLOW_SPEED);
  }

  setFreeCamera(on: boolean): void {
    if (on) {
      this.camera.lowerAlphaLimit = null;
      this.camera.upperAlphaLimit = null;
      this.camera.lowerBetaLimit = 0.1;
      this.camera.upperBetaLimit = Math.PI / 2;
      this.camera.lowerRadiusLimit = 5;
      this.camera.upperRadiusLimit = 50;
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
    }
  }
}
