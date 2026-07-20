// Install Obsidian's DOM helpers for the whole Jest lane: instance methods
// (createEl/createDiv/empty/…) on HTMLElement.prototype under jsdom, and the
// GLOBAL create* functions (with a createMockEl fallback for DOM-less node
// tests). Production code uses the global form for detached roots/sentinels;
// without this, those paths throw `createEl is not defined` in node-env specs.
import './setup/obsidianDom';

type TestWindow = typeof globalThis & {
  cancelAnimationFrame?: (handle: number) => void;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
};

const testWindow = globalThis as TestWindow;

if (!testWindow.requestAnimationFrame) {
  testWindow.requestAnimationFrame = (callback: FrameRequestCallback): number => (
    Number(setTimeout(() => callback(Date.now()), 0))
  );
}

if (!testWindow.cancelAnimationFrame) {
  testWindow.cancelAnimationFrame = (handle: number): void => {
    clearTimeout(handle);
  };
}

if (!('window' in globalThis)) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: testWindow,
    writable: true,
  });
}
