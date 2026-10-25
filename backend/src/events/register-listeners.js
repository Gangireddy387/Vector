import { registerAutomationListeners } from '../modules/automations/automation.listener.js';
import { registerIssueListeners } from '../modules/issues/issue.listener.js';
import { registerNotificationListeners } from '../modules/notifications/notification.listener.js';
import { registerRealtimeListeners } from '../shared/realtime/realtime.listener.js';

/** Wires every domain-event subscriber. Called once during startup. */
export function registerListeners() {
  registerIssueListeners();
  registerAutomationListeners();
  registerNotificationListeners();
  registerRealtimeListeners();
}
