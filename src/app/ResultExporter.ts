import { message, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { Application } from "pixi.js";
import type { BowlScene } from "../scenes/BowlScene";
import type { ExportFormat } from "../ui/ExportMenu";
import { COLORS } from "../ui/theme";
import type { ScanReport } from "./types";

const GIF_FRAMES_PER_SECOND = 20;
const GIF_FRAME_DELAY_MS = 1_000 / GIF_FRAMES_PER_SECOND;
const GIF_MAX_DIMENSION = 720;
const VIDEO_MAX_DIMENSION = 1_280;
const VIDEO_FRAMES_PER_SECOND = 30;
const RESULT_HOLD_MS = 650;
const EXPORT_TIMEOUT_MS = 30_000;

interface VideoEncoding {
  readonly mimeType: string;
  readonly extension: "webm" | "mp4";
  readonly filterName: string;
}

interface CaptureSurface {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
}

interface GifWorkerCompleteMessage {
  readonly type: "complete";
  readonly bytes: ArrayBuffer;
}

interface GifWorkerErrorMessage {
  readonly type: "error";
  readonly message: string;
}

type GifWorkerResponse = GifWorkerCompleteMessage | GifWorkerErrorMessage;

export class ResultExporter {
  constructor(
    private readonly app: Application,
    private readonly bowlScene: BowlScene,
    private readonly setChromeVisible: (visible: boolean) => void,
  ) {}

  async export(format: ExportFormat, report: ScanReport): Promise<void> {
    try {
      const videoEncoding = format === "video" ? selectVideoEncoding() : undefined;
      const extension = format === "image" ? "png" : format === "gif" ? "gif" : videoEncoding!.extension;
      const filename = resultFilename(report, extension);
      const destination = await save({
        title: `Export Spaghetti Meter ${format}`,
        defaultPath: filename,
        filters: [{
          name: format === "image"
            ? "PNG image"
            : format === "gif"
              ? "Animated GIF"
              : videoEncoding!.filterName,
          extensions: [extension],
        }],
      });
      if (!destination) return;

      this.setChromeVisible(false);
      await nextAnimationFrame();
      try {
        const bytes = format === "image"
          ? await this.capturePng()
          : format === "gif"
            ? await this.captureGif()
            : await this.captureVideo(videoEncoding!);
        await writeFile(destination, bytes);
      } finally {
        this.setChromeVisible(true);
      }
    } catch (error) {
      if (isCancellation(error)) return;
      console.error(`Could not export the result as ${format}`, error);
      await message(`Could not export the result as ${format}.\n\n${String(error)}`, {
        title: "Spaghetti Meter",
        kind: "error",
      });
    }
  }

  private async capturePng(): Promise<Uint8Array> {
    const canvas = this.app.renderer.extract.canvas({
      target: this.app.stage,
      frame: this.app.screen,
      resolution: this.app.renderer.resolution,
      antialias: true,
      clearColor: COLORS.background,
    });
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("The extracted result is not backed by an HTML canvas");
    }
    const blob = await canvasToBlob(canvas, "image/png");
    return new Uint8Array(await blob.arrayBuffer());
  }

  private async captureGif(): Promise<Uint8Array> {
    const surface = createCaptureSurface(this.app, GIF_MAX_DIMENSION);
    const worker = new Worker(new URL("../workers/gifEncoderWorker.ts", import.meta.url), {
      type: "module",
    });
    const completed = new Promise<Uint8Array>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<GifWorkerResponse>) => {
        if (event.data.type === "complete") {
          resolve(new Uint8Array(event.data.bytes));
        } else {
          reject(new Error(event.data.message));
        }
      };
      worker.onerror = (event) => reject(new Error(event.message));
    });
    worker.postMessage({ type: "start" });

    let lastFrameAt = Number.NEGATIVE_INFINITY;
    const sendFrame = (now: number, force = false): void => {
      if (!force && now - lastFrameAt < GIF_FRAME_DELAY_MS) return;
      drawCaptureSurface(this.app, surface);
      const image = surface.context.getImageData(
        0,
        0,
        surface.canvas.width,
        surface.canvas.height,
      );
      const rgba = image.data.buffer as ArrayBuffer;
      worker.postMessage({
        type: "frame",
        rgba,
        width: surface.canvas.width,
        height: surface.canvas.height,
        delay: GIF_FRAME_DELAY_MS,
      }, [rgba]);
      lastFrameAt = now;
    };

    try {
      await this.replayAndCapture(sendFrame);
      sendFrame(performance.now(), true);
      worker.postMessage({ type: "finish" });
      return await completed;
    } finally {
      worker.terminate();
    }
  }

  private async captureVideo(encoding: VideoEncoding): Promise<Uint8Array> {
    const surface = createCaptureSurface(this.app, VIDEO_MAX_DIMENSION);
    drawCaptureSurface(this.app, surface);
    const stream = surface.canvas.captureStream(VIDEO_FRAMES_PER_SECOND);
    try {
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: encoding.mimeType,
        videoBitsPerSecond: 6_000_000,
      });
      const completed = new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onerror = () => reject(new Error("The browser video encoder failed"));
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: encoding.mimeType });
          if (blob.size === 0) {
            reject(new Error("The browser video encoder produced an empty file"));
          } else {
            resolve(blob);
          }
        };
      });

      recorder.start(250);
      let replayError: unknown;
      try {
        await this.replayAndCapture(() => drawCaptureSurface(this.app, surface));
        drawCaptureSurface(this.app, surface);
      } catch (error) {
        replayError = error;
      } finally {
        if (recorder.state !== "inactive") recorder.stop();
      }

      const blob = await completed;
      if (replayError) throw replayError;
      return new Uint8Array(await blob.arrayBuffer());
    } finally {
      for (const track of stream.getTracks()) track.stop();
    }
  }

  private async replayAndCapture(captureFrame: (now: number) => void): Promise<void> {
    if (!this.bowlScene.replayResult()) {
      throw new Error("The result is not ready to replay");
    }
    const startedAt = performance.now();
    let settledAt: number | undefined;
    while (true) {
      const now = await nextAnimationFrame();
      captureFrame(now);
      if (this.bowlScene.resultReady) {
        settledAt ??= now;
        if (now - settledAt >= RESULT_HOLD_MS) return;
      }
      if (now - startedAt >= EXPORT_TIMEOUT_MS) {
        throw new Error("The result animation did not finish within 30 seconds");
      }
    }
  }
}

function createCaptureSurface(app: Application, maximumDimension: number): CaptureSurface {
  const scale = Math.min(1, maximumDimension / Math.max(app.screen.width, app.screen.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(app.screen.width * scale));
  canvas.height = Math.max(1, Math.round(app.screen.height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Could not create the export canvas");
  return { canvas, context };
}

function drawCaptureSurface(app: Application, surface: CaptureSurface): void {
  // WebGL's default backbuffer is transient; render immediately before copying it.
  app.renderer.render({ container: app.stage });
  surface.context.drawImage(
    app.canvas,
    0,
    0,
    surface.canvas.width,
    surface.canvas.height,
  );
}

function selectVideoEncoding(): VideoEncoding {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This system WebView does not provide video recording");
  }
  const formats: readonly VideoEncoding[] = [
    { mimeType: "video/webm;codecs=vp9", extension: "webm", filterName: "WebM video" },
    { mimeType: "video/webm;codecs=vp8", extension: "webm", filterName: "WebM video" },
    { mimeType: "video/webm", extension: "webm", filterName: "WebM video" },
    { mimeType: "video/mp4;codecs=avc1.42E01E", extension: "mp4", filterName: "MP4 video" },
    { mimeType: "video/mp4", extension: "mp4", filterName: "MP4 video" },
  ];
  const encoding = formats.find((format) => MediaRecorder.isTypeSupported(format.mimeType));
  if (!encoding) throw new Error("This system WebView does not support WebM or MP4 recording");
  return encoding;
}

function resultFilename(report: ScanReport, extension: string): string {
  const project = report.projectName
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "repository";
  return `spaghetti-meter-${project}-${Math.max(0, Math.floor(report.score))}.${extension}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(`The result could not be encoded as ${type}`));
    }, type);
  });
}

function nextAnimationFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function isCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
