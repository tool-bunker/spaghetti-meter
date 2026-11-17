const status = document.querySelector<HTMLElement>("#startup-status");
const title = document.querySelector<HTMLElement>("#startup-title");
const detail = document.querySelector<HTMLElement>("#startup-detail");
const errorOutput = document.querySelector<HTMLElement>("#startup-error");
let phase = "Loading interface modules";
let failed = false;

function showStartupError(error: unknown): void {
  if (failed) return;
  failed = true;
  console.error(`Spaghetti Meter failed during ${phase}`, error);
  status?.setAttribute("role", "alert");
  if (title) title.textContent = "Spaghetti Meter could not start";
  if (detail) detail.textContent = phase;
  if (errorOutput) {
    errorOutput.textContent = error instanceof Error
      ? error.stack || error.message
      : String(error);
    errorOutput.hidden = false;
  }
}

const handleError = (event: ErrorEvent): void => {
  showStartupError(event.error || event.message);
};
const handleRejection = (event: PromiseRejectionEvent): void => {
  showStartupError(event.reason);
};
window.addEventListener("error", handleError);
window.addEventListener("unhandledrejection", handleRejection);

void import("./main")
  .then(({ startApplication }) => startApplication((nextPhase) => {
    phase = nextPhase;
    if (detail) detail.textContent = phase;
  }))
  .then(() => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleRejection);
  })
  .catch(showStartupError);

export {};
