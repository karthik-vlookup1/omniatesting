# Electron Architecture Rules

- Renderer code may not directly access the filesystem.
- Preload is the only bridge between renderer and Electron main.
- Retrieval and indexing logic live in service modules, not UI components.
- Logging should be structured and emitted from service boundaries.

---

**Enforced by:** `hx rule check` (layer-order rule) / `hx doctor` (advanced-pack SOP lints).
