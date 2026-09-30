# Instruction File Anti-Patterns

- Putting all repository knowledge into one file
- Repeating the same rule in multiple places
- Encoding obsolete rules that nobody audits
- Writing conditional instructions so specific that they rarely apply
- Embedding long tool manuals into the startup context

---

**Enforced by:** `hx doctor` (instruction-file calibration lint) — partial; some patterns are manual judgment.
