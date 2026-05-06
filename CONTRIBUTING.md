# Contributing to The Daily Node

Thanks for your interest! Before you start, a few things to know:

## This is a personal project

I built The Daily Node for myself and decided to make it public so others can use, fork, and learn from it. I'm the only maintainer, and I make decisions about features and direction based on what I want for my own dashboard.

That means:

- **Bug reports are welcome.** Please use the [bug template](.github/ISSUE_TEMPLATE/bug_report.yml).
- **Feature requests are welcome.** Please use the [feature template](.github/ISSUE_TEMPLATE/feature_request.yml). I read everything but won't implement most of them — that's not a slight, it's just bandwidth + scope.
- **Pull requests are welcome but not guaranteed to be merged.** Please **open an issue first** to discuss the change before opening a PR. Surprise PRs are hard to triage.
- **Forks are always welcome.** If you want a feature I won't add, fork the repo and add it. That's what MIT is for.

## If you're opening a PR

1. **Open an issue first** to align on the change.
2. **Keep changes small and focused.** One PR = one logical change.
3. **Match existing patterns.** Look at neighboring files in `src/` and follow their conventions.
4. **Read [CLAUDE.md](./CLAUDE.md)** — it documents two non-obvious build constraints (default-only imports, hook-dep-array variable ordering) that will silently break the build if you violate them.
5. **Run `npm run build` and confirm `Command Center.html` still loads** in a browser before pushing.
6. **No formal linter.** Match the surrounding code style (inline `style` props, `React.useX` hook prefix, theme via `useT()`).

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the component tree, data flow, and module responsibilities.

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
