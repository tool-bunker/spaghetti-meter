import {
  BitmapText,
  Container,
  Graphics,
  Point,
  Rectangle,
  Text,
  type FederatedPointerEvent,
  type TextStyleOptions,
  type Ticker,
} from "pixi.js";
import type { AppState } from "../app/types";
import { describeScore } from "../app/verdict";
import { calculateBowlBounds, type BowlBounds } from "../spaghetti/geometry";
import { SpaghettiScene } from "../spaghetti/SpaghettiScene";
import { SPAGHETTI_SETTINGS } from "../spaghetti/settings";
import { UiButton } from "../ui/UiButton";
import { COLORS, FONTS } from "../ui/theme";
import { BowlEffects, scoreColor } from "./BowlEffects";

const BOLD_FONT_WEIGHT = "bold";
const COMPACT_LAYOUT_MAX_WIDTH = 700;
const HORIZONTAL_GUTTER = 36;
const SCORE_BADGE_RADIUS = 32;
const SCORE_BADGE_MIN_SCALE = 0.78;
const SCORE_BADGE_MAX_SCALE = 1.55;
const SCORE_BADGE_FULL_SCALE_AT = 200;
const CLICK_IMPULSE_MAGNITUDE = 0.96;
const CLICK_IMPULSE_RADIUS = 180;
const STAMP_IMPULSE_MAGNITUDE = 1.44;
const STAMP_DELAY_SECONDS = 1.1;
const STAMP_DROP_DURATION_SECONDS = 0.28;
const STAMP_SETTLE_DURATION_SECONDS = 0.18;
const STAMP_START_SCALE_MULTIPLIER = 3.4;
const STAMP_IMPACT_SCALE_MULTIPLIER = 0.82;
const VERDICT_STAMP_DELAY_SECONDS = 0.08;
const VERDICT_STAMP_DROP_SECONDS = 0.26;
const VERDICT_STAMP_SETTLE_SECONDS = 0.16;
const VERDICT_STAMP_START_SCALE = 2.35;
const VERDICT_STAMP_IMPACT_SCALE = 0.78;

interface BowlSceneActions {
  chooseFolder: () => void;
  cancelScan: () => void;
  openNewFolder: () => void;
}

export class BowlScene extends Container {
  private readonly impactCamera = new Container({ label: "impact-camera" });
  private readonly backdrop = new Graphics();
  private readonly bowlEffects = new BowlEffects();
  private readonly spaghetti = new SpaghettiScene();
  private readonly selectButton: UiButton;
  private readonly replayButton: UiButton;
  private readonly newFolderButton: UiButton;
  private readonly projectMetaGroup = new Container({
    label: "project-name-and-version",
    eventMode: "none",
  });
  private readonly projectMetaBackground = new Graphics({ eventMode: "none" });
  private readonly projectMeta = centeredText("", {
    fill: 0xffffff,
    fontFamily: FONTS.mono,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.5,
  });
  private readonly scanGroup = new Container({ label: "scan-message", eventMode: "none" });
  private readonly scanText = new BitmapText({
    text: "",
    style: {
      fill: COLORS.muted,
      fontFamily: FONTS.sans,
      fontSize: 12,
    },
    anchor: 0.5,
    eventMode: "none",
    roundPixels: true,
  });
  private readonly spaghettiInteraction = new Container({
    label: "spaghetti-impact-area",
    eventMode: "static",
  });
  private readonly spaghettiHitArea = new Rectangle();
  private readonly pointerPosition = new Point();
  private readonly scoreBadge = new Container({ label: "score-badge", eventMode: "none" });
  private readonly scoreBadgeBackground = new Graphics({ eventMode: "none" })
    .circle(0, 0, SCORE_BADGE_RADIUS)
    .fill({ color: COLORS.background, alpha: 0.94 })
    .stroke({ color: COLORS.panelBorder, width: 1.5 });
  private readonly scoreBadgeRing = new Graphics({ eventMode: "none" })
    .circle(0, 0, SCORE_BADGE_RADIUS - 2)
    .stroke({ color: 0xffffff, width: 3.5 });
  private readonly scoreText = new BitmapText({
    text: "0",
    style: {
      fill: 0xffffff,
      fontFamily: FONTS.display,
      fontSize: 28,
      fontWeight: "700",
    },
    anchor: 0.5,
    eventMode: "none",
    roundPixels: true,
  });
  private readonly titleText = centeredText("", {
    fill: COLORS.heading,
    fontFamily: FONTS.display,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1.1,
    align: "center",
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
  private bowl: BowlBounds | undefined;
  private reducedMotion = false;
  private lastSpaghettiScore = Number.NaN;
  private lastScanning = false;
  private lastReducedMotion = false;
  private displayedScore: number | null = null;
  private scoreStampElapsed = 0;
  private scoreStampDelayElapsed = 0;
  private scoreStampActive = false;
  private scoreStampLanded = false;
  private scoreStampImpactTriggered = false;
  private verdictStampElapsed = 0;
  private verdictStampActive = false;
  private verdictStampLanded = false;

  private readonly handleSpaghettiPointerDown = (event: FederatedPointerEvent): void => {
    const report = this.state.report;
    if (this.state.status !== "complete"
      || !report
      || report.score <= 0
      || this.reducedMotion
      || this.spaghetti.productionProgress <= 0) return;
    this.spaghettiInteraction.toLocal(event.global, undefined, this.pointerPosition);
    this.triggerSpaghettiImpact(
      this.pointerPosition.x,
      this.pointerPosition.y,
      CLICK_IMPULSE_MAGNITUDE,
      CLICK_IMPULSE_RADIUS,
      COLORS.accentHover,
    );
  };

  constructor(actions: BowlSceneActions) {
    super({ label: "bowl-scene", eventMode: "passive" });
    this.selectButton = new UiButton({
      label: "Select folder",
      accessibleHint: "Choose a project folder to measure",
      variant: "primary",
      icon: "folder",
      onPress: actions.chooseFolder,
    });
    this.replayButton = new UiButton({
      label: "Replay",
      accessibleLabel: "Replay spaghetti animation",
      accessibleHint: "Restarts the current spaghetti drop without scanning the project again",
      variant: "circle",
      icon: "replay",
      onPress: () => {
        this.bowlEffects.restart();
        this.setDisplayedScore(0);
        this.rebuildSpaghettiIfNeeded(true);
      },
    });
    this.newFolderButton = new UiButton({
      label: "Open new folder",
      accessibleLabel: "Clear bowl and open a new folder",
      accessibleHint: "Choose another project to measure",
      variant: "circle",
      icon: "folder",
      onPress: actions.openNewFolder,
    });
    this.actionButton = new UiButton({
      label: "Cancel scan",
      variant: "text",
      onPress: actions.cancelScan,
    });

    this.spaghettiInteraction.hitArea = this.spaghettiHitArea;
    this.spaghettiInteraction.interactiveChildren = false;
    this.spaghettiInteraction.cursor = "crosshair";
    this.spaghettiInteraction.on("pointerdown", this.handleSpaghettiPointerDown);

    this.scanGroup.addChild(this.scanText);
    this.scoreBadge.addChild(
      this.scoreBadgeBackground,
      this.scoreBadgeRing,
      this.scoreText,
    );
    this.projectMetaGroup.addChild(this.projectMetaBackground, this.projectMeta);
    this.projectMetaGroup.accessibleType = "div";
    this.impactCamera.addChild(
      this.backdrop,
      this.bowlEffects,
      this.spaghetti,
      this.bowlEffects.foreground,
      this.spaghettiInteraction,
      this.scoreBadge,
      this.selectButton,
      this.replayButton,
      this.newFolderButton,
      this.scanGroup,
      this.projectMetaGroup,
      this.titleText,
      this.actionButton,
      this.errorTitle,
      this.errorText,
    );
    this.addChild(this.impactCamera);

    this.titleText.accessible = true;
    this.titleText.accessibleType = "h1";
    this.scoreText.accessible = true;
    this.scoreText.accessibleType = "div";
    this.scanText.accessibleType = "div";
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
    this.bowlEffects.setReducedMotion(reducedMotion);
    this.rebuildSpaghettiIfNeeded(true);
    this.updateProgressMessage();
    this.updateSpaghettiInteraction();
  }

  resize(width: number, height: number): void {
    this.sceneWidth = width;
    this.sceneHeight = height;
    const compact = width <= COMPACT_LAYOUT_MAX_WIDTH;
    const centerX = width / 2;
    const top = compact ? 18 : Math.max(20, height * 0.03);

    this.backdrop.clear().rect(0, 0, width, height).fill(COLORS.background);
    const bowl = calculateBowlBounds(width, height, SPAGHETTI_SETTINGS.bowl);
    this.bowl = bowl;
    this.bowlEffects.resize(width, height, bowl);

    this.selectButton.position.set(centerX - 95, top);
    this.replayButton.position.set(20, top);
    this.newFolderButton.position.set(64, top);
    const scoreBadgeY = this.scoreBadgeY(bowl);
    this.scoreBadge.position.set(bowl.centerX, scoreBadgeY);
    this.layoutProjectMeta();
    this.spaghettiHitArea.x = 0;
    this.spaghettiHitArea.y = 0;
    this.spaghettiHitArea.width = width;
    this.spaghettiHitArea.height = height;

    const { depth, rimY } = bowl;
    this.scanGroup.position.set(centerX, rimY - depth * 0.72);
    this.scanText.position.set(0, 0);

    const resultTop = Math.max(rimY + depth * 1.55, height - (compact ? 245 : 235));
    this.titleText.style.fontSize = Math.min(56, Math.max(34, width * 0.055));
    this.titleText.style.wordWrap = true;
    this.titleText.style.wordWrapWidth = Math.min(width - HORIZONTAL_GUTTER, 700);
    this.layoutVerdictTitle();

    this.actionButton.resize(Math.min(220, width - HORIZONTAL_GUTTER), 28);
    this.actionButton.position.set(centerX - this.actionButton.width / 2, resultTop + 72);
    this.errorTitle.position.set(centerX, resultTop + 72);
    this.errorText.style.wordWrapWidth = Math.min(width - 42, 520);
    this.errorText.position.set(centerX, resultTop + 94);

    this.rebuildSpaghettiIfNeeded(true);
  }

  update(ticker: Ticker): void {
    this.spaghetti.update(ticker);
    this.updateScore();
    this.bowlEffects.setProductionProgress(this.spaghetti.productionProgress);
    this.bowlEffects.update(ticker);
    this.applyEffects();
    this.updateScoreStamp(ticker);
    this.updateVerdictStamp(ticker);
    this.applyResultVisibility();
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
    const projectName = report?.projectName
      ?? this.state.selectedPath.split(/[\\/]/).filter(Boolean).at(-1)
      ?? "";
    const verdict = describeScore(report?.score);

    this.selectButton.visible = showSelect;
    const complete = status === "complete" && report !== null;
    const showReplay = complete && report.score > 0;
    this.replayButton.visible = showReplay;
    this.replayButton.setEnabled(showReplay);
    this.newFolderButton.visible = complete;
    this.newFolderButton.setEnabled(complete);
    this.selectButton.setEnabled(showSelect);
    this.updateSpaghettiInteraction();
    this.projectMeta.text = formatProjectLabel(projectName, report?.projectVersion);
    this.projectMetaGroup.accessibleTitle = report?.projectVersion
      ? `Project ${projectName}, version ${report.projectVersion}`
      : `Project ${projectName}`;
    this.updateProjectMetaLabel();
    this.layoutProjectMeta();
    this.applyScoreState(report);
    this.updateProgressMessage(projectName);

    this.titleText.text = verdict.label.toUpperCase();
    this.titleText.accessibleTitle = verdict.label;
    this.layoutVerdictTitle();

    const scanning = status === "scanning";
    this.actionButton.visible = scanning;
    this.actionButton.setEnabled(scanning);

    this.errorTitle.visible = status === "error";
    this.errorText.visible = status === "error";
    this.errorText.text = this.state.errorMessage;
    this.bowlEffects.setVisible(report !== null);
    this.applyResultVisibility();
  }

  private applyScoreState(report: AppState["report"]): void {
    if (!report) {
      this.setDisplayedScore(null);
      this.resetScoreStamp();
      this.scoreText.accessibleTitle = "No spaghetti score measured";
      return;
    }
    if (report.score !== this.lastSpaghettiScore || this.displayedScore === null) {
      this.setDisplayedScore(this.reducedMotion ? report.score : 0);
    }
    this.scoreText.accessibleTitle =
      `${report.score} spaghetti score; ${SPAGHETTI_SETTINGS.serving.containedScore} is the baseline`;
    if (this.reducedMotion) {
      this.showStaticScoreBadge(report.score);
    } else {
      this.setScoreBadgeVisible(this.scoreStampActive || this.scoreStampLanded);
    }
  }

  private applyResultVisibility(): void {
    const complete = this.state.status === "complete" && this.state.report !== null;
    const showProjectMeta = this.projectMeta.text.trim().length > 0;
    const showVerdict = complete
      && (this.reducedMotion || this.verdictStampActive || this.verdictStampLanded);
    this.projectMetaGroup.visible = showProjectMeta;
    this.projectMetaGroup.accessible = showProjectMeta;
    this.titleText.visible = showVerdict;
    this.titleText.accessible = showVerdict;
  }

  private updateScore(): void {
    const report = this.state.report;
    if (this.state.status !== "complete" || !report) return;
    const score = this.reducedMotion
      ? report.score
      : Math.floor(report.score * this.spaghetti.productionProgress);
    this.setDisplayedScore(Math.min(report.score, score));
  }

  private setDisplayedScore(score: number | null): void {
    const normalizedScore = score === null ? null : Math.max(0, Math.floor(score));
    if (normalizedScore === null) {
      this.bowlEffects.clear();
    } else {
      this.bowlEffects.setScore(normalizedScore);
    }
    if (normalizedScore === this.displayedScore) return;
    this.displayedScore = normalizedScore;
    this.updateProgressMessage();
  }

  private updateProgressMessage(projectName?: string): void {
    const { report, status } = this.state;
    const scanning = status === "scanning";
    const counting = status === "complete"
      && report !== null
      && !this.reducedMotion
      && this.displayedScore !== null
      && this.displayedScore < report.score;
    const visible = scanning || counting;

    this.scanGroup.visible = visible;
    this.scanText.accessible = visible;
    if (!visible) return;

    this.scanText.text = scanning
      ? `Reading ${projectName || "project"}…`
      : `Spaghetti Meter score · ${this.displayedScore}`;
    this.scanText.accessibleTitle = scanning
      ? this.scanText.text
      : "Spaghetti Meter score counting";
  }

  private updateSpaghettiInteraction(): void {
    const report = this.state.report;
    const enabled = this.state.status === "complete"
      && report !== null
      && report.score > 0
      && !this.reducedMotion;
    this.spaghettiInteraction.eventMode = enabled ? "static" : "none";
    this.spaghettiInteraction.cursor = enabled ? "crosshair" : "default";
  }

  private updateProjectMetaLabel(): void {
    const paddingX = 11;
    const paddingY = 5;
    this.projectMetaBackground.clear()
      .roundRect(
        -this.projectMeta.width / 2 - paddingX,
        -this.projectMeta.height / 2 - paddingY,
        this.projectMeta.width + paddingX * 2,
        this.projectMeta.height + paddingY * 2,
        4,
      )
      .fill({ color: 0x111111, alpha: 0.92 });
  }

  private layoutProjectMeta(): void {
    if (!this.bowl) return;
    const badgeScale = this.scoreBadgeBaseScale();
    this.projectMetaGroup.position.set(
      this.bowl.centerX,
      this.scoreBadgeY(this.bowl) + SCORE_BADGE_RADIUS * badgeScale + 16,
    );
  }

  private verdictTitleY(): number {
    const scaleY = Math.max(0.001, Math.abs(this.titleText.scale.y));
    const titleHalfHeight = this.titleText.height / scaleY / 2;
    return this.projectMetaGroup.y
      + this.projectMetaBackground.height / 2
      + titleHalfHeight
      + 16;
  }

  private layoutVerdictTitle(): void {
    if (!this.bowl) return;
    this.titleText.position.set(this.bowl.centerX, this.verdictTitleY());
  }

  private scoreBadgeY(bowl: BowlBounds): number {
    return bowl.rimY + bowl.depth * 0.46;
  }

  private scoreBadgeBaseScale(): number {
    const score = this.state.report?.score ?? this.displayedScore ?? 0;
    const scoreRatio = Math.min(1, Math.max(0, score) / SCORE_BADGE_FULL_SCALE_AT);
    return SCORE_BADGE_MIN_SCALE
      + (SCORE_BADGE_MAX_SCALE - SCORE_BADGE_MIN_SCALE) * scoreRatio;
  }

  private setScoreBadgeVisible(visible: boolean): void {
    this.scoreBadge.visible = visible;
    this.scoreText.accessible = visible;
  }

  private setScoreBadgeAppearance(score: number): void {
    const normalizedScore = Math.max(0, Math.floor(score));
    this.scoreText.text = String(normalizedScore);
    const digitCount = this.scoreText.text.length;
    this.scoreText.style.fontSize = Math.max(15, 28 - Math.max(0, digitCount - 3) * 5);
    const color = scoreColor(normalizedScore);
    this.scoreText.tint = color;
    this.scoreBadgeRing.tint = color;
  }

  private resetScoreStamp(): void {
    this.scoreStampElapsed = 0;
    this.scoreStampDelayElapsed = 0;
    this.scoreStampActive = false;
    this.scoreStampLanded = false;
    this.scoreStampImpactTriggered = false;
    this.resetVerdictStamp();
    this.bowlEffects.hideStaticImpact();
    const report = this.state.report;
    if (this.reducedMotion && report) {
      this.showStaticScoreBadge(report.score);
      this.showStaticVerdictTitle();
    } else {
      this.setScoreBadgeVisible(false);
    }
  }

  private showStaticScoreBadge(score: number): void {
    this.scoreStampActive = false;
    this.scoreStampLanded = true;
    this.scoreStampImpactTriggered = true;
    this.setScoreBadgeAppearance(score);
    this.setScoreBadgeVisible(true);
    if (this.bowl) {
      this.scoreBadge.position.set(this.bowl.centerX, this.scoreBadgeY(this.bowl));
    }
    this.scoreBadge.scale.set(this.scoreBadgeBaseScale());
    if (this.bowl) {
      this.bowlEffects.showStaticImpact(
        this.bowl.centerX,
        this.scoreBadgeY(this.bowl),
        SCORE_BADGE_RADIUS * this.scoreBadgeBaseScale() * 1.75,
        score,
      );
    }
  }

  private startScoreStamp(score: number): void {
    this.scoreStampElapsed = 0;
    this.scoreStampActive = true;
    this.scoreStampLanded = false;
    this.scoreStampImpactTriggered = false;
    this.setScoreBadgeAppearance(score);
    this.setScoreBadgeVisible(true);
    this.applyScoreStampTransform();
  }

  private updateScoreStamp(ticker: Ticker): void {
    const report = this.state.report;
    if (this.state.status !== "complete" || !report) return;
    if (this.reducedMotion) {
      if (!this.scoreStampLanded) this.showStaticScoreBadge(report.score);
      return;
    }
    const deltaSeconds = Math.min(ticker.deltaMS / 1_000, 0.05);
    if (!this.scoreStampActive && !this.scoreStampLanded) {
      if (this.spaghetti.productionProgress < 1) {
        this.scoreStampDelayElapsed = 0;
        return;
      }
      this.scoreStampDelayElapsed = Math.min(
        STAMP_DELAY_SECONDS,
        this.scoreStampDelayElapsed + deltaSeconds,
      );
      if (this.scoreStampDelayElapsed < STAMP_DELAY_SECONDS) return;
      this.startScoreStamp(report.score);
    }
    if (!this.scoreStampActive) return;

    const totalDuration = STAMP_DROP_DURATION_SECONDS + STAMP_SETTLE_DURATION_SECONDS;
    this.scoreStampElapsed = Math.min(
      totalDuration,
      this.scoreStampElapsed + deltaSeconds,
    );
    if (!this.scoreStampImpactTriggered
      && this.scoreStampElapsed >= STAMP_DROP_DURATION_SECONDS) {
      this.scoreStampImpactTriggered = true;
      this.triggerScoreStampImpact();
    }
    this.applyScoreStampTransform();
    if (this.scoreStampElapsed >= totalDuration) {
      this.scoreStampActive = false;
      this.scoreStampLanded = true;
    }
  }

  private resetVerdictStamp(): void {
    this.verdictStampElapsed = 0;
    this.verdictStampActive = false;
    this.verdictStampLanded = false;
    this.titleText.rotation = 0;
    this.titleText.scale.set(1);
    this.titleText.alpha = 1;
    this.layoutVerdictTitle();
  }

  private showStaticVerdictTitle(): void {
    this.verdictStampActive = false;
    this.verdictStampLanded = true;
    this.titleText.rotation = 0;
    this.titleText.scale.set(1);
    this.titleText.alpha = 1;
    this.layoutVerdictTitle();
  }

  private startVerdictStamp(): void {
    this.verdictStampElapsed = 0;
    this.verdictStampActive = true;
    this.verdictStampLanded = false;
    this.titleText.alpha = 0;
    this.applyVerdictStampTransform();
  }

  private updateVerdictStamp(ticker: Ticker): void {
    if (this.state.status !== "complete" || !this.state.report) return;
    if (this.reducedMotion) {
      if (!this.verdictStampLanded) this.showStaticVerdictTitle();
      return;
    }
    if ((!this.scoreStampActive && !this.scoreStampLanded)
      || this.scoreStampElapsed < VERDICT_STAMP_DELAY_SECONDS) return;

    const deltaSeconds = Math.min(ticker.deltaMS / 1_000, 0.05);
    if (!this.verdictStampActive && !this.verdictStampLanded) {
      this.startVerdictStamp();
    }
    if (!this.verdictStampActive) return;

    const totalDuration = VERDICT_STAMP_DROP_SECONDS + VERDICT_STAMP_SETTLE_SECONDS;
    this.verdictStampElapsed = Math.min(
      totalDuration,
      this.verdictStampElapsed + deltaSeconds,
    );
    this.applyVerdictStampTransform();
    if (this.verdictStampElapsed >= totalDuration) {
      this.verdictStampActive = false;
      this.verdictStampLanded = true;
      this.titleText.rotation = 0;
      this.titleText.scale.set(1);
      this.titleText.alpha = 1;
      this.layoutVerdictTitle();
    }
  }

  private applyVerdictStampTransform(): void {
    if (!this.bowl) return;
    const finalX = this.bowl.centerX;
    const finalY = this.verdictTitleY();
    if (this.verdictStampElapsed < VERDICT_STAMP_DROP_SECONDS) {
      const progress = this.verdictStampElapsed / VERDICT_STAMP_DROP_SECONDS;
      const smashProgress = progress ** 3;
      const scale = VERDICT_STAMP_START_SCALE
        + (VERDICT_STAMP_IMPACT_SCALE - VERDICT_STAMP_START_SCALE) * smashProgress;
      this.titleText.position.set(finalX, finalY);
      this.titleText.rotation = 0;
      this.titleText.scale.set(scale);
      this.titleText.alpha = Math.min(1, progress * 3);
      return;
    }

    const progress = Math.min(
      1,
      (this.verdictStampElapsed - VERDICT_STAMP_DROP_SECONDS)
        / VERDICT_STAMP_SETTLE_SECONDS,
    );
    const settleProgress = 1 - (1 - progress) ** 3;
    const scale = VERDICT_STAMP_IMPACT_SCALE
      + (1 - VERDICT_STAMP_IMPACT_SCALE) * settleProgress;
    this.titleText.position.set(finalX, finalY);
    this.titleText.rotation = 0;
    this.titleText.scale.set(scale);
    this.titleText.alpha = 1;
  }

  private applyScoreStampTransform(): void {
    if (!this.bowl) return;
    const finalScale = this.scoreBadgeBaseScale();
    const impactY = this.scoreBadgeY(this.bowl);
    if (this.scoreStampElapsed < STAMP_DROP_DURATION_SECONDS) {
      const progress = this.scoreStampElapsed / STAMP_DROP_DURATION_SECONDS;
      const positionProgress = progress ** 3;
      const sizeProgress = 1 - (1 - progress) ** 3;
      const startY = impactY - Math.max(150, this.bowl.depth * 1.35);
      const scaleMultiplier = STAMP_START_SCALE_MULTIPLIER
        + (STAMP_IMPACT_SCALE_MULTIPLIER - STAMP_START_SCALE_MULTIPLIER)
          * sizeProgress;
      this.scoreBadge.position.set(
        this.bowl.centerX,
        startY + (impactY - startY) * positionProgress,
      );
      this.scoreBadge.scale.set(finalScale * scaleMultiplier);
      return;
    }

    const progress = Math.min(
      1,
      (this.scoreStampElapsed - STAMP_DROP_DURATION_SECONDS)
        / STAMP_SETTLE_DURATION_SECONDS,
    );
    const settleProgress = 1 - (1 - progress) ** 3;
    const scaleMultiplier = STAMP_IMPACT_SCALE_MULTIPLIER
      + (1 - STAMP_IMPACT_SCALE_MULTIPLIER) * settleProgress;
    this.scoreBadge.position.set(this.bowl.centerX, impactY);
    this.scoreBadge.scale.set(finalScale * scaleMultiplier);
  }

  private triggerScoreStampImpact(): void {
    if (!this.bowl) return;
    const score = this.state.report?.score ?? 0;
    const x = this.bowl.centerX;
    const y = this.scoreBadgeY(this.bowl);
    const radius = Math.min(260, Math.max(160, this.bowl.halfWidth * 1.05));
    this.spaghetti.applyRadialImpulse(x, y, STAMP_IMPULSE_MAGNITUDE, radius);
    this.bowlEffects.triggerStampImpact(x, y, radius, score);
  }

  private triggerSpaghettiImpact(
    x: number,
    y: number,
    magnitude: number,
    radius: number,
    color: number,
  ): void {
    this.spaghetti.applyRadialImpulse(x, y, magnitude, radius);
    this.bowlEffects.triggerShockwave(x, y, radius, color);
  }

  private applyEffects(): void {
    if (!this.scoreStampActive) {
      this.scoreBadge.scale.set(
        this.scoreBadgeBaseScale() * this.bowlEffects.scoreScale,
      );
    }
    this.spaghetti.setBowlVisualTransform(
      this.bowlEffects.bowlOffsetX,
      this.bowlEffects.bowlOffsetY,
      this.bowlEffects.bowlScaleX,
      this.bowlEffects.bowlScaleY,
    );
    this.impactCamera.position.set(
      this.bowlEffects.cameraOffsetX,
      this.bowlEffects.cameraOffsetY,
    );
  }

  private rebuildSpaghettiIfNeeded(force = false): void {
    if (this.sceneWidth < 2 || this.sceneHeight < 2) return;
    if (!this.bowl) return;
    const score = this.state.report?.score ?? 0;
    const scanning = this.state.status === "scanning";
    if (!force
      && score === this.lastSpaghettiScore
      && scanning === this.lastScanning
      && this.reducedMotion === this.lastReducedMotion) return;

    this.lastSpaghettiScore = score;
    this.lastScanning = scanning;
    this.lastReducedMotion = this.reducedMotion;
    if (this.state.report) this.bowlEffects.restart();
    else this.bowlEffects.clear();
    this.spaghetti.rebuild(
      this.sceneWidth,
      this.sceneHeight,
      this.bowl,
      score,
      scanning,
      this.reducedMotion,
    );
    this.resetScoreStamp();
    this.setDisplayedScore(this.state.report
      ? (this.reducedMotion ? score : 0)
      : null);
  }
}

function centeredText(text: string, style: TextStyleOptions): Text {
  return new Text({ text, style, anchor: 0.5, eventMode: "none" });
}

function formatProjectLabel(projectName: string, projectVersion: string | null | undefined): string {
  const version = projectVersion?.trim().replace(/^v(?=\d)/i, "");
  return version ? `${projectName} / v${version}` : projectName;
}
