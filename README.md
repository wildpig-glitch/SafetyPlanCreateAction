# Safety Plan Create Action

A Forge app for Atlassian Jira that helps manage safety plans for automotive systems. The app provides functionality to clone and take over ASIL (Automotive Safety Integrity Level) stories in Jira.

## Features

- **Clone ASIL Stories**: Create a new safety plan in a target project based on a template, filtering by ASIL level
- **Take Over ASIL Stories**: Create a copy of an existing safety plan within the same project

## Development

### Prerequisites

- Node.js 16+
- Forge CLI

### Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Run tests:
   ```
   npm test
   ```

### Testing

This project uses Jest for unit testing. The tests are located in the `src/__tests__` directory.

To run the tests:

```
npm test
```

To run tests with coverage:

```
npm test -- --coverage
```

### Project Structure

- `src/index.js`: Main application logic
- `src/helpers.js`: Utility functions for working with Jira API
- `src/constants.js`: Global constants
- `src/__tests__/`: Unit tests

## Deployment

To deploy the app to Forge:

1. Build the app:
   ```
   forge build
   ```

2. Deploy the app:
   ```
   forge deploy
   ```

3. Install the app in your Jira instance:
   ```
   forge install
   ```