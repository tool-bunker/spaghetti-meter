import "@fontsource-variable/space-grotesk";
import RAPIER from "@dimforge/rapier2d-compat";
import { Application, Assets, type Texture } from "pixi.js";
import { SpaghettiMeterApp } from "./app/SpaghettiMeterApp";
import { COLORS } from "./ui/theme";
import "./styles.css";

void (async () => {
  const host = document.querySelector<HTMLDivElement>("#app");
  if (!host) throw new Error("Application host is missing");

  const [, , bowlTexture] = await Promise.all([
    RAPIER.init(),
    document.fonts.load('700 16px "Space Grotesk Variable"'),
    Assets.load<Texture>({
      alias: "spaghetti-bowl",
      src: "/bowl.svg",
      data: { resolution: 2 },
    }),
  ]);

  const app = new Application();
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

  app.canvas.className = "spaghetti-meter-canvas";
  app.canvas.setAttribute("role", "application");
  app.canvas.setAttribute("aria-label", "Spaghetti Meter project mess meter");
  host.appendChild(app.canvas);

  const controller = new SpaghettiMeterApp(app, bowlTexture);
  window.addEventListener("beforeunload", () => {
    controller.dispose();
    app.destroy(
      { removeView: true, releaseGlobalResources: true },
      { children: true },
    );
  }, { once: true });
})().catch((error: unknown) => {
  console.error("Spaghetti Meter failed to start", error);
});
