// Mock implementation of @forge/api
export const asApp = jest.fn();
export const route = jest.fn((strings, ...values) => 
  strings.map((str, i) => str + (values[i] || '')).join('')
);