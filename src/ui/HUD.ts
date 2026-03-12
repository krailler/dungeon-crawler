export class HUD {
  private healthFill: HTMLElement;
  private healthText: HTMLElement;
  private fpsCounter: HTMLElement;
  private fpsAccum: number = 0;
  private fpsFrames: number = 0;

  constructor() {
    this.healthFill = document.getElementById("health-fill")!;
    this.healthText = document.getElementById("health-text")!;
    this.fpsCounter = document.getElementById("fps-counter")!;
  }

  updateHealth(current: number, max: number): void {
    const pct = Math.max(0, Math.min(100, (current / max) * 100));
    this.healthFill.style.width = `${pct}%`;
    this.healthText.textContent = `${Math.ceil(current)}/${max}`;

    // Color changes based on health percentage
    if (pct > 60) {
      this.healthFill.style.background = "#2ecc71"; // green
    } else if (pct > 30) {
      this.healthFill.style.background = "#f39c12"; // orange
    } else {
      this.healthFill.style.background = "#e74c3c"; // red
    }
  }

  updateFPS(dt: number): void {
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      const fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsCounter.textContent = `${fps} FPS`;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
  }
}
