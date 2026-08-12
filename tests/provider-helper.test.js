"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function classList() {
  const values = new Set();
  return {
    contains: (value) => values.has(value),
    toggle(value, enabled) {
      if (enabled) values.add(value);
      else values.delete(value);
    },
  };
}

function providerState(platform) {
  const helperLabel = { textContent: "" };
  const context = {
    window: {
      musicProviders: {
        activeId: "netease",
        metadata: { netease: { name: "网易云音乐" } },
        get: () => ({}),
        platform: () => platform,
      },
    },
    document: { body: { dataset: {} } },
    pendingProviderId: null,
    providerButton: {
      classList: classList(),
      dataset: {},
      setAttribute() {},
      disabled: false,
    },
    providerLogout: { hidden: true, setAttribute() {} },
    providerButtonLabel: { textContent: "" },
    neteaseHelperLink: {
      hidden: true,
      href: "",
      target: "",
      rel: "",
      querySelector: () => helperLabel,
      setAttribute(name, value) { this[name] = value; },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "assets/js/providers/state.js"), "utf8"), context);
  context.setProviderButton("connected", { display_name: "Listener" }, "netease");
  return { ...context, helperLabel };
}

function providerSetup(platform) {
  const storage = new Map();
  const context = {
    URLSearchParams,
    navigator: { platform },
    window: {
      location: { search: "" },
      localStorage: {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
      spotifyAuth: {},
      appleMusicAuth: {},
      neteaseMusicAuth: {},
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "assets/js/providers/registry.js"), "utf8"), context);
  return context.window.musicProviders.setupHtml("netease");
}

test("shows a direct Windows helper download whenever NetEase is connected", () => {
  const state = providerState("windows");
  assert.equal(state.neteaseHelperLink.hidden, false);
  assert.equal(state.helperLabel.textContent, "下载播放助手");
  assert.match(state.neteaseHelperLink.href, /Vinyll\.NeteaseBridge-win-x64\.exe$/);
});

test("routes Mac users to honest setup instructions instead of the Windows binary", () => {
  const state = providerState("macos");
  assert.equal(state.neteaseHelperLink.hidden, false);
  assert.equal(state.helperLabel.textContent, "Mac 同步说明");
  assert.match(state.neteaseHelperLink.href, /bridge#macos/);
  assert.equal(state.neteaseHelperLink.target, "_blank");
});

test("keeps the Windows download in the connected setup panel", () => {
  const setup = providerSetup("Win32");
  assert.match(setup, /下载 Windows 本地助手/);
  assert.match(setup, /Vinyll\.NeteaseBridge-win-x64\.exe/);
});

test("does not claim the current Mac CLI bridge reads the official desktop app", () => {
  const setup = providerSetup("MacIntel");
  assert.match(setup, /不是网易云官方 Mac 客户端/);
  assert.doesNotMatch(setup, /Vinyll\.NeteaseBridge-win-x64\.exe/);
});
