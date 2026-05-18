import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ForgeReconciler, {
  Button,
  Heading,
  Inline,
  SectionMessage,
  Spinner,
  Stack,
  Text,
} from '@forge/react';
import { requestJira, view } from '@forge/bridge';

const SUPPORTED_PROJECT_KEY = 'FIN';
const SUPPORTED_ISSUE_TYPE = 'Payment Request';
const COMPLETED_MESSAGE = 'This payment request is already completed.';
const UNSUPPORTED_MESSAGE = 'Finance approval actions are not available for this issue.';

const STATUS_ACTIONS = {
  New: [
    { label: 'Send to review', transitionName: 'Send to review', appearance: 'primary' },
    { label: 'Decline', transitionName: 'Decline', appearance: 'danger' },
  ],
  'Additional Review': [
    { label: 'Approve', transitionName: 'Approve', appearance: 'primary' },
    { label: 'Escalate to CEO', transitionName: 'Escalate to CEO', appearance: 'default' },
    { label: 'Decline', transitionName: 'Decline', appearance: 'danger' },
  ],
  'Review from CEO': [
    { label: 'Approve', transitionName: 'Approve', appearance: 'primary' },
    { label: 'Decline', transitionName: 'Decline', appearance: 'danger' },
  ],
  Approved: [
    { label: 'Mark as paid', transitionName: 'Mark as paid', appearance: 'primary' },
  ],
};

const COMPLETED_STATUSES = new Set(['Payment done', 'Canceled']);

class JiraAuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JiraAuthorizationError';
  }
}

const isAuthorizationError = (error) => {
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();

  return (
    error instanceof JiraAuthorizationError ||
    error?.status === 401 ||
    name.includes('authoriz') ||
    name.includes('consent') ||
    message.includes('authorize') ||
    message.includes('authorization') ||
    message.includes('consent')
  );
};

const initialState = {
  issueIdOrKey: null,
  issue: null,
  transitions: [],
  loading: true,
  processingTransitionName: null,
  error: null,
  actionMessage: null,
};

const getIssueIdOrKey = (context) => {
  const issue = context?.extension?.issue || context?.issue;

  return (
    issue?.key ||
    issue?.id ||
    context?.extension?.issueKey ||
    context?.extension?.issueId ||
    context?.issueKey ||
    context?.issueId ||
    null
  );
};

const getApiErrorMessage = (response, responseBodyText, fallbackMessage) => {
  let details = '';

  try {
    const body = responseBodyText ? JSON.parse(responseBodyText) : null;
    const messages = [
      ...(Array.isArray(body?.errorMessages) ? body.errorMessages : []),
      ...Object.values(body?.errors || {}),
    ].filter(Boolean);

    details = messages.length > 0 ? ` ${messages.join(' ')}` : '';
  } catch (error) {
    details = '';
  }

  if (response.status === 401) {
    return `${fallbackMessage} Jira returned HTTP 401. The app may be missing authorization or updated scopes; run forge deploy and forge install --upgrade, then authorize the app again if prompted.${details}`;
  }

  if (response.status === 403) {
    return `${fallbackMessage} Jira returned HTTP 403. The current Jira user may not have permission for this issue, or the workflow may restrict this transition.${details}`;
  }

  return `${fallbackMessage} Jira returned HTTP ${response.status}.${details}`;
};

const requestJson = async (path, options, fallbackMessage) => {
  // Keep all Jira REST calls on relative paths so Forge can route the request
  // through the current Jira site and apply the app/user authorization context.
  console.log(`[jira-finance-buttons] requestJira path: ${path}`);

  const response = await requestJira(path, options);

  console.log(`[jira-finance-buttons] requestJira status: ${response.status}`);

  if (!response.ok) {
    // Reading the body once here gives useful temporary diagnostics without
    // logging credentials. Jira error payloads should contain messages only.
    const responseBodyText = await response.text();

    console.log(`[jira-finance-buttons] requestJira non-OK body: ${responseBodyText}`);

    if (response.status === 401) {
      throw new JiraAuthorizationError(getApiErrorMessage(response, responseBodyText, fallbackMessage));
    }

    throw new Error(getApiErrorMessage(response, responseBodyText, fallbackMessage));
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

const fetchIssue = async (issueIdOrKey) => requestJson(
  `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}?fields=project,issuetype,status`,
  undefined,
  'Unable to load issue details.'
);

const fetchTransitions = async (issueIdOrKey) => {
  const data = await requestJson(
    `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/transitions`,
    undefined,
    'Unable to load available transitions.'
  );

  return Array.isArray(data?.transitions) ? data.transitions : [];
};

const postTransition = async (issueIdOrKey, transitionId) => requestJson(
  `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/transitions`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transition: {
        id: transitionId,
      },
    }),
  },
  'Unable to transition issue.'
);

const isSupportedIssue = (issue) => (
  issue?.fields?.project?.key === SUPPORTED_PROJECT_KEY &&
  issue?.fields?.issuetype?.name === SUPPORTED_ISSUE_TYPE
);

const resolveTransition = (transitions, transitionName) => {
  const matches = transitions.filter((transition) => transition.name === transitionName);

  if (matches.length === 0) {
    return {
      status: 'missing',
      message: `"${transitionName}" is not available for this issue and user.`,
    };
  }

  if (matches.length > 1) {
    return {
      status: 'ambiguous',
      message: `Jira returned multiple "${transitionName}" transitions. Use Jira's native transition UI or make transition names unique.`,
    };
  }

  return {
    status: 'ready',
    id: matches[0].id,
  };
};

const getSupportedActions = (statusName) => STATUS_ACTIONS[statusName] || [];

const App = () => {
  const [state, setState] = useState(initialState);

  const loadPanelState = useCallback(async (knownIssueIdOrKey) => {
    const issueIdOrKey = knownIssueIdOrKey || getIssueIdOrKey(await view.getContext());

    if (!issueIdOrKey) {
      setState((current) => ({
        ...current,
        issueIdOrKey: null,
        issue: null,
        transitions: [],
        loading: false,
        error: UNSUPPORTED_MESSAGE,
      }));
      return;
    }

    const issue = await fetchIssue(issueIdOrKey);
    const transitions = isSupportedIssue(issue) ? await fetchTransitions(issueIdOrKey) : [];

    setState((current) => ({
      ...current,
      issueIdOrKey,
      issue,
      transitions,
      loading: false,
      error: null,
    }));
  }, []);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const issueIdOrKey = getIssueIdOrKey(await view.getContext());

        if (!isMounted) {
          return;
        }

        if (!issueIdOrKey) {
          setState((current) => ({
            ...current,
            issueIdOrKey: null,
            issue: null,
            transitions: [],
            loading: false,
            error: UNSUPPORTED_MESSAGE,
          }));
          return;
        }

        const issue = await fetchIssue(issueIdOrKey);
        const transitions = isSupportedIssue(issue) ? await fetchTransitions(issueIdOrKey) : [];

        if (!isMounted) {
          return;
        }

        setState((current) => ({
          ...current,
          issueIdOrKey,
          issue,
          transitions,
          loading: false,
          error: null,
        }));
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (isAuthorizationError(error)) {
          // Authorization failures from requestJira must not be converted into
          // normal UI state, because doing so can mask Forge/Jira consent flows.
          throw error;
        }

        setState((current) => ({
          ...current,
          loading: false,
          error: error.message || 'Unable to load finance approval actions.',
        }));
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const statusName = state.issue?.fields?.status?.name;
  const supportedIssue = isSupportedIssue(state.issue);
  const availableActions = useMemo(() => getSupportedActions(statusName), [statusName]);

  const handleTransition = useCallback(async (transitionName) => {
    if (!state.issueIdOrKey) {
      return;
    }

    setState((current) => ({
      ...current,
      processingTransitionName: transitionName,
      error: null,
      actionMessage: null,
    }));

    try {
      const latestTransitions = await fetchTransitions(state.issueIdOrKey);
      const resolved = resolveTransition(latestTransitions, transitionName);

      if (resolved.status !== 'ready') {
        setState((current) => ({
          ...current,
          transitions: latestTransitions,
          processingTransitionName: null,
          actionMessage: resolved.message,
        }));
        return;
      }

      await postTransition(state.issueIdOrKey, resolved.id);
      await loadPanelState(state.issueIdOrKey);

      try {
        await view.refresh();
      } catch (error) {
        // The panel has already refreshed its own state; host refresh is best effort.
      }
    } catch (error) {
      if (isAuthorizationError(error)) {
        // Let Forge/Jira surface authorization and consent problems instead of
        // treating them like workflow restrictions or transition failures.
        throw error;
      }

      setState((current) => ({
        ...current,
        processingTransitionName: null,
        error: error.message || 'Unable to complete the selected action.',
      }));
    }
  }, [loadPanelState, state.issueIdOrKey]);

  const renderBody = () => {
    if (state.loading) {
      return (
        <Inline alignBlock="center" space="space.100">
          <Spinner size="small" />
          <Text>Loading finance approval actions...</Text>
        </Inline>
      );
    }

    if (state.error) {
      return (
        <SectionMessage appearance="error">
          <Text>{state.error}</Text>
        </SectionMessage>
      );
    }

    if (!supportedIssue) {
      return <Text>{UNSUPPORTED_MESSAGE}</Text>;
    }

    if (COMPLETED_STATUSES.has(statusName)) {
      return <Text>{COMPLETED_MESSAGE}</Text>;
    }

    if (availableActions.length === 0) {
      return <Text>{UNSUPPORTED_MESSAGE}</Text>;
    }

    return (
      <Stack space="space.200">
        {state.actionMessage ? (
          <SectionMessage appearance="warning">
            <Text>{state.actionMessage}</Text>
          </SectionMessage>
        ) : null}
        <Stack space="space.100">
          {availableActions.map((action) => {
            const resolved = resolveTransition(state.transitions, action.transitionName);
            const isProcessing = state.processingTransitionName !== null;
            const isDisabled = isProcessing || resolved.status !== 'ready';

            return (
              <Stack key={action.transitionName} space="space.050">
                <Button
                  appearance={action.appearance}
                  isDisabled={isDisabled}
                  onClick={() => handleTransition(action.transitionName)}
                >
                  {state.processingTransitionName === action.transitionName ? 'Processing...' : action.label}
                </Button>
                {resolved.status !== 'ready' ? (
                  <Text>{resolved.message}</Text>
                ) : null}
              </Stack>
            );
          })}
        </Stack>
      </Stack>
    );
  };

  return (
    <Stack space="space.200">
      <Heading as="h2">Finance Approval Actions</Heading>
      {renderBody()}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
