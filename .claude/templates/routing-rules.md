# Routing Rules Template

<!--
Also referenced but never shipped by the course (course-issue #34). This documents the default
`hx graph` routing table — the same table the engine implements in src/graph/engine.ts and that
`hx graph render` regenerates into graph.md so the diagram can never silently drift from the
code (course-issue #3).
-->

| Current node | Condition | Next node |
|---|---|---|
| research | always | implement |
| implement | tests pass locally | verify |
| implement | tests fail after max local retries | verify (with failure noted) |
| verify | review == "pass" AND tests pass | approve |
| verify | review == "fail" | implement |
| verify | review == "needs-info" | research |
| verify | attempts >= max_attempts | human (escalation, not silent failure — course-issue #1) |
| approve | human approves | merge |
| approve | human rejects | implement |
| approve | timeout elapsed | auto_reject_or_escalate (configurable) |
| merge | always | end |

Any verdict from `verify` that isn't exactly `"pass"` is treated as `"fail"` by default
(fail-closed routing — course-issue #2). Define new verdict strings explicitly in your graph
JSON's routing table rather than relying on this default if you need different behavior.
