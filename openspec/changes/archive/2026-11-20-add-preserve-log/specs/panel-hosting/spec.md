# Spec Delta

## MODIFIED Requirements

### Requirement: Page and panel communication
The page and panel SHALL communicate over an in-page channel, without going through the dev server and without authorization. The panel gets the full record list and the Preserve log status (on or off, available or not, records left out or saved without bodies, last write failed) as read-only shared state, and can call a "clear records" action and a "set Preserve log" action.

#### Scenario: New call
- **WHEN** the panel is connected and the page makes a new call
- **THEN** the call appears in the panel list immediately, without reloading

#### Scenario: Panel opened after calls
- **WHEN** the panel is opened after the page already has 5 records
- **THEN** the panel shows these 5 records right after connecting

#### Scenario: Panel opened with Preserve log on
- **WHEN** Preserve log was turned on earlier in the tab and the panel is opened after a reload
- **THEN** the panel shows Preserve log as on right after connecting, together with the restored records
