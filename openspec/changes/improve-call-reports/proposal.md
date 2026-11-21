# Improve call report readability

## Why

Call reports put timing and payloads on the same level as the evidence needed for triage, and the template preview is empty unless an error is visible. A report should be useful when pasted without prior discussion, even when the destination has a character limit.

## What Changes

- Offer an opt-in diagnostic layout for all existing template syntaxes. Keep the default layout and platform presets unchanged.
- Show a preview for a selected call, a visible error batch, or a synthetic example and make copying an existing template discoverable.
- Add reproducible playground scenarios and a snapshot matrix for Markdown, Discord, and LINE.
- Defer choosing a new default, a one-click agent action, or additional platforms.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `inspector-panel`: Add a diagnostic report layout and an always-available template preview.

## Impact

Inspector panel report generation, saved template preferences, and Nuxt playground scenarios. No recording protocol, public API, network integration, or preset defaults change.
