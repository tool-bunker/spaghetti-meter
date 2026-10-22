import { Container, Graphics, Text, type TextStyleOptions, type Ticker } from "pixi.js";
import type { AppState } from "../app/types";
import { describeScore } from "../app/verdict";
import { SpaghettiScene } from "../spaghetti/SpaghettiScene";
import { SPAGHETTI_SETTINGS } from "../spaghetti/settings";
import { UiButton } from "../ui/UiButton";
import { COLORS, FONTS } from "../ui/theme";

const BOLD_FONT_WEIGHT = "bold";
const COMPACT_LAYOUT_MAX_WIDTH = 700;
const HORIZONTAL_GUTTER = 36;

interface BowlSceneActions {
  chooseFolder: () => void;
  cancelScan: () => void;
  openNewFolder: () => void;
}

export class BowlScene extends Container {
  private readonly backdrop = new Graphics();
  private readonly glow = new Graphics();
  private readonly spaghetti = new SpaghettiScene();
  private readonly selectButton: UiButton;
  private readonly projectEyebrow = centeredText("", {
    fill: COLORS.red,
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: BOLD_FONT_WEIGHT,
    letterSpacing: 2,
  });
  private readonly projectName = centeredText("", {
    fill: COLORS.project,
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: "600",
  });
  private readonly scanGroup = new Container({ label: "scan-message", eventMode: "none" });
  private readonly spinner = new Graphics();
  private readonly scanText = centeredText("", {
    fill: 0xa99d90,
    fontFamily: FONTS.sans,
    fontSize: 12,
  });
  private readonly amountGroup = new Container({ label: "score" });
  private readonly scoreText = centeredText("—", {
    fill: COLORS.subtle,
    fontFamily: FONTS.serif,
    fontSize: 48,
    fontWeight: "500",
  });
  private readonly scoreSuffix = new Text({
    text: "/100",
    style: {
      fill: COLORS.muted,
      fontFamily: FONTS.mono,
      fontSize: 12,
      letterSpacing: 0.5,
    },
  });
  private readonly titleText = centeredText("", {
    fill: COLORS.heading,
    fontFamily: FONTS.serif,
    fontSize: 30,
    fontWeight: "500",
    letterSpacing: -0.7,
    align: "center",
  });
  private readonly copyText = centeredText("", {
    fill: COLORS.body,
    fontFamily: FONTS.sans,
    fontSize: 12,
    lineHeight: 19,
    align: "center",
    wordWrap: true,
    wordWrapWidth: 520,
  });
  private readonly actionButton: UiButton;
  private readonly errorTitle = centeredText("Could not fill the bowl.", {
    fill: COLORS.error,
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: BOLD_FONT_WEIGHT,
  });
  private readonly errorText = centeredText("", {
    fill: COLORS.errorMuted,
    fontFamily: FONTS.sans,
    fontSize: 11,
    align: "center",
    wordWrap: true,
    wordWrapWidth: 520,
  });

  private state: AppState = {
    selectedPath: "",
    report: null,
    status: "idle",
    errorMessage: "",
    requestId: "",
    showingInfo: false,
  };
  private sceneWidth = 0;
  private sceneHeight = 0;
  private reducedMotion = false;
  private lastSpaghettiScore = Number.NaN;
  private lastScanning = false;
  private lastReducedMotion = false;

  constructor(actions: BowlSceneActions) {
    super({ label: "bowl-scene", eventMode: "passive" });
    this.selectButton = new UiButton({
      label: "Select folder",
      accessibleHint: "Choose a project folder to measure",
      variant: "primary",
      icon: "folder",
      onPress: actions.chooseFolder,
    });
    this.actionButton = new UiButton({
      label: "Cancel scan",
      variant: "text",
      onPress: () => {
        if (this.state.status === "scanning") actions.cancelScan();
        else if (this.state.status === "complete") actions.openNewFolder();
      },
    });

    this.scanGroup.addChild(this.spinner, this.scanText);
    this.amountGroup.addChild(this.scoreText, this.scoreSuffix);
    this.addChild(
      this.backdrop,
      this.glow,
      this.spaghetti,
      this.selectButton,
      this.projectEyebrow,
      this.projectName,
      this.scanGroup,
      this.amountGroup,
      this.titleText,
      this.copyText,
      this.actionButton,
      this.errorTitle,
      this.errorText,
    );

    this.titleText.accessible = true;
    this.titleText.accessibleType = "h1";
    this.copyText.accessible = true;
    this.copyText.accessibleType = "p";
    this.scoreText.accessible = true;
    this.scoreText.accessibleType = "div";
    this.applyState();
  }

  setState(state: AppState): void {
    this.state = state;
    this.applyState();
    this.rebuildSpaghettiIfNeeded();
  }

  setReducedMotion(reducedMotion: boolean): void {
    if (this.reducedMotion === reducedMotion) return;
    this.reducedMotion = reducedMotion;
    this.rebuildSpaghettiIfNeeded(true);
  }

  resize(width: number, height: number): void {
    this.sceneWidth = width;
    this.sceneHeight = height;
    const compact = width <= COMPACT_LAYOUT_MAX_WIDTH;
    const centerX = width / 2;
    const top = compact ? 18 : Math.max(20, height * 0.03);

    this.backdrop.clear().rect(0, 0, width, height).fill(COLORS.background);
    this.glow.clear()
      .ellipse(centerX, height * 0.46, Math.min(width * 0.4, 360), Math.min(height * 0.3, 220))
      .fill({
        color: this.state.report && this.state.report.score > 100 ? COLORS.red : COLORS.accent,
        alpha: this.state.report && this.state.report.score > 100 ? 0.055 : 0.035,
      });

    this.selectButton.position.set(centerX - 95, top);
    this.projectEyebrow.position.set(centerX, top + 7);
    this.projectName.position.set(centerX, top + 28);

    const depth = Math.min(height * SPAGHETTI_SETTINGS.bowl.depthRatio, SPAGHETTI_SETTINGS.bowl.maximumDepth);
    const rimY = height * SPAGHETTI_SETTINGS.bowl.rimYRatio;
    this.scanGroup.position.set(centerX, rimY - depth * 0.72);
    this.scanText.position.set(14 + this.scanText.width / 2, 0);

    const resultTop = Math.max(rimY + depth * 1.5, height - (compact ? 186 : 192));
    const scoreFontSize = Math.min(67, Math.max(42, height * 0.052));
    this.scoreText.style.fontSize = scoreFontSize;
    this.amountGroup.position.set(centerX, resultTop);
    this.layoutScore();

    this.titleText.style.fontSize = Math.min(38, Math.max(23, width * 0.038));
    this.titleText.style.wordWrap = true;
    this.titleText.style.wordWrapWidth = Math.min(width - HORIZONTAL_GUTTER, 620);
    this.titleText.position.set(centerX, resultTop + 48);

    this.copyText.style.wordWrapWidth = Math.min(width - 42, 520);
    this.copyText.position.set(centerX, resultTop + 84);

    this.actionButton.resize(Math.min(220, width - HORIZONTAL_GUTTER), 28);
    this.actionButton.position.set(centerX - this.actionButton.width / 2, resultTop + 112);
    this.errorTitle.position.set(centerX, resultTop + 116);
    this.errorText.style.wordWrapWidth = Math.min(width - 42, 520);
    this.errorText.position.set(centerX, resultTop + 138);

    this.rebuildSpaghettiIfNeeded(true);
  }

  update(ticker: Ticker): void {
    this.spaghetti.update(ticker);
    if (this.state.status === "scanning" && !this.reducedMotion) {
      this.spinner.rotation += 0.12 * ticker.deltaTime;
    }
  }

  setInteractive(interactive: boolean): void {
    this.eventMode = interactive ? "passive" : "none";
  }

  dispose(): void {
    this.spaghetti.dispose();
    super.destroy({ children: true });
  }

  private applyState(): void {
    const { status, report } = this.state;
    const showSelect = status === "idle" || status === "error";
    const showProject = status === "scanning" || status === "complete";
    const projectName = report?.projectName
      ?? this.state.selectedPath.split(/[\\/]/).filter(Boolean).at(-1)
      ?? "";
    const verdict = describeScore(report?.score);

    this.selectButton.visible = showSelect;
    this.selectButton.setEnabled(showSelect);
    this.projectEyebrow.visible = showProject;
    this.projectName.visible = showProject;
    this.projectEyebrow.text = status === "scanning" ? "MEASURING" : "PROJECT";
    this.projectName.text = projectName;
    this.projectName.accessible = showProject;
    this.projectName.accessibleTitle = `${this.projectEyebrow.text.toLowerCase()} ${projectName}`;

    this.scanGroup.visible = status === "scanning";
    this.scanText.text = `Reading ${projectName || "project"}…`;

    this.scoreText.text = report ? String(report.score) : "—";
    this.scoreText.style.fill = report ? COLORS.accent : COLORS.subtle;
    this.scoreText.accessibleTitle = report
      ? `${report.score} out of 100 spaghetti score`
      : "No spaghetti score measured";
    this.layoutScore();

    this.titleText.text = status === "scanning" ? "Measuring the spaghetti…" : verdict.label;
    this.titleText.accessibleTitle = this.titleText.text;
    this.copyText.text = status === "scanning"
      ? "Code Buster is reading the project locally."
      : verdict.copy;
    this.copyText.accessibleTitle = this.copyText.text;

    this.actionButton.visible = status === "complete" || status === "scanning";
    this.actionButton.setEnabled(this.actionButton.visible);
    this.actionButton.setLabel(
      status === "scanning" ? "Cancel scan" : "Clear bowl · open new folder",
    );

    this.errorTitle.visible = status === "error";
    this.errorText.visible = status === "error";
    this.errorText.text = this.state.errorMessage;
    this.glow.tint = report && report.score > 100 ? COLORS.red : 0xffffff;
  }

  private layoutScore(): void {
    const gap = 5;
    this.scoreText.position.set(-this.scoreSuffix.width / 2 - gap / 2, 0);
    this.scoreSuffix.position.set(this.scoreText.width / 2 + gap / 2, 14);
  }

  private rebuildSpaghettiIfNeeded(force = false): void {
    if (this.sceneWidth < 2 || this.sceneHeight < 2) return;
    const score = this.state.report?.score ?? 0;
    const scanning = this.state.status === "scanning";
    if (!force
      && score === this.lastSpaghettiScore
      && scanning === this.lastScanning
      && this.reducedMotion === this.lastReducedMotion) return;

    this.lastSpaghettiScore = score;
    this.lastScanning = scanning;
    this.lastReducedMotion = this.reducedMotion;
    this.spaghetti.rebuild(
      this.sceneWidth,
      this.sceneHeight,
      score,
      scanning,
      this.reducedMotion,
    );
  }
}

function centeredText(text: string, style: TextStyleOptions): Text {
  return new Text({ text, style, anchor: 0.5, eventMode: "none" });
}
