import {
  BitmapText,
  Container,
  Graphics,
  Point,
  Rectangle,
  Text,
  type FederatedPointerEvent,
  type TextStyleOptions,
  type Texture,
  type Ticker,
} from "pixi.js";
import type { AppState } from "../app/types";
import { describeScore } from "../app/verdict";
import { calculateBowlBounds, type BowlBounds } from "../spaghetti/geometry";
import { SpaghettiScene } from "../spaghetti/SpaghettiScene";
import { SPAGHETTI_SETTINGS } from "../spaghetti/settings";
import { UiButton } from "../ui/UiButton";
import { BACKGROUND_GLOWS, COLORS, FONTS } from "../ui/theme";
import { BowlEffects, scoreColor } from "./BowlEffects";
import { ScoreMeter } from "./ScoreMeter";

const BOLD_FONT_WEIGHT = "bold";
const COMPACT_LAYOUT_MAX_WIDTH = 700;
const HORIZONTAL_GUTTER = 36;
const SCORE_BADGE_RADIUS = 36;
const SCORE_BADGE_MIN_SCALE = 0.82;
const SCORE_BADGE_MAX_SCALE = 1.62;
const SCORE_BADGE_FULL_SCALE_AT = 200;
const CLICK_IMPULSE_MAGNITUDE = 0.96;
const CLICK_IMPULSE_RADIUS = 180;
const STAMP_IMPULSE_MAGNITUDE = 1.44;
const STAMP_SECONDARY_IMPULSE_MAGNITUDE = 0.58;
const STAMP_SECONDARY_RADIUS_MULTIPLIER = 1.68;
const STAMP_AFTERSHOCK_DELAY_SECONDS = 0.12;
const STAMP_ANTICIPATION_SECONDS = 0.18;
const STAMP_ANTICIPATION_PULL_MAGNITUDE = 0.018;
const STAMP_DELAY_SECONDS = 1.1;
const STAMP_DROP_DURATION_SECONDS = 0.28;
const STAMP_SETTLE_DURATION_SECONDS = 0.18;
const PROGRESS_SCORE_FADE_START = 0.58;
const PROGRESS_SCORE_HIDE_AT = 0.72;
const STAMP_START_SCALE_MULTIPLIER = 3.4;
const STAMP_IMPACT_SCALE_MULTIPLIER = 0.82;
const VERDICT_STAMP_DELAY_SECONDS = 0.08;
const VERDICT_STAMP_DROP_SECONDS = 0.26;
const VERDICT_STAMP_SETTLE_SECONDS = 0.16;
const IMPACT_HIT_STOP_SECONDS = 0.075;
const EVIDENCE_STAMP_SECONDS = 0.24;
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
  private readonly anticipationShade = new Graphics({ eventMode: "none" });
  private readonly bowlEffects = new BowlEffects();
  private readonly spaghetti: SpaghettiScene;
  private readonly scoreMeter = new ScoreMeter();
  private readonly selectButton: UiButton;
  private readonly replayButton: UiButton;
  private readonly newFolderButton: UiButton;
  private readonly projectMetaGroup = new Container({
    label: "project-name-and-version",
    eventMode: "none",
  });
  private readonly projectMetaBackground = new Graphics({ eventMode: "none" });
  private readonly projectMeta = centeredText("", {
    fill: COLORS.text,
    fontFamily: FONTS.mono,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.7,
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
    .fill({ color: COLORS.panelStrong, alpha: 0.96 })
    .stroke({ color: COLORS.secondary, alpha: 0.48, width: 1.5 });
  private readonly scoreBadgeRing = new Graphics({ eventMode: "none" })
    .circle(0, 0, SCORE_BADGE_RADIUS - 2)
    .stroke({ color: COLORS.text, width: 3.5 });
  private readonly scoreText = new BitmapText({
    text: "0",
    style: {
      fill: COLORS.text,
      fontFamily: FONTS.display,
      fontSize: 32,
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
  private readonly detailText = centeredText("", {
    fill: COLORS.body,
    fontFamily: FONTS.sans,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
    align: "center",
    wordWrap: true,
    wordWrapWidth: 620,
    stroke: { color: COLORS.background, width: 4, join: "round" },
  });
  private readonly evidenceText = centeredText("", {
    fill: COLORS.muted,
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
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
  private meterScore = 0;
  private meterScoreAtStamp = 0;
  private scoreStampElapsed = 0;
  private scoreStampDelayElapsed = 0;
  private scoreStampActive = false;
  private scoreStampLanded = false;
  private scoreStampImpactTriggered = false;
  private verdictStampElapsed = 0;
  private verdictStampActive = false;
  private verdictStampLanded = false;
  private resultControlsVisible = true;
  private scoreAftershockElapsed = 0;
  private scoreAftershockPending = false;
  private impactFreezeRemaining = 0;
  private evidenceStampElapsed = 0;
  private evidenceStampActive = false;
  private evidenceStampLanded = false;

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
      COLORS.secondary,
    );
  };

  constructor(actions: BowlSceneActions, bowlTexture: Texture) {
    super({ label: "bowl-scene", eventMode: "passive" });
    this.spaghetti = new SpaghettiScene(bowlTexture);
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
        this.replayResult();
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
      this.anticipationShade,
      this.bowlEffects,
      this.spaghetti,
      this.bowlEffects.foreground,
      this.spaghettiInteraction,
      this.selectButton,
      this.replayButton,
      this.newFolderButton,
      this.scanGroup,
      this.projectMetaGroup,
      this.titleText,
      this.detailText,
      this.evidenceText,
      this.actionButton,
      this.errorTitle,
      this.errorText,
    );
    this.addChild(this.impactCamera, this.scoreBadge, this.scoreMeter);

    this.titleText.accessible = true;
    this.titleText.accessibleType = "h1";
    this.detailText.accessible = true;
    this.detailText.accessibleType = "p";
    this.evidenceText.accessible = true;
    this.evidenceText.accessibleType = "p";
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
    this.scoreMeter.setReducedMotion(reducedMotion);
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

    this.backdrop.clear()
      .rect(0, 0, width, height)
      .fill(COLORS.background)
      .ellipse(width * 0.92, height * 0.16, Math.max(260, width * 0.38), Math.max(220, height * 0.36))
      .fill(BACKGROUND_GLOWS.primary)
      .ellipse(width * 0.08, height * 0.2, Math.max(240, width * 0.34), Math.max(210, height * 0.34))
      .fill(BACKGROUND_GLOWS.secondary)
      .ellipse(width * 0.56, height * 1.04, Math.max(280, width * 0.42), Math.max(220, height * 0.34))
      .fill(BACKGROUND_GLOWS.accent);
    const dotSpacing = 48;
    for (let y = 24; y < height; y += dotSpacing) {
      const rowOffset = Math.floor(y / dotSpacing) % 2 === 0 ? 0 : dotSpacing / 2;
      for (let x = 24 + rowOffset; x < width; x += dotSpacing) {
        this.backdrop.circle(x, y, 1);
      }
    }
    this.backdrop.fill({ color: COLORS.text, alpha: 0.065 });
    this.anticipationShade.clear()
      .rect(0, 0, width, height)
      .fill(0x050312);
    this.anticipationShade.alpha = 0;
    const bowl = calculateBowlBounds(width, height, SPAGHETTI_SETTINGS.bowl);
    this.bowl = bowl;
    this.bowlEffects.resize(width, height, bowl);

    this.selectButton.position.set(centerX - 95, Math.max(58, top + 38));
    this.replayButton.position.set(20, top);
    this.newFolderButton.position.set(64, top);
    const scoreBadgeY = this.scoreBadgeY(bowl);
    this.scoreBadge.position.set(bowl.centerX, scoreBadgeY);
    this.layoutProjectMeta();
    this.scoreMeter.resize(width);
    this.scoreMeter.position.set(centerX, height - 58);
    this.spaghettiHitArea.x = 0;
    this.spaghettiHitArea.y = 0;
    this.spaghettiHitArea.width = width;
    this.spaghettiHitArea.height = height;

    const { depth, rimY } = bowl;
    this.scanGroup.position.set(centerX, rimY - depth * 0.72);
    this.scanText.position.set(0, 0);

    const resultTop = Math.max(rimY + depth * 1.55, height - (compact ? 245 : 235));
    this.titleText.style.fontSize = Math.min(60, Math.max(36, width * 0.058));
    this.titleText.style.wordWrap = true;
    this.titleText.style.wordWrapWidth = Math.min(width - HORIZONTAL_GUTTER, 720);
    this.detailText.style.fontSize = compact ? 14 : 17;
    this.detailText.style.lineHeight = compact ? 19 : 23;
    this.detailText.style.wordWrapWidth = Math.min(width - HORIZONTAL_GUTTER * 1.5, 640);
    this.evidenceText.style.fontSize = compact ? 9 : 11;
    this.layoutVerdictTitle();

    const actionWidth = Math.min(220, width - HORIZONTAL_GUTTER);
    this.actionButton.resize(actionWidth, 28);
    this.actionButton.position.set(
      centerX - actionWidth / 2,
      this.scanGroup.y + this.scanText.height / 2 + 7,
    );
    this.errorTitle.position.set(centerX, resultTop + 72);
    this.errorText.style.wordWrapWidth = Math.min(width - 42, 520);
    this.errorText.position.set(centerX, resultTop + 94);

    this.rebuildSpaghettiIfNeeded(true);
  }

  update(ticker: Ticker): void {
    const deltaSeconds = Math.min(ticker.deltaMS / 1_000, 0.05);
    if (this.impactFreezeRemaining > 0) {
      this.impactFreezeRemaining = Math.max(0, this.impactFreezeRemaining - deltaSeconds);
      return;
    }
    this.spaghetti.update(ticker);
    this.updateScore();
    this.bowlEffects.setProductionProgress(this.spaghetti.productionProgress);
    this.updateScoreStamp(ticker);
    if (this.impactFreezeRemaining > 0) return;
    this.updateScoreAftershock(ticker);
    this.bowlEffects.update(ticker);
    this.scoreMeter.update(ticker);
    this.applyEffects();
    this.updateVerdictStamp(ticker);
    this.updateEvidenceStamp(ticker);
    this.applyResultVisibility();
  }

  get resultReady(): boolean {
    const complete = this.state.status === "complete" && this.state.report !== null;
    return complete
      && (this.reducedMotion
        || (this.scoreStampLanded && this.verdictStampLanded && this.evidenceStampLanded));
  }
  replayResult(): boolean {
    const report = this.state.report;
    if (this.state.status !== "complete" || !report || report.score <= 0) return false;
    this.bowlEffects.restart();
    this.setDisplayedScore(0);
    this.rebuildSpaghettiIfNeeded(true);
    return true;
  }


  setResultControlsVisible(visible: boolean): void {
    if (this.resultControlsVisible === visible) return;
    this.resultControlsVisible = visible;
    this.updateResultControlVisibility();
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
    this.updateResultControlVisibility();
    this.selectButton.setEnabled(showSelect);
    this.updateSpaghettiInteraction();
    this.projectMeta.text = formatProjectLabel(projectName, report?.projectVersion);
    this.projectMetaGroup.accessibleTitle = report?.projectVersion
      ? `Project ${projectName}, version ${report.projectVersion}`
      : `Project ${projectName}`;
    this.updateProjectMetaLabel();
    this.layoutProjectMeta();
    this.applyScoreState(report);
    const showScoreMeter = report !== null;
    this.scoreMeter.visible = showScoreMeter;
    this.scoreMeter.accessible = showScoreMeter;
    this.updateProgressMessage(projectName);

    this.titleText.text = verdict.label.toUpperCase();
    this.titleText.accessibleTitle = verdict.label;
    this.detailText.text = verdict.detail;
    this.detailText.accessibleTitle = verdict.detail;
    this.evidenceText.text = report
      ? `${report.fileCount} FILES · ${report.actionableCount} ACTIONABLE · ${report.advisoryCount} ADVISORIES`
      : "";
    this.evidenceText.accessibleTitle = report
      ? `${report.fileCount} files, ${report.actionableCount} actionable findings, ${report.advisoryCount} advisories`
      : "No findings measured";
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

  private updateResultControlVisibility(): void {
    const complete = this.state.status === "complete" && this.state.report !== null;
    const showReplay = this.resultControlsVisible
      && complete
      && this.state.report !== null
      && this.state.report.score > 0;
    this.replayButton.visible = showReplay;
    this.replayButton.setEnabled(showReplay);
    this.newFolderButton.visible = this.resultControlsVisible && complete;
    this.newFolderButton.setEnabled(complete);
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
    this.detailText.visible = showVerdict;
    this.detailText.accessible = showVerdict;
    const showEvidence = complete
      && (this.reducedMotion || this.evidenceStampActive || this.evidenceStampLanded);
    this.evidenceText.visible = showEvidence;
    this.evidenceText.accessible = showEvidence;
  }

  private updateScore(): void {
    const report = this.state.report;
    if (this.state.status !== "complete" || !report) return;
    const score = this.reducedMotion
      ? report.score
      : Math.floor(report.score * this.spaghetti.productionProgress);
    this.setDisplayedScore(Math.min(report.score, score));
    this.updateProgressMessage();
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
    const reportScore = this.state.report?.score;
    if (normalizedScore === null) {
      this.setMeterScore(0);
    } else if (this.reducedMotion || this.scoreStampImpactTriggered) {
      this.setMeterScore(normalizedScore);
    } else if (this.spaghetti.productionProgress < PROGRESS_SCORE_HIDE_AT) {
      const concealedScore = reportScore === undefined
        ? normalizedScore
        : Math.min(normalizedScore, Math.max(0, reportScore - 1));
      this.setMeterScore(concealedScore);
    }
    this.updateProgressMessage();
  }

  private setMeterScore(score: number): void {
    const normalizedScore = Math.max(0, Math.floor(score));
    if (normalizedScore === this.meterScore) return;
    this.meterScore = normalizedScore;
    this.scoreMeter.setScore(normalizedScore);
  }

  private updateProgressMessage(projectName?: string): void {
    const { report, status } = this.state;
    const scanning = status === "scanning";
    const productionProgress = this.spaghetti.productionProgress;
    const counting = status === "complete"
      && report !== null
      && !this.reducedMotion
      && this.displayedScore !== null
      && productionProgress < PROGRESS_SCORE_HIDE_AT;
    const visible = scanning || counting;

    this.scanGroup.visible = visible;
    this.scanText.accessible = visible;
    if (!visible) {
      this.scanGroup.alpha = 0;
      return;
    }

    this.scanGroup.alpha = scanning || productionProgress <= PROGRESS_SCORE_FADE_START
      ? 1
      : Math.max(
        0,
        (PROGRESS_SCORE_HIDE_AT - productionProgress)
          / (PROGRESS_SCORE_HIDE_AT - PROGRESS_SCORE_FADE_START),
      );
    this.scanText.text = scanning
      ? `Reading ${projectName || "project"}…`
      : `Spaghetti Meter score · ${this.displayedScore}`;
    this.scanText.accessibleTitle = scanning
      ? this.scanText.text
      : "Spaghetti Meter score counting";
    this.actionButton.y = this.scanGroup.y + this.scanText.height / 2 + 7;
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
    const paddingX = 14;
    const paddingY = 6;
    this.projectMetaBackground.clear()
      .roundRect(
        -this.projectMeta.width / 2 - paddingX,
        -this.projectMeta.height / 2 - paddingY,
        this.projectMeta.width + paddingX * 2,
        this.projectMeta.height + paddingY * 2,
        5,
      )
      .fill({ color: COLORS.panelStrong, alpha: 0.97 })
      .stroke({ color: COLORS.secondary, alpha: 0.36, width: 1 });
  }

  private layoutProjectMeta(): void {
    if (!this.bowl) return;
    const badgeScale = this.scoreBadgeBaseScale();
    const visibleGap = 5;
    this.projectMetaGroup.position.set(
      this.bowl.centerX,
      this.scoreBadgeY(this.bowl)
        + SCORE_BADGE_RADIUS * badgeScale
        + this.projectMetaBackground.height / 2
        + visibleGap,
    );
  }

  private verdictTitleY(): number {
    const bowl = this.bowl;
    if (!bowl) return 0;
    const scaleY = Math.max(0.001, Math.abs(this.titleText.scale.y));
    const titleHalfHeight = this.titleText.height / scaleY / 2;
    const belowProjectMeta = this.projectMetaGroup.y
      + this.projectMetaBackground.height / 2
      + titleHalfHeight
      + 20;
    const belowBowl = bowl.rimY + bowl.depth + titleHalfHeight + 22;
    return Math.max(belowProjectMeta, belowBowl);
  }

  private layoutVerdictTitle(): void {
    if (!this.bowl) return;
    this.titleText.position.set(this.bowl.centerX, this.verdictTitleY());
    const titleScaleY = Math.max(0.001, Math.abs(this.titleText.scale.y));
    const titleHeight = this.titleText.height / titleScaleY;
    this.detailText.position.set(
      this.bowl.centerX,
      this.titleText.y + titleHeight / 2 + 13,
    );
    const evidenceY = this.detailText.y + this.detailText.height / 2 + 14;
    this.evidenceText.position.set(
      this.bowl.centerX,
      Math.min(evidenceY, this.scoreMeter.y - 34),
    );
  }

  private scoreBadgeY(bowl: BowlBounds): number {
    return bowl.rimY + bowl.depth * 0.44;
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
    this.scoreText.style.fontSize = Math.max(16, 32 - Math.max(0, digitCount - 3) * 5);
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
    this.meterScoreAtStamp = 0;
    this.scoreText.alpha = 1;
    this.scoreAftershockElapsed = 0;
    this.scoreAftershockPending = false;
    this.impactFreezeRemaining = 0;
    this.anticipationShade.alpha = 0;
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
    this.setMeterScore(score);
    this.scoreText.alpha = 1;
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
    this.scoreStampElapsed = -STAMP_ANTICIPATION_SECONDS;
    this.scoreStampActive = true;
    this.scoreStampLanded = false;
    this.scoreStampImpactTriggered = false;
    this.setScoreBadgeAppearance(score);
    this.setScoreBadgeVisible(true);
    this.scoreText.alpha = 0;
    this.scoreText.accessible = false;
    this.meterScoreAtStamp = this.meterScore;
    if (this.bowl) {
      this.spaghetti.applyHorizontalPull(
        this.bowl.centerX,
        STAMP_ANTICIPATION_PULL_MAGNITUDE,
        this.bowl.halfWidth * 1.15,
      );
    }
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
    if (!this.ensureScoreStampStarted(report.score, deltaSeconds)) return;
    this.advanceScoreStamp(deltaSeconds);
  }

  private ensureScoreStampStarted(score: number, deltaSeconds: number): boolean {
    if (this.scoreStampActive) return true;
    if (this.scoreStampLanded) return false;
    if (this.spaghetti.productionProgress < 1) {
      this.scoreStampDelayElapsed = 0;
      return false;
    }

    this.scoreStampDelayElapsed = Math.min(
      STAMP_DELAY_SECONDS,
      this.scoreStampDelayElapsed + deltaSeconds,
    );
    if (this.scoreStampDelayElapsed < STAMP_DELAY_SECONDS) return false;
    this.startScoreStamp(score);
    return true;
  }

  private advanceScoreStamp(deltaSeconds: number): void {
    const totalDuration = STAMP_DROP_DURATION_SECONDS + STAMP_SETTLE_DURATION_SECONDS;
    this.scoreStampElapsed = Math.min(
      totalDuration,
      this.scoreStampElapsed + deltaSeconds,
    );
    const reportScore = this.state.report?.score ?? 0;
    if (this.scoreStampElapsed >= 0 && this.scoreStampElapsed < STAMP_DROP_DURATION_SECONDS) {
      const progress = this.scoreStampElapsed / STAMP_DROP_DURATION_SECONDS;
      const interpolatedScore = Math.floor(
        this.meterScoreAtStamp + (reportScore - this.meterScoreAtStamp) * progress,
      );
      this.setMeterScore(Math.min(Math.max(0, reportScore - 1), interpolatedScore));
    }
    if (!this.scoreStampImpactTriggered
      && this.scoreStampElapsed >= STAMP_DROP_DURATION_SECONDS) {
      this.scoreStampImpactTriggered = true;
      this.triggerScoreStampImpact();
    }
    this.applyScoreStampTransform();
    if (this.scoreStampElapsed < totalDuration) return;

    this.scoreStampActive = false;
    this.scoreStampLanded = true;
    this.anticipationShade.alpha = 0;
  }

  private resetVerdictStamp(): void {
    this.verdictStampElapsed = 0;
    this.verdictStampActive = false;
    this.verdictStampLanded = false;
    this.titleText.rotation = 0;
    this.titleText.scale.set(1);
    this.titleText.alpha = 1;
    this.detailText.alpha = 1;
    this.resetEvidenceStamp();
    this.layoutVerdictTitle();
  }

  private showStaticVerdictTitle(): void {
    this.verdictStampActive = false;
    this.verdictStampLanded = true;
    this.titleText.rotation = 0;
    this.titleText.scale.set(1);
    this.titleText.alpha = 1;
    this.detailText.alpha = 1;
    this.showStaticEvidence();
    this.layoutVerdictTitle();
  }

  private startVerdictStamp(): void {
    this.verdictStampElapsed = 0;
    this.verdictStampActive = true;
    this.verdictStampLanded = false;
    this.titleText.alpha = 0;
    this.detailText.alpha = 0;
    this.applyVerdictStampTransform();
  }

  private updateVerdictStamp(ticker: Ticker): void {
    if (this.state.status !== "complete" || !this.state.report) return;
    if (this.reducedMotion) {
      if (!this.verdictStampLanded) this.showStaticVerdictTitle();
      return;
    }
    if (!this.verdictStampCanStart()) return;
    if (!this.verdictStampActive && !this.verdictStampLanded) {
      this.startVerdictStamp();
    }
    if (!this.verdictStampActive) return;
    this.advanceVerdictStamp(Math.min(ticker.deltaMS / 1_000, 0.05));
  }

  private verdictStampCanStart(): boolean {
    const scoreStampVisible = this.scoreStampActive || this.scoreStampLanded;
    return scoreStampVisible && this.scoreStampElapsed >= VERDICT_STAMP_DELAY_SECONDS;
  }

  private advanceVerdictStamp(deltaSeconds: number): void {
    const totalDuration = VERDICT_STAMP_DROP_SECONDS + VERDICT_STAMP_SETTLE_SECONDS;
    this.verdictStampElapsed = Math.min(
      totalDuration,
      this.verdictStampElapsed + deltaSeconds,
    );
    this.applyVerdictStampTransform();
    if (this.verdictStampElapsed < totalDuration) return;

    this.verdictStampActive = false;
    this.verdictStampLanded = true;
    this.titleText.rotation = 0;
    this.titleText.scale.set(1);
    this.titleText.alpha = 1;
    this.detailText.alpha = 1;
    this.layoutVerdictTitle();
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
      this.detailText.alpha = Math.max(0, Math.min(1, (progress - 0.72) / 0.28));
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
    this.detailText.alpha = 1;
  }
  private resetEvidenceStamp(): void {
    this.evidenceStampElapsed = 0;
    this.evidenceStampActive = false;
    this.evidenceStampLanded = false;
    this.evidenceText.scale.set(1);
    this.evidenceText.alpha = 1;
  }

  private showStaticEvidence(): void {
    this.evidenceStampActive = false;
    this.evidenceStampLanded = true;
    this.evidenceText.scale.set(1);
    this.evidenceText.alpha = 1;
    this.layoutVerdictTitle();
  }

  private updateEvidenceStamp(ticker: Ticker): void {
    if (this.state.status !== "complete" || !this.state.report) return;
    if (this.reducedMotion) {
      if (!this.evidenceStampLanded) this.showStaticEvidence();
      return;
    }
    if (!this.verdictStampLanded) return;
    if (!this.evidenceStampActive && !this.evidenceStampLanded) {
      this.evidenceStampActive = true;
      this.evidenceStampElapsed = 0;
      this.evidenceText.alpha = 0;
      this.evidenceText.scale.set(1.65);
    }
    if (!this.evidenceStampActive) return;

    this.evidenceStampElapsed = Math.min(
      EVIDENCE_STAMP_SECONDS,
      this.evidenceStampElapsed + Math.min(ticker.deltaMS / 1_000, 0.05),
    );
    const progress = this.evidenceStampElapsed / EVIDENCE_STAMP_SECONDS;
    if (progress < 0.72) {
      const impactProgress = (progress / 0.72) ** 3;
      this.evidenceText.scale.set(1.65 + (0.88 - 1.65) * impactProgress);
      this.evidenceText.alpha = Math.min(1, progress * 4);
    } else {
      const settleProgress = 1 - (1 - (progress - 0.72) / 0.28) ** 3;
      this.evidenceText.scale.set(0.88 + (1 - 0.88) * settleProgress);
      this.evidenceText.alpha = 1;
    }
    if (progress < 1) return;
    this.evidenceStampActive = false;
    this.evidenceStampLanded = true;
    this.evidenceText.scale.set(1);
    this.evidenceText.alpha = 1;
  }


  private applyScoreStampTransform(): void {
    if (!this.bowl) return;
    const finalScale = this.scoreBadgeBaseScale();
    const impactY = this.scoreBadgeY(this.bowl);
    this.scoreBadge.position.set(this.bowl.centerX, impactY);
    if (this.scoreStampElapsed < 0) {
      const anticipationProgress = Math.max(
        0,
        (this.scoreStampElapsed + STAMP_ANTICIPATION_SECONDS)
          / STAMP_ANTICIPATION_SECONDS,
      );
      this.scoreBadge.scale.set(finalScale * STAMP_START_SCALE_MULTIPLIER);
      this.anticipationShade.alpha = 0.22 * anticipationProgress;
      return;
    }
    if (this.scoreStampElapsed < STAMP_DROP_DURATION_SECONDS) {
      const progress = this.scoreStampElapsed / STAMP_DROP_DURATION_SECONDS;
      const sizeProgress = 1 - (1 - progress) ** 3;
      const scaleMultiplier = STAMP_START_SCALE_MULTIPLIER
        + (STAMP_IMPACT_SCALE_MULTIPLIER - STAMP_START_SCALE_MULTIPLIER)
          * sizeProgress;
      this.scoreBadge.scale.set(finalScale * scaleMultiplier);
      this.anticipationShade.alpha = 0.22 * (1 - progress);
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
    this.scoreBadge.scale.set(finalScale * scaleMultiplier);
    this.anticipationShade.alpha = 0;
  }

  private triggerScoreStampImpact(): void {
    if (!this.bowl) return;
    const score = this.state.report?.score ?? 0;
    this.scoreText.alpha = 1;
    this.scoreText.accessible = true;
    this.setMeterScore(score);
    const x = this.bowl.centerX;
    const y = this.scoreBadgeY(this.bowl);
    const radius = Math.min(260, Math.max(160, this.bowl.halfWidth * 1.05));
    this.spaghetti.applyRadialImpulse(x, y, STAMP_IMPULSE_MAGNITUDE, radius);
    this.bowlEffects.triggerStampImpact(x, y, radius, score);
    this.impactFreezeRemaining = IMPACT_HIT_STOP_SECONDS;
    this.scoreMeter.triggerImpact();
    this.scoreAftershockElapsed = 0;
    this.scoreAftershockPending = true;
  }

  private updateScoreAftershock(ticker: Ticker): void {
    if (!this.scoreAftershockPending || !this.bowl) return;
    this.scoreAftershockElapsed += Math.min(ticker.deltaMS / 1_000, 0.05);
    if (this.scoreAftershockElapsed < STAMP_AFTERSHOCK_DELAY_SECONDS) return;

    this.scoreAftershockPending = false;
    const score = this.state.report?.score ?? 0;
    const x = this.bowl.centerX;
    const y = this.scoreBadgeY(this.bowl);
    const primaryRadius = Math.min(260, Math.max(160, this.bowl.halfWidth * 1.05));
    const radius = primaryRadius * STAMP_SECONDARY_RADIUS_MULTIPLIER;
    this.spaghetti.applyRadialImpulse(
      x,
      y,
      STAMP_SECONDARY_IMPULSE_MAGNITUDE,
      radius,
    );
    this.bowlEffects.triggerAftershock(x, y, radius, score);
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
    this.spaghetti.setBowlHighlight(
      this.bowlEffects.bowlHighlightProgress,
      this.bowlEffects.bowlHighlightAlpha,
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
