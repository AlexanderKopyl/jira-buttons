# Finance Approval Buttons Open Questions

1. Confirm the exact Jira transition names in project `FIN` for issue type `Payment Request`: `Send to review`, `Decline`, `Approve`, `Escalate to CEO`, and `Mark as paid`.

2. Confirm whether any of those transitions have transition screens with required fields. If yes, the app must either collect those fields or intentionally disable those custom buttons and direct users to Jira's native transition UI.

3. Confirm whether the issue type display name is exactly `Payment Request` in Jira Cloud. The manifest and runtime checks depend on the issue type name unless changed to ID-based logic.

4. Confirm whether stakeholders accept `jira:issuePanel` UX, where the panel appears after opening the issue panel button, rather than an always-visible right-side issue context panel.

5. Confirm the desired behavior when a transition is expected by business rules but hidden by Jira permissions or workflow conditions: hide the button completely or show it disabled with an explanatory message.
