import "@fontsource-variable/space-grotesk";
import RAPIER from "@dimforge/rapier2d-compat";
import { Application, Assets, type Texture } from "pixi.js";
import { SpaghettiMeterApp } from "./app/SpaghettiMeterApp";
import { COLORS } from "./ui/theme";

export async function startApplication(reportProgress: (phase: string) => void): Promise<void> {
  const host = document.querySelector<HTMLDivElement>("#app");
  if (!host) throw new Error("Application host is missing");

  reportProgress("Initializing physics and loading assets");
  const [, , bowlTexture] = await Promise.all([
    RAPIER.init(),
    document.fonts.load('700 16px "Space Grotesk Variable"'),
    Assets.load<Texture>({
      alias: "spaghetti-bowl",
      src: new URL("/bowl.svg", document.baseURI).href,
      data: { resolution: 2 },
    }),
  ]);

  const app = new Application();
  let controller: SpaghettiMeterApp | undefined;
  try {
    reportProgress("Creating graphics renderer");
    await app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      background: COLORS.background,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      preference: "webgl",
      accessibilityOptions: {
        enabledByDefault: true,
        activateOnTab: true,
        deactivateOnMouseMove: false,
      },
      eventFeatures: {
        move: true,
        globalMove: false,
        click: true,
        wheel: false,
      },
    });

    reportProgress("Building interface");
    app.canvas.className = "spaghetti-meter-canvas";
    app.canvas.setAttribute("role", "application");
    app.canvas.setAttribute("aria-label", "Spaghetti Meter project mess meter");
    host.appendChild(app.canvas);
    controller = new SpaghettiMeterApp(app, bowlTexture);

    reportProgress("Drawing first frame");
    app.render();
    host.replaceChildren(app.canvas);
  } catch (error) {
    controller?.dispose();
    if (app.renderer) {
      app.destroy(
        { removeView: true, releaseGlobalResources: true },
        { children: true },
      );
    }
    throw error;
  }

  window.addEventListener("beforeunload", () => {
    controller?.dispose();
    app.destroy(
      { removeView: true, releaseGlobalResources: true },
      { children: true },
    );
  }, { once: true });
}
