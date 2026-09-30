# Proposed file: `.env.example`

**Apply:** copy `env.example` from this folder to `.env.example` at the project root.

**Why:** recon-001's scope includes `.env.example` (placeholders only, BUILD_BRIEF §8.7), but hx
protects `.env*` by default. Either apply this by hand, or apply the `hx-config` approval (which
adds `allowEdit: [".env.example"]`) and let the agent maintain it.
