import { Container, Graphics } from "pixi.js";
import { SPAGHETTI_SETTINGS } from "../spaghetti/settings";
import { COLORS } from "../ui/theme";

const NOODLE_FRAGMENT_COUNT = 24;
const SAUCE_DROPLET_COUNT = 8;
const IMPACT_RAY_COUNT = 14;
const BACKDROP_RAY_COUNT = 18;
const CORNER_CONFETTI_PER_SIDE = 28;
const CORNER_CONFETTI_COUNT = CORNER_CONFETTI_PER_SIDE * 2;
const CONFETTI_GRAVITY = 520;
const BACKDROP_RAY_DELAY_SECONDS = 0.07;
const BACKDROP_RAY_BURST_SECONDS = 0.28;
const OUTER_WAVE_DURATION_SECONDS = 0.42;
const INNER_WAVE_DURATION_SECONDS = 0.24;
const RAY_DURATION_SECONDS = 0.18;
const BOWL_COMPRESSION_DURATION_SECONDS = 0.36;
const CAMERA_PUNCH_DURATION_SECONDS = 0.14;

interface ImpactParticle {
  readonly view: Graphics;
  velocityX: number;
  velocityY: number;
  spin: number;
  age: number;
  lifetime: number;
}

interface ConfettiParticle extends ImpactParticle {
  baseScale: number;
  flutterPhase: number;
  flutterSpeed: number;
}

interface ImpactRay {
  readonly view: Graphics;
  targetLength: number;
}

interface BackdropRay {
  readonly view: Graphics;
  baseAlpha: number;
  targetLength: number;
}

interface ImpactWave {
  readonly view: Graphics;
  age: number;
  lifetime: number;
  startRadius: number;
  endRadius: number;
}

export class StampImpactEffects extends Container {
  readonly backdrop = new Container({ label: "stamp-impact-backdrop", eventMode: "none" });
  private readonly backdropRays: BackdropRay[];
  private readonly noodleFragments: ImpactParticle[];
  private readonly sauceDroplets: ImpactParticle[];
  private readonly cornerConfetti: ConfettiParticle[];
  private readonly rays: ImpactRay[];
  private readonly waves: ImpactWave[];
  private readonly staticRing = new Graphics({ eventMode: "none" })
    .circle(0, 0, 1)
    .fill({ color: 0xffffff, alpha: 0.035 })
    .stroke({ color: 0xffffff, width: 0.028 });
  private reducedMotion = false;
  private backdropRayActive = false;
  private backdropRayAge = 0;
  private backdropDriftPhase = 0;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private backdropMinimumLength = 0;
  private rayAge = RAY_DURATION_SECONDS;
  private compressionAge = BOWL_COMPRESSION_DURATION_SECONDS;
  private cameraPunchAge = CAMERA_PUNCH_DURATION_SECONDS;
  private impactIntensity = 1;
  private currentBowlOffsetY = 0;
  private currentBowlScaleX = 1;
  private currentBowlScaleY = 1;
  private currentCameraOffsetX = 0;
  private currentCameraOffsetY = 0;

  constructor() {
    super({ label: "stamp-impact-effects", eventMode: "none" });
    this.backdropRays = Array.from({ length: BACKDROP_RAY_COUNT }, () => {
      const view = new Graphics({ eventMode: "none" })
        .poly([0, -5, 0.18, -18, 0.55, -48, 1, -96, 1, 96, 0.55, 48, 0.18, 18, 0, 5], true)
        .fill(0xffffff);
      view.visible = false;
      return {
        view,
        baseAlpha: 0,
        targetLength: 0,
      };
    });
    this.backdrop.addChild(...this.backdropRays.map((ray) => ray.view));
    this.backdrop.visible = false;
    this.noodleFragments = Array.from(
      { length: NOODLE_FRAGMENT_COUNT },
      () => createParticle(false),
    );
    this.sauceDroplets = Array.from(
      { length: SAUCE_DROPLET_COUNT },
      () => createParticle(true),
    );
    this.cornerConfetti = Array.from(
      { length: CORNER_CONFETTI_COUNT },
      (_, index) => createConfettiParticle(index),
    );
    this.rays = Array.from({ length: IMPACT_RAY_COUNT }, () => {
      const view = new Graphics({ eventMode: "none" })
        .roundRect(0, -1, 1, 2, 1)
        .fill(0xffffff);
      view.visible = false;
      return { view, targetLength: 0 };
    });
    this.waves = [
      createWave(),
      createWave(),
    ];
    this.staticRing.visible = false;
    this.addChild(
      ...this.rays.map((ray) => ray.view),
      ...this.waves.map((wave) => wave.view),
      ...this.noodleFragments.map((particle) => particle.view),
      ...this.sauceDroplets.map((particle) => particle.view),
      ...this.cornerConfetti.map((particle) => particle.view),
      this.staticRing,
    );
  }

  resize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
    if (this.backdropRayActive) this.updateBackdropRayLengths();
  }

  get bowlOffsetY(): number {
    return this.currentBowlOffsetY;
  }

  get bowlScaleX(): number {
    return this.currentBowlScaleX;
  }

  get bowlScaleY(): number {
    return this.currentBowlScaleY;
  }

  get cameraOffsetX(): number {
    return this.currentCameraOffsetX;
  }

  get cameraOffsetY(): number {
    return this.currentCameraOffsetY;
  }

  setReducedMotion(reducedMotion: boolean): void {
    if (this.reducedMotion === reducedMotion) return;
    this.reducedMotion = reducedMotion;
    this.clearTransient();
    if (!reducedMotion) this.staticRing.visible = false;
  }

  trigger(x: number, y: number, radius: number, score: number, color: number): void {
    if (this.reducedMotion) return;
    this.staticRing.visible = false;
    const scoreRatio = Math.min(1.5, Math.max(0, score) / 200);
    this.impactIntensity = 0.78 + scoreRatio * 0.28;
    this.triggerBackdropRays(x, y, radius, score, color);
    this.triggerWaves(x, y, radius, color);
    this.triggerRays(x, y, radius, score, color);
    this.triggerParticles(x, y, score, scoreRatio);
    this.triggerCornerConfetti(score, color);
    this.compressionAge = 0;
    this.cameraPunchAge = 0;
    this.updateCompression(0);
    this.updateCameraPunch(0);
  }

  showStatic(x: number, y: number, radius: number, color: number): void {
    this.clearTransient();
    this.staticRing.position.set(x, y);
    this.staticRing.scale.set(Math.max(24, radius * 0.56));
    this.staticRing.tint = color;
    this.staticRing.alpha = 0.28;
    this.staticRing.visible = true;
  }

  hideStatic(): void {
    this.staticRing.visible = false;
  }

  update(deltaSeconds: number): void {
    if (this.reducedMotion) return;
    this.updateBackdropRays(deltaSeconds);
    this.updateWaves(deltaSeconds);
    this.updateRays(deltaSeconds);
    this.updateParticles(this.noodleFragments, deltaSeconds);
    this.updateParticles(this.sauceDroplets, deltaSeconds);
    this.updateCornerConfetti(deltaSeconds);
    this.updateCompression(deltaSeconds);
    this.updateCameraPunch(deltaSeconds);
  }

  clear(): void {
    this.clearTransient();
    this.staticRing.visible = false;
  }

  private triggerWaves(x: number, y: number, radius: number, color: number): void {
    const outer = this.waves[0];
    const inner = this.waves[1];
    if (!outer || !inner) return;
    configureWave(outer, x, y, radius * 0.12, radius, OUTER_WAVE_DURATION_SECONDS, color);
    configureWave(inner, x, y, radius * 0.07, radius * 0.62, INNER_WAVE_DURATION_SECONDS, color);
  }

  private triggerRays(x: number, y: number, radius: number, score: number, color: number): void {
    const activeCount = score <= 100 ? 8 : score <= 200 ? 11 : IMPACT_RAY_COUNT;
    this.rayAge = 0;
    for (let index = 0; index < this.rays.length; index += 1) {
      const ray = this.rays[index];
      if (!ray) continue;
      if (index >= activeCount) {
        ray.view.visible = false;
        continue;
      }
      const angle = index / activeCount * Math.PI * 2 + (index % 2) * 0.08;
      ray.targetLength = radius * (0.42 + (index % 4) * 0.055);
      ray.view.position.set(x, y);
      ray.view.rotation = angle;
      ray.view.scale.set(ray.targetLength * 0.2, 1 + (index % 3) * 0.28);
      ray.view.tint = color;
      ray.view.alpha = 0.82;
      ray.view.visible = true;
    }
  }

  private triggerBackdropRays(
    x: number,
    y: number,
    radius: number,
    score: number,
    color: number,
  ): void {
    const activeCount = score <= 100 ? 10 : score <= 200 ? 14 : BACKDROP_RAY_COUNT;
    const scoreRatio = Math.min(1, Math.max(0, score) / 200);
    this.backdropRayAge = -BACKDROP_RAY_DELAY_SECONDS;
    this.backdropRayActive = true;
    this.backdropDriftPhase = 0;
    this.backdrop.position.set(x, y);
    this.backdropMinimumLength = radius * 2.4;
    this.updateBackdropRayLengths();
    this.backdrop.rotation = 0;
    this.backdrop.alpha = 1;
    this.backdrop.visible = true;
    for (let index = 0; index < this.backdropRays.length; index += 1) {
      const ray = this.backdropRays[index];
      if (!ray) continue;
      if (index >= activeCount) {
        ray.view.visible = false;
        continue;
      }
      const angle = index / activeCount * Math.PI * 2 + (index % 2) * 0.045;
      ray.baseAlpha = 0.18 + scoreRatio * 0.14 + (index % 3) * 0.02;
      ray.view.rotation = angle;
      ray.view.scale.set(ray.targetLength * 0.025, 1 + (index % 4) * 0.18);
      ray.view.tint = index % 3 === 0 ? COLORS.accentHover : color;
      ray.view.alpha = 0;
      ray.view.visible = true;
    }
  }

  private updateBackdropRayLengths(): void {
    const farthestX = Math.max(this.backdrop.x, this.viewportWidth - this.backdrop.x);
    const farthestY = Math.max(this.backdrop.y, this.viewportHeight - this.backdrop.y);
    const viewportRadius = Math.hypot(farthestX, farthestY) + 96;
    const baseLength = Math.max(this.backdropMinimumLength, viewportRadius * 1.45);
    for (let index = 0; index < this.backdropRays.length; index += 1) {
      const ray = this.backdropRays[index];
      if (!ray) continue;
      ray.targetLength = baseLength * (1.02 + (index % 5) * 0.025);
    }
  }

  private triggerCornerConfetti(score: number, color: number): void {
    const speedScale = 0.9 + Math.min(0.5, Math.max(0, score) / 400);
    for (let index = 0; index < this.cornerConfetti.length; index += 1) {
      const particle = this.cornerConfetti[index];
      if (!particle) continue;
      const fromLeft = index < CORNER_CONFETTI_PER_SIDE;
      const sideIndex = index % CORNER_CONFETTI_PER_SIDE;
      const progress = sideIndex / (CORNER_CONFETTI_PER_SIDE - 1);
      const leftAngle = -1.5 + progress * 0.95;
      const angle = fromLeft ? leftAngle : -Math.PI - leftAngle;
      const speed = (390 + (sideIndex % 8) * 38) * speedScale;
      particle.view.position.set(
        fromLeft ? 8 : this.viewportWidth - 8,
        this.viewportHeight - 6,
      );
      particle.view.rotation = angle;
      particle.baseScale = 0.75 + (sideIndex % 5) * 0.12;
      particle.view.scale.set(particle.baseScale);
      particle.view.tint = confettiColor(index, color);
      particle.view.alpha = 1;
      particle.view.visible = true;
      particle.velocityX = Math.cos(angle) * speed;
      particle.velocityY = Math.sin(angle) * speed;
      particle.spin = (sideIndex % 2 === 0 ? 1 : -1) * (5.5 + (sideIndex % 4));
      particle.age = 0;
      particle.lifetime = 1.45 + (sideIndex % 6) * 0.11;
      particle.flutterPhase = sideIndex * 0.7;
      particle.flutterSpeed = 9 + (sideIndex % 5) * 1.4;
    }
  }

  private triggerParticles(x: number, y: number, score: number, scoreRatio: number): void {
    const noodleCount = score <= 100 ? 12 : score <= 200 ? 20 : NOODLE_FRAGMENT_COUNT;
    const dropletCount = score <= 100 ? 0 : score <= 200 ? 2 : SAUCE_DROPLET_COUNT;
    const baseAngle = (score % 19) * 0.037;
    const speedScale = 0.82 + scoreRatio * 0.32;
    for (let index = 0; index < this.noodleFragments.length; index += 1) {
      const particle = this.noodleFragments[index];
      if (!particle) continue;
      if (index >= noodleCount) {
        particle.view.visible = false;
        continue;
      }
      const angle = baseAngle + index / noodleCount * Math.PI * 2;
      const speed = (135 + (index % 6) * 24) * speedScale;
      activateParticle(particle, x, y, angle, speed, index, 0.52 + (index % 5) * 0.045);
      const colors = SPAGHETTI_SETTINGS.strand.colors;
      particle.view.tint = colors[index % colors.length] ?? COLORS.accentHover;
      particle.view.scale.set(0.72 + (index % 4) * 0.12);
    }
    for (let index = 0; index < this.sauceDroplets.length; index += 1) {
      const particle = this.sauceDroplets[index];
      if (!particle) continue;
      if (index >= dropletCount) {
        particle.view.visible = false;
        continue;
      }
      const angle = -Math.PI + 0.28 + index / Math.max(1, dropletCount - 1) * (Math.PI - 0.56);
      const speed = (155 + (index % 4) * 28) * speedScale;
      activateParticle(particle, x, y, angle, speed, index, 0.58 + (index % 3) * 0.06);
      particle.view.tint = index % 2 === 0 ? COLORS.red : COLORS.error;
      particle.view.scale.set(0.85 + (index % 3) * 0.18);
    }
  }

  private updateWaves(deltaSeconds: number): void {
    for (const wave of this.waves) {
      if (!wave.view.visible) continue;
      wave.age += deltaSeconds;
      if (wave.age >= wave.lifetime) {
        wave.view.visible = false;
        continue;
      }
      const progress = wave.age / wave.lifetime;
      const eased = 1 - (1 - progress) ** 3;
      const radius = wave.startRadius + (wave.endRadius - wave.startRadius) * eased;
      wave.view.scale.set(radius);
      wave.view.alpha = (1 - progress) ** 2;
    }
  }

  private updateRays(deltaSeconds: number): void {
    if (this.rayAge >= RAY_DURATION_SECONDS) return;
    this.rayAge = Math.min(RAY_DURATION_SECONDS, this.rayAge + deltaSeconds);
    const progress = this.rayAge / RAY_DURATION_SECONDS;
    const extension = 0.25 + (1 - (1 - progress) ** 3) * 0.75;
    for (const ray of this.rays) {
      if (!ray.view.visible) continue;
      ray.view.scale.x = ray.targetLength * extension;
      ray.view.alpha = (1 - progress) ** 2;
      if (progress >= 1) ray.view.visible = false;
    }
  }

  private updateBackdropRays(deltaSeconds: number): void {
    if (!this.backdropRayActive) return;
    this.backdropRayAge = Math.min(
      BACKDROP_RAY_BURST_SECONDS + 2,
      this.backdropRayAge + deltaSeconds,
    );
    if (this.backdropRayAge < 0) return;
    this.backdropDriftPhase += deltaSeconds * 1.45;
    if (this.backdropDriftPhase >= Math.PI * 2) {
      this.backdropDriftPhase -= Math.PI * 2;
    }

    const burstProgress = Math.min(1, this.backdropRayAge / BACKDROP_RAY_BURST_SECONDS);
    const burstExtension = 0.025 + (1 - (1 - burstProgress) ** 4) * 0.975;
    const orbitAge = Math.max(0, this.backdropRayAge - BACKDROP_RAY_BURST_SECONDS);
    const settleScale = 0.92 + Math.exp(-orbitAge * 5) * 0.08;
    const fadeIn = Math.min(1, burstProgress * 3.5);
    this.backdrop.rotation += deltaSeconds * (0.14 + this.impactIntensity * 0.035);
    for (let index = 0; index < this.backdropRays.length; index += 1) {
      const ray = this.backdropRays[index];
      if (!ray?.view.visible) continue;
      const drift = 1 + Math.sin(this.backdropDriftPhase + index * 0.62) * 0.028;
      ray.view.scale.x = ray.targetLength * burstExtension * settleScale * drift;
      ray.view.alpha = ray.baseAlpha * fadeIn;
    }
  }

  private updateCornerConfetti(deltaSeconds: number): void {
    for (const particle of this.cornerConfetti) {
      if (!particle.view.visible) continue;
      particle.age += deltaSeconds;
      if (particle.age >= particle.lifetime) {
        particle.view.visible = false;
        continue;
      }
      particle.velocityY += CONFETTI_GRAVITY * deltaSeconds;
      particle.velocityX *= Math.max(0, 1 - deltaSeconds * 0.22);
      particle.view.x += particle.velocityX * deltaSeconds;
      particle.view.y += particle.velocityY * deltaSeconds;
      particle.view.rotation += particle.spin * deltaSeconds;
      particle.flutterPhase += particle.flutterSpeed * deltaSeconds;
      particle.view.scale.x = particle.baseScale * Math.cos(particle.flutterPhase);
      particle.view.alpha = Math.min(1, (1 - particle.age / particle.lifetime) * 3);
    }
  }

  private updateParticles(particles: readonly ImpactParticle[], deltaSeconds: number): void {
    for (const particle of particles) {
      if (!particle.view.visible) continue;
      particle.age += deltaSeconds;
      if (particle.age >= particle.lifetime) {
        particle.view.visible = false;
        continue;
      }
      particle.velocityY += 255 * deltaSeconds;
      particle.view.x += particle.velocityX * deltaSeconds;
      particle.view.y += particle.velocityY * deltaSeconds;
      particle.view.rotation += particle.spin * deltaSeconds;
      particle.view.alpha = (1 - particle.age / particle.lifetime) ** 1.4;
    }
  }

  private updateCompression(deltaSeconds: number): void {
    if (this.compressionAge >= BOWL_COMPRESSION_DURATION_SECONDS) {
      this.currentBowlOffsetY = 0;
      this.currentBowlScaleX = 1;
      this.currentBowlScaleY = 1;
      return;
    }
    this.compressionAge = Math.min(
      BOWL_COMPRESSION_DURATION_SECONDS,
      this.compressionAge + deltaSeconds,
    );
    const progress = this.compressionAge / BOWL_COMPRESSION_DURATION_SECONDS;
    const amount = (1 - progress) * Math.cos(progress * Math.PI * 3);
    this.currentBowlOffsetY = 7 * amount * this.impactIntensity;
    this.currentBowlScaleX = 1 + 0.032 * amount * this.impactIntensity;
    this.currentBowlScaleY = 1 - 0.072 * amount * this.impactIntensity;
  }

  private updateCameraPunch(deltaSeconds: number): void {
    if (this.cameraPunchAge >= CAMERA_PUNCH_DURATION_SECONDS) {
      this.currentCameraOffsetX = 0;
      this.currentCameraOffsetY = 0;
      return;
    }
    this.cameraPunchAge = Math.min(
      CAMERA_PUNCH_DURATION_SECONDS,
      this.cameraPunchAge + deltaSeconds,
    );
    const progress = this.cameraPunchAge / CAMERA_PUNCH_DURATION_SECONDS;
    const decay = 1 - progress;
    this.currentCameraOffsetX = Math.sin(progress * Math.PI * 4) * 2.5 * decay;
    this.currentCameraOffsetY = (5.5 + Math.sin(progress * Math.PI * 5) * 2) * decay;
  }

  private clearTransient(): void {
    this.backdropRayActive = false;
    this.backdropRayAge = 0;
    this.backdropDriftPhase = 0;
    this.backdropMinimumLength = 0;
    this.rayAge = RAY_DURATION_SECONDS;
    this.compressionAge = BOWL_COMPRESSION_DURATION_SECONDS;
    this.cameraPunchAge = CAMERA_PUNCH_DURATION_SECONDS;
    this.currentBowlOffsetY = 0;
    this.currentBowlScaleX = 1;
    this.currentBowlScaleY = 1;
    this.currentCameraOffsetX = 0;
    this.currentCameraOffsetY = 0;
    this.backdrop.visible = false;
    this.backdrop.rotation = 0;
    for (const ray of this.backdropRays) ray.view.visible = false;
    for (const ray of this.rays) ray.view.visible = false;
    for (const wave of this.waves) wave.view.visible = false;
    for (const particle of this.noodleFragments) particle.view.visible = false;
    for (const particle of this.sauceDroplets) particle.view.visible = false;
    for (const particle of this.cornerConfetti) particle.view.visible = false;
  }
}

function createConfettiParticle(index: number): ConfettiParticle {
  const view = index % 3 === 0
    ? new Graphics({ eventMode: "none" }).roundRect(-4, -2, 8, 4, 1).fill(0xffffff)
    : index % 3 === 1
      ? new Graphics({ eventMode: "none" }).poly([-4, 3, 0, -4, 4, 3], true).fill(0xffffff)
      : new Graphics({ eventMode: "none" }).roundRect(-2, -4, 4, 8, 1).fill(0xffffff);
  view.visible = false;
  return {
    view,
    velocityX: 0,
    velocityY: 0,
    spin: 0,
    age: 0,
    lifetime: 0,
    baseScale: 1,
    flutterPhase: 0,
    flutterSpeed: 0,
  };
}

function confettiColor(index: number, scoreColor: number): number {
  switch (index % 7) {
    case 0:
      return scoreColor;
    case 1:
      return COLORS.red;
    case 2:
      return COLORS.scoreGreen;
    case 3:
      return COLORS.accentHover;
    default: {
      const colors = SPAGHETTI_SETTINGS.strand.colors;
      return colors[index % colors.length] ?? COLORS.accent;
    }
  }
}

function createParticle(droplet: boolean): ImpactParticle {
  const view = droplet
    ? new Graphics({ eventMode: "none" }).circle(0, 0, 2.4).fill(0xffffff)
    : new Graphics({ eventMode: "none" }).roundRect(-6, -1.5, 12, 3, 1.5).fill(0xffffff);
  view.visible = false;
  return {
    view,
    velocityX: 0,
    velocityY: 0,
    spin: 0,
    age: 0,
    lifetime: 0,
  };
}

function createWave(): ImpactWave {
  const view = new Graphics({ eventMode: "none" })
    .circle(0, 0, 1)
    .fill({ color: 0xffffff, alpha: 0.045 })
    .stroke({ color: 0xffffff, width: 0.032 });
  view.visible = false;
  return {
    view,
    age: 0,
    lifetime: 0,
    startRadius: 0,
    endRadius: 0,
  };
}

function configureWave(
  wave: ImpactWave,
  x: number,
  y: number,
  startRadius: number,
  endRadius: number,
  lifetime: number,
  color: number,
): void {
  wave.age = 0;
  wave.lifetime = lifetime;
  wave.startRadius = startRadius;
  wave.endRadius = endRadius;
  wave.view.position.set(x, y);
  wave.view.scale.set(startRadius);
  wave.view.tint = color;
  wave.view.alpha = 1;
  wave.view.visible = true;
}

function activateParticle(
  particle: ImpactParticle,
  x: number,
  y: number,
  angle: number,
  speed: number,
  index: number,
  lifetime: number,
): void {
  particle.view.position.set(x + (index % 3 - 1) * 4, y + (index % 2) * 3);
  particle.view.rotation = angle;
  particle.view.alpha = 1;
  particle.view.visible = true;
  particle.velocityX = Math.cos(angle) * speed;
  particle.velocityY = Math.sin(angle) * speed - 58;
  particle.spin = index % 2 === 0 ? 7.5 : -7.5;
  particle.age = 0;
  particle.lifetime = lifetime;
}
