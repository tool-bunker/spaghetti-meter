import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Application, Text, type Texture, type Ticker } from "pixi.js";
import { BowlScene } from "../scenes/BowlScene";
import { ResultExporter } from "./ResultExporter";
import { InfoScene } from "../scenes/InfoScene";
import { LicenseDialog } from "../ui/LicenseDialog";
import { ExportMenu, type ExportFormat } from "../ui/ExportMenu";
import { UiButton } from "../ui/UiButton";
import { COLORS, FONTS } from "../ui/theme";
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
  private readonly exportButton: UiButton;
  private readonly exportMenu: ExportMenu;
  private readonly resultExporter: ResultExporter;
  private readonly branding = new Text({
    text: "SPAGHETTI METER",
    style: {
      fill: COLORS.text,
      fontFamily: FONTS.display,
      fontSize: 16,
      fontWeight: "700",
      letterSpacing: 2.2,
    },
    anchor: 0.5,
    eventMode: "none",
  });
  private readonly licenseDialog = new LicenseDialog();
  private readonly motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  private state: AppState = { ...INITIAL_STATE };
  private reducedMotion = this.motionQuery.matches;
  private infoProgress = 0;
  private infoTarget = 0;
  private sceneWidth = 0;
  private sceneHeight = 0;
  private exporting = false;
  private exportAvailable = false;
  private exportMenuOpen = false;

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

  constructor(private readonly app: Application, bowlTexture: Texture) {
    this.bowlScene = new BowlScene({
      chooseFolder: () => void this.chooseFolder(),
      cancelScan: () => void this.cancelScan(),
      openNewFolder: () => void this.openNewFolder(),
    }, bowlTexture);
    this.infoScene = new InfoScene(
      () => this.showInfo(false),
      () => this.licenseDialog.show(),
    );
    this.infoButton = new UiButton({
      label: "i",
      accessibleLabel: "How Spaghetti Meter works",
      tooltipAlign: "right",
      variant: "circle",
      onPress: () => this.showInfo(!this.state.showingInfo),
    });
    this.exportButton = new UiButton({
      label: "Export",
      accessibleLabel: "Export result",
      accessibleHint: "Choose PNG image, animated GIF, or silent video",
      variant: "circle",
      tooltipAlign: "right",
      icon: "export",
      onPress: () => this.setExportMenuOpen(!this.exportMenuOpen),
    });
    this.exportButton.visible = false;
    this.exportMenu = new ExportMenu((format) => {
      this.setExportMenuOpen(false);
      void this.exportResult(format);
    });
    this.resultExporter = new ResultExporter(
      this.app,
      this.bowlScene,
      (visible) => this.setExportChromeVisible(visible),
    );
    this.branding.accessible = true;
    this.branding.accessibleType = "div";
    this.branding.accessibleTitle = "Spaghetti Meter";

    this.app.stage.addChild(
      this.bowlScene,
      this.infoScene,
      this.branding,
      this.exportMenu,
      this.exportButton,
      this.infoButton,
    );
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
    this.exportMenu.destroy({ children: true });
    this.exportButton.destroy({ children: true });
    this.branding.destroy();
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

  private async exportResult(format: ExportFormat): Promise<void> {
    const report = this.state.report;
    if (!report || !this.bowlScene.resultReady || this.exporting) return;
    this.exporting = true;
    this.updateExportButton();
    try {
      await this.resultExporter.export(format, report);
    } finally {
      this.exporting = false;
      this.updateExportButton();
    }
  }

  private setExportMenuOpen(open: boolean): void {
    const nextOpen = open && this.exportAvailable && !this.exporting;
    this.exportMenuOpen = nextOpen;
    this.exportMenu.setOpen(nextOpen);
    this.exportButton.setActive(nextOpen);
    this.refreshAccessibility();
  }

  private updateExportButton(): void {
    const available = !this.exporting
      && !this.state.showingInfo
      && this.bowlScene.resultReady;
    if (available === this.exportAvailable) return;
    this.exportAvailable = available;
    this.exportButton.visible = available;
    this.exportButton.setEnabled(available);
    if (!available && this.exportMenuOpen) this.setExportMenuOpen(false);
  }

  private setExportChromeVisible(visible: boolean): void {
    this.bowlScene.setResultControlsVisible(visible);
    this.infoButton.visible = visible;
    this.exportButton.visible = visible && this.exportAvailable;
    if (!visible) this.setExportMenuOpen(false);
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
    if (showingInfo) this.setExportMenuOpen(false);
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
    this.updateExportButton();
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
    this.branding.position.set(width / 2, 29);
    this.infoButton.position.set(width - 22 - 34, 20);
    this.exportButton.position.set(width - 22 - 34 - 44, 20);
    this.exportMenu.position.set(width - 22 - this.exportMenu.menuWidth, 60);
    this.bowlScene.pivot.set(width / 2, height / 2);
    this.bowlScene.position.set(width / 2, height / 2);
    this.infoScene.pivot.set(width / 2, height / 2);
    this.infoScene.position.set(width / 2, height / 2);
    this.applySceneTransition();
  }

  private update(ticker: Ticker): void {
    this.bowlScene.update(ticker);
    this.updateExportButton();
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


