import cron from 'node-cron';
import { config } from '../config/index.js';
import { sendDueReminders } from '../modules/issues/due-reminder.job.js';
import { sendDailyDigests } from '../modules/notifications/daily-digest.job.js';
import { sendWorkdayNudges } from '../modules/notifications/workday-nudge.job.js';
import { sendWeeklyReports } from '../modules/reports/weekly-reports.job.js';
import { runDueRecurringTasks } from '../modules/recurring-tasks/recurring-task.service.js';
import { runPendingFollowups } from '../modules/meetings/meeting.followup.js';
import { sendMeetingReminders } from '../modules/meetings/meeting.notify.js';
import { purgeOldTranscripts } from '../modules/meetings/meeting.search.js';
import { continueMeetingSeries, syncFromCalendars } from '../modules/meetings/meeting.service.js';
import { settleIdleMeetings } from '../modules/meetings/meeting.signaling.js';
import { sendStandupDigests } from '../modules/standups/standup-digest.job.js';
import { sendStandupReminders } from '../modules/standups/standup-reminder.job.js';
import { purgeExpiredMessages } from '../modules/support/support.service.js';
import { logger } from '../shared/logger.js';
import { recordFail, recordOk } from '../shared/ops/signals.js';

const JOBS = [
  { name: 'recurring-tasks', schedule: '* * * * *', run: runDueRecurringTasks },
  { name: 'due-reminders', schedule: '*/15 * * * *', run: sendDueReminders },
  // Hourly: each user receives it at 8:00 in their own time zone.
  { name: 'daily-digest', schedule: '0 * * * *', run: () => sendDailyDigests() },
  // Hourly: Monday 08:00 local — weekly reports overview for opted-in users.
  { name: 'weekly-reports', schedule: '0 * * * *', run: () => sendWeeklyReports() },
  // Hourly: day-2 / day-7 workday habit nudge at 10:00 local (weekdays).
  { name: 'workday-nudges', schedule: '0 * * * *', run: () => sendWorkdayNudges() },
  // Hourly: standup nudge at each project's reminder hour in the person's zone (weekdays).
  { name: 'standup-reminders', schedule: '0 * * * *', run: () => sendStandupReminders() },
  // Hourly: manager standup rollup at each project's digest hour.
  { name: 'standup-digests', schedule: '0 * * * *', run: () => sendStandupDigests() },
  { name: 'expired-support-messages', schedule: '*/5 * * * *', run: purgeExpiredMessages },
  { name: 'idle-meetings', schedule: '*/2 * * * *', run: settleIdleMeetings },
  { name: 'meeting-series', schedule: '* * * * *', run: continueMeetingSeries },
  { name: 'meeting-reminders', schedule: '* * * * *', run: sendMeetingReminders },
  // Moves, cancellations and RSVPs from hosts' connected Google / Microsoft calendars.
  { name: 'calendar-sync', schedule: '*/5 * * * *', run: async () => (await syncFromCalendars()).changed },
  // Summaries, chapters, search index and recaps for meetings that ended.
  { name: 'meeting-followups', schedule: '*/2 * * * *', run: runPendingFollowups },
  { name: 'transcript-retention', schedule: '30 3 * * *', run: () => purgeOldTranscripts(config.meetings.transcriptDays) },
];

/** Wraps a job so overlapping executions are skipped; successes/failures feed ops signals + structured logs. */
function guard(job) {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      const result = await job.run();
      recordOk('jobs', job.name);
      if (result) logger.info(`job ${job.name} processed items`, { area: 'jobs', job: job.name, count: result });
    } catch (error) {
      recordFail('jobs', job.name, error);
      logger.error(`job ${job.name} failed`, { area: 'jobs', job: job.name, error });
    } finally {
      running = false;
    }
  };
}

const tasks = [];

export function startScheduler() {
  if (!config.jobs.enabled) {
    logger.info('background jobs disabled (JOBS_ENABLED=false)', { area: 'jobs' });
    return;
  }
  JOBS.forEach((job) => tasks.push(cron.schedule(job.schedule, guard(job))));
  logger.info(`scheduled jobs: ${JOBS.map((job) => job.name).join(', ')}`, { area: 'jobs' });
}

/** Stops scheduling new runs (a run in progress finishes). */
export function stopScheduler() {
  tasks.splice(0).forEach((task) => task.stop());
}
