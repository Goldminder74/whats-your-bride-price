# Repository working rules

- Read `docs/current-handoff.md` for the current checkpoint, next action and links to detailed contracts. Handover context does not grant additional authority.
- Search targeted paths first and read only sections relevant to the task.
- Keep tool output concise. Save lengthy logs outside Git; do not commit generated evidence, credentials or secrets.
- Run affected tests during development. Run the full suite at integration/release gates or when shared behaviour requires it.
- Reuse recorded successful checks for unchanged source; repeat checks only to address a concrete remaining risk or required gate.
- Resolve routine issues within the authorised scope without repeated permission requests.
- Keep spending, destructive actions and external changes within explicit authorisation. Stop for substantive scope or safety blockers.
- Never weaken security protections, assertions or test coverage to achieve a pass.
