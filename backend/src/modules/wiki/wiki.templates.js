/**
 * Guided wiki starters. Bodies use clear fill-in lines (_like this_) so people
 * know what to replace — not a blank page with vague headings.
 */

const tip = (text) => `> **Tip:** ${text}\n`;

export const WIKI_TEMPLATES = [
  {
    id: 'blank',
    title: 'Blank page',
    description: 'Empty page — start typing in your own structure.',
    audience: 'Any topic',
    tips: ['Give it a clear title first', 'Use ## headings so others can scan'],
    pageTitle: 'Untitled page',
    body: `${tip('Start with a short purpose line, then add ## headings for each topic.')}
## What this page is about
_One or two sentences: who should read this and why._

## Details
- _Point 1_
- _Point 2_

## Links & next steps
- _Add useful links or owners here_
`,
  },
  {
    id: 'handbook',
    title: 'Team handbook',
    description: 'How we work day to day — norms, owners, and where to ask.',
    audience: 'Everyone on the team',
    tips: ['Keep answers short', 'Name a real owner for each area', 'Link tools people already use'],
    pageTitle: 'Team handbook',
    body: `${tip('Replace every line in italics. Delete tips when you are done.')}
## Purpose
_Who this handbook is for (e.g. new hires, whole company) and what “good” looks like here._

## How we communicate
- **Chat:** _Where day-to-day talk happens (e.g. Vector channel / Slack)_
- **Urgent:** _How to escalate (call, @mention, on-call)_
- **Async:** _When to write a doc vs. a chat message_

## Working hours & meetings
- **Core hours:** _e.g. 10:00–16:00 local_
- **Standup / sync:** _Day, time, link_
- **Meeting hygiene:** _Agenda required? Notes owner?_

## How we decide
1. _Who proposes_
2. _Who decides_
3. _Where the decision is written down_

## Roles & owners
| Area | Owner | Backup | Notes |
| --- | --- | --- | --- |
| Product | _Name_ | _Name_ | |
| Engineering | _Name_ | _Name_ | |
| Support | _Name_ | _Name_ | |

## Tools we use
| Need | Tool | Link |
| --- | --- | --- |
| Tasks | Vector | |
| Docs | This wiki | |
| Design | _Figma / …_ | |

## Onboarding checklist
- [ ] Read this handbook
- [ ] Get access to _list systems_
- [ ] Meet your buddy: _Name_
- [ ] First small task filed in Vector

## FAQ
**Q:** _Who do I ask about X?_  
**A:** _Answer_

**Q:** _How do I take time off?_  
**A:** _Answer_
`,
  },
  {
    id: 'runbook',
    title: 'Runbook',
    description: 'Step-by-step playbook for an incident or a recurring ops job.',
    audience: 'On-call / ops',
    tips: ['Write steps a tired person can follow at 2am', 'Include rollback and who to ping', 'Link dashboards and logs'],
    pageTitle: 'Runbook: ',
    body: `${tip('Name the incident or job in the title (e.g. “Runbook: Payment API 5xx”). Fill every italic line.')}
## When to use this
_Symptoms or alerts that mean you should open this page (exact error text, dashboard red, customer report)._

## Severity
- **Sev / priority:** _e.g. SEV-2 / high_
- **Customer impact:** _Who feels it and how_

## Preconditions (before you start)
- [ ] You have access to: _VPN, admin console, cloud account_
- [ ] Open these: _dashboard URL, log query, status page_
- [ ] Notify: _#incidents channel or on-call lead_

## Diagnose
1. _Check X metric / log — what “bad” looks like_
2. _Compare with last known good_
3. _Decide: restart, rollback, or escalate_

## Fix steps
1. _Exact action (command, UI path, or ticket)_
2. _Verify it worked (what to see)_
3. _Communicate status update_

## Rollback
_How to undo if the fix makes things worse. Include the command or toggle._

## Escalation
| If this happens | Ping | With this info |
| --- | --- | --- |
| Stuck > 15 min | _Name / role_ | Timeline + what you tried |
| Data risk | _Name / role_ | Impact + systems touched |

## Afterward
- [ ] Timeline noted (times + actions)
- [ ] Follow-up tasks filed in Vector
- [ ] Status page / customers updated if needed
- [ ] This runbook updated with what you learned
`,
  },
  {
    id: 'meeting-notes',
    title: 'Meeting notes',
    description: 'Agenda, decisions, and owners — so the meeting was worth it.',
    audience: 'Meeting attendees',
    tips: ['Fill agenda before the call', 'Capture decisions in one line each', 'Every action needs an owner and due date'],
    pageTitle: 'Meeting: ',
    body: `${tip('Put the meeting name and date in the title. Fill italics during or right after the call.')}
## Meta
- **When:** _Date · time · timezone_
- **Where:** _Link or room_
- **Attendees:** _Names_
- **Note taker:** _Name_

## Agenda
1. _Topic — owner — timebox_
2. _Topic — owner — timebox_
3. _Topic — owner — timebox_

## Discussion notes
### _Topic 1_
- _Key point_
- _Open question_

### _Topic 2_
- _Key point_

## Decisions
| Decision | Why | Owner |
| --- | --- | --- |
| _We will …_ | _Because …_ | _Name_ |

## Action items
- [ ] **_Name_** — _task_ — due _date_
- [ ] **_Name_** — _task_ — due _date_

## Parking lot
- _Ideas we deferred_

## Next meeting
_Date · goal_
`,
  },
  {
    id: 'faq',
    title: 'FAQ',
    description: 'Short answers to questions people ask again and again.',
    audience: 'Teammates & partners',
    tips: ['One question = one short answer', 'Group by topic', 'Link to deeper docs instead of pasting everything'],
    pageTitle: 'FAQ',
    body: `${tip('Replace sample Q&As with real ones. Keep answers under ~5 lines when you can.')}
## Getting started
**Q: How do I get access?**  
**A:** _Steps or who to ask. Link the access form if you have one._

**Q: Where do we track work?**  
**A:** _e.g. Vector project “X”. How to create a task._

## Access & accounts
**Q: I forgot my password / SSO failed**  
**A:** _Reset steps or IT contact._

**Q: How do I invite a contractor?**  
**A:** _Policy + who approves + how to invite._

## Process
**Q: How do we ship a change?**  
**A:** _PR → review → deploy. Link the runbook if needed._

**Q: How do we handle incidents?**  
**A:** _Who is on-call and which runbook to open._

## People
**Q: Who owns _area_?**  
**A:** _Name + backup._
`,
  },
  {
    id: 'project-brief',
    title: 'Project brief',
    description: 'Goals, scope, and success metrics before the work starts.',
    audience: 'Stakeholders & builders',
    tips: ['One clear goal sentence', 'List out-of-scope to avoid surprise work', 'Name risks early'],
    pageTitle: 'Brief: ',
    body: `${tip('Fill this before kickoff. Share the link in the kickoff invite.')}
## Goal
_In one sentence: what success looks like when we are done._

## Why now
_Business or customer reason this matters this quarter._

## Who it is for
- **Primary users:** _Who_
- **Stakeholders:** _Who must approve_

## In scope
- _Must-have 1_
- _Must-have 2_
- _Must-have 3_

## Out of scope
- _Explicitly not doing this_
- _Deferred to later_

## Success metrics
| Metric | Baseline | Target | How we measure |
| --- | --- | --- | --- |
| _e.g. Time to X_ | _Today_ | _Goal_ | _Dashboard / report_ |

## Milestones
| Milestone | Date | Owner | Done when |
| --- | --- | --- | --- |
| Kickoff | _Date_ | _Name_ | Brief approved |
| First usable version | _Date_ | _Name_ | _Criterion_ |
| Launch | _Date_ | _Name_ | _Criterion_ |

## Risks & open questions
| Risk / question | Impact | Mitigation / owner |
| --- | --- | --- |
| _…_ | High / Med / Low | _…_ |

## Links
- Spec / design: _URL_
- Vector project: _URL_
- Related wiki pages: _URL_
`,
  },
  {
    id: 'how-to',
    title: 'How-to guide',
    description: 'Teach someone to do one thing, start to finish.',
    audience: 'Anyone following the steps',
    tips: ['One guide = one outcome', 'Number every step', 'Show what “done” looks like'],
    pageTitle: 'How to ',
    body: `${tip('Finish the title (e.g. “How to publish a release”). Write steps a new teammate can follow alone.')}
## Outcome
_What you will have finished after these steps._

## Before you start
- Time needed: _e.g. 15 minutes_
- You need access to: _tools / roles_
- Related: _link to runbook or policy_

## Steps
1. **_Step name_**  
   _What to click or type. Include a screenshot link if helpful._  
   _Expected result:_ …

2. **_Step name_**  
   _Details_  
   _Expected result:_ …

3. **_Step name_**  
   _Details_  
   _Expected result:_ …

## Check you are done
- [ ] _Visible proof 1_
- [ ] _Visible proof 2_

## Troubleshooting
| Problem | Fix |
| --- | --- |
| _Something failed_ | _What to try_ |

## Who to ask
_Name or channel if you get stuck._
`,
  },
];

export function getWikiTemplates() {
  return WIKI_TEMPLATES.map(({ id, title, description, audience, tips, pageTitle }) => ({
    id,
    title,
    description,
    audience,
    tips,
    pageTitle,
  }));
}

export function resolveWikiTemplate(templateId) {
  return WIKI_TEMPLATES.find((template) => template.id === templateId) ?? null;
}
