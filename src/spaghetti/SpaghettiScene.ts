import {
  ColliderDesc,
  SoftBodyDesc,
  World,
  type SoftBody,
} from "@dimforge/rapier2d-compat";
import {
  Container,
  FillGradient,
  Graphics,
  MeshRope,
  Point,
  Sprite,
  Texture,
  type DestroyOptions,
  type RopeGeometry,
  type Ticker,
} from "pixi.js";
import { SPAGHETTI_SETTINGS, type SpaghettiSettings } from "./settings";
import type { BowlBounds } from "./geometry";

interface RopeBody {
  points: Point[];
  body: SoftBody | undefined;
  particleCount: number;
  ropeLength: number;
  collisionGroups: number;
  spawnX: number;
  spawnY: number;
  targetX: number;
  phase: number;
  curl: number;
  view: MeshRope;
  caps: [Sprite, Sprite];
  spawnAt: number;
  active: boolean;
}


export class SpaghettiScene extends Container {
  private readonly settings: SpaghettiSettings;
  private readonly segmentTexture: Texture;
  private readonly ownsSegmentTexture: boolean;
  private readonly capTexture: Texture;
  private readonly ownsCapTexture: boolean;
  private bowl: BowlBounds | undefined;
  private bowlBack: Container | undefined;
  private bowlFront: Container | undefined;
  private world: World | undefined;
  private ropes: RopeBody[] = [];
  private elapsed = 0;
  private accumulator = 0;
  private score = 0;
  private reducedMotion = false;
  private activeRopeCount = 0;
  private readonly impulseCenter = { x: 0, y: 0 };

  constructor(settings: SpaghettiSettings = SPAGHETTI_SETTINGS) {
    super({ label: "spaghetti-scene", eventMode: "none" });
    this.settings = settings;
    const texture = this.createSegmentTexture();
    this.segmentTexture = texture.texture;
    this.ownsSegmentTexture = texture.owned;
    const capTexture = this.createCapTexture();
    this.capTexture = capTexture.texture;
    this.ownsCapTexture = capTexture.owned;
  }

  get productionProgress(): number {
    if (this.reducedMotion || this.ropes.length === 0) return 1;
    return this.activeRopeCount / this.ropes.length;
  }

  setBowlVisualOffset(offsetX: number): void {
    if (this.bowlBack) this.bowlBack.x = offsetX;
    if (this.bowlFront) this.bowlFront.x = offsetX;
  }

  applyRadialImpulse(x: number, y: number, magnitude: number, radius: number): void {
    if (this.reducedMotion || !this.world || magnitude <= 0 || radius <= 0) return;
    const scale = this.settings.physics.pixelsPerMeter;
    this.impulseCenter.x = x / scale;
    this.impulseCenter.y = y / scale;
    const radiusInMeters = radius / scale;
    for (const rope of this.ropes) {
      if (!rope.active || !rope.body) continue;
      rope.body.applyRadialImpulse(
        this.impulseCenter,
        magnitude,
        radiusInMeters,
        true,
      );
    }
  }

  rebuild(
    width: number,
    height: number,
    bowl: BowlBounds,
    score: number,
    scanning: boolean,
    reducedMotion: boolean,
  ): void {
    if (width < 2 || height < 2) return;

    for (const child of this.removeChildren()) {
      child.destroy({ children: true });
    }
    this.world?.free();
    this.world = undefined;
    this.ropes = [];
    this.bowlBack = undefined;
    this.bowlFront = undefined;
    this.elapsed = 0;
    this.accumulator = 0;
    this.activeRopeCount = 0;
    this.score = Math.max(0, Math.floor(score));
    this.reducedMotion = reducedMotion;

    this.bowl = bowl;

    if (!reducedMotion) this.world = this.createPhysicsWorld(width, height);
    this.drawBowlBack();
    const ropeLayer = new Container({ label: "spaghetti-ropes", eventMode: "none" });
    this.addChild(ropeLayer);
    if (this.score > 0) this.createRopes(ropeLayer, this.score);
    if (this.reducedMotion) this.activeRopeCount = this.ropes.length;
    this.drawBowlOutline();
    if (scanning) this.drawScanningRing();
  }

  update(ticker: Ticker): void {
    if (this.reducedMotion || this.ropes.length === 0 || !this.world) return;

    this.elapsed += ticker.deltaMS;
    const activated = this.activateRopes();
    const physics = this.settings.physics;
    this.accumulator += Math.min(ticker.deltaMS / 1_000, physics.maximumFrameSeconds);
    let steps = 0;
    while (this.accumulator >= physics.timeStep && steps < physics.maximumSubSteps) {
      this.world.step();
      this.accumulator -= physics.timeStep;
      steps += 1;
    }
    if (steps === physics.maximumSubSteps) {
      this.accumulator = Math.min(this.accumulator, physics.timeStep);
    }
    if (steps > 0 || activated) this.renderPhysicsRopes();
  }

  dispose(): void {
    for (const child of this.removeChildren()) {
      child.destroy({ children: true });
    }
    this.world?.free();
    this.world = undefined;
    this.ropes = [];
    this.bowlBack = undefined;
    this.bowlFront = undefined;
    this.activeRopeCount = 0;
    if (this.ownsSegmentTexture) this.segmentTexture.destroy(true);
    if (this.ownsCapTexture) this.capTexture.destroy(true);
    super.destroy({ children: false } as DestroyOptions);
  }

  private createPhysicsWorld(width: number, height: number): World {
    if (!this.bowl) throw new Error("Bowl geometry must exist before creating physics");
    const physics = this.settings.physics;
    const world = new World({ x: 0, y: physics.gravity });
    world.timestep = physics.timeStep;
    world.integrationParameters.numSolverIterations = physics.solverIterations;
    world.integrationParameters.numInternalPgsIterations = physics.internalPgsIterations;
    world.integrationParameters.softBodiesMaxExtraSubsteps = physics.maximumExtraSubsteps;

    const scale = physics.pixelsPerMeter;
    const innerHalfWidth = this.bowl.halfWidth * this.settings.bowl.innerWidthRatio;
    const left = this.bowl.centerX - innerHalfWidth;
    const bowlVertices = new Float32Array((this.settings.bowl.physicsSegments + 1) * 2);
    for (let index = 0; index <= this.settings.bowl.physicsSegments; index += 1) {
      const progress = index / this.settings.bowl.physicsSegments;
      const x = left + progress * innerHalfWidth * 2;
      bowlVertices[index * 2] = x / scale;
      bowlVertices[index * 2 + 1] = this.bowlFloorY(x) / scale;
    }
    world.createCollider(
      ColliderDesc.polyline(bowlVertices)
        .setFriction(physics.friction)
        .setRestitution(0),
    );
    const boundaryInset = physics.viewportBoundaryInset;
    const boundaryThickness = physics.viewportBoundaryThickness;
    const wallHalfHeight = (height - boundaryInset) / 2 + boundaryThickness;
    const wallCenterY = (height - boundaryInset) / 2;
    const createBoundary = (
      halfWidth: number,
      halfHeight: number,
      centerX: number,
      centerY: number,
    ): void => {
      world.createCollider(
        ColliderDesc.cuboid(halfWidth / scale, halfHeight / scale)
          .setTranslation(centerX / scale, centerY / scale)
          .setFriction(physics.friction)
          .setRestitution(0),
      );
    };
    createBoundary(
      boundaryThickness,
      wallHalfHeight,
      boundaryInset - boundaryThickness,
      wallCenterY,
    );
    createBoundary(
      boundaryThickness,
      wallHalfHeight,
      width - boundaryInset + boundaryThickness,
      wallCenterY,
    );
    createBoundary(
      width / 2 + boundaryThickness,
      boundaryThickness,
      width / 2,
      height - boundaryInset + boundaryThickness,
    );
    return world;
  }

  private drawBowlBack(): void {
    if (!this.bowl) return;
    const { centerX, rimY, halfWidth, depth } = this.bowl;
    const openingFill = new FillGradient({
      type: "linear",
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0xcfd2d2 },
        { offset: 0.5, color: 0xe9eaea },
        { offset: 1, color: 0xfafafa },
      ],
    });
    const footFill = new FillGradient({
      type: "linear",
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0xf2f3f3 },
        { offset: 1, color: 0xd7d9d9 },
      ],
    });

    const shadow = new Graphics()
      .ellipse(centerX, rimY + depth * 1.08, halfWidth * 0.68, depth * 0.075)
      .fill({ color: 0x6d7272, alpha: 0.16 });
    const footWidth = halfWidth * 0.4;
    const foot = new Graphics()
      .roundRect(
        centerX - footWidth / 2,
        rimY + depth * 0.89,
        footWidth,
        depth * 0.17,
        depth * 0.045,
      )
      .fill(footFill)
      .stroke({ color: 0xc7caca, alpha: 0.8, width: 1 });
    const opening = new Graphics()
      .ellipse(centerX, rimY, halfWidth, depth * 0.09)
      .fill(openingFill)
      .stroke({ color: 0xd7dada, width: 1.5 });

    const back = new Container({ label: "bowl-back", eventMode: "none" });
    back.addChild(shadow, foot, opening);
    this.bowlBack = back;
    this.addChild(back);
  }

  private drawBowlOutline(): void {
    if (!this.bowl) return;
    const { centerX, rimY, halfWidth, depth } = this.bowl;
    const left = centerX - halfWidth;
    const right = centerX + halfWidth;
    const ceramicFill = new FillGradient({
      type: "linear",
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0xffffff },
        { offset: 0.48, color: 0xf5f6f6 },
        { offset: 0.82, color: 0xe5e7e7 },
        { offset: 1, color: 0xd2d5d5 },
      ],
    });

    const body = new Graphics()
      .moveTo(left, rimY)
      .quadraticCurveTo(centerX, rimY + depth * 0.11, right, rimY)
      .bezierCurveTo(
        right - halfWidth * 0.03,
        rimY + depth * 0.48,
        centerX + halfWidth * 0.48,
        rimY + depth * 0.88,
        centerX + halfWidth * 0.2,
        rimY + depth * 0.95,
      )
      .quadraticCurveTo(
        centerX,
        rimY + depth,
        centerX - halfWidth * 0.2,
        rimY + depth * 0.95,
      )
      .bezierCurveTo(
        centerX - halfWidth * 0.48,
        rimY + depth * 0.88,
        left + halfWidth * 0.03,
        rimY + depth * 0.48,
        left,
        rimY,
      )
      .closePath()
      .fill(ceramicFill)
      .stroke({ color: 0xcfd2d2, width: 1.5, join: "round" });
    const rim = new Graphics()
      .moveTo(left, rimY)
      .quadraticCurveTo(centerX, rimY + depth * 0.11, right, rimY)
      .stroke({ color: 0xc6caca, width: 2, cap: "round" });
    const highlight = new Graphics()
      .moveTo(left + halfWidth * 0.14, rimY + depth * 0.1)
      .bezierCurveTo(
        left + halfWidth * 0.2,
        rimY + depth * 0.28,
        centerX - halfWidth * 0.48,
        rimY + depth * 0.5,
        centerX - halfWidth * 0.3,
        rimY + depth * 0.66,
      )
      .stroke({ color: 0xffffff, alpha: 0.9, width: 5, cap: "round" });

    const front = new Container({ label: "bowl-front", eventMode: "none" });
    front.addChild(body, rim, highlight);
    this.bowlFront = front;
    this.addChild(front);
  }

  private drawScanningRing(): void {
    if (!this.bowl) return;
    const ring = new Graphics()
      .ellipse(this.bowl.centerX, this.bowl.rimY, this.bowl.halfWidth * 0.62, this.bowl.depth * 0.08)
      .stroke({ color: 0xffd55a, alpha: 0.48, width: 2 });
    this.bowlFront?.addChild(ring);
  }

  private createSegmentTexture(): { texture: Texture; owned: boolean } {
    const canvas = document.createElement("canvas");
    canvas.width = this.settings.render.textureWidth;
    canvas.height = this.settings.render.textureHeight;
    const context = canvas.getContext("2d");
    if (!context) return { texture: Texture.WHITE, owned: false };

    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return { texture: Texture.from(canvas), owned: true };
  }

  private createCapTexture(): { texture: Texture; owned: boolean } {
    const canvas = document.createElement("canvas");
    const size = this.settings.render.capTextureSize;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return { texture: Texture.WHITE, owned: false };

    context.fillStyle = "white";
    context.beginPath();
    context.arc(size / 2, size / 2, size / 2 - 0.5, 0, Math.PI * 2);
    context.fill();
    return { texture: Texture.from(canvas), owned: true };
  }

  private createCap(tint: number): Sprite {
    const cap = new Sprite({
      texture: this.capTexture,
      tint,
      visible: this.reducedMotion,
      eventMode: "none",
    });
    cap.anchor.set(0.5);
    cap.width = this.settings.strand.thickness;
    cap.height = this.settings.strand.thickness;
    return cap;
  }

  private createRopes(layer: Container, servingSize: number): void {
    if (!this.bowl) return;
    const serving = this.settings.serving;
    const strand = this.settings.strand;
    const containedScore = Math.min(servingSize, serving.containedScore);
    const overflowScore = Math.max(0, servingSize - serving.containedScore);
    const physicalCount = Math.round(
      serving.baseCount
        + containedScore * serving.containedGrowth
        + overflowScore * serving.overflowGrowth,
    );
    const overflowScale = Math.min(serving.overflowScaleLimit, overflowScore / serving.containedScore);
    const random = randomGenerator(this.score * 149 + (overflowScore > 0 ? 997 : 0));

    for (let ropeIndex = 0; ropeIndex < physicalCount; ropeIndex += 1) {
      const renderPointCount = strand.minimumRenderPoints
        + Math.floor(random() * strand.renderPointVariation);
      const ropeLength = strand.minimumLength
        + containedScore / serving.containedScore * strand.containedLengthGrowth
        + random() * strand.lengthVariation
        + overflowScale * strand.overflowLengthGrowth;
      const spawnWidthRatio = strand.spawnWidthRatio + overflowScale * strand.overflowSpawnWidthGrowth;
      const spawnX = this.bowl.centerX + (random() - 0.5) * this.bowl.halfWidth * spawnWidthRatio;
      const targetWidthRatio = strand.targetWidthRatio + overflowScale * strand.overflowTargetWidthGrowth;
      const targetX = this.bowl.centerX + (spawnX - this.bowl.centerX) * targetWidthRatio;
      const spawnY = -ropeLength - random() * this.bowl.depth * strand.spawnDepthRatio;
      const phase = random() * Math.PI * 2;
      const curl = strand.minimumCurl + random() * strand.curlVariation + overflowScale * strand.overflowCurlGrowth;
      const points = Array.from({ length: renderPointCount }, () => new Point());
      const colorIndex = Math.floor(random() * strand.colors.length);
      const tint = strand.colors[colorIndex] ?? strand.colors[0];
      const view = new MeshRope({
        texture: this.segmentTexture,
        points,
        width: strand.thickness,
        tint,
        visible: this.reducedMotion,
        eventMode: "none",
      });
      view.autoUpdate = false;
      const caps: [Sprite, Sprite] = [this.createCap(tint), this.createCap(tint)];
      layer.addChild(view, ...caps);
      const collisionMembership = 2 ** (ropeIndex % strand.collisionLayerCount);

      const body: RopeBody = {
        points,
        body: undefined,
        particleCount: strand.particleCount,
        ropeLength,
        collisionGroups: collisionMembership * 0x10000 + collisionMembership,
        spawnX,
        spawnY,
        targetX,
        phase,
        curl,
        view,
        caps,
        spawnAt: ropeIndex * strand.spawnIntervalMs + random() * strand.spawnJitterMs,
        active: this.reducedMotion,
      };
      this.ropes.push(body);

      if (this.reducedMotion) {
        this.placeSettledRope(body, ropeIndex, physicalCount, random);
        this.updateRopeCaps(body);
        (view.geometry as RopeGeometry).update();
      }
    }
  }

  private createPhysicsRope(rope: RopeBody): SoftBody | undefined {
    if (!this.world) return undefined;
    const strand = this.settings.strand;
    const physics = this.settings.physics;
    const scale = physics.pixelsPerMeter;
    const collisionRadius = (strand.thickness / 2 + strand.collisionPadding) / scale;
    const body = this.world.createSoftBody(
      SoftBodyDesc.rope(
        { x: rope.spawnX / scale, y: rope.spawnY / scale },
        { x: rope.spawnX / scale, y: (rope.spawnY + rope.ropeLength) / scale },
        rope.particleCount,
      )
        .setSoftness(physics.softnessFrequency, physics.softnessDampingRatio)
        .setParticleMass(physics.particleMass)
        .setParticleRadius(collisionRadius)
        .setLinearDamping(physics.linearDamping)
        .setSelfContacts(true)
        .setCanSleep(true)
        .setSurfaceCollider(
          ColliderDesc.ball(collisionRadius)
            .setFriction(physics.friction)
            .setCollisionGroups(rope.collisionGroups)
            .setRestitution(0),
        ),
    );

    for (let index = 0; index < rope.particleCount; index += 1) {
      const progress = index / (rope.particleCount - 1);
      const wave = Math.sin(index * 0.48 + rope.phase) * rope.curl;
      const x = rope.spawnX + wave;
      body.setParticlePosition(index, {
        x: x / scale,
        y: (rope.spawnY + progress * rope.ropeLength) / scale,
      });
      body.setParticleVelocity(index, {
        x: (rope.targetX - x) / scale * 0.2,
        y: 0,
      });
    }
    return body;
  }

  private activateRopes(): boolean {
    let activated = false;
    for (const rope of this.ropes) {
      if (rope.active || this.elapsed < rope.spawnAt) continue;
      rope.body = this.createPhysicsRope(rope);
      if (!rope.body) continue;
      rope.active = true;
      this.activeRopeCount += 1;
      rope.view.visible = true;
      rope.caps[0].visible = true;
      rope.caps[1].visible = true;
      activated = true;
    }
    return activated;
  }

  private renderPhysicsRopes(): void {
    for (const rope of this.ropes) {
      if (!rope.active || !rope.body || rope.body.isSleeping()) continue;
      this.updateRenderPoints(rope);
      (rope.view.geometry as RopeGeometry).update();
      this.updateRopeCaps(rope);
    }
  }

  private updateRenderPoints(rope: RopeBody): void {
    if (!rope.body) return;
    const scale = this.settings.physics.pixelsPerMeter;
    const positions = rope.body.particlePositions();
    const maximumParticleIndex = positions.length / 2 - 1;
    const maximumPointIndex = rope.points.length - 1;
    for (let index = 0; index < rope.points.length; index += 1) {
      const particlePosition = index / maximumPointIndex * maximumParticleIndex;
      const particleIndex = Math.min(Math.floor(particlePosition), maximumParticleIndex - 1);
      const progress = particlePosition - particleIndex;
      const progressSquared = progress * progress;
      const progressCubed = progressSquared * progress;
      const previousIndex = Math.max(0, particleIndex - 1) * 2;
      const firstIndex = particleIndex * 2;
      const secondIndex = Math.min(maximumParticleIndex, particleIndex + 1) * 2;
      const nextIndex = Math.min(maximumParticleIndex, particleIndex + 2) * 2;
      const previousX = positions[previousIndex];
      const previousY = positions[previousIndex + 1];
      const firstX = positions[firstIndex];
      const firstY = positions[firstIndex + 1];
      const secondX = positions[secondIndex];
      const secondY = positions[secondIndex + 1];
      const nextX = positions[nextIndex];
      const nextY = positions[nextIndex + 1];
      rope.points[index].set(
        0.5 * (
          2 * firstX
          + (-previousX + secondX) * progress
          + (2 * previousX - 5 * firstX + 4 * secondX - nextX) * progressSquared
          + (-previousX + 3 * firstX - 3 * secondX + nextX) * progressCubed
        ) * scale,
        0.5 * (
          2 * firstY
          + (-previousY + secondY) * progress
          + (2 * previousY - 5 * firstY + 4 * secondY - nextY) * progressSquared
          + (-previousY + 3 * firstY - 3 * secondY + nextY) * progressCubed
        ) * scale,
      );
    }
  }

  private updateRopeCaps(rope: RopeBody): void {
    const lastPoint = rope.points[rope.points.length - 1];
    if (!lastPoint) return;
    rope.caps[0].position.copyFrom(rope.points[0]);
    rope.caps[1].position.copyFrom(lastPoint);
  }


  private placeSettledRope(
    rope: RopeBody,
    ropeIndex: number,
    ropeCount: number,
    random: () => number,
  ): void {
    if (!this.bowl) return;
    const rowCount = Math.max(4, Math.ceil(Math.sqrt(ropeCount) * 1.5));
    const row = ropeIndex % rowCount;
    const centerX = this.bowl.centerX + (random() - 0.5) * this.bowl.halfWidth * 1.05;
    const scoreRatio = this.score / this.settings.serving.containedScore;
    const interiorHeight = this.bowl.depth * 0.72;
    const overflowHeight = this.bowl.depth * 0.35 * Math.max(0, scoreRatio - 1);
    const occupiedHeight = interiorHeight * Math.min(scoreRatio, 1) + overflowHeight;
    const rowSpacing = occupiedHeight / Math.max(1, rowCount - 1);
    const pileLift = this.bowl.depth * 0.24 * Math.min(scoreRatio, 1);
    const baseY = this.bowl.rimY + interiorHeight - pileLift - row * rowSpacing
      + (random() - 0.5) * 5;
    const midpoint = (rope.points.length - 1) / 2;
    const wavePhase = random() * Math.PI * 2;
    const waveFrequency = 0.38 + random() * 0.24;
    const waveHeight = 2.4 + random() * 3.4;
    const renderSpacing = rope.ropeLength / (rope.points.length - 1) * 0.82;

    for (let index = 0; index < rope.points.length; index += 1) {
      const offset = index - midpoint;
      const x = centerX + offset * renderSpacing;
      const floor = this.bowlFloorY(x);
      const y = Math.min(
        baseY + Math.sin(index * waveFrequency + wavePhase) * waveHeight,
        floor - row * 0.8,
      );
      rope.points[index].set(x, y);
    }
  }

  private bowlFloorY(x: number): number {
    if (!this.bowl) return Number.POSITIVE_INFINITY;
    const bowlSettings = this.settings.bowl;
    const innerHalfWidth = this.bowl.halfWidth * bowlSettings.innerWidthRatio;
    const horizontal = x - this.bowl.centerX;
    if (Math.abs(horizontal) > innerHalfWidth) return Number.POSITIVE_INFINITY;
    const normalizedX = horizontal / innerHalfWidth;
    return this.bowl.rimY + 4
      + this.bowl.depth * bowlSettings.floorDepthRatio * (1 - normalizedX * normalizedX);
  }

}

function randomGenerator(seed: number): () => number {
  let value = Math.max(1, seed >>> 0);
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}
