import { Container, Graphics, Text, type Ticker } from "pixi.js";
import { COLORS, FONTS } from "../ui/theme";

const MAX_METER_SCORE = 250;
const EXPECTED_MAX = 100;
const OVERFLOW_MAX = 150;
const BAR_Y = 8;
const BAR_HEIGHT = 11;
const THRESHOLD_PULSE_SECONDS = 0.34;
const IMPACT_RECOIL_SECONDS = 0.28;
const SWEEP_SECONDS = 0.3;

interface MeterBand {
  readonly label: string;
  readonly color: number;
}

export class ScoreMeter extends Container {
  private readonly barBase = new Graphics({ eventMode: "none" });
  private readonly barFill = new Graphics({ eventMode: "none" });
  private readonly barFillMask = new Graphics({ eventMode: "none" });
  private readonly ticks = new Graphics({ eventMode: "none" });
  private readonly pointerTrail = new Graphics({ eventMode: "none" })
    .roundRect(-30, BAR_Y - 1, 30, BAR_HEIGHT + 2, (BAR_HEIGHT + 2) / 2)
    .fill(0xffffff);
  private readonly pointer = new Graphics({ eventMode: "none" })
    .poly([0, BAR_Y + 2, -7, BAR_Y - 9, 7, BAR_Y - 9], true)
    .fill(COLORS.text)
    .stroke({ color: COLORS.background, alpha: 0.9, width: 1.5, join: "round" });
  private readonly finalSweep = new Graphics({ eventMode: "none" })
    .roundRect(-2, BAR_Y - 5, 4, BAR_HEIGHT + 10, 2)
    .fill(0xffffff);
  private readonly thresholdPulses = [
    createThresholdPulse(COLORS.scoreGreen),
    createThresholdPulse(COLORS.scoreOrange),
    createThresholdPulse(COLORS.red),
  ] as const;
  private readonly thresholdPulseAges = [
    THRESHOLD_PULSE_SECONDS,
    THRESHOLD_PULSE_SECONDS,
    THRESHOLD_PULSE_SECONDS,
  ];
  private readonly status = meterText("EXPECTED · 0", 12, "700");
  private readonly expectedLabel = meterText("EXPECTED", 9, "700");
  private readonly overflowLabel = meterText("OVERFLOW", 9, "700");
  private readonly catastropheLabel = meterText("CATASTROPHE", 9, "700");
  private readonly markers = [
    meterText("0", 8),
    meterText("100", 8),
    meterText("150", 8),
    meterText("250+", 8),
  ] as const;

  private barWidth = 0;
  private score = 0;
  private reducedMotion = false;
  private impactAge = IMPACT_RECOIL_SECONDS;
  private sweepAge = SWEEP_SECONDS;

  constructor() {
    super({ label: "score-meter", eventMode: "none" });
    this.status.position.set(0, -11);
    this.expectedLabel.tint = COLORS.scoreGreen;
    this.overflowLabel.tint = COLORS.scoreOrange;
    this.catastropheLabel.tint = COLORS.red;
    this.barFill.mask = this.barFillMask;
    this.pointerTrail.alpha = 0.2;
    this.finalSweep.visible = false;
    this.addChild(
      this.barBase,
      this.barFill,
      this.barFillMask,
      this.pointerTrail,
      this.ticks,
      ...this.thresholdPulses,
      this.finalSweep,
      this.pointer,
      this.status,
      this.expectedLabel,
      this.overflowLabel,
      this.catastropheLabel,
      ...this.markers,
    );
    this.accessible = true;
    this.accessibleType = "div";
    this.updateScoreVisuals();
  }

  resize(availableWidth: number): void {
    this.barWidth = Math.min(680, Math.max(280, availableWidth - 72));
    const left = -this.barWidth / 2;
    const expectedWidth = this.barWidth * EXPECTED_MAX / MAX_METER_SCORE;
    const overflowWidth = this.barWidth * (OVERFLOW_MAX - EXPECTED_MAX) / MAX_METER_SCORE;
    const catastropheX = left + expectedWidth + overflowWidth;

    this.drawBands(this.barBase, 0.22);
    this.drawBands(this.barFill, 1);
    this.barFillMask.clear()
      .rect(0, BAR_Y - 2, this.barWidth, BAR_HEIGHT + 4)
      .fill(0xffffff);
    this.barFillMask.position.set(left, 0);

    const markerPositions = [
      left,
      left + expectedWidth,
      catastropheX,
      left + this.barWidth,
    ];
    this.ticks.clear();
    for (const position of markerPositions) {
      this.ticks
        .moveTo(position, BAR_Y + BAR_HEIGHT)
        .lineTo(position, BAR_Y + BAR_HEIGHT + 5)
        .stroke({ color: COLORS.text, alpha: 0.5, width: 1 });
    }
    for (let index = 0; index < this.markers.length; index += 1) {
      this.markers[index].position.set(markerPositions[index], BAR_Y + BAR_HEIGHT + 11);
    }
    for (let index = 0; index < this.thresholdPulses.length; index += 1) {
      this.thresholdPulses[index].position.set(markerPositions[index + 1] ?? left, 0);
    }

    this.expectedLabel.position.set(left + expectedWidth / 2, BAR_Y + BAR_HEIGHT + 27);
    this.overflowLabel.position.set(
      left + expectedWidth + overflowWidth / 2,
      BAR_Y + BAR_HEIGHT + 27,
    );
    this.catastropheLabel.position.set(
      catastropheX + (this.barWidth - expectedWidth - overflowWidth) / 2,
      BAR_Y + BAR_HEIGHT + 27,
    );
    this.updatePointerPosition();
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    if (!reducedMotion) return;
    this.impactAge = IMPACT_RECOIL_SECONDS;
    this.sweepAge = SWEEP_SECONDS;
    this.scale.set(1);
    this.pointer.y = 0;
    this.finalSweep.visible = false;
    for (let index = 0; index < this.thresholdPulses.length; index += 1) {
      this.thresholdPulseAges[index] = THRESHOLD_PULSE_SECONDS;
      this.thresholdPulses[index].visible = false;
    }
  }

  setScore(score: number): void {
    const normalized = Math.max(0, Math.floor(score));
    if (normalized === this.score) return;
    const previous = this.score;
    this.score = normalized;
    if (!this.reducedMotion) {
      this.triggerThreshold(previous, normalized, EXPECTED_MAX, 0);
      this.triggerThreshold(previous, normalized, OVERFLOW_MAX, 1);
      this.triggerThreshold(previous, normalized, MAX_METER_SCORE, 2);
    }
    this.updateScoreVisuals();
  }

  triggerImpact(): void {
    if (this.reducedMotion) return;
    this.impactAge = 0;
    this.sweepAge = 0;
    this.finalSweep.visible = true;
  }

  update(ticker: Ticker): void {
    if (this.reducedMotion) return;
    const deltaSeconds = Math.min(ticker.deltaMS / 1_000, 0.05);
    this.updateThresholdPulses(deltaSeconds);
    this.updateImpact(deltaSeconds);
  }

  private drawBands(graphics: Graphics, alpha: number): void {
    const left = -this.barWidth / 2;
    const expectedWidth = this.barWidth * EXPECTED_MAX / MAX_METER_SCORE;
    const overflowWidth = this.barWidth * (OVERFLOW_MAX - EXPECTED_MAX) / MAX_METER_SCORE;
    const catastropheX = left + expectedWidth + overflowWidth;
    graphics.clear()
      .roundRect(left, BAR_Y, this.barWidth, BAR_HEIGHT, BAR_HEIGHT / 2)
      .fill({ color: COLORS.scoreGreen, alpha })
      .rect(left + expectedWidth, BAR_Y, overflowWidth, BAR_HEIGHT)
      .fill({ color: COLORS.scoreOrange, alpha })
      .roundRect(
        catastropheX,
        BAR_Y,
        this.barWidth - expectedWidth - overflowWidth,
        BAR_HEIGHT,
        BAR_HEIGHT / 2,
      )
      .fill({ color: COLORS.red, alpha })
      .rect(catastropheX, BAR_Y, BAR_HEIGHT / 2, BAR_HEIGHT)
      .fill({ color: COLORS.red, alpha });
    if (alpha < 1) {
      graphics
        .roundRect(left, BAR_Y, this.barWidth, BAR_HEIGHT, BAR_HEIGHT / 2)
        .stroke({ color: COLORS.text, alpha: 0.52, width: 1.5 });
    }
  }

  private updateScoreVisuals(): void {
    const band = meterBand(this.score);
    this.status.text = `${band.label} · ${this.score}`;
    this.status.tint = band.color;
    this.pointer.tint = band.color;
    this.pointerTrail.tint = band.color;
    this.finalSweep.tint = band.color;
    this.accessibleTitle = `${this.score} spaghetti score, ${band.label.toLowerCase()}`;
    this.updatePointerPosition();
  }

  private updatePointerPosition(): void {
    if (this.barWidth <= 0) return;
    const ratio = Math.min(1, this.score / MAX_METER_SCORE);
    const pointerX = -this.barWidth / 2 + this.barWidth * ratio;
    this.barFillMask.scale.x = ratio;
    this.pointer.x = pointerX;
    this.pointerTrail.x = pointerX;
  }

  private triggerThreshold(
    previous: number,
    next: number,
    threshold: number,
    index: number,
  ): void {
    if (previous >= threshold || next < threshold) return;
    this.thresholdPulseAges[index] = 0;
    const pulse = this.thresholdPulses[index];
    pulse.scale.set(1);
    pulse.alpha = 1;
    pulse.visible = true;
  }

  private updateThresholdPulses(deltaSeconds: number): void {
    for (let index = 0; index < this.thresholdPulses.length; index += 1) {
      const pulse = this.thresholdPulses[index];
      const age = Math.min(
        THRESHOLD_PULSE_SECONDS,
        this.thresholdPulseAges[index] + deltaSeconds,
      );
      this.thresholdPulseAges[index] = age;
      if (age >= THRESHOLD_PULSE_SECONDS) {
        pulse.visible = false;
        continue;
      }
      const progress = age / THRESHOLD_PULSE_SECONDS;
      pulse.scale.set(1 + progress * 3.2, 1 + progress * 0.8);
      pulse.alpha = (1 - progress) ** 2 * 0.72;
    }
  }

  private updateImpact(deltaSeconds: number): void {
    if (this.impactAge < IMPACT_RECOIL_SECONDS) {
      this.impactAge = Math.min(IMPACT_RECOIL_SECONDS, this.impactAge + deltaSeconds);
      const progress = this.impactAge / IMPACT_RECOIL_SECONDS;
      const envelope = 1 - progress;
      this.scale.set(1 + Math.sin(progress * Math.PI * 2.6) * envelope * 0.028, 1);
      this.pointer.y = -Math.sin(progress * Math.PI) * envelope * 10;
    } else {
      this.scale.set(1);
      this.pointer.y = 0;
    }

    if (this.sweepAge >= SWEEP_SECONDS) return;
    this.sweepAge = Math.min(SWEEP_SECONDS, this.sweepAge + deltaSeconds);
    const progress = this.sweepAge / SWEEP_SECONDS;
    const eased = 1 - (1 - progress) ** 3;
    const targetX = this.pointer.x;
    this.finalSweep.x = -this.barWidth / 2 + (targetX + this.barWidth / 2) * eased;
    this.finalSweep.alpha = Math.sin(progress * Math.PI) * 0.9;
    if (progress >= 1) this.finalSweep.visible = false;
  }
}
function createThresholdPulse(color: number): Graphics {
  const pulse = new Graphics({ eventMode: "none" })
    .roundRect(-2, BAR_Y - 4, 4, BAR_HEIGHT + 8, 2)
    .fill(color);
  pulse.visible = false;
  return pulse;
}


function meterBand(score: number): MeterBand {
  if (score <= EXPECTED_MAX) return { label: "EXPECTED", color: COLORS.scoreGreen };
  if (score <= OVERFLOW_MAX) return { label: "OVERFLOW", color: COLORS.scoreOrange };
  if (score <= MAX_METER_SCORE) return { label: "CATASTROPHE", color: COLORS.red };
  return { label: "UNCONTAINED", color: COLORS.red };
}

function meterText(text: string, fontSize: number, fontWeight: "500" | "700" = "500"): Text {
  return new Text({
    text,
    style: {
      fill: COLORS.text,
      fontFamily: FONTS.mono,
      fontSize,
      fontWeight,
      letterSpacing: 0.6,
    },
    anchor: 0.5,
    eventMode: "none",
    roundPixels: true,
  });
}
