import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/startup.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

// Keep each startup attempt isolated; the production browser smoke check covers real DOM rendering.
function start(loadModule) {
  const elements = new Map(["status", "title", "detail", "error"].map((name) => [
    `#startup-${name}`,
    {
      textContent: "",
      hidden: name === "error",
      attributes: new Map(),
      setAttribute(name, value) { this.attributes.set(name, value); },
    },
  ]));
  const listeners = new Map();
  vm.runInNewContext(source, {
    Error,
    exports: {},
    console: { error() {} },
    require: loadModule,
    document: { querySelector: (selector) => elements.get(selector) },
    window: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: (name, callback) => {
        if (listeners.get(name) === callback) listeners.delete(name);
      },
    },
  });
  return {
    elements,
    dispatch: (name, event) => listeners.get(name)?.(event),
    settle: () => new Promise((resolve) => setImmediate(resolve)),
  };
}

function assertVisibleFailure(attempt) {
  assert.equal(attempt.elements.get("#startup-status").attributes.get("role"), "alert");
  assert.equal(attempt.elements.get("#startup-error").hidden, false);
}

test("a failed interface module load produces a visible error before the app can initialize", async () => {
  const attempt = start(() => { throw new Error("Failed to fetch dynamically imported module"); });
  await attempt.settle();
  assertVisibleFailure(attempt);
  assert.match(attempt.elements.get("#startup-error").textContent, /Failed to fetch dynamically imported module/);
});

test("graphics initialization failures retain the failing phase and technical error", async () => {
  const attempt = start(() => ({
    async startApplication(reportProgress) {
      reportProgress("Creating graphics renderer");
      throw new Error("WebGL context creation failed");
    },
  }));
  await attempt.settle();
  assertVisibleFailure(attempt);
  assert.equal(attempt.elements.get("#startup-detail").textContent, "Creating graphics renderer");
  assert.match(attempt.elements.get("#startup-error").textContent, /WebGL context creation failed/);
});

test("secondary startup errors do not overwrite the original failure", async () => {
  const attempt = start(() => { throw new Error("Secondary module failure"); });
  attempt.dispatch("unhandledrejection", { reason: new Error("Original initialization failure") });
  await attempt.settle();
  assertVisibleFailure(attempt);
  const error = attempt.elements.get("#startup-error").textContent;
  assert.match(error, /Original initialization failure/);
  assert.doesNotMatch(error, /Secondary module failure/);
});
