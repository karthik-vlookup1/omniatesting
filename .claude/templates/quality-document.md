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

<!-- Replace with your project's actual domains. -->

| Domain | Grade | Verification | Agent Legibility | Test Stability | Key Gaps | Last Updated |
|--------|-------|-------------|-----------------|---------------|----------|-------------|
| (add your domains here) | - | - | - | - | - | - |

## Architectural Layers

<!-- Replace with your project's actual layers (e.g. from docs/ARCHITECTURE.md). -->

| Layer | Grade | Boundary Enforcement | Agent Legibility | Key Gaps | Last Updated |
|-------|-------|---------------------|-----------------|----------|-------------|
| (add your layers here) | - | - | - | - | - |

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

### {{DATE}}

- Changes:
- Domains promoted:
- Domains demoted:
- New gaps identified:
- Gaps closed:
