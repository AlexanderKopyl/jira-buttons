# Finance Approval Buttons Implementation Plan

## Constraints

- Do not bypass Jira workflow permissions.
- Do not hardcode transition IDs.
- Do not change Jira workflows unless a confirmed blocker requires workflow configuration outside this app.
- Do not create duplicate Jira transitions.
- Keep support limited to project `FIN` and issue type `Payment Request`.
- Use existing dependencies unless a specific implementation blocker is found.

## Step 1: Replace Template Frontend With Issue Context Loading

Target file:

- `jira-finance-buttons/src/frontend/index.jsx`

Actions:

- Remove the hello-world `invoke('getText')` flow.
- Import `view` and `requestJira` from `@forge/bridge`.
- Load context with `view.getContext()`.
- Extract the current issue key or ID from the issue panel extension context.
- Add loading and error states.

Acceptance criteria:

- Panel loads without calling the template resolver.
- Panel can identify the current Jira issue.
- If issue context is missing, the panel shows a concise unavailable message.

## Step 2: Fetch And Validate Current Issue

Target file:

- `jira-finance-buttons/src/frontend/index.jsx`

Actions:

- Call `GET /rest/api/3/issue/{issueIdOrKey}?fields=project,issuetype,status`.
- Verify `fields.project.key === 'FIN'`.
- Verify `fields.issuetype.name === 'Payment Request'`.
- Read `fields.status.name`.
- If not supported, show nothing or a short unavailable message.

Acceptance criteria:

- Supported FIN Payment Request issues continue to render the action panel.
- Other projects or issue types do not show finance actions.
- Display condition filtering is treated as a UI optimization, not a security guarantee.

## Step 3: Fetch Available Transitions For Current User

Target file:

- `jira-finance-buttons/src/frontend/index.jsx`

Actions:

- Call `GET /rest/api/3/issue/{issueIdOrKey}/transitions`.
- Store returned transitions for the current status.
- Do not infer permissions from status alone.
- Consider using `expand=transitions.fields` if transition screen requirements need detection before button rendering.

Acceptance criteria:

- Buttons are based only on transition names present in Jira's available transitions response.
- Users without transition permission do not see actionable buttons.
- Empty transitions produce a non-actionable state, not a bypass attempt.

## Step 4: Implement Business Action Mapping

Target file:

- `jira-finance-buttons/src/frontend/index.jsx`

Actions:

- Define a local mapping from Jira status name to expected action labels and transition names.
- Keep labels and transition names separate so copy can change independently if needed.
- Use the mapping only to decide which business actions are relevant for a status.
- Use Jira's available transitions response to decide which relevant actions are executable.

Required mapping:

| Status | Actions |
| --- | --- |
| New | Send to review, Decline |
| Additional Review | Approve, Escalate to CEO, Decline |
| Review from CEO | Approve, Decline |
| Approved | Mark as paid |
| Payment done | Completed message |
| Canceled | Completed message |

Acceptance criteria:

- Status `New` renders only available `Send to review` and `Decline` actions.
- Status `Additional Review` renders only available `Approve`, `Escalate to CEO`, and `Decline` actions.
- Status `Review from CEO` renders only available `Approve` and `Decline` actions.
- Status `Approved` renders only available `Mark as paid`.
- Status `Payment done` and `Canceled` render `This payment request is already completed.`
- Unknown status renders a short unsupported-status message.

## Step 5: Execute Transitions Safely

Target file:

- `jira-finance-buttons/src/frontend/index.jsx`

Actions:

- On button click, disable buttons while processing.
- Re-fetch available transitions or use a very recent transition list.
- Resolve the transition ID by exact transition name.
- If no matching transition exists, refresh state and show that the transition is no longer available.
- If multiple matching transition names exist, do not execute; show an ambiguity error.
- Call `POST /rest/api/3/issue/{issueIdOrKey}/transitions` with `{ transition: { id } }`.
- Do not include field updates unless transition field requirements are explicitly implemented.

Acceptance criteria:

- No transition ID is hardcoded.
- Transition POST uses only an ID resolved from Jira's available transitions for the issue/current user.
- Failed transitions do not leave the UI in a permanently loading state.
- After success, issue details and transitions are refreshed.

## Step 6: Refresh Host Issue View After Success

Target file:

- `jira-finance-buttons/src/frontend/index.jsx`

Actions:

- After a successful transition, call `view.refresh()` if available.
- Re-fetch panel state regardless of host refresh result.
- Handle `view.refresh()` failure non-fatally because panel state refresh is the app's responsibility.

Acceptance criteria:

- The panel reflects the new status after transition.
- Jira issue view is requested to refresh after transition.
- A `view.refresh()` error does not mask a successful transition.

## Step 7: Optional Resolver Cleanup

Target files:

- `jira-finance-buttons/manifest.yml`
- `jira-finance-buttons/src/index.js`
- `jira-finance-buttons/src/resolvers/index.js`
- `jira-finance-buttons/package.json`
- `jira-finance-buttons/package-lock.json`

Actions:

- If no backend resolver is used, remove the `resolver` property from the issue panel module.
- Remove the `function` module only if no functions remain.
- Remove `src/index.js` and `src/resolvers/index.js` only if Forge validation passes without them.
- Consider removing `@forge/resolver` only after confirming no resolver remains and dependency cleanup is desired.

Acceptance criteria:

- Manifest validates.
- App behavior remains frontend-only.
- No unused resolver invocation remains.

## Step 8: Validate Manifest And Lint

Target files:

- `jira-finance-buttons/manifest.yml`
- `jira-finance-buttons/src/frontend/index.jsx`

Actions:

- Run `npm run lint` if dependencies are already installed.
- Run Forge manifest validation or `forge lint` if Forge CLI is available and does not require deployment.
- Do not run `forge deploy`.
- Do not run `forge install`.

Acceptance criteria:

- Lint passes or all lint failures are documented.
- Manifest validation passes or all validation failures are documented.
- No deployment occurs.

## Manual Test Checklist

- Open a `FIN` issue with issue type `Payment Request` and status `New`.
- Confirm the panel shows `Send to review` and/or `Decline` only if Jira returns those transitions for the current user.
- Click `Send to review`; confirm the issue transitions through Jira and the panel refreshes.
- Open a `FIN` Payment Request in `Additional Review`.
- Confirm `Approve`, `Escalate to CEO`, and `Decline` follow available Jira transitions.
- Open a `FIN` Payment Request in `Review from CEO`.
- Confirm `Approve` and `Decline` follow available Jira transitions.
- Open a `FIN` Payment Request in `Approved`.
- Confirm `Mark as paid` follows available Jira transitions.
- Open a `FIN` Payment Request in `Payment done`.
- Confirm the panel shows `This payment request is already completed.`
- Open a `FIN` Payment Request in `Canceled`.
- Confirm the panel shows `This payment request is already completed.`
- Open an issue outside project `FIN`.
- Confirm finance actions are not shown.
- Open a `FIN` issue with another issue type.
- Confirm finance actions are not shown.
- Test with a user lacking transition permission.
- Confirm restricted transitions are not shown or cannot be executed.
- Test a transition with a required screen field, if one exists.
- Confirm the app handles the failure or disables the action rather than bypassing Jira.
- Test browser refresh and panel reopen after transition.
- Confirm state is loaded from Jira, not stale local assumptions.

## Rollback Plan

- Revert changes to `src/frontend/index.jsx`.
- If resolver cleanup was performed, restore `manifest.yml`, `src/index.js`, `src/resolvers/index.js`, `package.json`, and `package-lock.json` to the previous template-compatible state.
- Re-deploy the previous working Forge app version only after the rollback diff is reviewed.
- No Jira workflow rollback should be needed because the implementation must not modify workflows.

## Recommended Implementation Order

1. Implement frontend-only issue loading and validation.
2. Add transition fetching and status/action rendering.
3. Add safe transition execution by resolved transition name.
4. Add refresh/error handling.
5. Run lint and manifest validation.
6. Decide whether resolver cleanup is worth doing in the same change or a follow-up cleanup.
