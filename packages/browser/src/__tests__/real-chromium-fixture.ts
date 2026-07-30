import http from "node:http";
import type { AddressInfo } from "node:net";
import { CROSS_ORIGIN_ISOLATION_HEADERS } from "../headers.js";

/**
 * Tiny static fixture for real-Chromium integration tests.
 * Serves COOP/COEP + DOM ladder controls + page-side `__scenelockScene`.
 */

export const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Scenelock real-chromium fixture</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; }
    canvas { display: block; border: 1px solid #333; margin-top: 16px; }
    #status { margin-top: 8px; }
  </style>
</head>
<body>
  <button type="button" id="save-btn">Save</button>
  <label for="email-input">Email</label>
  <input id="email-input" type="text" />
  <div data-testid="marker">marker</div>
  <button type="button" id="late-btn" disabled>Late</button>
  <canvas id="scene" width="200" height="120"></canvas>
  <div id="status">idle</div>
  <script>
    // Minimal canvas app + page-side scene adapter (mirrors scene-bridge.ts contract).
    (function () {
      var canvas = document.getElementById("scene");
      var ctx = canvas.getContext("2d");
      var node = {
        id: "shape-1",
        role: "shape",
        name: "Box",
        bbox: { x: 20, y: 20, width: 80, height: 60 },
      };
      function paint() {
        ctx.fillStyle = "#eee";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#3366cc";
        ctx.fillRect(node.bbox.x, node.bbox.y, node.bbox.width, node.bbox.height);
      }
      paint();

      window.__scenelockScene = {
        contractVersion: "fixture-v1",
        snapshot: function () {
          return [Object.assign({}, node, { bbox: Object.assign({}, node.bbox) })];
        },
        locate: function (id) {
          if (id !== node.id) return null;
          return Object.assign({}, node.bbox);
        },
        settled: function () {
          return Promise.resolve();
        },
        hitTest: function (point) {
          var b = node.bbox;
          if (
            point.x >= b.x &&
            point.x < b.x + b.width &&
            point.y >= b.y &&
            point.y < b.y + b.height
          ) {
            return node.id;
          }
          return null;
        },
      };

      document.getElementById("save-btn").addEventListener("click", function () {
        document.getElementById("status").textContent = "saved";
      });

      // Auto-wait target: becomes enabled after 300ms (no test-side sleeps).
      setTimeout(function () {
        document.getElementById("late-btn").disabled = false;
      }, 300);
    })();
  </script>
</body>
</html>
`;

export interface FixtureServer {
  readonly url: string;
  close(): Promise<void>;
}

/** Start a loopback HTTP server serving the fixture with COOP/COEP. */
export async function startFixtureServer(): Promise<FixtureServer> {
  const server = http.createServer((req, res) => {
    const headers: Record<string, string> = {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...CROSS_ORIGIN_ISOLATION_HEADERS,
      // COEP require-corp: mark same-origin document as corp-friendly.
      "Cross-Origin-Resource-Policy": "same-origin",
    };
    if (req.url === "/" || req.url === "/index.html" || req.url === undefined) {
      res.writeHead(200, headers);
      res.end(FIXTURE_HTML);
      return;
    }
    res.writeHead(404, headers);
    res.end("not found");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}/`;

  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
