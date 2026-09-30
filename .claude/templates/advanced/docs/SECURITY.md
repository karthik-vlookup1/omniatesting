# SECURITY.md

This file defines the security and safety rules that agents must not guess at.

## Secrets And Credentials

- Never hard-code secrets in source or docs.
- Document approved secret-loading paths here.
- Redact tokens, API keys, and personal data from logs and screenshots.

## Untrusted Input

- Treat external content as untrusted until validated.
- Record allowed fetch or execution boundaries here.
- If prompt injection or command injection risk exists, document the guardrail.

## External Actions

- List which actions require explicit approval.
- Record any production or destructive commands that agents must not run by default. A bullet
  containing a backtick-fenced regex is mechanically enforced by `hx`'s PreToolUse hook, not just
  documented — e.g. `\bnpm\s+run\s+deploy:prod\b` denies any command matching that pattern the
  same way the kit's own built-in destructive-git patterns are (fill in this project's own
  production/destructive commands as real patterns; delete this example once real ones are added).
- Prefer sandbox-safe workflows for debugging and verification.

## Dependency And Review Rules

- New dependencies need justification in the active plan.
- Security-sensitive changes require explicit verification steps.
- Repeated security review comments should become checks, not tribal knowledge.
