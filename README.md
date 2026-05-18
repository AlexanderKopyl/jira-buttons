# jira-buttons

Documentation for the Jira Cloud Forge app in `jira-finance-buttons/`.

## Project Overview

This repository contains an Atlassian Forge app for Jira Cloud. The app adds a `jira:issuePanel` named **Finance Approval Actions** to FIN Payment Request issues.

The panel helps finance users run allowed Jira workflow transitions from the issue page. It uses the Jira REST API through Forge bridge `requestJira`; Jira workflow permissions, workflow conditions, validators, and issue status remain the source of truth. The app must not bypass Jira workflow restrictions.

Supported Jira project: `FIN`

Supported issue/work type: `Payment Request`

Main actions:

- Send to review
- Approve
- Decline
- Escalate to CEO
- Mark as paid

## Requirements

- macOS / zsh friendly setup
- Node.js 22.x or 24.x
- npm
- Forge CLI
- Atlassian account
- Jira site access
- Forge Developer Space
- Jira permission to install and test Forge apps

## Node.js Setup With nvm

Forge CLI supports Node.js 22.x or 24.x. Node.js 26.x is not supported for Forge CLI.

```bash
nvm install 22
nvm use 22
nvm alias default 22

node -v
npm -v
```

## Forge CLI Setup

```bash
npm install -g @forge/cli@latest
forge --version
```

## Atlassian API Token for Forge Login

Open Atlassian Account -> Security -> API tokens.

Create an API token for Forge CLI login. Use a scoped Forge token if that option is available for your account.

Store the token in 1Password or another password manager. Never commit the token to git. This token is used only for `forge login`.

## Forge Login

```bash
forge login
forge whoami
```

When prompted:

- Email = your Atlassian email.
- Password = API token, not your normal Atlassian password.
- On a macOS Keychain prompt, enter your Mac login password and allow access.

## Install Project Dependencies

```bash
cd jira-finance-buttons
npm install
```

## Validate App

```bash
forge lint
```

## Deploy Development App

```bash
forge deploy
```

## Install App to Jira Site

```bash
forge install
```

Select Jira, enter the Jira site URL, select the development environment, and confirm the requested scopes.

Example Jira site URL:

```bash
s-hub.atlassian.net
```

## Upgrade After Manifest, Scope, or Code Changes

```bash
forge deploy
forge install --upgrade
```

Run the upgrade after adding or changing scopes, after manifest changes, and when Jira needs to re-authorize the app. A browser hard refresh may also be needed after changes:

```bash
Cmd + Shift + R
```

## Debug / Tunnel

```bash
forge tunnel
```

Use the tunnel to see frontend and debug logs while developing. Keep the app installed on the same Jira site and environment that you are testing.

## Jira Test Checklist

- Open a test FIN Payment Request issue.
- Check that the Finance Approval Actions panel appears.
- Check buttons by status:
  - New: Send to review, Decline
  - Additional Review: Approve, Escalate to CEO, Decline
  - Review from CEO: Approve, Decline
  - Approved: Mark as paid
  - Payment done / Canceled: completed message
- Do not test first on real production payment requests.
- Test with authorized and unauthorized users.

## Troubleshooting

### Unsupported Node.js Version

Fix: use Node.js 22 or 24 through `nvm`.

### `nvm: command not found`

Fix: install `nvm` first, then restart the shell or source your shell profile.

### macOS Keychain Prompt

Fix: use your Mac login password, not your Atlassian password or API token.

### 401 Unauthorized; Scope Does Not Match

Fix:

- Check `manifest.yml` scopes.
- Run `forge deploy`.
- Run `forge install --upgrade`.
- Re-authorize the app if prompted.

### Panel Not Visible

Check:

- The app is installed on the correct Jira site.
- The issue is in project `FIN`.
- The issue/work type is exactly `Payment Request`.
- `displayConditions` in `jira-finance-buttons/manifest.yml`.
- Hard refresh the Jira page.

### Button Unavailable

Jira did not return this transition for the current user and status.

Check workflow permissions, workflow conditions, groups, and current issue status.

### Transition POST Fails

Possible reasons:

- Required transition screen fields
- Workflow validator
- User lacks permission
- Stale issue status

## Security Notes

- Never commit Atlassian API tokens.
- Never hardcode transition IDs.
- Do not bypass Jira workflow permissions.
- Do not add admin scopes unless explicitly required.
- Do not expose Finance data outside the Jira issue context.

## Rollback

```bash
forge uninstall
```

Uninstalling the Forge app does not change Jira workflows. Jira statuses, transitions, and permissions remain untouched.
