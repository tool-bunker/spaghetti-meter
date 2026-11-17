import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { path } from "pixi.js";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/main.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

for (const baseURI of [
  "tauri://localhost/",
  "tauri://localhost/index.html",
  "http://localhost:1420/",
  "http://tauri.localhost/",
]) {
  test(`welcome screen loads its bowl from the correct origin at ${baseURI}`, async () => {
    const requested = [];
    const host = {
      children: ["loading"],
      appendChild(child) { this.children.push(child); },
      replaceChildren(...children) { this.children = children; },
    };
    let application;
    class Application {
      canvas = { setAttribute() {} };
      renderer = {};
      rendered = false;
      constructor() { application = this; }
      async init() {}
      render() { this.rendered = true; }
      destroy() {}
    }
    const exports = {};
    vm.runInNewContext(source, {
      exports,
      URL,
      document: {
        baseURI,
        querySelector: () => host,
        fonts: { load: async () => [] },
      },
      window: { innerWidth: 540, innerHeight: 900, devicePixelRatio: 1, addEventListener() {} },
      require: (name) => {
        switch (name) {
          case "@fontsource-variable/space-grotesk": return {};
          case "@dimforge/rapier2d-compat": return { __esModule: true, default: { init: async () => {} } };
          case "./app/SpaghettiMeterApp": return { SpaghettiMeterApp: class {} };
          case "./ui/theme": return { COLORS: { background: 0x0d0824 } };
          case "pixi.js": return {
            Application,
            Assets: {
              async load(asset) {
                // Use Pixi's actual URL resolver: root-relative URLs lose the host for tauri://.
                const url = path.toAbsolute(asset.src, baseURI);
                requested.push(url);
                if (url !== new URL("/bowl.svg", baseURI).href) {
                  throw new Error(`No packaged bowl asset at ${url}`);
                }
                return {};
              },
            },
          };
          default: throw new Error(`Unexpected dependency: ${name}`);
        }
      },
    });
    await exports.startApplication(() => {});
    assert.deepEqual(requested, [new URL("/bowl.svg", baseURI).href]);
    assert.deepEqual(host.children, [application.canvas]);
    assert.equal(application.rendered, true);
  });
}
