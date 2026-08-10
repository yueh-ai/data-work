import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SessionHeader } from "./sessionHeader.js";

const agentControlLabels = [
  "Viewer URL",
  "Upload Token",
  "Handoff Download",
  "Confirm Import",
  "Upload Command"
];

test("session header exposes browser upload and live connection without agent controls", () => {
  const markup = renderToStaticMarkup(
    createElement(SessionHeader, {
      connection: "live",
      uploading: false,
      onUploadFile: () => undefined
    })
  );

  assert.match(markup, /CSV Companion/);
  assert.match(markup, /Upload Session/);
  assert.match(markup, /Browser Upload/);
  assert.match(markup, /Live/);
  assert.match(markup, /type="file"/);
  assert.match(markup, /accept="\.csv,text\/csv"/);

  for (const label of agentControlLabels) {
    assert.equal(markup.includes(label), false, `unexpected agent control: ${label}`);
  }
});

test("session header shows and disables the browser upload while uploading", () => {
  const markup = renderToStaticMarkup(
    createElement(SessionHeader, {
      connection: "connecting",
      uploading: true,
      onUploadFile: () => undefined
    })
  );

  assert.match(markup, /Uploading/);
  assert.match(markup, /Connecting/);
  assert.match(markup, /disabled=""/);
});
