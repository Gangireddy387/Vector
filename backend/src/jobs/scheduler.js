import cron from 'node-cron';
import { config } from '../config/index.js';
import { sendDueReminders } from '../modules/issues/due-reminder.job.js';
import { sendDailyDigests } from '../modules/notifications/daily-digest.job.js';
import { runDueRecurringTasks } from '../modules/recurring-tasks/recurring-task.service.js';
import { settleIdleMeetings } from '../modules/meetings/meeting.signaling.js';
import { purgeExpiredMessages } from '../modules/support/support.service.js';

const JOBS = [
  { name: 'recurring-tasks', schedule: '* * * * *', run: runDueRecurringTasks },
  { name: 'due-reminders', schedule: '*/15 * * * *', run: sendDueReminders },
  // Hourly: each user receives it at 8:00 in their own time zone.
  { name: 'daily-digest', schedule: '0 * * * *', run: () => sendDailyDigests() },
  { name: 'expired-support-messages', schedule: '*/5 * * * *', run: purgeExpiredMessages },
  { name: 'idle-meetings', schedule: '*/2 * * * *', run: settleIdleMeetings },
];

/** Wraps a job so overlapping executions are skipped and failures are logged. */
function guard(job) {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      const result = await job.run();
      if (result) console.info(`[jobs] ${job.name} processed ${result} item(s)`);
    } catch (error) {
      console.error(`[jobs] ${job.name} failed:`, error);
    } finally {
      running = false;
    }
  };
}

export function startScheduler() {
  if (!config.jobs.enabled) {
    console.info('[jobs] background jobs disabled (JOBS_ENABLED=false)');
    return;
  }
  JOBS.forEach((job) => cron.schedule(job.schedule, guard(job)));
  console.info(`[jobs] scheduled: ${JOBS.map((job) => job.name).join(', ')}`);
}
