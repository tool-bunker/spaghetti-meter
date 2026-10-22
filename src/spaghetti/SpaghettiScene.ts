import {
  Container,
  Graphics,
  Point,
  Sprite,
  Texture,
  type DestroyOptions,
  type Ticker,
} from "pixi.js";
import { SPAGHETTI_SETTINGS, type SpaghettiSettings } from "./settings";

interface RopeBody {
  points: Point[];
  previous: Point[];
  escapeSides: Int8Array;
  landed: Uint8Array;
  canSpill: boolean;
  spillDirection: number;
  stackOffset: number;
  restSlope: number;
  restPhase: number;
  segments: Sprite[];
  view: Container;
  segmentLength: number;
  spawnAt: number;
  active: boolean;
  sleeping: boolean;
  settledAt: number;
  idlePhase: number;
  idleStrength: number;
}

interface BowlBounds {
  centerX: number;
  rimY: number;
  halfWidth: number;
  depth: number;
}

export class SpaghettiScene extends Container {
  private readonly settings: SpaghettiSettings;
  private readonly segmentTexture: Texture;
  private readonly ownsSegmentTexture: boolean;
  private bowl: BowlBounds | undefined;
  private ropes: RopeBody[] = [];
  private elapsed = 0;
  private score = 0;
  private sceneWidth = 0;
  private sceneHeight = 0;
  private reducedMotion = false;

  constructor(settings: SpaghettiSettings = SPAGHETTI_SETTINGS) {
    super({ label: "spaghetti-scene", eventMode: "none" });
    this.settings = settings;
    const texture = this.createSegmentTexture();
    this.segmentTexture = texture.texture;
    this.ownsSegmentTexture = texture.owned;
  }

  rebuild(
    width: number,
    height: number,
    score: number,
    scanning: boolean,
    reducedMotion: boolean,
  ): void {
    if (width < 2 || height < 2) return;

    for (const child of this.removeChildren()) {
      child.destroy({ children: true });
    }
    this.ropes = [];
    this.elapsed = 0;
    this.sceneWidth = width;
    this.sceneHeight = height;
    this.score = Math.max(0, Math.floor(score));
    this.reducedMotion = reducedMotion;

    const bowlSettings = this.settings.bowl;
    const halfWidth = Math.min(
      width * (width <= 700 ? bowlSettings.compactWidthRatio : bowlSettings.wideWidthRatio),
      bowlSettings.maximumHalfWidth,
    );
    const depth = Math.min(height * bowlSettings.depthRatio, bowlSettings.maximumDepth);
    this.bowl = {
      centerX: width / 2,
      rimY: height * bowlSettings.rimYRatio,
      halfWidth,
      depth,
    };

    this.drawBowlBack();
    const ropeLayer = new Container({ label: "spaghetti-ropes", eventMode: "none" });
    this.addChild(ropeLayer);
    if (this.score > 0) this.createRopes(ropeLayer, this.score);
    this.drawBowlOutline();
    if (scanning) this.drawScanningRing();
  }

  update(ticker: Ticker): void {
    if (this.reducedMotion || this.ropes.length === 0 || !this.bowl) return;

    this.elapsed += ticker.deltaMS;
    if (this.updateRopeActivity()) this.simulateActiveRopes(ticker.deltaMS);
    this.animateSettledRopes();
  }

  private updateRopeActivity(): boolean {
    let hasMovingRopes = false;
    for (const body of this.ropes) {
      if (!body.active && this.elapsed >= body.spawnAt) {
        body.active = true;
        body.view.visible = true;
      }

      const sleepAfter = body.canSpill
        ? this.settings.settling.spillAfterMs
        : this.settings.settling.containedAfterMs;
      if (body.active && !body.sleeping && this.elapsed - body.spawnAt >= sleepAfter) {
        body.sleeping = true;
        body.settledAt = this.elapsed;
        for (let index = 0; index < body.points.length; index += 1) {
          body.previous[index].copyFrom(body.points[index]);
        }
      }
      hasMovingRopes ||= body.active && !body.sleeping;
    }
    return hasMovingRopes;
  }


  private simulateActiveRopes(deltaMs: number): void {
    const physics = this.settings.physics;
    const denseServing = this.ropes.length > physics.denseServingCount;
    const substeps = this.ropes.length > physics.mediumServingCount ? 2 : 3;
    const iterations = denseServing ? 3 : this.ropes.length > physics.mediumServingCount ? 4 : 5;
    const step = Math.min(deltaMs / 1000, physics.maximumStepSeconds) / substeps;
    for (let substep = 0; substep < substeps; substep += 1) {
      this.integrate(step);
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        this.constrainActiveRopes();
      }
    }
    this.renderActiveRopes();
  }

  private constrainActiveRopes(): void {
    for (const body of this.ropes) {
      if (!body.active || body.sleeping) continue;
      this.constrainRope(body);
      this.constrainBend(body);
      this.collideWithBowl(body);
    }
  }

  private renderActiveRopes(): void {
    for (const body of this.ropes) {
      if (body.active && !body.sleeping) this.renderRope(body);
    }
  }

  dispose(): void {
    for (const child of this.removeChildren()) {
      child.destroy({ children: true });
    }
    if (this.ownsSegmentTexture) this.segmentTexture.destroy(true);
    super.destroy({ children: false } as DestroyOptions);
  }

  private drawBowlBack(): void {
    if (!this.bowl) return;
    const { centerX, rimY, halfWidth, depth } = this.bowl;
    const left = centerX - halfWidth;
    const right = centerX + halfWidth;

    const shadow = new Graphics()
      .ellipse(centerX, rimY + depth * 1.35, halfWidth * 0.78, depth * 0.12)
      .fill({ color: 0x0c0806, alpha: 0.34 });
    const shell = new Graphics()
      .moveTo(left, rimY)
      .quadraticCurveTo(centerX, rimY + depth * 1.3, right, rimY)
      .lineTo(left, rimY)
      .closePath()
      .fill({ color: 0xb94f3e, alpha: 1 });
    const cavity = new Graphics()
      .moveTo(left + 10, rimY + 2)
      .quadraticCurveTo(centerX, rimY + depth * 0.82, right - 10, rimY + 2)
      .lineTo(left + 10, rimY + 2)
      .closePath()
      .fill({ color: 0x24140f, alpha: 0.98 });
    const opening = new Graphics()
      .ellipse(centerX, rimY, halfWidth, depth * 0.13)
      .fill({ color: 0x20110d, alpha: 1 });

    this.addChild(shadow, shell, cavity, opening);
  }

  private drawBowlOutline(): void {
    if (!this.bowl) return;
    const { centerX, rimY, halfWidth, depth } = this.bowl;
    const left = centerX - halfWidth;
    const right = centerX + halfWidth;
    const outline = new Graphics()
      .moveTo(left, rimY)
      .quadraticCurveTo(centerX, rimY + depth * 1.3, right, rimY)
      .stroke({ color: 0xf3bea0, alpha: 0.82, width: 4, cap: "round" })
      .ellipse(centerX, rimY, halfWidth, depth * 0.13)
      .stroke({ color: 0xf3bea0, alpha: 0.82, width: 4 });
    this.addChild(outline);
  }

  private drawScanningRing(): void {
    if (!this.bowl) return;
    const ring = new Graphics()
      .ellipse(this.bowl.centerX, this.bowl.rimY, this.bowl.halfWidth * 0.62, this.bowl.depth * 0.08)
      .stroke({ color: 0xffd55a, alpha: 0.48, width: 2 });
    this.addChild(ring);
  }

  private createSegmentTexture(): { texture: Texture; owned: boolean } {
    const canvas = document.createElement("canvas");
    canvas.width = this.settings.render.textureWidth;
    canvas.height = this.settings.render.textureHeight;
    const context = canvas.getContext("2d");
    if (!context) return { texture: Texture.WHITE, owned: false };

    context.fillStyle = "white";
    context.beginPath();
    context.roundRect(0, 0, canvas.width, canvas.height, canvas.height / 2);
    context.fill();
    return { texture: Texture.from(canvas), owned: true };
  }

  private createRopes(layer: Container, servingSize: number): void {
    if (!this.bowl) return;
    const serving = this.settings.serving;
    const strand = this.settings.strand;
    const containedScore = Math.min(servingSize, serving.containedScore);
    const overflowScore = Math.max(0, servingSize - serving.containedScore);
    const physicalCount = Math.min(
      serving.maximumCount,
      Math.round(serving.baseCount + containedScore * serving.containedGrowth + overflowScore * serving.overflowGrowth),
    );
    const overflowScale = Math.min(serving.overflowScaleLimit, overflowScore / serving.containedScore);
    const random = randomGenerator(this.score * 149 + (overflowScore > 0 ? 997 : 0));
    const spillRopeCount = Math.min(
      serving.maximumSpillCount,
      Math.ceil(overflowScore / serving.overflowPerSpill),
    );
    const bowlRopeCount = physicalCount - spillRopeCount;

    for (let ropeIndex = 0; ropeIndex < physicalCount; ropeIndex += 1) {
      const pointCount = strand.minimumPoints
        + Math.floor(random() * strand.pointVariation)
        + Math.round(overflowScale * strand.overflowPointGrowth);
      const segmentLength = strand.minimumSegmentLength + random() * strand.segmentLengthVariation;
      const ropeLength = segmentLength * (pointCount - 1);
      const spillDirection = ropeIndex >= physicalCount - spillRopeCount
        ? (ropeIndex % 2 === 0 ? -1 : 1)
        : 0;
      const spawnX = this.bowl.centerX + (random() - 0.5) * this.bowl.halfWidth * strand.spawnWidthRatio;
      const targetX = this.bowl.centerX + (spawnX - this.bowl.centerX) * 0.55;
      const spawnY = -ropeLength - random() * this.bowl.depth * strand.spawnDepthRatio;
      const phase = random() * Math.PI * 2;
      const curl = strand.minimumCurl + random() * strand.curlVariation + overflowScale * strand.overflowCurlGrowth;
      const points: Point[] = [];
      const previous: Point[] = [];

      for (let index = 0; index < pointCount; index += 1) {
        const wave = Math.sin(index * 0.22 + phase) * curl;
        const point = new Point(spawnX + wave, spawnY + index * segmentLength);
        points.push(point);
        const horizontalVelocity = (targetX - point.x) * 0.004;
        previous.push(new Point(
          point.x - horizontalVelocity - (random() - 0.5) * 0.2,
          point.y - random() * 0.3,
        ));
      }

      const colorIndex = Math.floor(random() * strand.colors.length);
      const tint = strand.colors[colorIndex] ?? strand.colors[0];
      const view = new Container({ visible: this.reducedMotion, eventMode: "none" });
      const segments: Sprite[] = [];
      for (let index = 0; index < pointCount - 1; index += 1) {
        const segment = new Sprite({ texture: this.segmentTexture });
        segment.anchor.set(0.5);
        segment.tint = tint;
        segment.height = strand.thickness;
        view.addChild(segment);
        segments.push(segment);
      }
      layer.addChild(view);

      const spawnAt = ropeIndex * strand.spawnIntervalMs + random() * strand.spawnJitterMs;
      const body: RopeBody = {
        points,
        previous,
        escapeSides: new Int8Array(pointCount),
        landed: new Uint8Array(pointCount),
        canSpill: spillDirection !== 0 || (servingSize >= 95 && ropeIndex === physicalCount - 1),
        spillDirection,
        stackOffset: this.bowl.depth * 0.6
          * Math.min(ropeIndex / Math.max(bowlRopeCount - 1, 1), 1)
          * Math.min(servingSize / serving.containedScore, 1),
        restSlope: Math.sin((ropeIndex + 1) * 2.399) * 0.035,
        restPhase: ropeIndex * 2.399,
        segments,
        view,
        segmentLength,
        spawnAt,
        active: this.reducedMotion,
        sleeping: false,
        settledAt: 0,
        idlePhase: random() * Math.PI * 2,
        idleStrength: (
          0.45
          + ropeIndex / Math.max(physicalCount - 1, 1) * 0.9
          + random() * 0.35
        ) * (spillDirection === 0 ? 1 : this.settings.settling.spillIdleScale),
      };
      this.ropes.push(body);

      if (this.reducedMotion) this.placeSettledRope(body, ropeIndex, physicalCount, random);
      this.renderRope(body);
    }
  }

  private placeSettledRope(
    body: RopeBody,
    ropeIndex: number,
    ropeCount: number,
    random: () => number,
  ): void {
    if (!this.bowl) return;
    const rowCount = Math.max(4, Math.ceil(Math.sqrt(ropeCount) * 1.5));
    const row = ropeIndex % rowCount;
    const centerX = this.bowl.centerX + (random() - 0.5) * this.bowl.halfWidth * 1.05;
    const fillRatio = Math.min(this.score / this.settings.serving.containedScore, 1);
    const baseY = this.bowl.rimY + this.bowl.depth * (0.72 - fillRatio * 0.38) - row * 4.8
      + (random() - 0.5) * 5;
    const midpoint = (body.points.length - 1) / 2;
    const wavePhase = random() * Math.PI * 2;
    const waveFrequency = 0.38 + random() * 0.24;
    const waveHeight = 2.4 + random() * 3.4;

    for (let index = 0; index < body.points.length; index += 1) {
      const offset = index - midpoint;
      const x = centerX + offset * body.segmentLength * 0.82;
      const floor = this.bowlFloorY(x);
      const y = Math.min(
        baseY + Math.sin(index * waveFrequency + wavePhase) * waveHeight,
        floor - row * 0.8,
      );
      body.points[index].set(x, y);
      body.previous[index].copyFrom(body.points[index]);
    }
  }

  private animateSettledRopes(): void {
    const settling = this.settings.settling;
    const time = this.elapsed / 1_000;
    for (const body of this.ropes) {
      if (!body.sleeping) continue;
      const blend = Math.min((this.elapsed - body.settledAt) / settling.idleBlendMs, 1);
      const drift = Math.sin(time * settling.horizontalFrequency + body.idlePhase);
      const lift = Math.abs(Math.sin(time * settling.verticalFrequency + body.idlePhase * 1.37));
      body.view.position.set(
        drift * body.idleStrength * blend,
        -lift * body.idleStrength * settling.verticalScale * blend,
      );
    }
  }

  private integrate(step: number): void {
    const physics = this.settings.physics;
    const gravity = physics.gravity * step * step;
    for (const body of this.ropes) {
      if (!body.active || body.sleeping) continue;
      const damping = this.elapsed - body.spawnAt > physics.settlingDampingAfterMs
        ? physics.settlingDamping
        : physics.damping;
      const spilling = this.bowl && body.spillDirection !== 0
        && body.points[body.points.length - 1].y >= this.bowl.rimY - this.bowl.depth * 0.4;
      for (let index = 0; index < body.points.length; index += 1) {
        const point = body.points[index];
        const previous = body.previous[index];
        const velocityX = (point.x - previous.x) * damping;
        const verticalDamping = body.escapeSides[index] !== 0 && body.landed[index] === 0
          ? 0.985
          : damping;
        const velocityY = (point.y - previous.y) * verticalDamping;
        previous.copyFrom(point);
        point.x += velocityX + (spilling ? body.spillDirection * physics.spillForce * step * step : 0);
        point.y += velocityY + gravity;
      }
    }
  }

  private constrainRope(body: RopeBody): void {
    for (let index = 0; index < body.points.length - 1; index += 1) {
      const first = body.points[index];
      const second = body.points[index + 1];
      const deltaX = second.x - first.x;
      const deltaY = second.y - first.y;
      const distance = Math.hypot(deltaX, deltaY) || 0.0001;
      const correction = (distance - body.segmentLength) / distance * 0.5;
      first.x += deltaX * correction;
      first.y += deltaY * correction;
      second.x -= deltaX * correction;
      second.y -= deltaY * correction;
    }
  }

  private constrainBend(body: RopeBody): void {
    this.constrainChord(body, 2, body.segmentLength * 1.9, 0.18);
    this.constrainChord(body, 4, body.segmentLength * 3.4, 0.07);
  }

  private constrainChord(body: RopeBody, span: number, minimum: number, stiffness: number): void {
    for (let index = 0; index < body.points.length - span; index += 1) {
      const first = body.points[index];
      const last = body.points[index + span];
      const deltaX = last.x - first.x;
      const deltaY = last.y - first.y;
      const distance = Math.hypot(deltaX, deltaY) || 0.0001;
      if (distance >= minimum) continue;

      const correction = (minimum - distance) / distance * stiffness;
      first.x -= deltaX * correction;
      first.y -= deltaY * correction;
      last.x += deltaX * correction;
      last.y += deltaY * correction;
    }
  }

  private collideWithBowl(body: RopeBody): void {
    const bowl = this.bowl;
    if (!bowl) return;
    const bowlSettings = this.settings.bowl;
    const innerHalfWidth = bowl.halfWidth * bowlSettings.innerWidthRatio;
    const centerDepth = bowl.depth * bowlSettings.floorDepthRatio;
    for (let index = 0; index < body.points.length; index += 1) {
      this.collidePointWithBowl(body, index, bowl, innerHalfWidth, centerDepth);
    }
  }

  private collidePointWithBowl(
    body: RopeBody,
    index: number,
    bowl: BowlBounds,
    innerHalfWidth: number,
    centerDepth: number,
  ): void {
    const point = body.points[index];
    const previous = body.previous[index];
    let horizontal = point.x - bowl.centerX;
    let outsideBowl = Math.abs(horizontal) >= innerHalfWidth;
    if (!body.canSpill && outsideBowl) {
      point.x = bowl.centerX + Math.sign(horizontal) * (innerHalfWidth - 0.5);
      previous.x = point.x;
      horizontal = point.x - bowl.centerX;
      outsideBowl = false;
    }

    this.updateEscapeSide(body, index, horizontal, outsideBowl, bowl);
    const escapeSide = body.escapeSides[index];
    if (escapeSide !== 0) {
      const wasLanded = body.landed[index] !== 0;
      if (this.collideEscapedPoint(
        point,
        previous,
        bowl,
        innerHalfWidth,
        escapeSide,
        wasLanded,
      )) {
        body.landed[index] = 1;
      }
      return;
    }
    if (outsideBowl) return;
    this.collideContainedPoint(body, index, bowl, horizontal, innerHalfWidth, centerDepth);
  }

  private updateEscapeSide(
    body: RopeBody,
    index: number,
    horizontal: number,
    outsideBowl: boolean,
    bowl: BowlBounds,
  ): void {
    if (body.escapeSides[index] === 0 && outsideBowl && body.points[index].y >= bowl.rimY - 2) {
      body.escapeSides[index] = horizontal < 0 ? -1 : 1;
    }
  }

  private collideEscapedPoint(
    point: Point,
    previous: Point,
    bowl: BowlBounds,
    innerHalfWidth: number,
    escapeSide: number,
    wasLanded: boolean,
  ): boolean {
    if (!wasLanded) {
      this.keepEscapedPointBeyondRim(point, previous, bowl, escapeSide, innerHalfWidth);
    }
    return this.collideWithCanvasFloor(point, previous, wasLanded);
  }

  private keepEscapedPointBeyondRim(
    point: Point,
    previous: Point,
    bowl: BowlBounds,
    escapeSide: number,
    innerHalfWidth: number,
  ): void {
    const edgeX = bowl.centerX + escapeSide * innerHalfWidth;
    if ((point.x - edgeX) * escapeSide >= 0) return;
    point.x = edgeX;
    previous.x = edgeX;
  }

  private collideContainedPoint(
    body: RopeBody,
    index: number,
    bowl: BowlBounds,
    horizontal: number,
    innerHalfWidth: number,
    centerDepth: number,
  ): void {
    const point = body.points[index];
    const previous = body.previous[index];
    const bowlFloor = this.bowlFloorY(point.x);
    const layerWave = horizontal / innerHalfWidth * Math.PI * 1.5 + body.restPhase;
    const layerFloor = bowl.rimY + bowl.depth * this.settings.bowl.floorDepthRatio - body.stackOffset
      + horizontal * body.restSlope + Math.sin(layerWave) * 3;
    const usingLayer = layerFloor < bowlFloor;
    const floor = usingLayer ? layerFloor : bowlFloor;
    if (point.y <= floor) return;

    const velocityX = point.x - previous.x;
    const velocityY = point.y - previous.y;
    const slope = usingLayer
      ? body.restSlope + Math.cos(layerWave) * 3 * Math.PI * 1.5 / innerHalfWidth
      : -2 * centerDepth * horizontal / (innerHalfWidth * innerHalfWidth);
    const inverseNormalLengthSquared = 1 / (1 + slope * slope);
    const penetration = point.y - floor;
    point.x += penetration * slope * inverseNormalLengthSquared;
    point.y -= penetration * inverseNormalLengthSquared;

    const inverseTangentLength = 1 / Math.sqrt(1 + slope * slope);
    const tangentX = inverseTangentLength;
    const tangentY = slope * inverseTangentLength;
    const surfaceFriction = body.spillDirection === 0
      ? this.settings.physics.containedFriction
      : this.settings.physics.spillFriction;
    const tangentVelocity = (velocityX * tangentX + velocityY * tangentY) * surfaceFriction;
    previous.x = point.x - tangentX * tangentVelocity;
    previous.y = point.y - tangentY * tangentVelocity;
  }

  private collideWithCanvasFloor(point: Point, previous: Point, stayGrounded = false): boolean {
    const horizontalVelocity = point.x - previous.x;
    const margin = 12;
    const rightEdge = this.sceneWidth - margin;
    let hitSide = false;
    if (point.x < margin) {
      point.x = margin;
      hitSide = true;
    } else if (point.x > rightEdge) {
      point.x = rightEdge;
      hitSide = true;
    }

    const groundY = this.sceneHeight - 12;
    if (!stayGrounded && point.y <= groundY) {
      if (hitSide) previous.x = point.x;
      return false;
    }

    point.y = groundY;
    previous.y = groundY;
    const friction = stayGrounded ? 0.25 : 0.4;
    previous.x = hitSide ? point.x : point.x - horizontalVelocity * friction;
    return true;
  }

  private bowlFloorY(x: number): number {
    if (!this.bowl) return Number.POSITIVE_INFINITY;
    const bowlSettings = this.settings.bowl;
    const innerHalfWidth = this.bowl.halfWidth * bowlSettings.innerWidthRatio;
    const horizontal = x - this.bowl.centerX;
    if (Math.abs(horizontal) >= innerHalfWidth) return Number.POSITIVE_INFINITY;
    const normalizedX = horizontal / innerHalfWidth;
    return this.bowl.rimY + 4
      + this.bowl.depth * bowlSettings.floorDepthRatio * (1 - normalizedX * normalizedX);
  }

  private renderRope(body: RopeBody): void {
    for (let index = 0; index < body.segments.length; index += 1) {
      const first = body.points[index];
      const second = body.points[index + 1];
      const deltaX = second.x - first.x;
      const deltaY = second.y - first.y;
      const segment = body.segments[index];
      segment.position.set((first.x + second.x) / 2, (first.y + second.y) / 2);
      segment.rotation = Math.atan2(deltaY, deltaX);
      segment.width = Math.hypot(deltaX, deltaY) + this.settings.render.segmentOverlap;
    }
  }
}

function randomGenerator(seed: number): () => number {
  let value = Math.max(1, seed >>> 0);
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}
