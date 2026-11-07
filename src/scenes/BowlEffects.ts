import { Container, Graphics, type Ticker } from "pixi.js";
import type { BowlBounds } from "../spaghetti/geometry";
import { SPAGHETTI_SETTINGS } from "../spaghetti/settings";
import { COLORS } from "../ui/theme";

const SCORE_RED_AT = 200;
const PARTICLE_COUNT = 20;
const PULSE_DURATION_SECONDS = 0.34;
const RIM_FLASH_DURATION_SECONDS = 0.48;
const WARM_PULSE_DURATION_SECONDS = 0.55;
const WOBBLE_DURATION_SECONDS = 0.42;
const SHOCKWAVE_COUNT = 4;
const SHOCKWAVE_DURATION_SECONDS = 0.42;

interface BurstParticle {
  readonly view: Graphics;
  velocityX: number;
  velocityY: number;
  spin: number;
  age: number;
  lifetime: number;
}

interface Shockwave {
  readonly view: Graphics;
  age: number;
  lifetime: number;
  startRadius: number;
  endRadius: number;
}

export class BowlEffects extends Container {
  private readonly glow = new Graphics({ eventMode: "none" });
  private readonly warmPulse = new Graphics({ eventMode: "none" });
  private readonly rimFlash = new Graphics({ eventMode: "none" });
  private readonly particles: BurstParticle[];
  private readonly shockwaves: Shockwave[];
  readonly foreground = new Container({ label: "bowl-effects-foreground", eventMode: "none" });
  private bowl: BowlBounds | undefined;
  private score = 0;
  private productionProgress = 0;
  private reducedMotion = false;
  private active = false;
  private pulseRemaining = 0;
  private pulseAmplitude = 0;
  private rimFlashRemaining = 0;
  private warmPulseRemaining = 0;
  private wobbleRemaining = 0;
  private currentScoreScale = 1;
  private currentBowlOffsetX = 0;

  constructor() {
    super({ label: "bowl-effects", eventMode: "none" });
    this.particles = Array.from({ length: PARTICLE_COUNT }, (_, index) => {
      const color = index % 3 === 0 ? COLORS.red : index % 2 === 0 ? COLORS.error : COLORS.accentHover;
      const view = new Graphics({ eventMode: "none" })
        .roundRect(-5, -1.5, 10, 3, 1.5)
        .fill(color);
      view.visible = false;
      return {
        view,
        velocityX: 0,
        velocityY: 0,
        spin: 0,
        age: 0,
        lifetime: 0,
      };
    });
    this.shockwaves = Array.from({ length: SHOCKWAVE_COUNT }, () => {
      const view = new Graphics({ eventMode: "none" })
        .circle(0, 0, 1)
        .fill({ color: 0xffffff, alpha: 0.055 })
        .stroke({ color: 0xffffff, width: 0.035 });
      view.visible = false;
      return {
        view,
        age: 0,
        lifetime: 0,
        startRadius: 0,
        endRadius: 0,
      };
    });
    this.addChild(this.glow, this.warmPulse);
    this.foreground.addChild(
      ...this.shockwaves.map((shockwave) => shockwave.view),
      ...this.particles.map((particle) => particle.view),
      this.rimFlash,
    );
    this.clear();
  }

  get scoreScale(): number {
    return this.currentScoreScale;
  }

  get bowlOffsetX(): number {
    return this.currentBowlOffsetX;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.foreground.visible = visible;
  }

  resize(width: number, height: number, bowl: BowlBounds): void {
    this.bowl = bowl;
    this.glow.clear()
      .ellipse(
        bowl.centerX,
        height * 0.46,
        Math.min(width * 0.4, 360),
        Math.min(height * 0.3, 220),
      )
      .fill(0xffffff);
    this.warmPulse.clear()
      .ellipse(bowl.centerX, bowl.rimY + bowl.depth * 0.3, bowl.halfWidth + 74, bowl.depth + 72)
      .fill(COLORS.red);
    this.rimFlash.clear()
      .ellipse(bowl.centerX, bowl.rimY, bowl.halfWidth, bowl.depth * 0.13)
      .stroke({ color: COLORS.accentHover, width: 7 });
    this.updateGlow();
  }

  setReducedMotion(reducedMotion: boolean): void {
    if (this.reducedMotion === reducedMotion) return;
    this.reducedMotion = reducedMotion;
    if (reducedMotion) this.clearTransientEffects();
  }

  clear(): void {
    this.active = false;
    this.score = 0;
    this.productionProgress = 0;
    this.clearTransientEffects();
    this.updateGlow();
  }

  restart(): void {
    this.active = true;
    this.score = 0;
    this.productionProgress = 0;
    this.clearTransientEffects();
    this.updateGlow();
  }

  setScore(score: number): void {
    const nextScore = Math.max(0, Math.floor(score));
    if (!this.active || nextScore < this.score) this.restart();
    const previousScore = this.score;
    this.score = nextScore;
    this.active = true;
    this.updateGlow();
    if (this.reducedMotion || nextScore === previousScore) return;

    this.triggerLightMilestone(previousScore, nextScore);
    this.triggerBaselineMilestone(previousScore, nextScore);
    this.triggerOverflowMilestone(previousScore, nextScore);
    this.triggerHighMilestone(previousScore, nextScore);
    this.triggerCatastropheMilestone(previousScore, nextScore);
  }

  private triggerLightMilestone(previousScore: number, nextScore: number): void {
    if (!crossedScore(previousScore, nextScore, 50)) return;
    this.triggerPulse(0.055);
  }

  private triggerBaselineMilestone(previousScore: number, nextScore: number): void {
    if (!crossedScore(previousScore, nextScore, 100)) return;
    this.triggerPulse(0.09);
    this.rimFlashRemaining = RIM_FLASH_DURATION_SECONDS;
  }

  private triggerOverflowMilestone(previousScore: number, nextScore: number): void {
    if (previousScore > 100 || nextScore <= 100) return;
    this.wobbleRemaining = WOBBLE_DURATION_SECONDS;
  }

  private triggerHighMilestone(previousScore: number, nextScore: number): void {
    if (!crossedScore(previousScore, nextScore, 150)) return;
    this.triggerPulse(0.105);
    this.warmPulseRemaining = WARM_PULSE_DURATION_SECONDS;
  }

  private triggerCatastropheMilestone(previousScore: number, nextScore: number): void {
    if (!crossedScore(previousScore, nextScore, SCORE_RED_AT)) return;
    this.triggerPulse(0.14);
    this.triggerCatastropheBurst();
  }

  setProductionProgress(progress: number): void {
    const nextProgress = Math.max(0, Math.min(1, progress));
    const completed = this.productionProgress < 1 && nextProgress >= 1;
    this.productionProgress = nextProgress;
    if (completed && this.active && this.score > 0 && !this.reducedMotion) {
      this.triggerPulse(0.075);
    }
  }

  triggerShockwave(x: number, y: number, radius: number, color: number = COLORS.accentHover): void {
    if (this.reducedMotion || radius <= 0) return;
    let selected: Shockwave | undefined;
    for (const shockwave of this.shockwaves) {
      if (!shockwave.view.visible) {
        selected = shockwave;
        break;
      }
      if (!selected || shockwave.age / shockwave.lifetime > selected.age / selected.lifetime) {
        selected = shockwave;
      }
    }
    if (!selected) return;

    selected.age = 0;
    selected.lifetime = SHOCKWAVE_DURATION_SECONDS;
    selected.startRadius = Math.max(8, radius * 0.12);
    selected.endRadius = radius;
    selected.view.position.set(x, y);
    selected.view.scale.set(selected.startRadius);
    selected.view.tint = color;
    selected.view.alpha = 1;
    selected.view.visible = true;
  }

  update(ticker: Ticker): void {
    if (this.reducedMotion) return;
    const deltaSeconds = Math.min(ticker.deltaMS / 1_000, 0.05);
    this.updatePulse(deltaSeconds);
    this.updateRimFlash(deltaSeconds);
    this.updateWarmPulse(deltaSeconds);
    this.updateWobble(deltaSeconds);
    this.updateParticles(deltaSeconds);
    this.updateShockwaves(deltaSeconds);
  }

  private updateGlow(): void {
    const scoreRatio = Math.min(1, this.score / SCORE_RED_AT);
    this.glow.tint = this.active ? scoreColor(this.score) : COLORS.accent;
    this.glow.alpha = this.active ? 0.025 + scoreRatio * 0.045 : 0.025;
  }

  private triggerPulse(amplitude: number): void {
    this.pulseAmplitude = Math.max(this.pulseAmplitude, amplitude);
    this.pulseRemaining = PULSE_DURATION_SECONDS;
  }

  private updatePulse(deltaSeconds: number): void {
    if (this.pulseRemaining <= 0) {
      this.currentScoreScale = 1;
      this.pulseAmplitude = 0;
      return;
    }
    this.pulseRemaining = Math.max(0, this.pulseRemaining - deltaSeconds);
    const progress = 1 - this.pulseRemaining / PULSE_DURATION_SECONDS;
    this.currentScoreScale = 1 + Math.sin(progress * Math.PI) * this.pulseAmplitude;
  }

  private updateRimFlash(deltaSeconds: number): void {
    if (this.rimFlashRemaining <= 0) {
      this.rimFlash.alpha = 0;
      return;
    }
    this.rimFlashRemaining = Math.max(0, this.rimFlashRemaining - deltaSeconds);
    const progress = 1 - this.rimFlashRemaining / RIM_FLASH_DURATION_SECONDS;
    this.rimFlash.alpha = Math.sin(progress * Math.PI) * 0.9;
  }

  private updateWarmPulse(deltaSeconds: number): void {
    if (this.warmPulseRemaining <= 0) {
      this.warmPulse.alpha = 0;
      return;
    }
    this.warmPulseRemaining = Math.max(0, this.warmPulseRemaining - deltaSeconds);
    const progress = 1 - this.warmPulseRemaining / WARM_PULSE_DURATION_SECONDS;
    this.warmPulse.alpha = Math.sin(progress * Math.PI) * 0.1;
  }

  private updateWobble(deltaSeconds: number): void {
    if (this.wobbleRemaining <= 0) {
      this.currentBowlOffsetX = 0;
      return;
    }
    this.wobbleRemaining = Math.max(0, this.wobbleRemaining - deltaSeconds);
    const progress = 1 - this.wobbleRemaining / WOBBLE_DURATION_SECONDS;
    this.currentBowlOffsetX = Math.sin(progress * Math.PI * 6) * (1 - progress) * 3;
  }

  private triggerCatastropheBurst(): void {
    if (!this.bowl) return;
    const denominator = this.particles.length - 1;
    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index];
      if (!particle) continue;
      const progress = index / denominator;
      const angle = -Math.PI + 0.35 + progress * (Math.PI - 0.7);
      const speed = 120 + (index % 5) * 18;
      particle.view.position.set(
        this.bowl.centerX + (index % 3 - 1) * 5,
        this.bowl.rimY + this.bowl.depth * 0.26,
      );
      particle.view.rotation = angle;
      particle.view.scale.set(0.75 + (index % 4) * 0.1);
      particle.view.alpha = 1;
      particle.view.visible = true;
      particle.velocityX = Math.cos(angle) * speed;
      particle.velocityY = Math.sin(angle) * speed - 36;
      particle.spin = index % 2 === 0 ? 5.5 : -5.5;
      particle.age = 0;
      particle.lifetime = 0.85 + (index % 5) * 0.05;
    }
  }

  private updateParticles(deltaSeconds: number): void {
    for (const particle of this.particles) {
      if (!particle.view.visible) continue;
      particle.age += deltaSeconds;
      if (particle.age >= particle.lifetime) {
        particle.view.visible = false;
        continue;
      }
      particle.velocityY += 230 * deltaSeconds;
      particle.view.x += particle.velocityX * deltaSeconds;
      particle.view.y += particle.velocityY * deltaSeconds;
      particle.view.rotation += particle.spin * deltaSeconds;
      particle.view.alpha = 1 - particle.age / particle.lifetime;
    }
  }

  private updateShockwaves(deltaSeconds: number): void {
    for (const shockwave of this.shockwaves) {
      if (!shockwave.view.visible) continue;
      shockwave.age += deltaSeconds;
      if (shockwave.age >= shockwave.lifetime) {
        shockwave.view.visible = false;
        continue;
      }
      const progress = shockwave.age / shockwave.lifetime;
      const eased = 1 - (1 - progress) ** 3;
      const radius = shockwave.startRadius
        + (shockwave.endRadius - shockwave.startRadius) * eased;
      shockwave.view.scale.set(radius);
      shockwave.view.alpha = (1 - progress) ** 2;
    }
  }

  private clearTransientEffects(): void {
    this.pulseRemaining = 0;
    this.pulseAmplitude = 0;
    this.rimFlashRemaining = 0;
    this.warmPulseRemaining = 0;
    this.wobbleRemaining = 0;
    this.currentScoreScale = 1;
    this.currentBowlOffsetX = 0;
    this.rimFlash.alpha = 0;
    this.warmPulse.alpha = 0;
    for (const particle of this.particles) particle.view.visible = false;
    for (const shockwave of this.shockwaves) shockwave.view.visible = false;
  }
}

export function scoreColor(score: number): number {
  const baseline = SPAGHETTI_SETTINGS.serving.containedScore;
  if (score <= baseline) {
    return mixColor(COLORS.scoreGreen, COLORS.accent, score / baseline);
  }
  return mixColor(
    COLORS.accent,
    COLORS.red,
    Math.min(1, (score - baseline) / (SCORE_RED_AT - baseline)),
  );
}

function mixColor(from: number, to: number, progress: number): number {
  const amount = Math.max(0, Math.min(1, progress));
  const red = Math.round((from >> 16) + ((to >> 16) - (from >> 16)) * amount);
  const green = Math.round(((from >> 8) & 0xff) + (((to >> 8) & 0xff) - ((from >> 8) & 0xff)) * amount);
  const blue = Math.round((from & 0xff) + ((to & 0xff) - (from & 0xff)) * amount);
  return (red << 16) | (green << 8) | blue;
}

function crossedScore(previousScore: number, nextScore: number, milestone: number): boolean {
  return previousScore < milestone && nextScore >= milestone;
}
