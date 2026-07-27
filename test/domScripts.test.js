import assert from "node:assert/strict";
import test from "node:test";
import {
  hasLikelyVisualAssets,
  shouldNormalizePageBreaks,
  createWaitForAssetsScript,
  createNormalizePageBreaksScript,
} from "../src/utils/domScripts.js";

test("hasLikelyVisualAssets retorna true para img", () => {
  assert.equal(hasLikelyVisualAssets('<img src="a.png" />'), true);
});

test("hasLikelyVisualAssets retorna true para svg", () => {
  assert.equal(hasLikelyVisualAssets('<svg><circle r="10" /></svg>'), true);
});

test("hasLikelyVisualAssets retorna true para canvas", () => {
  assert.equal(hasLikelyVisualAssets("<canvas></canvas>"), true);
});

test("hasLikelyVisualAssets retorna true para iframe", () => {
  assert.equal(hasLikelyVisualAssets("<iframe src='page.html'></iframe>"), true);
});

test("hasLikelyVisualAssets retorna true para stylesheet link", () => {
  assert.equal(
    hasLikelyVisualAssets('<link rel="stylesheet" href="style.css">'),
    true
  );
});

test("hasLikelyVisualAssets retorna true para style tag", () => {
  assert.equal(hasLikelyVisualAssets("<style>body{color:red}</style>"), true);
});

test("hasLikelyVisualAssets retorna true para @font-face", () => {
  assert.equal(
    hasLikelyVisualAssets("@font-face { font-family: 'Custom'; }"),
    true
  );
});

test("hasLikelyVisualAssets retorna true para background-image inline", () => {
  assert.equal(
    hasLikelyVisualAssets('<div style="background-image:url(a.png)"></div>'),
    true
  );
});

test("hasLikelyVisualAssets retorna false para html somente texto", () => {
  assert.equal(hasLikelyVisualAssets("<div>somente texto</div>"), false);
});

test("hasLikelyVisualAssets retorna false para html vazio", () => {
  assert.equal(hasLikelyVisualAssets(""), false);
});

test("hasLikelyVisualAssets retorna false para null/undefined", () => {
  assert.equal(hasLikelyVisualAssets(null), false);
  assert.equal(hasLikelyVisualAssets(undefined), false);
});

test("shouldNormalizePageBreaks detecta data-pdf-normalize-page-breaks", () => {
  assert.equal(
    shouldNormalizePageBreaks('<div data-pdf-normalize-page-breaks></div>'),
    true
  );
});

test("shouldNormalizePageBreaks detecta data-pdf-content-anchor", () => {
  assert.equal(
    shouldNormalizePageBreaks('<div data-pdf-content-anchor></div>'),
    true
  );
});

test("shouldNormalizePageBreaks retorna false sem marcadores", () => {
  assert.equal(shouldNormalizePageBreaks("<div>sem marcador</div>"), false);
});

test("shouldNormalizePageBreaks retorna false para html vazio", () => {
  assert.equal(shouldNormalizePageBreaks(""), false);
});

test("createWaitForAssetsScript retorna string de script valida", () => {
  const script = createWaitForAssetsScript(400);
  assert.equal(typeof script, "string");
  assert.ok(script.includes("waitFonts"));
  assert.ok(script.includes("waitImages"));
  assert.ok(script.includes("400"));
  assert.ok(script.length > 50);
});

test("createWaitForAssetsScript respeita timeout minimo de 100ms", () => {
  const script = createWaitForAssetsScript(0);
  assert.ok(script.includes("100"));
});

test("createNormalizePageBreaksScript retorna string de script valida", () => {
  const script = createNormalizePageBreaksScript();
  assert.equal(typeof script, "string");
  assert.ok(script.includes("BREAK_SELECTOR"));
  assert.ok(script.includes("findLastMeaningfulElement"));
  assert.ok(script.includes("resolveClipPadding"));
  assert.ok(script.length > 200);
});
