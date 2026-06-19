import { vi } from 'vitest'

// jsdom does not implement window.matchMedia — stub it so session.js's
// isStandalone() doesn't throw during tests. Returns matches: false by default.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
