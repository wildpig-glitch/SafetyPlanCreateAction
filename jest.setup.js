// This file runs before Jest starts the tests
// Global setup code can go here

// Mock console methods to avoid cluttering test output
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};