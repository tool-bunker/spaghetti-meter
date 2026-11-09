import { GIFEncoder, applyPalette, quantize, type GifEncoderInstance } from "gifenc";

interface StartMessage {
  type: "start";
}

interface FrameMessage {
  type: "frame";
  rgba: ArrayBuffer;
  width: number;
  height: number;
  delay: number;
}

interface FinishMessage {
  type: "finish";
}

type GifWorkerMessage = StartMessage | FrameMessage | FinishMessage;

interface GifWorkerScope {
  onmessage: ((event: MessageEvent<GifWorkerMessage>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const workerScope = self as unknown as GifWorkerScope;
let encoder: GifEncoderInstance | undefined;

workerScope.onmessage = (event): void => {
  try {
    switch (event.data.type) {
      case "start":
        encoder = GIFEncoder();
        break;
      case "frame": {
        if (!encoder) throw new Error("GIF encoder has not been started");
        const rgba = new Uint8ClampedArray(event.data.rgba);
        const palette = quantize(rgba, 256, { format: "rgb565" });
        const indexed = applyPalette(rgba, palette, "rgb565");
        encoder.writeFrame(indexed, event.data.width, event.data.height, {
          palette,
          delay: event.data.delay,
          repeat: 0,
        });
        break;
      }
      case "finish": {
        if (!encoder) throw new Error("GIF encoder has not been started");
        encoder.finish();
        const bytes = encoder.bytes();
        workerScope.postMessage({ type: "complete", bytes: bytes.buffer }, [bytes.buffer]);
        encoder = undefined;
        break;
      }
    }
  } catch (error) {
    workerScope.postMessage({ type: "error", message: String(error) });
    encoder = undefined;
  }
};
