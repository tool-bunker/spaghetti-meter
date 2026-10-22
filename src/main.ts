import { Application } from "pixi.js";
import { SpagettiApp } from "./app/SpagettiApp";
import { COLORS } from "./ui/theme";
import "./styles.css";

void (async () => {
  const host = document.querySelector<HTMLDivElement>("#app");
  if (!host) throw new Error("Application host is missing");

  const app = new Application();
  await app.init({
    resizeTo: window,
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

  app.canvas.className = "spagetti-canvas";
  app.canvas.setAttribute("role", "application");
  app.canvas.setAttribute("aria-label", "Spagetti project mess meter");
  host.appendChild(app.canvas);

  const controller = new SpagettiApp(app);
  window.addEventListener("beforeunload", () => {
    controller.dispose();
    app.destroy(
      { removeView: true, releaseGlobalResources: true },
      { children: true },
    );
  }, { once: true });
})().catch((error: unknown) => {
  console.error("Spagetti failed to start", error);
});
