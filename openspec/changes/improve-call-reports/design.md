## Context

The same formatter supplies both copy menus. Markdown can use tables and HTML disclosure; Discord and LINE need flat lists and bounded messages. Existing templates already support duplicate-and-edit and live syntax controls. An empty preview on a clean panel prevents users from comparing these controls before recording a failure.

## Goals / Non-Goals

- Human target: find procedure, HTTP outcome (or not sent), first failure and reproduction context within five seconds of opening a pasted report, without expanding a payload.
- Agent target: in one prompt with no follow-up questions, identify the evidenced failure and produce or run a minimal reproduction. Mark environment-dependent failures, omitted or masked values, and partial input rather than guessing.
- Custom-platform target: at most three actions once in Report templates: copy a preset, rename, change one syntax setting. Preview updates while editing; it must work with no calls.
- Keep classic formatting, defaults, section switches, masking, and length limits compatible. No autonomous replay, transport commands, or sending reports to an external service.

## Decisions

- Compare classic details-first with a short first-screen summary followed by details. The diagnostic layout uses existing facts: request method and target, first issue or captured error, and where to find input or what is missing. It does not infer a server trigger or manufacture missing input.
- Compare pretty or shortened JSON with compact JSON before full omission under the budget. Compact without loss first; for bounded diagnostic reports retain failure and request context ahead of bodies, and disclose when sections are dropped.
- Compare Markdown with reproduction cues against standalone structured data using the same captured facts. Try Markdown in the panel because it can be read in the existing destinations and copied. A structured interchange format and direct agent integrations are separate product decisions.
- Reuse the existing template-copy flow and syntax settings. Make the copy action explicit and keep the preview populated rather than introducing a templating language or wizard.

## Risks / Trade-offs

- Summaries repeat some detail. Keep them short, respect the per-report toggles, and snapshot legacy and diagnostic formats.
- A summary cannot recover a non-preserved body or infer infrastructure conditions. Report only the recorded evidence and keep literal payloads subject to the existing masking options.
- Native platform rendering and a blind agent exercise are acceptance checks, not properties proved by snapshots.

## Playground findings

- Fifteen baseline clipboard files (four cases plus the error batch across three templates) match the new Classic formatter byte for byte. The stock playground had no failed stream or retry scenario; those runs use the scenarios added in this change.
- On the captured validation input, a top summary puts reproduction on Markdown line 5 versus line 20 for the same summary at the end. This is a placement check, not a timed reading study.
- A four-event stream with a 700-character budget keeps all four events with compact Diagnostic JSON; tail sampling keeps one. At 600 characters Diagnostic drops the event block and discloses it, while shorter Classic still fits the event block.
- An independent agent, given only the Classic Markdown validation report, diagnosed both issues without clarification and reproduced the failure in a clean Nuxt playground. This did not compare agents or prove a speed gain. The new template flow retains duplication and adds an example preview before any events are recorded.
- Markdown was checked with GitHub's renderer. Discord and LINE native rendering was not checked; their clipboard outputs and limits are covered by tests.
