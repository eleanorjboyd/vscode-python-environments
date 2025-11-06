# Contributing to Python Environments

Thank you for your interest in contributing to the Python Environments extension! This document provides guidelines and instructions to help you get the project set up and start contributing.

## Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information, see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Contributor License Agreement

This project welcomes contributions and suggestions. Most contributions require you to agree to a Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us the rights to use your contribution. For details, visit <https://cla.opensource.microsoft.com>.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions provided by the bot. You will only need to do this once across all repos using our CLA.

## Prerequisites

Before setting up your development environment, ensure you have the following installed:

- **Node.js** (v18 or later) - [Download](https://nodejs.org/)
- **npm** (v9 or later) - Usually included with Node.js
- **VS Code** - [Download](https://code.visualstudio.com/)
- **Python** (v3.9 or later) - For testing and running examples

## Getting Started

### 1. Fork and Clone the Repository

### 2. Install Node Dependencies

```bash
npm install
```

This will install all required Node.js packages for the project.

### 3. Set Up Your Python Environment

First, create a Python virtual environment in the project:

```bash
# Create a virtual environment
python -m venv .venv

# Activate the virtual environment
source .venv/bin/activate

# Or on Windows:
# .\.venv\Scripts\activate

# Install Python project dependencies
pip install -r requirements.txt

# Or if using dev requirements:
pip install -r requirements-dev.txt
```

This sets up the Python environment used for testing and running the extension.

## Development Workflow

### Building and Watching Files

The project uses webpack for bundling and TypeScript for compilation. To start development:

```bash
# Start the watch task (compiles and bundles automatically)
npm run watch
```

This command:
- Watches TypeScript files in `src/` for changes
- Automatically recompiles on file changes
- Bundles the extension for testing

You can also run specific npm scripts:

```bash
npm run compile        # Single compilation
npm run package        # Production build with minification
npm run lint           # Run ESLint
npm run watch-tests    # Watch and compile test files
```

### Project Structure

```
src/
├── api.ts                    # Public extension API definitions
├── extension.ts              # Extension entry point
├── helpers.ts                # Utility functions
├── internal.api.ts           # Internal API
├── common/                   # Core utilities and wrappers
│   ├── constants.ts
│   ├── logging.ts
│   ├── commands.ts
│   ├── localize.ts          # Localization strings
│   └── ...
├── features/                 # Main extension features
│   ├── envCommands.ts
│   ├── envManagers.ts
│   ├── projectManager.ts
│   ├── pythonApi.ts
│   └── ...
├── managers/                 # Environment manager implementations
│   ├── builtin/
│   ├── conda/
│   ├── pipenv/
│   ├── poetry/
│   ├── pyenv/
│   └── ...
└── test/                     # Test files
    ├── unittests.ts         # Mock setup for unit tests
    ├── constants.ts
    └── ...

files/
├── common_pip_packages.json  # Default pip packages
├── conda_packages.json       # Default conda packages
└── templates/                # Project templates

docs/
└── projects-api-reference.md # API documentation
```