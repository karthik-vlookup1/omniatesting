# Lessons

A running log of reasons things didn't work out — why a feature got blocked, why a fix was
rejected, why an issue was marked won't-fix. Regenerated automatically (`hx feature block`,
`hx issue reject`, `hx issue wontfix`, or `hx lesson add`) — read this before repeating the same
dead end a future session might otherwise walk into again.

## 2026-10-02: git commit -- <path> on a case-insensitive repo committed file content instead of a deletion

- Source: manual (fe-001)
- With core.ignorecase=true, git commit -- readme.md matched README.md on disk and committed its content as readme.md. Fix: stage exact index changes with git update-index (--force-remove / --cacheinfo), check git diff --cached --name-status, then commit without a pathspec

## 2026-10-02: Mantine menus intermittently display:none in jsdom unless MantineProvider env="test"

- Source: manual (fe-003)
- Popover hideDetached reads floating-ui referenceHidden; jsdom zero-size rects made it flip, so menu items were randomly unfindable. transitionProps duration 0 made it worse (menus never opened). Fix: render with <MantineProvider env="test">, which disables hideDetached, transitions and portals. Also: vitest exits 1 on an uncaught error even when every test passes, so check the exit code, not just the pass count
