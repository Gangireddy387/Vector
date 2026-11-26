import type { Component } from 'vue'
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FolderKanban,
  GitBranch,
  House,
  Inbox,
  Kanban,
  ListTodo,
  MessageCircle,
  Package,
  Sparkles,
  Target,
  Video,
  Workflow,
} from 'lucide-vue-next'
import type { PlanFeatureKey } from '@/lib/plan-features'

export type GuideCategory = 'path' | 'workday' | 'collaborate' | 'plan' | 'admin'

export interface GuideStep {
  title: string
  detail: string
  /** Extra bullet points under the step (where to click, what you’ll see). */
  hints?: string[]
}

export interface GuideExample {
  title: string
  story: string
  outcome: string
}

export interface GuideTopic {
  id: string
  order: number
  title: string
  summary: string
  category: GuideCategory
  icon: Component
  routeNames?: string[]
  features?: PlanFeatureKey[]
  whenToUse: string
  steps: GuideStep[]
  example: GuideExample
  tips?: string[]
}

export const GUIDE_CATEGORIES: Array<{ id: GuideCategory; label: string; blurb: string }> = [
  { id: 'path', label: 'Learn path', blurb: 'Follow in order' },
  { id: 'workday', label: 'Workday', blurb: 'Home, inbox, calendar' },
  { id: 'collaborate', label: 'Collaborate', blurb: 'Chat, meetings' },
  { id: 'plan', label: 'Plan & report', blurb: 'Goals, roadmap' },
  { id: 'admin', label: 'Workspace', blurb: 'Wiki & more' },
]

/** Numbered how-to path with detailed steps and hints. */
export const GUIDE_TOPICS: GuideTopic[] = [
  {
    id: 'projects',
    order: 1,
    title: '1 · Projects',
    summary: 'A project holds the board, tasks, chat, and releases for one body of work.',
    category: 'path',
    icon: FolderKanban,
    routeNames: ['projects', 'project', 'project-settings'],
    whenToUse:
      'Create one project per product, launch, or client stream. Keep scope clear so the board, Work chat, and releases stay easy to follow — avoid one mega-project for unrelated work.',
    steps: [
      {
        title: 'Open Projects',
        detail:
          'Use the left sidebar Projects section, or press G then P. You will see projects you belong to, favorites at the top when set, and archived projects if you enable that filter.',
        hints: [
          'On desktop, projects also appear as a list under Projects in the sidebar for quick jump.',
          'If the list is empty, you are not on a project yet — create one or ask an admin to add you.',
        ],
      },
      {
        title: 'Create a project (or start from a sample)',
        detail:
          'Click New project. Enter a clear name (for example “Website launch”), choose Kanban for continuous flow or Scrum if you want a backlog and sprints, then set a key and color if offered. New organizations can create a sample project with demo tasks already filled — useful the first time; keep or wipe it later from the banner on that project.',
        hints: [
          'Kanban: work flows through columns with no required sprint.',
          'Scrum: use Backlog + sprints for planned iterations.',
          'Name the project for outsiders too — “Q2 Website” beats “Stuff”.',
        ],
      },
      {
        title: 'Add people to the project',
        detail:
          'Open the project → Settings (project admins) or ask an organization admin to add members. Assign Member or Admin so teammates can see the board, Work chat, and tasks.',
        hints: [
          'Admins can change settings and invite others; members can work on tasks and chat.',
          'People only see projects they belong to unless they have broader org access.',
        ],
      },
      {
        title: 'Start on the Board',
        detail:
          'After create you usually land on Board — the default place for daily work. Other tabs (Tasks, Releases, Standup, Roadmap, and more) sit along the top of the project.',
        hints: [
          'Use Board for day-to-day movement; use Tasks when you need filters or bulk edits.',
          'Bookmark the project from the sidebar so it stays one click away.',
        ],
      },
    ],
    example: {
      title: 'Website launch',
      story:
        'Marketing creates “Website launch”, invites design and engineering, chooses Kanban, then opens Board with columns To do → In progress → Done. Work chat and Releases stay on the same project for go-live.',
      outcome: 'One shared home for the launch: board, chat, tasks, and later release notes.',
    },
    tips: [
      'Prefer several focused projects over one catch-all — filters, chat, and releases stay clearer.',
      'If you are exploring Vector for the first time, create the sample project, walk the board, then wipe or keep it.',
    ],
  },
  {
    id: 'board',
    order: 2,
    title: '2 · Board',
    summary: 'Status columns with cards you drag as work moves forward.',
    category: 'path',
    icon: Kanban,
    routeNames: ['project-board'],
    whenToUse:
      'Use the board for daily standups and execution. Prefer the Tasks list when you need heavy filters, saved views, or bulk edits.',
    steps: [
      {
        title: 'Open Board inside a project',
        detail:
          'Click a project in the sidebar, then choose the Board tab (often the default). Columns match your workflow statuses such as To do, In progress, and Done.',
        hints: [
          'Column names come from the project workflow — admins can adjust statuses in project settings.',
          'Empty columns are normal at the start; create cards to fill them.',
        ],
      },
      {
        title: 'Create a card',
        detail:
          'Press C anywhere, or use Create task. Enter a clear title, pick type (task, bug, story), assignee, and due date when you know them. The card appears in the starting column.',
        hints: [
          'Write titles as outcomes: “Wire Stripe checkout” not “Fix stuff”.',
          'Assignee + due date make the card show up on Home and Inbox for the right person.',
        ],
      },
      {
        title: 'Move work across columns',
        detail:
          'Drag a card into the next status, or focus the card and use Alt + arrow keys. Moving into Done (or your completed status) updates progress for reports and Home.',
        hints: [
          'If a card sits in In progress for days, ask in standup — it may be blocked or oversized.',
          'Moving status is the main signal for velocity and burndown charts.',
        ],
      },
      {
        title: 'Run standup from the board',
        detail:
          'Walk left-to-right or by person. Ask about cards stuck In progress, then move, split, or reassign. Crowded middle columns usually mean a bottleneck.',
        hints: [
          'Open a card only when you need detail; the column view is the story for most standups.',
          'Pair with written Standup (topic 8) so remote teammates still get done / next / blocked.',
        ],
      },
    ],
    example: {
      title: 'Standup walk-through',
      story:
        'The lead opens Board, sees three cards stuck In progress, asks owners, then moves “Contact form” to Done after QA confirms.',
      outcome: 'The column layout tells the story without opening every task.',
    },
    tips: [
      'Scrum projects also have a Backlog tab for work not yet pulled onto the board.',
      'Keep WIP low — fewer cards In progress usually means faster finish rates.',
    ],
  },
  {
    id: 'tasks',
    order: 3,
    title: '3 · Tasks',
    summary: 'Create, filter, assign, comment, and track every piece of work.',
    category: 'path',
    icon: ListTodo,
    routeNames: ['issues', 'issue', 'issue-create', 'project-issues'],
    whenToUse:
      'Anything that needs an owner, status, or due date — features, bugs, and follow-ups from meetings or chat.',
    steps: [
      {
        title: 'Create a task',
        detail:
          'Press C (or Create task in the sidebar). Write a specific title, add a Markdown description if needed, choose project, assignee, priority, and due date. Save — it appears on Board, Tasks, and (if assigned to you) Home.',
        hints: [
          'Description supports Markdown: lists, bold, and checklists for acceptance criteria.',
          'Quick-add syntax next to the title can set @assignee and due dates in one line.',
        ],
      },
      {
        title: 'Fill the important fields',
        detail:
          'Open the task. Set labels, parent/epic, sprint (Scrum), and Fix version when you use Releases. Attach files and link related tasks when that helps the next person.',
        hints: [
          'Fix version ties the task to a release (see topic 4).',
          'Parent/epic keeps related work grouped on Roadmap and reports.',
        ],
      },
      {
        title: 'Collaborate on the task',
        detail:
          'Use comments and @mentions so people get Inbox alerts. Log time if your plan includes time tracking. Update status as work moves, or drag the card on the board.',
        hints: [
          '@mentions notify the person in Inbox — better than hoping they saw Work chat.',
          'Keep decisions on the task when possible so history stays with the work.',
        ],
      },
      {
        title: 'Find work again',
        detail:
          'Use Tasks (all work) or the project Tasks tab. Filter by assignee, status, label, or search with Ctrl/⌘ K.',
        hints: [
          'Saved filters help if you reopen the same view every morning.',
          'Global search finds tasks, projects, people, and wiki pages from one box.',
        ],
      },
    ],
    example: {
      title: 'Bug from a meeting',
      story:
        'Someone reports checkout failing on promo codes. You create “Checkout 500 on promo codes”, assign eng, due tomorrow, and paste the error in the description.',
      outcome: 'It appears on Home, Inbox for the assignee, and the project board immediately.',
    },
    tips: [
      'If chat creates action items, turn them into tasks the same day so they get owners.',
      'Small, clear tasks finish faster than vague epics without children.',
    ],
  },
  {
    id: 'releases',
    order: 4,
    title: '4 · Releases',
    summary: 'Name versions you ship, tag issues, generate notes, and mark released.',
    category: 'path',
    icon: Package,
    routeNames: ['project-releases', 'project-release'],
    features: ['releases'],
    whenToUse:
      'Website launches, app updates, or any named drop you ship to users. Releases turn “what we finished” into a changelog.',
    steps: [
      {
        title: 'Open Releases for the project',
        detail:
          'Inside the project, open the Releases tab. Use All / Unreleased / Released / Archived to filter. Project editors see New version.',
        hints: [
          'If the tab is locked, your plan may not include Releases — ask an admin.',
          'Empty state means no versions yet — create the first one before tagging tasks.',
        ],
      },
      {
        title: 'Create a version',
        detail:
          'Click New version. Name it clearly (v1.0, April drop). Optionally add description, start date, and target release date. Save — you open that version’s detail page.',
        hints: [
          'Use names people will recognize in release notes and support tickets.',
          'Keep one active Unreleased version per upcoming ship when possible.',
        ],
      },
      {
        title: 'Tag Fix versions on shipping tasks',
        detail:
          'Open each task that will ship and set Fix version to that version (for example v1.0). Release notes are built from those tasks. Use Affected version only when a bug was found in an already-shipped version.',
        hints: [
          'Fix version = “ships in”. Affected version = “broken in”.',
          'Tag early so notes stay accurate as you approach launch day.',
        ],
      },
      {
        title: 'Generate notes and mark Released',
        detail:
          'On the version page, generate markdown release notes from fix-version issues, edit the text, then mark Released when you actually ship. Archive older versions later so the list stays clean.',
        hints: [
          'Edit notes for customers — remove internal jargon before sharing.',
          'Mark Released on the real ship day so dates stay trustworthy.',
        ],
      },
    ],
    example: {
      title: 'Website launch v1.0',
      story:
        'Create v1.0. Tag Homepage hero, Contact form, and SEO meta with Fix version v1.0. When they are Done, generate notes listing those three, then mark Released on launch day.',
      outcome: 'Stakeholders get a clear changelog; later bugs can point at Affected version v1.0.',
    },
    tips: [
      'Filter Unreleased vs Released so old versions stay out of daily view.',
      'If a task slips out of the release, clear its Fix version before generating notes.',
    ],
  },
  {
    id: 'dependencies',
    order: 5,
    title: '5 · Dependencies',
    summary: 'Mark which tasks block others so the critical path stays visible.',
    category: 'path',
    icon: GitBranch,
    routeNames: ['project-dependencies'],
    whenToUse:
      'When work cannot start until something else finishes — API before UI, design before build, legal before launch.',
    steps: [
      {
        title: 'Open Dependencies',
        detail: 'Inside the project, open the Dependencies tab to see linked work as a graph or list.',
        hints: ['You can also add links from a task’s relation fields when available.'],
      },
      {
        title: 'Link blocking work',
        detail:
          'Mark that task A blocks task B (or B is blocked by A). Only create links for real blockers — soft preferences clutter the graph.',
        hints: [
          'Example: “Stripe webhook” blocks “Payments UI”.',
          'Update or remove the link when the blocker is gone.',
        ],
      },
      {
        title: 'Plan around blockers',
        detail:
          'Finish or re-scope upstream work first. The board and dependency view highlight stuck chains so nobody starts too early.',
        hints: [
          'In standup, call out blocked cards by name.',
          'If a blocker will take weeks, split the downstream task so some work can proceed.',
        ],
      },
    ],
    example: {
      title: 'Payments after API',
      story:
        '“Payments UI” is blocked by “Stripe webhook”. Eng finishes the webhook; the link clears; UI moves to In progress.',
      outcome: 'No mystery idle cards waiting on unspoken blockers.',
    },
    tips: ['Dependencies explain waiting; status columns show movement — use both.'],
  },
  {
    id: 'home',
    order: 6,
    title: '6 · Home & Start my day',
    summary: 'Your morning loop: standup, focus tasks, meetings, and messages.',
    category: 'workday',
    icon: House,
    routeNames: ['home'],
    whenToUse: 'First thing each workday — set priorities before deep work.',
    steps: [
      {
        title: 'Open Home',
        detail:
          'Sidebar Home, or press G then H. Home shows what needs you today across projects — not an empty dashboard.',
        hints: ['New admins may also see a short setup checklist until the first project and invites are done.'],
      },
      {
        title: 'Run Start my day',
        detail:
          'Follow the loop: post or review standup → pick a few focus tasks → check upcoming meetings → skim messages and Inbox. Clear blockers before long focus blocks.',
        hints: [
          'Keep focus to 1–3 tasks so the day stays realistic.',
          'If standup is locked on your plan, skip to tasks and meetings.',
        ],
      },
      {
        title: 'Work from the cards',
        detail:
          'Open tasks from Home, join meetings from meeting cards, and jump into project Standup or Board when a card points you there.',
        hints: ['Return to Home after lunch to re-check Inbox and due items.'],
      },
    ],
    example: {
      title: 'Monday morning',
      story:
        'You open Home, post standup (“Shipped form, next: payments, blocked on API keys”), pin two payment tasks, then join the 10am call from the meetings card.',
      outcome: 'Priorities are clear before 10:15.',
    },
    tips: ['Home works best when tasks have assignees and due dates.'],
  },
  {
    id: 'inbox',
    order: 7,
    title: '7 · Inbox',
    summary: 'Assignments, mentions, due dates, and other alerts in one place.',
    category: 'workday',
    icon: Inbox,
    routeNames: ['inbox'],
    whenToUse: 'After standup and whenever you return from focus time.',
    steps: [
      {
        title: 'Open Inbox',
        detail: 'Sidebar Inbox, or G then I. Unread items show a badge on the nav link.',
        hints: ['Process Inbox in batches so focus time stays protected.'],
      },
      {
        title: 'Act on each item',
        detail:
          'Open the linked task or chat, reply or update status, then mark read. Do not leave mentions sitting — teammates assume you saw them.',
        hints: ['If it becomes new work, create a task instead of only replying in chat.'],
      },
      {
        title: 'Tune notifications',
        detail:
          'Account settings → notifications and quiet hours so evenings and focus blocks stay quieter without missing critical alerts.',
        hints: ['Quiet hours mute non-urgent noise; critical call alerts may still come through depending on settings.'],
      },
    ],
    example: {
      title: 'Mention while heads-down',
      story:
        'A teammate @mentions you on “SEO meta”. Inbox surfaces the comment; you reply without hunting Work chat history.',
      outcome: 'Nothing important lives only in a buried chat thread.',
    },
    tips: ['Clear Inbox before ending the day so tomorrow’s Home starts clean.'],
  },
  {
    id: 'standup',
    order: 8,
    title: '8 · Standup',
    summary: 'Daily written update: done / next / blockers for the project.',
    category: 'collaborate',
    icon: ClipboardList,
    routeNames: ['project-standup', 'standup-rollup'],
    features: ['chat'],
    whenToUse:
      'Every working day — especially when the team is distributed or skips a live stand-up call.',
    steps: [
      {
        title: 'Open Standup for the project',
        detail:
          'Project → Standup tab, or follow the link from Home’s Start my day. Leads can use Standup rollup across projects.',
        hints: ['Post in the project where the work lives, not a random channel.'],
      },
      {
        title: 'Write three beats',
        detail:
          'Done — what you finished. Next — what you will do. Blocked — anything stuck (people, access, decisions). Keep it short and specific.',
        hints: [
          'Name tasks or keys when you can (“WEB-12 contact form”).',
          'Empty Blocked is fine — write “None” so leads know you checked.',
        ],
      },
      {
        title: 'Read the team',
        detail:
          'Skim others’ posts for blockers you can clear. Use rollup if you lead more than one project.',
        hints: ['Reply or create a task when you can unblock someone the same day.'],
      },
    ],
    example: {
      title: 'Blocked on keys',
      story:
        'You write “Blocked: waiting on Stripe live keys”. The lead sees it in rollup and unblocks procurement the same morning.',
      outcome: 'Blockers surface early instead of in Friday surprises.',
    },
    tips: ['Written standup + Board walk is stronger than either alone.'],
  },
  {
    id: 'work-chat',
    order: 9,
    title: '9 · Work chat',
    summary: 'Project channel for decisions next to the board.',
    category: 'collaborate',
    icon: MessageCircle,
    routeNames: ['project-chat'],
    features: ['chat'],
    whenToUse:
      'Project-specific discussion, links, and screenshots. Use Messages for private 1:1s.',
    steps: [
      {
        title: 'Open Work chat',
        detail: 'Inside the project, open the Work chat tab. Everyone on the project can see the channel.',
        hints: ['Keep customer-sensitive chat in the right project only.'],
      },
      {
        title: 'Keep context here',
        detail:
          'Paste task keys, decisions, and screenshots. Prefer Work chat over scattered DMs for anything the whole project needs.',
        hints: ['Link the task key so people can open the work in one click.'],
      },
      {
        title: 'Turn talk into tasks',
        detail:
          'When someone agrees to do work, create a task with an owner and due date so it appears on the board — chat alone is easy to forget.',
        hints: ['Same-day create is the habit that prevents “we talked about it” debt.'],
      },
    ],
    example: {
      title: 'Design sign-off',
      story:
        'Design drops the final hero image in Work chat. Eng creates “Homepage hero” and attaches the asset.',
      outcome: 'Decision and task stay linked to the same project.',
    },
    tips: ['If a thread gets long, summarize the decision in a task comment too.'],
  },
  {
    id: 'messages',
    order: 10,
    title: '10 · Messages',
    summary: 'Direct messages and team/department chats for people.',
    category: 'collaborate',
    icon: MessageCircle,
    routeNames: ['messages'],
    features: ['directMessages', 'teamChat'],
    whenToUse: '1:1 feedback, team announcements, and questions that are not project-specific.',
    steps: [
      {
        title: 'Open Messages',
        detail: 'Sidebar Messages. You will see DMs and team/department channels your plan includes.',
        hints: ['Unread badges show on the Messages nav item.'],
      },
      {
        title: 'Start or open a conversation',
        detail: 'Pick a person for a DM, or open your team/department chat for group updates.',
        hints: ['Use team chat for announcements; use project Work chat for delivery work.'],
      },
      {
        title: 'Promote real work to tasks',
        detail:
          'If the chat becomes actionable work, create a task in the right project so it gets status, owner, and board visibility.',
        hints: ['Attach files to the task after the DM so nothing lives only in chat history.'],
      },
    ],
    example: {
      title: 'Quick unblock',
      story:
        'You DM design for an alt crop; they send a file; you attach it on the Homepage hero task.',
      outcome: 'Fast chat without losing the file off the task.',
    },
    tips: ['Private feedback belongs in DMs; project decisions belong in Work chat or on the task.'],
  },
  {
    id: 'meetings',
    order: 11,
    title: '11 · Meetings & calls',
    summary: 'Schedule meetings, join browser video, and capture follow-ups as tasks.',
    category: 'collaborate',
    icon: Video,
    routeNames: ['meetings', 'meeting', 'meeting-room', 'support-call'],
    features: ['meetings'],
    whenToUse: 'Reviews, stand-ups, customer calls — anything that needs faces or a shared session.',
    steps: [
      {
        title: 'Open Meetings',
        detail: 'Workday → Meetings (or the sidebar entry). Schedule with invitees and time, or start an instant call.',
        hints: ['Add a clear title and agenda so people know why they are invited.'],
      },
      {
        title: 'Join in the browser',
        detail:
          'Mute/unmute, share screen, reactions, and captions when available. Guests can join from a link when you share one.',
        hints: ['Test camera/mic before customer calls.', 'Share the board or a task during reviews.'],
      },
      {
        title: 'Capture follow-ups',
        detail:
          'Before the call fades, create tasks from action items with owners and due dates. Use AI summaries if your plan includes them.',
        hints: ['One task per owner beats a long notes doc nobody opens.'],
      },
    ],
    example: {
      title: 'Launch go/no-go',
      story:
        'You schedule the review, share the board on the call, then create three follow-up tasks from the recap.',
      outcome: 'Decisions leave with owners instead of fading from memory.',
    },
    tips: ['If nobody owns the follow-up, it did not really leave the meeting.'],
  },
  {
    id: 'calendar',
    order: 12,
    title: '12 · Calendar',
    summary: 'Meetings and task due dates in one place.',
    category: 'workday',
    icon: CalendarDays,
    routeNames: ['calendar'],
    features: ['calendar'],
    whenToUse: 'Weekly planning and avoiding stacked deadlines on the same day.',
    steps: [
      {
        title: 'Open Calendar',
        detail: 'Workday section → Calendar.',
        hints: ['Switch week/month views to plan load, not only today.'],
      },
      {
        title: 'Scan meetings and due dates',
        detail:
          'See upcoming meetings plus task due dates. Assignees can get due dates as all-day events when sync is on.',
        hints: ['Clustered dues on one day are a signal to renegotiate scope or dates.'],
      },
      {
        title: 'Jump into work',
        detail: 'Open a due-date event to land on the task, or open a meeting to join or prep.',
        hints: ['After moving a due date on the task, confirm Calendar reflects it.'],
      },
    ],
    example: {
      title: 'Thursday crunch',
      story:
        'Calendar shows three dues and a 2pm review. You pull two tasks earlier in the week so Thursday only holds review prep.',
      outcome: 'Deadlines stop stacking on one afternoon.',
    },
    tips: ['Calendar is a planning lens; Board is the execution lens.'],
  },
  {
    id: 'roadmap',
    order: 13,
    title: '13 · Roadmap',
    summary: 'Timeline of epics and tasks by start and due dates.',
    category: 'plan',
    icon: CalendarDays,
    routeNames: ['project-roadmap'],
    features: ['roadmap'],
    whenToUse: 'Communicate sequence and overlap for a quarter or a launch.',
    steps: [
      {
        title: 'Set dates on work',
        detail: 'Give epics and important tasks start and due dates so they can appear on the timeline.',
        hints: ['Undated work will not show as bars — dates are required for the picture.'],
      },
      {
        title: 'Open Roadmap',
        detail: 'Project → Roadmap to see bars across time.',
        hints: ['Use it in planning reviews with stakeholders who do not live on the board.'],
      },
      {
        title: 'Adjust when scope changes',
        detail: 'Shift dates when plans change so stakeholders always see an honest picture.',
        hints: ['Update linked Goals (topic 14) if the roadmap slip affects OKRs.'],
      },
    ],
    example: {
      title: 'Q2 launch',
      story:
        'Design spans April; build May–June; marketing after build. Roadmap shows the overlap at a glance.',
      outcome: 'Sequence is clear without opening every task.',
    },
    tips: ['Roadmap is for sequence; Board is for today’s movement.'],
  },
  {
    id: 'goals',
    order: 14,
    title: '14 · Goals & OKRs',
    summary: 'Organization objectives with measurable key results linked to work.',
    category: 'plan',
    icon: Target,
    routeNames: ['goals', 'goal'],
    features: ['goals'],
    whenToUse: 'Connect day-to-day tasks to company outcomes for the quarter.',
    steps: [
      {
        title: 'Create a goal',
        detail: 'Open Goals → new objective with a clear owner and time frame.',
        hints: ['Write objectives as outcomes, not activity lists.'],
      },
      {
        title: 'Add key results',
        detail: 'Measurable targets such as “Launch conversion ≥ 3%” or “+20% demo requests”.',
        hints: ['Prefer numbers you can check without a debate.'],
      },
      {
        title: 'Link projects or tasks',
        detail: 'Attach the work that moves each key result so board progress feeds the OKR.',
        hints: ['Review links in weekly leadership reviews, not only at quarter end.'],
      },
    ],
    example: {
      title: 'Grow signups',
      story:
        'Objective “Grow qualified signups”, KR “+20% demo requests”, linked to Website launch SEO and contact form tasks.',
      outcome: 'Progress on the board visibly feeds the goal.',
    },
    tips: ['Fewer sharp OKRs beat many vague ones.'],
  },
  {
    id: 'reports',
    order: 15,
    title: '15 · Reports & progress',
    summary: 'Velocity, burndown, workload, and team insights.',
    category: 'plan',
    icon: BarChart3,
    routeNames: ['reports', 'project-reports', 'project-progress'],
    features: ['reports'],
    whenToUse: 'Weekly reviews, sprint demos, and capacity checks.',
    steps: [
      {
        title: 'Open Progress or Reports',
        detail:
          'Inside a project use Progress/Reports for local health, or global Reports for the organization.',
        hints: ['Start with one project you know before reading org-wide charts.'],
      },
      {
        title: 'Pick a period',
        detail: 'Compare this sprint or week to the previous one so trends are visible.',
        hints: ['Flat burndown mid-sprint is a prompt to inspect blockers, not panic.'],
      },
      {
        title: 'Act on outliers',
        detail: 'Rebalance overloaded people, unblock stalled stages, and chase slipping due dates.',
        hints: ['Turn chart findings into tasks or reassignments the same day.'],
      },
    ],
    example: {
      title: 'Mid-sprint check',
      story:
        'Burndown is flat for three days. Reports show one person with eight open tasks — you move two cards to others.',
      outcome: 'The sprint recovers before the last day.',
    },
    tips: ['Reports inform decisions; they do not replace talking to people.'],
  },
  {
    id: 'automation',
    order: 16,
    title: '16 · Automation',
    summary: 'Rules, templates, and recurring tasks that remove busywork.',
    category: 'path',
    icon: Workflow,
    routeNames: ['project-automation'],
    features: ['automations', 'templates', 'recurringTasks'],
    whenToUse: 'Repeated handoffs, standard bug forms, and weekly chores.',
    steps: [
      {
        title: 'Open Automation',
        detail:
          'Project → Automation. You will see rules, templates, and recurring tasks depending on your plan.',
        hints: ['Start with one high-pain handoff before building many rules.'],
      },
      {
        title: 'Add a rule or template',
        detail:
          'Example rule: when status becomes Ready for QA → assign the QA lead and notify Work chat. Templates prefill common task types.',
        hints: ['Name rules clearly so future you knows what they do.', 'Test on one task before relying on them.'],
      },
      {
        title: 'Schedule recurring work',
        detail:
          'Create a recurring task (for example weekly security checklist) so it appears on schedule without manual create.',
        hints: ['Give recurring tasks a stable owner and a due pattern.'],
      },
    ],
    example: {
      title: 'QA ping',
      story: 'Card hits Ready for QA; automation assigns QA and posts in Work chat.',
      outcome: 'Handoffs do not depend on someone remembering to ping.',
    },
    tips: ['Automate boring, reliable steps — keep judgment calls human.'],
  },
  {
    id: 'wiki',
    order: 17,
    title: '17 · Wiki',
    summary: 'Shared docs for how the team works.',
    category: 'admin',
    icon: BookOpen,
    routeNames: ['wiki', 'wiki-page'],
    features: ['wiki'],
    whenToUse: 'Processes, runbooks, and decisions people should not have to ask in chat twice.',
    steps: [
      {
        title: 'Open Wiki',
        detail: 'Sidebar Wiki.',
        hints: ['Search from the wiki list or global search (Ctrl/⌘ K).'],
      },
      {
        title: 'Create or edit a page',
        detail:
          'Write Markdown. If AI Assistant is on, draft a page from a short brief, then review and publish.',
        hints: ['Start with a one-line purpose at the top of every page.', 'Date major process changes.'],
      },
      {
        title: 'Keep it linked from work',
        detail: 'Point tasks and onboarding at the page so it stays the source of truth.',
        hints: ['Link release checklists from the Releases process (topic 4).'],
      },
    ],
    example: {
      title: 'Release checklist',
      story: 'You publish “How we ship a release”. New hires open it before their first launch.',
      outcome: 'Process lives in Wiki instead of tribal knowledge.',
    },
    tips: ['If the answer was asked twice in chat, it belongs in Wiki.'],
  },
  {
    id: 'ai',
    order: 18,
    title: '18 · AI assistant',
    summary: 'Draft faster — briefings, task polish, and meeting summaries.',
    category: 'admin',
    icon: Sparkles,
    features: ['aiAssistant'],
    whenToUse: 'Blank-page moments, long threads, and meeting recaps.',
    steps: [
      {
        title: 'Daily briefing on Home',
        detail: 'Open Home and use the daily briefing for a short plan of the day.',
        hints: ['Treat it as a draft plan — adjust focus tasks yourself.'],
      },
      {
        title: 'Draft while creating tasks',
        detail:
          'When creating or editing a task, use AI suggestions to polish titles and structure descriptions — then edit for accuracy.',
        hints: ['You remain responsible for correctness before you assign someone.'],
      },
      {
        title: 'Meeting summaries',
        detail: 'After calls, use AI recap when available to seed follow-up tasks with owners.',
        hints: ['Always assign owners manually after the summary.'],
      },
    ],
    example: {
      title: 'Messy notes → criteria',
      story:
        'You paste rough notes into a description; AI structures acceptance criteria; you edit once and assign.',
      outcome: 'Clearer tasks with less typing — you still own the final wording.',
    },
    tips: ['AI drafts — people decide.'],
  },
]

export function visibleTopics(hasFeature: (key: PlanFeatureKey) => boolean): GuideTopic[] {
  return GUIDE_TOPICS.filter((topic) => !topic.features?.length || topic.features.some(hasFeature)).sort(
    (a, b) => a.order - b.order,
  )
}

export function topicForRoute(routeName: string | symbol | null | undefined, topics: GuideTopic[]): GuideTopic | null {
  if (!routeName || typeof routeName !== 'string') return null
  const exact = topics.find((topic) => topic.routeNames?.includes(routeName))
  if (exact) return exact
  return (
    topics.find((topic) => topic.routeNames?.some((name) => routeName === name || routeName.startsWith(`${name}-`))) ?? null
  )
}

export function searchTopics(topics: GuideTopic[], query: string): GuideTopic[] {
  const term = query.trim().toLowerCase()
  if (!term) return topics
  return topics.filter((topic) => {
    const hay = [
      topic.title,
      topic.summary,
      topic.whenToUse,
      topic.example.title,
      topic.example.story,
      ...topic.steps.flatMap((step) => [step.title, step.detail, ...(step.hints ?? [])]),
      ...(topic.tips ?? []),
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(term)
  })
}

export function nextTopic(topics: GuideTopic[], currentId: string): GuideTopic | null {
  const index = topics.findIndex((topic) => topic.id === currentId)
  if (index < 0 || index >= topics.length - 1) return null
  return topics[index + 1] ?? null
}

export function previousTopic(topics: GuideTopic[], currentId: string): GuideTopic | null {
  const index = topics.findIndex((topic) => topic.id === currentId)
  if (index <= 0) return null
  return topics[index - 1] ?? null
}
