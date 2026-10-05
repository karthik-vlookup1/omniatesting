# Quality Document

A quality snapshot for each product domain and architectural layer. Grades codebase health
over time — distinct from the evaluator rubric, which grades one session's output.

**Update cadence:** after each significant session, or before starting a new phase of work.

**Grading scale:**

- **A**: all verification passing, clean architecture, agent-legible, stable tests
- **B**: verification passing, mostly clean, minor gaps
- **C**: partially working, known gaps, some code hard for agents to understand
- **D**: not working, or major structural issues

---

## Product Domains

| Domain | Grade | Verification | Agent Legibility | Test Stability | Key Gaps | Last Updated |
| --- | --- | --- | --- | --- | --- | --- |
| phase-0-foundation | B | 4/4 passing | n/a (no automated signal) | n/a (no automated signal) | - | 2026-10-05 |
| phase-1-tenants | C | 1/5 passing | n/a (no automated signal) | n/a (no automated signal) | recon-101 (not_started), recon-103 (not_started), recon-104 (not_started), recon-105 (not_started) | 2026-10-05 |
| phase-2-matching | C | 3/4 passing | n/a (no automated signal) | n/a (no automated signal) | recon-204 (not_started) | 2026-10-05 |
| phase-3-outputs | C | 2/3 passing | n/a (no automated signal) | n/a (no automated signal) | recon-301 (not_started) | 2026-10-05 |
| phase-4-reporting | D | 0/1 passing | n/a (no automated signal) | n/a (no automated signal) | recon-401 (not_started) | 2026-10-05 |

## Architectural Layers

| Layer | Grade | Boundary Enforcement | Agent Legibility | Key Gaps | Last Updated |
| --- | --- | --- | --- | --- | --- |
| (no layers configured — set `architecture.layers` in hx.config.json) | - | - | - | - | - |

## Benchmark Snapshots

<!-- Populated by `hx bench --variant <baseline|improved|simplified> --repeat N`. -->

| Date | Harness Variant | Completion Rate | Retries | Defects Before Review | Notes |
|------|-----------------|------------------|---------|------------------------|-------|
| | | | | | |

## Simplification Log

<!-- Record ablation results here: remove a harness component, run the benchmark, compare. -->

| Date | Component Removed | Outcome | Decision |
|------|-------------------|---------|----------|
| | | | |

## Change History

### 2026-09-30

- Changes: regenerated Product Domains and Architectural Layers from feature status, evaluator verdicts, and rule violations (`hx quality update`).
- Domains promoted: -
- Domains demoted: -

### 2026-09-30

- Changes: regenerated Product Domains and Architectural Layers from feature status, evaluator verdicts, and rule violations (`hx quality update`).
- Domains promoted: phase-0-foundation (D -> C)
- Domains demoted: -

### 2026-09-30

- Changes: regenerated Product Domains and Architectural Layers from feature status, evaluator verdicts, and rule violations (`hx quality update`).
- Domains promoted: -
- Domains demoted: -

### 2026-10-01

- Changes: regenerated Product Domains and Architectural Layers from feature status, evaluator verdicts, and rule violations (`hx quality update`).
- Domains promoted: -
- Domains demoted: -

### 2026-10-01

- Changes: regenerated Product Domains and Architectural Layers from feature status, evaluator verdicts, and rule violations (`hx quality update`).
- Domains promoted: -
- Domains demoted: -

### 2026-10-02

- Changes: regenerated Product Domains and Architectural Layers from feature status, evaluator verdicts, and rule violations (`hx quality update`).
- Domains promoted: -
- Domains demoted: -

### 2026-10-02

- Changes: regenerated Product Domains and Architectural Layers from feature status, evaluator verdicts, and rule violations (`hx quality update`).
- Domains promoted: -
- Domains demoted: -

### 2026-10-02

- Changes: regenerated Product Domains and Architectural Layers from feature status, evaluator verdicts, and rule violations (`hx quality update`).
- Domains promoted: -
- Domains demoted: -

### 2026-10-02

- Changes: regenerated Product Domains and Architectural Layers from feature status, evaluator verdicts, and rule violations (`hx quality update`).
- Domains promoted: phase-0-foundation (C -> B)
- Domains demoted: -

### 2026-10-02

- Changes: regenerated Product Domains and Architectural Layers from feature status, evaluator verdicts, and rule violations (`hx quality update`).
- Domains promoted: -
- Domains demoted: -

### 2026-10-05

- Changes: regenerated Product Domains and Architectural Layers from feature status, evaluator verdicts, and rule violations (`hx quality update`).
- Domains promoted: phase-1-tenants (D -> C), phase-2-matching (D -> C), phase-3-outputs (D -> C)
- Domains demoted: -

### 2026-10-05

- Changes: regenerated Product Domains and Architectural Layers from feature status, evaluator verdicts, and rule violations (`hx quality update`).
- Domains promoted: -
- Domains demoted: -
