import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Application, type Ticker } from "pixi.js";
import { BowlScene } from "../scenes/BowlScene";
import { InfoScene } from "../scenes/InfoScene";
import { LicenseDialog } from "../ui/LicenseDialog";
import { UiButton } from "../ui/UiButton";
import type { AppState, ScanReport } from "./types";

const INITIAL_STATE: AppState = {
  selectedPath: "",
  report: null,
  status: "idle",
  errorMessage: "",
  requestId: "",
  showingInfo: false,
};

export class SpaghettiMeterApp {
  private readonly bowlScene: BowlScene;
  private readonly infoScene: InfoScene;
  private readonly infoButton: UiButton;
  private readonly licenseDialog = new LicenseDialog();
  private readonly motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  private state: AppState = { ...INITIAL_STATE };
  private reducedMotion = this.motionQuery.matches;
  private infoProgress = 0;
  private infoTarget = 0;
  private sceneWidth = 0;
  private sceneHeight = 0;

  private readonly updateFrame = (ticker: Ticker): void => {
    this.update(ticker);
  };

  private readonly handleResize = (): void => {
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this.resize(this.app.screen.width, this.app.screen.height);
  };

  private readonly handleMotionPreference = (event: MediaQueryListEvent): void => {
    this.reducedMotion = event.matches;
    this.bowlScene.setReducedMotion(this.reducedMotion);
    this.applySceneTransition();
  };

  constructor(private readonly app: Application) {
    this.bowlScene = new BowlScene({
      chooseFolder: () => void this.chooseFolder(),
      cancelScan: () => void this.cancelScan(),
      openNewFolder: () => void this.openNewFolder(),
    });
    this.infoScene = new InfoScene(
      () => this.showInfo(false),
      () => this.licenseDialog.show(),
    );
    this.infoButton = new UiButton({
      label: "i",
      accessibleLabel: "How Spaghetti Meter works",
      variant: "circle",
      onPress: () => this.showInfo(!this.state.showingInfo),
    });

    this.app.stage.addChild(this.bowlScene, this.infoScene, this.infoButton);
    this.app.ticker.maxFPS = 60;
    this.app.ticker.add(this.updateFrame);
    this.motionQuery.addEventListener("change", this.handleMotionPreference);
    window.addEventListener("resize", this.handleResize);

    this.bowlScene.setReducedMotion(this.reducedMotion);
    this.bowlScene.setState(this.state);
    this.resize(this.app.screen.width, this.app.screen.height);
  }

  dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.motionQuery.removeEventListener("change", this.handleMotionPreference);
    this.app.ticker.remove(this.updateFrame);
    this.bowlScene.dispose();
    this.infoScene.destroy({ children: true });
    this.infoButton.destroy({ children: true });
    this.licenseDialog.destroy();
  }

  private async chooseFolder(): Promise<void> {
    if (this.state.status === "scanning") return;
    this.setState({ errorMessage: "" });

    try {
      const selection = await open({
        directory: true,
        multiple: false,
        title: "Choose a project to measure",
      });
      if (typeof selection !== "string") return;

      this.setState({ selectedPath: selection, report: null });
      await this.scanProject(selection);
    } catch (error) {
      this.showError(error);
    }
  }

  private async scanProject(path: string): Promise<void> {
    const requestId = crypto.randomUUID();
    this.setState({ requestId, status: "scanning", errorMessage: "" });

    try {
      const report = await invoke<ScanReport>("scan_project", { requestId, path });
      this.setState({ report, status: "complete" });
    } catch (error) {
      if (String(error) === "Scan cancelled") {
        this.clearBowl();
        return;
      }
      this.showError(error);
    } finally {
      if (this.state.requestId === requestId) this.setState({ requestId: "" });
    }
  }

  private async cancelScan(): Promise<void> {
    if (!this.state.requestId) return;
    try {
      await invoke("cancel_scan", { requestId: this.state.requestId });
    } catch (error) {
      this.showError(error);
    }
  }

  private async openNewFolder(): Promise<void> {
    this.clearBowl();
    await this.chooseFolder();
  }

  private clearBowl(): void {
    this.setState({
      selectedPath: "",
      report: null,
      errorMessage: "",
      requestId: "",
      status: "idle",
    });
  }

  private showError(error: unknown): void {
    this.setState({
      report: null,
      errorMessage: String(error),
      requestId: "",
      status: "error",
    });
  }

  private showInfo(showingInfo: boolean): void {
    this.setState({ showingInfo });
    this.infoTarget = showingInfo ? 1 : 0;
    this.infoButton.setLabel(showingInfo ? "×" : "i", showingInfo ? "Return to the bowl" : "How Spaghetti Meter works");
    this.infoButton.setActive(showingInfo);
    this.bowlScene.setInteractive(!showingInfo);
    this.infoScene.setInteractive(showingInfo);
    if (showingInfo) this.infoScene.visible = true;
    this.applySceneTransition();
    this.refreshAccessibility();
  }

  private setState(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.bowlScene.setState(this.state);
    this.refreshAccessibility();
  }

  private refreshAccessibility(): void {
    this.app.renderer.accessibility.setAccessibilityEnabled(false);
    this.app.renderer.accessibility.setAccessibilityEnabled(true);
  }

  private resize(width: number, height: number): void {
    this.sceneWidth = width;
    this.sceneHeight = height;
    this.bowlScene.resize(width, height);
    this.infoScene.resize(width, height);
    this.infoButton.position.set(width - 22 - 34, 20);
    this.bowlScene.pivot.set(width / 2, height / 2);
    this.bowlScene.position.set(width / 2, height / 2);
    this.infoScene.pivot.set(width / 2, height / 2);
    this.infoScene.position.set(width / 2, height / 2);
    this.applySceneTransition();
  }

  private update(ticker: Ticker): void {
    this.bowlScene.update(ticker);
    if (this.reducedMotion) {
      if (this.infoProgress !== this.infoTarget) {
        this.infoProgress = this.infoTarget;
        this.applySceneTransition();
      }
      return;
    }

    if (this.infoProgress !== this.infoTarget) {
      const amount = ticker.deltaMS / 420;
      this.infoProgress = this.infoTarget > this.infoProgress
        ? Math.min(this.infoTarget, this.infoProgress + amount)
        : Math.max(this.infoTarget, this.infoProgress - amount);
      this.applySceneTransition();
    }
  }

  private applySceneTransition(): void {
    if (this.sceneWidth < 1 || this.sceneHeight < 1) return;
    const progress = this.reducedMotion ? this.infoTarget : this.infoProgress;
    const bowlScale = 1 - progress * 0.035;
    const infoScale = 0.965 + progress * 0.035;
    this.bowlScene.alpha = 1 - progress;
    this.bowlScene.scale.set(bowlScale);
    this.infoScene.alpha = progress;
    this.infoScene.scale.set(infoScale);
    this.bowlScene.visible = progress < 1;
    this.infoScene.visible = progress > 0;
  }
}
