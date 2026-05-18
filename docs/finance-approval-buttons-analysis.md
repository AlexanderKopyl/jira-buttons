# Finance Approval Buttons Analysis

## Current Repository State

- Repository root inspected: `/Users/aleksandrkopyl/www/jira-buttons`.
- Forge app directory: `jira-finance-buttons/`.
- Current app files:
  - `manifest.yml`
  - `package.json`
  - `package-lock.json`
  - `src/index.js`
  - `src/frontend/index.jsx`
  - `src/resolvers/index.js`
  - `README.md`
  - `AGENTS.md`
- Existing git state before analysis showed `.gitignore` modified/staged and `jira-finance-buttons/` untracked. This analysis did not attempt to revert or normalize that state.
- Runtime source is still the Forge hello-world template:
  - The frontend renders `Hello world!`.
  - The frontend invokes resolver method `getText`.
  - The resolver returns `Hello, world!`.

## Current Manifest Assessment

Current `manifest.yml` defines:

```yaml
modules:
  jira:issuePanel:
    - key: finance-approval-actions-panel
      resource: main
      resolver:
        function: resolver
      render: native
      title: Finance Approval Actions
      icon: https://developer.atlassian.com/platform/forge/images/icons/issue-panel-icon.svg
      allowMultiple: false
      displayConditions:
        projectKey: FIN
        issueType: Payment Request

  function:
    - key: resolver
      handler: index.handler

resources:
  - key: main
    path: src/frontend/index.jsx

permissions:
  scopes:
    - read:issue:jira
    - read:issue.transition:jira
    - write:issue:jira
```

Assessment:

- The app is already using the preferred Jira issue view location, `jira:issuePanel`.
- The issue panel is wired as a native-rendered UI Kit React resource through `resource: main` and `render: native`.
- The resolver function wiring is present and valid in shape: module resolver references function key `resolver`, function handler is `index.handler`, and `src/index.js` exports `handler` from `src/resolvers`.
- `allowMultiple: false` is appropriate for a single actions panel.
- `displayConditions.projectKey: FIN` and `displayConditions.issueType: Payment Request` are appropriate as a first UI filter.
- Display conditions are not a security boundary. Atlassian documentation states display conditions are evaluated client-side and should not be used to protect sensitive data. Runtime code must still verify project key and issue type after reading the issue.
- The current title and icon are suitable placeholders.
- The current manifest has a resolver even though the recommended implementation can avoid it. Keeping the resolver is not harmful, but it is unnecessary unless a backend-mediated design is chosen.

## Current Frontend And Backend Assessment

Frontend:

- Current file: `src/frontend/index.jsx`.
- Uses React and `@forge/react`.
- Uses `invoke` from `@forge/bridge`.
- Does not use Jira REST yet.
- Does not read issue context yet.
- Does not render finance workflow buttons yet.

Backend:

- Current files: `src/index.js`, `src/resolvers/index.js`.
- Uses `@forge/resolver`.
- Defines only `getText`.
- No backend Jira API calls exist.

Template type:

- This is a UI Kit React app using native rendering.
- It is resolver-based only because the template invokes `getText`.
- It is not Custom UI.
- It is not frontend-only yet, but it can be made frontend-only for this feature.

## Recommended Architecture

Use `jira:issuePanel` with UI Kit React and call Jira REST directly from the frontend with `requestJira` from `@forge/bridge`.

Recommended flow:

1. Use `view.getContext()` to obtain issue context for the current issue panel instance.
2. Read the current issue from Jira REST using issue key or ID from context.
3. Verify the issue is in project `FIN` and issue type `Payment Request`.
4. Read current status name from the issue fields.
5. Fetch available transitions for that issue/current user.
6. Map current status to allowed business actions by transition name.
7. Render only actions whose transition names are present in the currently available transitions response.
8. On button click, resolve the transition ID from the current transitions response by transition name.
9. Execute the transition by ID with Jira REST.
10. Refresh issue data and available transitions after a successful transition.
11. Optionally call `view.refresh()` after successful transition so the host issue view updates.

Status-to-action mapping:

| Status | Buttons / Message | Required transition names |
| --- | --- | --- |
| New | Send to review, Decline | `Send to review`, `Decline` |
| Additional Review | Approve, Escalate to CEO, Decline | `Approve`, `Escalate to CEO`, `Decline` |
| Review from CEO | Approve, Decline | `Approve`, `Decline` |
| Approved | Mark as paid | `Mark as paid` |
| Payment done | This payment request is already completed. | None |
| Canceled | This payment request is already completed. | None |

Important implementation rule:

- Never hardcode transition IDs.
- Always resolve the transition ID by matching the configured transition name against the currently available transitions returned by Jira for the issue/current user.
- If a transition name is not available, hide or disable that button with a clear unavailable state. The available transitions response is the app-level source of truth for whether the current user can perform the action.

## Backend Resolver Recommendation

Prefer frontend `requestJira` for this feature.

Rationale:

- Atlassian's `requestJira` bridge method is intended for UI Kit and Custom UI apps to call Jira REST APIs as the current user.
- Running calls as the current user preserves Jira workflow permissions and transition restrictions.
- The business requirement explicitly says the app must not bypass Jira workflow permissions.
- The feature does not require secrets, long-running work, storage, external services, or server-only validation.
- A backend resolver would add indirection without improving permission safety.

When a backend resolver would be justified:

- If audit logging, app storage, cross-issue aggregation, secrets, remote service integration, or server-side normalization becomes necessary.
- If product requirements require centralizing transition-name configuration outside frontend code.

If the frontend-only approach is used, implementation can remove the template resolver wiring in a later cleanup step. That cleanup changes app wiring but not business behavior if done together with replacing `invoke`.

## Required Jira REST Endpoints

Use Jira Cloud REST API v3.

Read current issue:

```http
GET /rest/api/3/issue/{issueIdOrKey}?fields=project,issuetype,status
```

Purpose:

- Confirm project key.
- Confirm issue type name.
- Read current status name.

Fetch available transitions:

```http
GET /rest/api/3/issue/{issueIdOrKey}/transitions
```

Purpose:

- Fetch only transitions available to the current user for the issue's current state.
- Enforce Jira workflow permissions/restrictions by rendering actions only from this response.

Optional transition metadata check:

```http
GET /rest/api/3/issue/{issueIdOrKey}/transitions?expand=transitions.fields
```

Purpose:

- Detect whether a transition has required fields on a transition screen.
- If required fields exist and the app cannot populate them safely, show a message directing the user to use Jira's native transition UI.

Execute selected transition:

```http
POST /rest/api/3/issue/{issueIdOrKey}/transitions
Content-Type: application/json

{
  "transition": {
    "id": "<resolved transition id>"
  }
}
```

Purpose:

- Perform the selected transition using the ID resolved from the latest available transitions response.

## Required Scopes

Current manifest scopes:

```yaml
permissions:
  scopes:
    - read:issue:jira
    - read:issue.transition:jira
    - write:issue:jira
```

Assessment:

- These are sufficient for the proposed granular-scope implementation.
- `read:issue:jira` supports reading issue fields.
- `read:issue.transition:jira` supports reading available transitions.
- `write:issue:jira` supports executing an issue transition.
- No dependency, storage, external fetch, project administration, workflow administration, or user profile scopes are required for the stated feature.

Minimality notes:

- Do not add `manage:jira-project` or `manage:jira-configuration`; the app must not edit Jira workflows.
- Do not add user, group, or admin scopes unless later requirements need them.
- Official Atlassian scope docs recommend classic scopes where available, but granular scopes are already in use and are narrower for this feature. Keep the current granular scopes unless Forge lint or deployment validation requires classic `read:jira-work` / `write:jira-work`.

## Exact Implementation File List

Files to change in implementation phase:

- `jira-finance-buttons/src/frontend/index.jsx`
  - Replace hello-world UI with finance approval panel.
  - Use `view.getContext`, `requestJira`, and optionally `view.refresh`.
  - Add status-to-action mapping.
  - Fetch issue details and transitions.
  - Resolve transition IDs by name at click time.
  - Render unavailable/completed states.
  - Handle loading, errors, and post-transition refresh.

Files to optionally change in implementation phase:

- `jira-finance-buttons/manifest.yml`
  - If frontend-only approach is implemented, remove the `resolver` reference under `jira:issuePanel` and remove the `function` module if no resolver remains.
  - Keep current scopes unless validation proves an adjustment is needed.
  - Consider adding `hasIssuePermission: TRANSITION_ISSUES` to display conditions only as a UI hint. Do not rely on it for security.

- `jira-finance-buttons/src/index.js`
  - Remove only if the resolver is removed from the manifest and no backend functions remain.

- `jira-finance-buttons/src/resolvers/index.js`
  - Remove only if the resolver is removed from the manifest and no backend functions remain.

- `jira-finance-buttons/package.json`
  - No dependency additions expected.
  - `@forge/bridge` and `@forge/react` are already present.
  - `@forge/resolver` may become removable only if resolver code is removed, but dependency cleanup is optional and should be done carefully after verifying Forge packaging.

Files not expected to change:

- `package-lock.json`, unless dependencies are intentionally removed or changed.
- Jira workflow configuration.
- Atlassian app deployment state.

## Risks And Mitigations

Transition screens requiring fields:

- Risk: Jira transitions may have required fields on transition screens. A plain transition POST with only `transition.id` can fail.
- Mitigation: Fetch transitions with `expand=transitions.fields` before executing or when loading actions. If a selected transition exposes required fields, either disable the custom button with a message or implement field collection only after requirements are confirmed.

Transition name mismatches:

- Risk: Actual Jira transition names may differ from the expected business labels, for example `Send to Review` vs `Send to review`.
- Mitigation: Confirm exact transition names in Jira. Keep button labels separate from transition names if needed.

Duplicate transition names:

- Risk: Multiple available transitions could share the same name.
- Mitigation: Treat duplicate names as ambiguous. Do not execute automatically. Show a configuration/error message requiring workflow cleanup or explicit naming.

Permission restrictions:

- Risk: Some users will not see transitions due to workflow conditions, project permissions, or issue security.
- Mitigation: Render only transitions returned by Jira for the current user. Do not call admin APIs. Do not bypass restrictions.

Issue panel visibility:

- Risk: `jira:issuePanel` is opened from an issue panel button and is not always visible inline by default.
- Mitigation: This is acceptable for the preferred approach, but stakeholders should confirm the UX. If always-visible right-side placement is required, evaluate `jira:issueContext` separately.

Display condition limitations:

- Risk: Display conditions are client-side and not sufficient for enforcement.
- Mitigation: Runtime code must verify project key and issue type after reading the issue.

Completed-state message:

- Risk: Users may expect buttons to disappear rather than showing a message.
- Mitigation: For `Payment done` and `Canceled`, render exactly: `This payment request is already completed.`

Stale transition data:

- Risk: Another user may transition the issue while the panel is open.
- Mitigation: Re-fetch issue and transitions before executing, or resolve from freshly fetched transitions at click time. Handle 400/409-style failures by reloading state.

Jira REST error handling:

- Risk: REST calls may fail with 401, 403, 404, or validation errors.
- Mitigation: Show concise errors and refresh state. Avoid exposing raw stack traces.

Docs validation status:

- Official Atlassian docs were consulted for `jira:issuePanel`, display conditions, Forge permissions/scopes, `requestJira`, `view.getContext`, `view.refresh`, and Jira issue transition REST APIs.

## Official Documentation References

- Forge Jira issue panel: https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-issue-panel/
- Forge display conditions: https://developer.atlassian.com/platform/forge/manifest-reference/display-conditions/
- Jira display conditions: https://developer.atlassian.com/platform/forge/manifest-reference/display-conditions/jira/
- Forge permissions: https://developer.atlassian.com/platform/forge/manifest-reference/permissions/
- Jira scopes for Forge apps: https://developer.atlassian.com/platform/forge/manifest-reference/scopes-product-jira/
- Forge bridge `requestJira`: https://developer.atlassian.com/platform/forge/custom-ui-bridge/requestJira/
- Forge bridge `view.getContext` and `view.refresh`: https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/view/
- Jira Cloud REST issue transitions: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueIdOrKey-transitions-get
