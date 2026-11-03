import cron from 'node-cron';
import { config } from '../config/index.js';
import { sendDueReminders } from '../modules/issues/due-reminder.job.js';
import { sendDailyDigests } from '../modules/notifications/daily-digest.job.js';
import { runDueRecurringTasks } from '../modules/recurring-tasks/recurring-task.service.js';
import { runPendingFollowups } from '../modules/meetings/meeting.followup.js';
import { sendMeetingReminders } from '../modules/meetings/meeting.notify.js';
import { purgeOldTranscripts } from '../modules/meetings/meeting.search.js';
import { continueMeetingSeries, syncFromCalendars } from '../modules/meetings/meeting.service.js';
import { settleIdleMeetings } from '../modules/meetings/meeting.signaling.js';
import { purgeExpiredMessages } from '../modules/support/support.service.js';

const JOBS = [
  { name: 'recurring-tasks', schedule: '* * * * *', run: runDueRecurringTasks },
  { name: 'due-reminders', schedule: '*/15 * * * *', run: sendDueReminders },
  // Hourly: each user receives it at 8:00 in their own time zone.
  { name: 'daily-digest', schedule: '0 * * * *', run: () => sendDailyDigests() },
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

const tasks = [];

export function startScheduler() {
  if (!config.jobs.enabled) {
    console.info('[jobs] background jobs disabled (JOBS_ENABLED=false)');
    return;
  }
  JOBS.forEach((job) => tasks.push(cron.schedule(job.schedule, guard(job))));
  console.info(`[jobs] scheduled: ${JOBS.map((job) => job.name).join(', ')}`);
}

/** Stops scheduling new runs (a run in progress finishes). */
export function stopScheduler() {
  tasks.splice(0).forEach((task) => task.stop());
}
