import { createRoot, type Root } from "react-dom/client";
import { HudRoot } from "./HudRoot";
import { hudStore, type PartyMember } from "./hudStore";

export class HUD {
  private root: Root | null = null;
  private fpsAccum: number = 0;
  private fpsFrames: number = 0;

  constructor() {
    const mount = document.getElementById("ui-root");
    if (!mount) {
      throw new Error("UI root #ui-root not found");
    }
    this.root = createRoot(mount);
    this.root.render(<HudRoot />);
  }

  setMember(member: PartyMember): void {
    hudStore.setMember(member);
  }

  updateMember(id: string, update: Partial<PartyMember>): void {
    hudStore.updateMember(id, update);
  }

  removeMember(id: string): void {
    hudStore.removeMember(id);
  }

  updateFPS(dt: number): void {
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      const fps = Math.round(this.fpsFrames / this.fpsAccum);
      hudStore.setFPS(fps);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
  }

  dispose(): void {
    this.root?.unmount();
    this.root = null;
    hudStore.reset();
  }
}
