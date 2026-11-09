import { Container, FillGradient, Graphics } from "pixi.js";
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
const FLOUR_DUST_COUNT = 30;
const AMBIENT_DEBRIS_COUNT = 14;
const BLOOM_DURATION_SECONDS = 0.38;
const DUST_GRAVITY = -18;
const AFTERSHOCK_DURATION_SECONDS = 0.3;
const HIGHLIGHT_DURATION_SECONDS = 0.48;
const SCREEN_FLASH_DURATION_SECONDS = 0.11;
const SCORE_ECHO_DURATION_SECONDS = 0.4;

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

interface DustParticle extends ImpactParticle {
  baseAlpha: number;
  baseScale: number;
}

interface AmbientDebris {
  readonly view: Graphics;
  originX: number;
  originY: number;
  phase: number;
  speed: number;
  driftX: number;
  driftY: number;
  baseAlpha: number;
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
  private readonly impactBloom = createImpactBloom();
  private readonly flourDust: DustParticle[];
  private readonly ambientDebris: AmbientDebris[];
  private readonly screenFlash = new Graphics({ eventMode: "none" });
  private readonly scoreEchoes = [createScoreEcho(), createScoreEcho(), createScoreEcho()] as const;
  private readonly scoreEchoAges = [
    SCORE_ECHO_DURATION_SECONDS,
    SCORE_ECHO_DURATION_SECONDS,
    SCORE_ECHO_DURATION_SECONDS,
  ];
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
  private bloomAge = BLOOM_DURATION_SECONDS;
  private bloomRadius = 0;
  private ambientDebrisActive = false;
  private ambientDebrisAge = 0;
  private aftershockAge = AFTERSHOCK_DURATION_SECONDS;
  private screenFlashAge = SCREEN_FLASH_DURATION_SECONDS;
  private highlightAge = HIGHLIGHT_DURATION_SECONDS;
  private rayAge = RAY_DURATION_SECONDS;
  private compressionAge = BOWL_COMPRESSION_DURATION_SECONDS;
  private cameraPunchAge = CAMERA_PUNCH_DURATION_SECONDS;
  private impactIntensity = 1;
  private currentBowlOffsetY = 0;
  private currentBowlScaleX = 1;
  private currentBowlScaleY = 1;
  private currentAftershockOffsetY = 0;
  private currentAftershockScaleX = 1;
  private currentAftershockScaleY = 1;
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
    this.flourDust = Array.from(
      { length: FLOUR_DUST_COUNT },
      (_, index) => createDustParticle(index),
    );
    this.ambientDebris = Array.from(
      { length: AMBIENT_DEBRIS_COUNT },
      (_, index) => createAmbientDebris(index),
    );
    this.backdrop.addChild(
      ...this.backdropRays.map((ray) => ray.view),
      this.impactBloom,
      ...this.ambientDebris.map((particle) => particle.view),
    );
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
      this.screenFlash,
      ...this.scoreEchoes,
      ...this.rays.map((ray) => ray.view),
      ...this.waves.map((wave) => wave.view),
      ...this.flourDust.map((particle) => particle.view),
      ...this.noodleFragments.map((particle) => particle.view),
      ...this.sauceDroplets.map((particle) => particle.view),
      ...this.cornerConfetti.map((particle) => particle.view),
      this.staticRing,
    );
  }

  resize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.screenFlash.clear()
      .rect(0, 0, width, height)
      .fill(0xffffff);
    if (this.backdropRayActive) this.updateBackdropRayLengths();
  }

  get bowlOffsetY(): number {
    return this.currentBowlOffsetY + this.currentAftershockOffsetY;
  }

  get bowlScaleX(): number {
    return this.currentBowlScaleX * this.currentAftershockScaleX;
  }

  get bowlScaleY(): number {
    return this.currentBowlScaleY * this.currentAftershockScaleY;
  }

  get cameraOffsetX(): number {
    return this.currentCameraOffsetX;
  }

  get cameraOffsetY(): number {
    return this.currentCameraOffsetY;
  }

  get highlightProgress(): number {
    return Math.min(1, this.highlightAge / HIGHLIGHT_DURATION_SECONDS);
  }

  get highlightAlpha(): number {
    if (this.highlightAge >= HIGHLIGHT_DURATION_SECONDS) return 0;
    const progress = this.highlightProgress;
    return Math.sin(progress * Math.PI) * 0.74;
  }

  setReducedMotion(reducedMotion: boolean): void {
    if (this.reducedMotion === reducedMotion) return;
    this.reducedMotion = reducedMotion;
    this.clearTransient();
    if (!reducedMotion) this.staticRing.visible = false;
  }

  trigger(
    x: number,
    y: number,
    radius: number,
    score: number,
    color: number,
    rimY: number,
    footY: number,
  ): void {
    if (this.reducedMotion) return;
    this.staticRing.visible = false;
    const scoreRatio = Math.min(1.5, Math.max(0, score) / 200);
    this.impactIntensity = 0.78 + scoreRatio * 0.28;
    this.triggerBackdropRays(x, y, radius, score, color);
    this.triggerBloom(x, y, radius);
    this.triggerWaves(x, y, radius, color);
    this.triggerRays(x, y, radius, score, color);
    this.triggerParticles(x, y, score, scoreRatio);
    this.triggerFlourDust(x, rimY, footY, radius);
    this.triggerAmbientDebris(x, y, radius);
    this.triggerCornerConfetti(score, color);
    this.triggerScreenFlash(color);
    this.triggerScoreEchoes(x, y, radius, color);
    this.compressionAge = 0;
    this.aftershockAge = AFTERSHOCK_DURATION_SECONDS;
    this.highlightAge = 0;
    this.cameraPunchAge = 0;
    this.updateCompression(0);
    this.updateCameraPunch(0);
  }

  triggerAftershock(): void {
    if (this.reducedMotion) return;
    this.aftershockAge = 0;
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
    this.updateScreenFlash(deltaSeconds);
    this.updateScoreEchoes(deltaSeconds);
    this.updateBackdropRays(deltaSeconds);
    this.updateBloom(deltaSeconds);
    this.updateAmbientDebris(deltaSeconds);
    this.updateWaves(deltaSeconds);
    this.updateRays(deltaSeconds);
    this.updateDust(deltaSeconds);
    this.updateParticles(this.noodleFragments, deltaSeconds);
    this.updateParticles(this.sauceDroplets, deltaSeconds);
    this.updateCornerConfetti(deltaSeconds);
    this.updateCompression(deltaSeconds);
    this.updateAftershock(deltaSeconds);
    this.updateHighlight(deltaSeconds);
    this.updateCameraPunch(deltaSeconds);
  }

  clear(): void {
    this.clearTransient();
    this.staticRing.visible = false;
  }

  private triggerScreenFlash(color: number): void {
    this.screenFlashAge = 0;
    this.screenFlash.tint = color;
    this.screenFlash.alpha = 0.17;
    this.screenFlash.visible = true;
  }

  private triggerScoreEchoes(x: number, y: number, radius: number, color: number): void {
    for (let index = 0; index < this.scoreEchoes.length; index += 1) {
      const echo = this.scoreEchoes[index];
      this.scoreEchoAges[index] = -index * 0.045;
      echo.position.set(x, y);
      echo.scale.set(radius * 0.16);
      echo.tint = color;
      echo.alpha = 0;
      echo.visible = true;
    }
  }

  private updateScreenFlash(deltaSeconds: number): void {
    if (this.screenFlashAge >= SCREEN_FLASH_DURATION_SECONDS) return;
    this.screenFlashAge = Math.min(
      SCREEN_FLASH_DURATION_SECONDS,
      this.screenFlashAge + deltaSeconds,
    );
    const progress = this.screenFlashAge / SCREEN_FLASH_DURATION_SECONDS;
    this.screenFlash.alpha = (1 - progress) ** 3 * 0.17;
    if (progress >= 1) this.screenFlash.visible = false;
  }

  private updateScoreEchoes(deltaSeconds: number): void {
    for (let index = 0; index < this.scoreEchoes.length; index += 1) {
      const echo = this.scoreEchoes[index];
      const age = Math.min(
        SCORE_ECHO_DURATION_SECONDS,
        this.scoreEchoAges[index] + deltaSeconds,
      );
      this.scoreEchoAges[index] = age;
      if (age < 0) continue;
      if (age >= SCORE_ECHO_DURATION_SECONDS) {
        echo.visible = false;
        continue;
      }
      const progress = age / SCORE_ECHO_DURATION_SECONDS;
      const radius = 20 + (1 - (1 - progress) ** 3) * 190;
      echo.scale.set(radius);
      echo.alpha = (1 - progress) ** 2 * 0.62;
    }
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
      ray.view.tint = index % 3 === 0 ? color : COLORS.highlight;
      ray.view.alpha = 0.58;
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
      ray.baseAlpha = 0.07 + scoreRatio * 0.055 + (index % 3) * 0.008;
      ray.view.rotation = angle;
      ray.view.scale.set(ray.targetLength * 0.025, 1 + (index % 4) * 0.18);
      ray.view.tint = index % 4 === 0 ? color : COLORS.accent;
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

  private triggerBloom(x: number, y: number, radius: number): void {
    this.backdrop.position.set(x, y);
    this.bloomAge = 0;
    this.bloomRadius = radius;
    this.impactBloom.position.set(0, 0);
    this.impactBloom.scale.set(radius * 0.18);
    this.impactBloom.alpha = 0;
    this.impactBloom.visible = true;
  }

  private triggerFlourDust(
    centerX: number,
    rimY: number,
    footY: number,
    radius: number,
  ): void {
    const perBand = this.flourDust.length / 2;
    for (let index = 0; index < this.flourDust.length; index += 1) {
      const particle = this.flourDust[index];
      if (!particle) continue;
      const bandIndex = index % perBand;
      const side = bandIndex / (perBand - 1) * 2 - 1;
      const atRim = index < perBand;
      const spread = atRim ? radius * 0.78 : radius * 0.34;
      particle.view.position.set(
        centerX + side * spread,
        (atRim ? rimY : footY) + (index % 3 - 1) * 3,
      );
      particle.baseScale = 0.75 + (index % 5) * 0.18;
      particle.view.scale.set(particle.baseScale);
      particle.baseAlpha = atRim ? 0.22 : 0.16;
      particle.view.alpha = 0;
      particle.view.visible = true;
      particle.velocityX = side * (26 + (index % 4) * 8);
      particle.velocityY = -(24 + (index % 6) * 6);
      particle.spin = 0;
      particle.age = 0;
      particle.lifetime = 0.72 + (index % 5) * 0.08;
    }
  }

  private triggerAmbientDebris(_x: number, _y: number, radius: number): void {
    this.ambientDebrisActive = true;
    this.ambientDebrisAge = 0;
    for (let index = 0; index < this.ambientDebris.length; index += 1) {
      const particle = this.ambientDebris[index];
      if (!particle) continue;
      const angle = index / this.ambientDebris.length * Math.PI * 2 + (index % 3) * 0.17;
      const distance = radius * (0.62 + (index % 5) * 0.11);
      particle.originX = Math.cos(angle) * distance;
      particle.originY = Math.sin(angle) * distance * 0.72;
      particle.phase = index * 0.83;
      particle.view.position.set(particle.originX, particle.originY);
      particle.view.rotation = angle;
      particle.view.alpha = 0;
      particle.view.visible = true;
    }
  }

  private updateBloom(deltaSeconds: number): void {
    if (this.bloomAge >= BLOOM_DURATION_SECONDS) return;
    this.bloomAge = Math.min(BLOOM_DURATION_SECONDS, this.bloomAge + deltaSeconds);
    const progress = this.bloomAge / BLOOM_DURATION_SECONDS;
    const expansion = 0.18 + (1 - (1 - progress) ** 3) * 1.18;
    this.impactBloom.scale.set(this.bloomRadius * expansion);
    this.impactBloom.alpha = Math.sin(Math.min(1, progress * 1.45) * Math.PI) * 0.46;
    if (progress >= 1) this.impactBloom.visible = false;
  }

  private updateDust(deltaSeconds: number): void {
    for (const particle of this.flourDust) {
      if (!particle.view.visible) continue;
      particle.age += deltaSeconds;
      if (particle.age >= particle.lifetime) {
        particle.view.visible = false;
        continue;
      }
      const progress = particle.age / particle.lifetime;
      particle.velocityY += DUST_GRAVITY * deltaSeconds;
      particle.view.x += particle.velocityX * deltaSeconds;
      particle.view.y += particle.velocityY * deltaSeconds;
      const expansion = 1 + progress * 0.9;
      particle.view.scale.set(particle.baseScale * expansion);
      particle.view.alpha = Math.sin(progress * Math.PI) * particle.baseAlpha;
    }
  }

  private updateAmbientDebris(deltaSeconds: number): void {
    if (!this.ambientDebrisActive) return;
    this.ambientDebrisAge = Math.min(1, this.ambientDebrisAge + deltaSeconds);
    const fadeIn = this.ambientDebrisAge;
    for (const particle of this.ambientDebris) {
      if (!particle.view.visible) continue;
      particle.phase += deltaSeconds * particle.speed;
      particle.view.position.set(
        particle.originX + Math.sin(particle.phase) * particle.driftX,
        particle.originY + Math.cos(particle.phase * 0.83) * particle.driftY,
      );
      particle.view.rotation += deltaSeconds * 0.16;
      particle.view.alpha = particle.baseAlpha * fadeIn;
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

  private updateAftershock(deltaSeconds: number): void {
    if (this.aftershockAge >= AFTERSHOCK_DURATION_SECONDS) {
      this.currentAftershockOffsetY = 0;
      this.currentAftershockScaleX = 1;
      this.currentAftershockScaleY = 1;
      return;
    }
    this.aftershockAge = Math.min(
      AFTERSHOCK_DURATION_SECONDS,
      this.aftershockAge + deltaSeconds,
    );
    const progress = this.aftershockAge / AFTERSHOCK_DURATION_SECONDS;
    const amount = Math.cos(progress * Math.PI * 3) * (1 - progress);
    this.currentAftershockOffsetY = 3.2 * amount;
    this.currentAftershockScaleX = 1 + 0.014 * amount;
    this.currentAftershockScaleY = 1 - 0.026 * amount;
  }

  private updateHighlight(deltaSeconds: number): void {
    this.highlightAge = Math.min(
      HIGHLIGHT_DURATION_SECONDS,
      this.highlightAge + deltaSeconds,
    );
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
    this.screenFlashAge = SCREEN_FLASH_DURATION_SECONDS;
    this.rayAge = RAY_DURATION_SECONDS;
    this.bloomAge = BLOOM_DURATION_SECONDS;
    this.bloomRadius = 0;
    this.ambientDebrisActive = false;
    this.ambientDebrisAge = 0;
    this.compressionAge = BOWL_COMPRESSION_DURATION_SECONDS;
    this.aftershockAge = AFTERSHOCK_DURATION_SECONDS;
    this.highlightAge = HIGHLIGHT_DURATION_SECONDS;
    this.cameraPunchAge = CAMERA_PUNCH_DURATION_SECONDS;
    this.currentBowlOffsetY = 0;
    this.currentBowlScaleX = 1;
    this.currentBowlScaleY = 1;
    this.currentAftershockOffsetY = 0;
    this.currentAftershockScaleX = 1;
    this.currentAftershockScaleY = 1;
    this.currentCameraOffsetX = 0;
    this.currentCameraOffsetY = 0;
    this.backdrop.visible = false;
    this.backdrop.rotation = 0;
    this.impactBloom.visible = false;
    this.screenFlash.visible = false;
    for (let index = 0; index < this.scoreEchoes.length; index += 1) {
      this.scoreEchoAges[index] = SCORE_ECHO_DURATION_SECONDS;
      this.scoreEchoes[index].visible = false;
    }
    for (const ray of this.backdropRays) ray.view.visible = false;
    for (const ray of this.rays) ray.view.visible = false;
    for (const wave of this.waves) wave.view.visible = false;
    for (const particle of this.flourDust) particle.view.visible = false;
    for (const particle of this.ambientDebris) particle.view.visible = false;
    for (const particle of this.noodleFragments) particle.view.visible = false;
    for (const particle of this.sauceDroplets) particle.view.visible = false;
    for (const particle of this.cornerConfetti) particle.view.visible = false;
  }
}

function createScoreEcho(): Graphics {
  const echo = new Graphics({ eventMode: "none" })
    .circle(0, 0, 1)
    .stroke({ color: 0xffffff, alpha: 0.92, width: 0.025 });
  echo.visible = false;
  return echo;
}

function createImpactBloom(): Graphics {
  const gradient = new FillGradient({
    type: "radial",
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    colorStops: [
      { offset: 0, color: "rgba(255,248,221,0.95)" },
      { offset: 0.34, color: "rgba(255,216,0,0.48)" },
      { offset: 1, color: "rgba(255,216,0,0)" },
    ],
  });
  const view = new Graphics({ eventMode: "none" })
    .circle(0, 0, 1)
    .fill(gradient);
  view.visible = false;
  return view;
}

function createDustParticle(index: number): DustParticle {
  const radius = 3 + index % 4;
  const view = new Graphics({ eventMode: "none" })
    .ellipse(0, 0, radius * 1.4, radius)
    .fill({ color: 0xfff2cf, alpha: 0.72 });
  view.visible = false;
  return {
    view,
    velocityX: 0,
    velocityY: 0,
    spin: 0,
    age: 0,
    lifetime: 0,
    baseAlpha: 0,
    baseScale: 1,
  };
}

function createAmbientDebris(index: number): AmbientDebris {
  const colors = SPAGHETTI_SETTINGS.strand.colors;
  const view = new Graphics({ eventMode: "none" })
    .roundRect(-3, -0.8, 6, 1.6, 0.8)
    .fill(colors[index % colors.length] ?? COLORS.highlight);
  view.visible = false;
  return {
    view,
    originX: 0,
    originY: 0,
    phase: 0,
    speed: 0.18 + (index % 5) * 0.025,
    driftX: 4 + (index % 4) * 1.5,
    driftY: 3 + (index % 3) * 1.4,
    baseAlpha: 0.055 + (index % 3) * 0.012,
  };
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
