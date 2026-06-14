# Contributing to Spendify

First off, thank you for considering contributing to Spendify! It's people like you that make Spendify such a great personal finance tool.

## Where to Start?
If you're looking for ways to contribute, please check out our **[GitHub Issues](https://github.com/SkorpionOP/Spendify/issues)** page. 
- Look for issues tagged with `good first issue` or `help wanted`.
- We actively log bugs, tech debt (like the recent "Codebase Cleanup" issue), and feature requests there.
- If you find a new bug or have a feature idea, please **open a new issue** before submitting a pull request so we can discuss it first.

## Local Setup
For instructions on setting up your local environment (Database, FastAPI backend, Vite frontend), please refer to the **Local Development Setup** section in our `README.md`.

## Coding Guidelines

We enforce a few code quality standards to keep the repository clean and maintainable. Please ensure your code adheres to these before opening a Pull Request.

### Backend (Python/FastAPI)
- **Formatting**: We use `black` for automatic code formatting. Run it on your code before committing:
  ```bash
  cd backend
  python -m black .
  ```
- **Linting**: We use `ruff` as our primary linter. Run it to catch unused imports, bare exceptions, and style guide (PEP 8) violations:
  ```bash
  cd backend
  python -m ruff check . --fix
  ```

### Frontend (React/JavaScript)
- **Linting**: We use `eslint` with standard React plugin configurations to prevent issues like cascading renders or missing hook dependencies.
  ```bash
  cd frontend
  npm run lint -- --fix
  ```
- **React Hooks**: Always ensure your `useEffect` dependencies are exhaustive. Avoid calling `setState` directly and synchronously within an effect to prevent infinite rendering loops.

## Pull Request Process
1. **Fork the repo** and create your branch from `main`.
2. **Implement your changes**.
3. **Run the linters** (`black`, `ruff`, `eslint`) to ensure your code passes our quality checks.
4. **Test your changes** locally to ensure no existing functionality is broken.
5. **Issue a Pull Request** with a clear title and description. Reference any related issues (e.g., "Fixes #12").

Once you submit your PR, a maintainer will review it, request changes if necessary, and eventually merge it.

Thank you for contributing! 🚀
