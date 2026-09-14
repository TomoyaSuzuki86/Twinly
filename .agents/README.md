# Twinly agent skills

Twinly pins `my-take-dev/inspired-mino-design-skills` as a Git submodule and exposes its seven skills under `.agents/skills/` via symlinks.

Before using the skills in a fresh checkout, initialize the pinned submodule:

```bash
git submodule update --init --recursive
```

For the daily refactoring cycle, use `$mino-reproducible-development` as the primary workflow and route only to the specialist skills that are relevant to the change. Preserve each skill's hard gates and exclusions; do not introduce behavior, UI, or public-contract changes merely to satisfy a design pattern.

The submodule is pinned so daily refactoring uses a reproducible skill version. Update the gitlink deliberately rather than following upstream changes implicitly.
