import fs from 'node:fs/promises';
import { Op } from 'sequelize';
import {
  Activity,
  Attachment,
  CalendarConnection,
  CalendarEvent,
  ChatFile,
  ChatMessage,
  Comment,
  CommentReaction,
  Conversation,
  ConversationFile,
  ConversationMessage,
  Issue,
  Meeting,
  MeetingAttendance,
  MeetingChatMessage,
  MeetingFile,
  MeetingParticipant,
  MeetingUpdate,
  Notification,
  Organization,
  OrganizationMember,
  Project,
  SavedFilter,
  StandupUpdate,
  SupportMessage,
  WikiFile,
  WikiPage,
  WorkLog,
} from '../../database/models.js';
import { sequelize } from '../../database/connection.js';
import { resolveStoragePath } from '../attachments/attachment.storage.js';

export const ACCOUNT_EXPORT_FORMAT = 'vector-account-export';
export const ACCOUNT_EXPORT_VERSION = 2;
/** Soft cap per collection so a single export stays downloadable. */
export const COLLECTION_LIMIT = 5000;
/** Total bytes budget for optional attachment embeds (metadata always included). */
const EMBED_BUDGET_BYTES = 8 * 1024 * 1024;
const EMBED_MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * @template T
 * @param {T[]} rows
 * @param {number} [limit]
 */
export function clipCollection(rows, limit = COLLECTION_LIMIT) {
  const truncated = rows.length > limit;
  return { items: truncated ? rows.slice(0, limit) : rows, truncated, total: rows.length };
}

function issueBrief(issue) {
  return {
    key: issue.key,
    title: issue.title,
    projectKey: issue.project?.key ?? null,
    projectName: issue.project?.name ?? null,
    updatedAt: issue.updatedAt,
  };
}

const issueListInclude = [{ model: Project, as: 'project', attributes: ['key', 'name'] }];
const issueListAttrs = ['key', 'title', 'projectId', 'updatedAt'];

async function listIssuesFor(where, user) {
  if (where === 'watched') {
    return user.getWatchedIssues({
      attributes: issueListAttrs,
      include: issueListInclude,
      order: [['updatedAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
      joinTableAttributes: [],
    });
  }
  return Issue.findAll({
    where: where === 'assigned' ? { assigneeId: user.id } : { reporterId: user.id },
    attributes: issueListAttrs,
    include: issueListInclude,
    order: [['updatedAt', 'DESC']],
    limit: COLLECTION_LIMIT + 1,
  });
}

function fileMeta({ id, fileName, mimeType, size, createdAt, source, issueKey = null, projectKey = null, messageId = null, pageTitle = null, meetingId = null }) {
  return { id, fileName, mimeType, size, createdAt, source, issueKey, projectKey, messageId, pageTitle, meetingId, embedded: false, contentBase64: null };
}

async function maybeEmbed(files, budget) {
  const out = [];
  let remaining = budget;
  for (const file of files) {
    const entry = { ...file, embedded: false, contentBase64: null };
    if (file.storageKey && file.size > 0 && file.size <= EMBED_MAX_FILE_BYTES && file.size <= remaining) {
      try {
        const bytes = await fs.readFile(resolveStoragePath(file.storageKey));
        if (bytes.length <= remaining) {
          entry.embedded = true;
          entry.contentBase64 = bytes.toString('base64');
          remaining -= bytes.length;
        }
      } catch {
        // Missing file on disk — keep metadata only.
      }
    }
    const { storageKey: _key, ...publicEntry } = entry;
    out.push(publicEntry);
  }
  return { files: out, embedBytesUsed: budget - remaining };
}

function jsonAuthorMatches(userId) {
  return sequelize.getDialect() === 'postgres'
    ? sequelize.where(sequelize.literal(`author->>'id'`), userId)
    : sequelize.where(sequelize.literal(`json_extract(author, '$.id')`), userId);
}

/**
 * Subject-access style JSON export for the signed-in person (GDPR / UK GDPR portable copy).
 * Omits secrets (passwords, MFA, calendar tokens, push endpoints, meeting guest/dial codes).
 */
export async function buildAccountExport(user) {
  const memberships = await OrganizationMember.findAll({
    where: { userId: user.id },
    include: [{ model: Organization, as: 'organization', attributes: ['id', 'name', 'slug', 'status'] }],
  });

  const [
    assigned,
    reported,
    watched,
    comments,
    commentReactions,
    chatMessages,
    conversationMessages,
    issueAttachments,
    chatFiles,
    conversationFiles,
    wikiFiles,
    meetingFiles,
    workLogs,
    standupUpdates,
    notifications,
    activities,
    calendarEvents,
    calendarConnections,
    hostedMeetings,
    meetingParticipations,
    meetingUpdates,
    meetingChat,
    meetingAttendance,
    wikiCreated,
    supportMessages,
    savedFilters,
  ] = await Promise.all([
    listIssuesFor('assigned', user),
    listIssuesFor('reported', user),
    listIssuesFor('watched', user),
    Comment.findAll({
      where: { authorId: user.id },
      attributes: ['id', 'body', 'parentId', 'editedAt', 'createdAt', 'issueId'],
      include: [{ model: Issue, as: 'issue', attributes: ['key'], include: [{ model: Project, as: 'project', attributes: ['key'] }] }],
      order: [['createdAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    CommentReaction.findAll({
      where: { userId: user.id },
      attributes: ['commentId', 'emoji', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    ChatMessage.findAll({
      where: { authorId: user.id },
      attributes: ['id', 'body', 'kind', 'parentId', 'editedAt', 'createdAt', 'projectId'],
      include: [
        { model: Project, as: 'project', attributes: ['key', 'name'] },
        { model: Issue, as: 'issues', attributes: ['key'], through: { attributes: [] } },
      ],
      order: [['createdAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    ConversationMessage.findAll({
      where: { authorId: user.id },
      attributes: ['id', 'body', 'subject', 'important', 'parentId', 'editedAt', 'deletedAt', 'createdAt', 'conversationId'],
      order: [['createdAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    Attachment.findAll({
      where: { uploaderId: user.id },
      attributes: ['id', 'fileName', 'mimeType', 'size', 'storageKey', 'commentId', 'createdAt', 'issueId'],
      include: [{ model: Issue, as: 'issue', attributes: ['key'] }],
      order: [['createdAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    ChatFile.findAll({
      where: { uploaderId: user.id },
      attributes: ['id', 'fileName', 'mimeType', 'size', 'storageKey', 'messageId', 'createdAt', 'projectId'],
      order: [['createdAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    ConversationFile.findAll({
      where: { uploaderId: user.id },
      attributes: ['id', 'fileName', 'mimeType', 'size', 'storageKey', 'messageId', 'createdAt', 'conversationId'],
      order: [['createdAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    WikiFile.findAll({
      where: { uploaderId: user.id },
      attributes: ['id', 'fileName', 'mimeType', 'size', 'storageKey', 'createdAt', 'pageId'],
      include: [{ model: WikiPage, as: 'page', attributes: ['title'] }],
      order: [['createdAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    MeetingFile.findAll({
      where: { uploaderId: user.id },
      attributes: ['id', 'fileName', 'mimeType', 'size', 'storageKey', 'createdAt', 'meetingId'],
      order: [['createdAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    WorkLog.findAll({
      where: { userId: user.id },
      attributes: ['id', 'minutes', 'note', 'loggedAt', 'createdAt', 'issueId'],
      include: [{ model: Issue, as: 'issue', attributes: ['key'] }],
      order: [['loggedAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    StandupUpdate.findAll({
      where: { userId: user.id },
      attributes: ['date', 'yesterday', 'today', 'blockers', 'issueIds', 'createdAt', 'updatedAt', 'projectId'],
      include: [{ model: Project, as: 'project', attributes: ['key', 'name'] }],
      order: [['date', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    Notification.findAll({
      where: { userId: user.id },
      attributes: ['type', 'title', 'body', 'link', 'readAt', 'clickedAt', 'createdAt', 'issueId', 'projectId'],
      include: [
        { model: Issue, as: 'issue', attributes: ['key'], required: false },
        { model: Project, as: 'project', attributes: ['key'], required: false },
      ],
      order: [['createdAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    Activity.findAll({
      where: { actorId: user.id },
      attributes: ['action', 'field', 'fromValue', 'toValue', 'meta', 'createdAt', 'issueId', 'projectId'],
      include: [
        { model: Issue, as: 'issue', attributes: ['key'], required: false },
        { model: Project, as: 'project', attributes: ['key'], required: false },
      ],
      order: [['createdAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    CalendarEvent.findAll({
      where: { ownerId: user.id },
      attributes: [
        'id',
        'title',
        'description',
        'date',
        'allDay',
        'startTime',
        'endTime',
        'category',
        'location',
        'status',
        'createdAt',
        'updatedAt',
        'projectId',
        'issueId',
      ],
      include: [
        { model: Project, as: 'project', attributes: ['key'], required: false },
        { model: Issue, as: 'issue', attributes: ['key'], required: false },
      ],
      order: [['date', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    CalendarConnection.findAll({
      where: { userId: user.id },
      attributes: ['id', 'provider', 'accountEmail', 'brokenAt', 'createdAt', 'updatedAt'],
    }),
    Meeting.findAll({
      where: { hostId: user.id },
      attributes: ['id', 'title', 'agenda', 'startsAt', 'durationMinutes', 'status', 'kind', 'createdAt'],
      order: [['startsAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    MeetingParticipant.findAll({
      where: { userId: user.id },
      attributes: ['meetingId', 'response', 'joinedAt', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    MeetingUpdate.findAll({
      where: { authorId: user.id },
      attributes: ['id', 'meetingId', 'body', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    MeetingChatMessage.findAll({
      where: jsonAuthorMatches(user.id),
      attributes: ['id', 'meetingId', 'body', 'room', 'broadcast', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    MeetingAttendance.findAll({
      where: { userId: user.id },
      attributes: ['meetingId', 'joinedAt', 'leftAt', 'kind', 'createdAt'],
      order: [['joinedAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    WikiPage.findAll({
      where: { createdById: user.id },
      attributes: ['id', 'title', 'body', 'kind', 'parentId', 'organizationId', 'createdAt', 'updatedAt'],
      include: [{ model: Organization, as: 'organization', attributes: ['name', 'slug'] }],
      order: [['updatedAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    SupportMessage.findAll({
      where: { authorId: user.id },
      attributes: ['id', 'body', 'kind', 'fromPortal', 'organizationId', 'editedAt', 'deletedAt', 'createdAt', 'recording'],
      order: [['createdAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
    SavedFilter.findAll({
      where: { userId: user.id },
      attributes: ['id', 'name', 'surface', 'criteria', 'projectId', 'isDefault', 'createdAt', 'updatedAt'],
      include: [{ model: Project, as: 'project', attributes: ['key', 'name'], required: false }],
      order: [['updatedAt', 'DESC']],
      limit: COLLECTION_LIMIT + 1,
    }),
  ]);

  // Resolve conversation kinds without exposing other members.
  const conversationIds = [...new Set(conversationMessages.map((row) => row.conversationId))];
  const conversations = conversationIds.length
    ? await Conversation.findAll({
        where: { id: conversationIds },
        attributes: ['id', 'kind', 'organizationId', 'teamId', 'departmentId', 'channelId'],
      })
    : [];
  const conversationById = new Map(conversations.map((row) => [row.id, row]));

  const meetingIds = [
    ...new Set([
      ...meetingParticipations.map((row) => row.meetingId),
      ...meetingUpdates.map((row) => row.meetingId),
      ...meetingChat.map((row) => row.meetingId),
      ...meetingAttendance.map((row) => row.meetingId),
      ...meetingFiles.map((row) => row.meetingId),
    ]),
  ];
  const relatedMeetings = meetingIds.length
    ? await Meeting.findAll({
        where: { id: { [Op.in]: meetingIds } },
        attributes: ['id', 'title', 'startsAt', 'status'],
      })
    : [];
  const meetingById = new Map(relatedMeetings.map((row) => [row.id, row]));

  const chatProjectIds = [...new Set(chatFiles.map((file) => file.projectId).filter(Boolean))];
  const chatProjects = chatProjectIds.length
    ? await Project.findAll({ where: { id: chatProjectIds }, attributes: ['id', 'key'] })
    : [];
  const chatProjectById = new Map(chatProjects.map((project) => [project.id, project.key]));

  const attachmentRows = [
    ...issueAttachments.map((row) => ({
      ...fileMeta({
        id: row.id,
        fileName: row.fileName,
        mimeType: row.mimeType,
        size: row.size,
        createdAt: row.createdAt,
        source: 'issue',
        issueKey: row.issue?.key ?? null,
      }),
      storageKey: row.storageKey,
      commentId: row.commentId,
    })),
    ...chatFiles.map((row) => ({
      ...fileMeta({
        id: row.id,
        fileName: row.fileName,
        mimeType: row.mimeType,
        size: row.size,
        createdAt: row.createdAt,
        source: 'chat',
        projectKey: chatProjectById.get(row.projectId) ?? null,
        messageId: row.messageId,
      }),
      storageKey: row.storageKey,
    })),
    ...conversationFiles.map((row) => ({
      ...fileMeta({
        id: row.id,
        fileName: row.fileName,
        mimeType: row.mimeType,
        size: row.size,
        createdAt: row.createdAt,
        source: 'conversation',
        messageId: row.messageId,
      }),
      storageKey: row.storageKey,
      conversationId: row.conversationId,
    })),
    ...wikiFiles.map((row) => ({
      ...fileMeta({
        id: row.id,
        fileName: row.fileName,
        mimeType: row.mimeType,
        size: row.size,
        createdAt: row.createdAt,
        source: 'wiki',
        pageTitle: row.page?.title ?? null,
      }),
      storageKey: row.storageKey,
    })),
    ...meetingFiles.map((row) => ({
      ...fileMeta({
        id: row.id,
        fileName: row.fileName,
        mimeType: row.mimeType,
        size: row.size,
        createdAt: row.createdAt,
        source: 'meeting',
        meetingId: row.meetingId,
      }),
      storageKey: row.storageKey,
    })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const clippedAttachments = clipCollection(attachmentRows);
  const { files: attachments, embedBytesUsed } = await maybeEmbed(clippedAttachments.items, EMBED_BUDGET_BYTES);

  const assignedClip = clipCollection(assigned.map(issueBrief));
  const reportedClip = clipCollection(reported.map(issueBrief));
  const watchedClip = clipCollection(watched.map(issueBrief));
  const commentsClip = clipCollection(
    comments.map((row) => ({
      id: row.id,
      body: row.body,
      parentId: row.parentId,
      editedAt: row.editedAt,
      createdAt: row.createdAt,
      issueKey: row.issue?.key ?? null,
      projectKey: row.issue?.project?.key ?? null,
    })),
  );
  const chatClip = clipCollection(
    chatMessages.map((row) => ({
      id: row.id,
      body: row.body,
      kind: row.kind,
      parentId: row.parentId,
      editedAt: row.editedAt,
      createdAt: row.createdAt,
      projectKey: row.project?.key ?? null,
      projectName: row.project?.name ?? null,
      issueKeys: (row.issues ?? []).map((issue) => issue.key),
    })),
  );
  const conversationClip = clipCollection(
    conversationMessages.map((row) => {
      const conversation = conversationById.get(row.conversationId);
      return {
        id: row.id,
        body: row.body,
        subject: row.subject,
        important: row.important,
        parentId: row.parentId,
        editedAt: row.editedAt,
        deletedAt: row.deletedAt,
        createdAt: row.createdAt,
        conversationId: row.conversationId,
        conversationKind: conversation?.kind ?? null,
        organizationId: conversation?.organizationId ?? null,
      };
    }),
  );
  const workLogClip = clipCollection(
    workLogs.map((row) => ({
      id: row.id,
      minutes: row.minutes,
      note: row.note,
      loggedAt: row.loggedAt,
      createdAt: row.createdAt,
      issueKey: row.issue?.key ?? null,
    })),
  );
  const standupClip = clipCollection(
    standupUpdates.map((row) => ({
      date: row.date,
      yesterday: row.yesterday,
      today: row.today,
      blockers: row.blockers,
      issueIds: row.issueIds ?? [],
      projectKey: row.project?.key ?? null,
      projectName: row.project?.name ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  );
  const notificationClip = clipCollection(
    notifications.map((row) => ({
      type: row.type,
      title: row.title,
      body: row.body,
      link: row.link,
      readAt: row.readAt,
      clickedAt: row.clickedAt,
      createdAt: row.createdAt,
      issueKey: row.issue?.key ?? null,
      projectKey: row.project?.key ?? null,
    })),
  );
  const activityClip = clipCollection(
    activities.map((row) => ({
      action: row.action,
      field: row.field,
      fromValue: row.fromValue,
      toValue: row.toValue,
      meta: row.meta,
      createdAt: row.createdAt,
      issueKey: row.issue?.key ?? null,
      projectKey: row.project?.key ?? null,
    })),
  );
  const calendarClip = clipCollection(
    calendarEvents.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      date: row.date,
      allDay: row.allDay,
      startTime: row.startTime,
      endTime: row.endTime,
      category: row.category,
      location: row.location,
      status: row.status,
      projectKey: row.project?.key ?? null,
      issueKey: row.issue?.key ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  );
  const hostedClip = clipCollection(
    hostedMeetings.map((row) => ({
      id: row.id,
      title: row.title,
      agenda: row.agenda,
      startsAt: row.startsAt,
      durationMinutes: row.durationMinutes,
      status: row.status,
      kind: row.kind,
      createdAt: row.createdAt,
    })),
  );
  const participationClip = clipCollection(
    meetingParticipations.map((row) => ({
      meetingId: row.meetingId,
      title: meetingById.get(row.meetingId)?.title ?? null,
      startsAt: meetingById.get(row.meetingId)?.startsAt ?? null,
      status: meetingById.get(row.meetingId)?.status ?? null,
      response: row.response,
      joinedAt: row.joinedAt,
    })),
  );
  const meetingUpdateClip = clipCollection(
    meetingUpdates.map((row) => ({
      id: row.id,
      meetingId: row.meetingId,
      title: meetingById.get(row.meetingId)?.title ?? null,
      body: row.body,
      createdAt: row.createdAt,
    })),
  );
  const meetingChatClip = clipCollection(
    meetingChat.map((row) => ({
      id: row.id,
      meetingId: row.meetingId,
      title: meetingById.get(row.meetingId)?.title ?? null,
      body: row.body,
      room: row.room,
      broadcast: row.broadcast,
      createdAt: row.createdAt,
    })),
  );
  const attendanceClip = clipCollection(
    meetingAttendance.map((row) => ({
      meetingId: row.meetingId,
      title: meetingById.get(row.meetingId)?.title ?? null,
      joinedAt: row.joinedAt,
      leftAt: row.leftAt,
      kind: row.kind,
    })),
  );
  const wikiClip = clipCollection(
    wikiCreated.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.kind === 'page' ? row.body : null,
      kind: row.kind,
      parentId: row.parentId,
      organizationId: row.organizationId,
      organizationSlug: row.organization?.slug ?? null,
      organizationName: row.organization?.name ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      role: 'created',
    })),
  );
  const supportClip = clipCollection(
    supportMessages.map((row) => ({
      id: row.id,
      body: row.deletedAt ? null : row.body,
      kind: row.kind,
      fromPortal: row.fromPortal,
      organizationId: row.organizationId,
      editedAt: row.editedAt,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      recording: row.recording
        ? {
            meetingId: row.recording.meetingId ?? null,
            durationSeconds: row.recording.durationSeconds ?? null,
            sizeBytes: row.recording.sizeBytes ?? null,
            mimeType: row.recording.mimeType ?? null,
            startedAt: row.recording.startedAt ?? null,
          }
        : null,
    })),
  );
  const savedFilterClip = clipCollection(
    savedFilters.map((row) => ({
      id: row.id,
      name: row.name,
      surface: row.surface,
      criteria: row.criteria,
      projectId: row.projectId,
      projectKey: row.project?.key ?? null,
      isDefault: row.isDefault,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  );
  const reactionClip = clipCollection(commentReactions.map((row) => ({ commentId: row.commentId, emoji: row.emoji, createdAt: row.createdAt })));

  const anyTruncated = [
    assignedClip,
    reportedClip,
    watchedClip,
    commentsClip,
    reactionClip,
    chatClip,
    conversationClip,
    clippedAttachments,
    workLogClip,
    standupClip,
    notificationClip,
    activityClip,
    calendarClip,
    hostedClip,
    participationClip,
    meetingUpdateClip,
    meetingChatClip,
    attendanceClip,
    wikiClip,
    supportClip,
    savedFilterClip,
  ].some((part) => part.truncated);

  return {
    format: ACCOUNT_EXPORT_FORMAT,
    version: ACCOUNT_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      title: user.title,
      timezone: user.timezone,
      about: user.about,
      location: user.location,
      phone: user.phone,
      skills: user.skills ?? [],
      avatarColor: user.avatarColor,
      avatarUrl: user.avatarUrl ?? null,
      status: user.status,
      mfaEnabled: Boolean(user.mfaEnabled),
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
    },
    preferences: user.preferences ?? {},
    memberships: memberships.map((membership) => ({
      organizationId: membership.organizationId,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.createdAt,
      organization: membership.organization
        ? {
            id: membership.organization.id,
            name: membership.organization.name,
            slug: membership.organization.slug,
            status: membership.organization.status,
          }
        : null,
    })),
    issues: {
      assigned: assignedClip.items,
      reported: reportedClip.items,
      watched: watchedClip.items,
    },
    comments: commentsClip.items,
    commentReactions: reactionClip.items,
    projectChatMessages: chatClip.items,
    conversationMessages: conversationClip.items,
    attachments,
    workLogs: workLogClip.items,
    standupUpdates: standupClip.items,
    notifications: notificationClip.items,
    activities: activityClip.items,
    calendarEvents: calendarClip.items,
    calendarConnections: calendarConnections.map((row) => ({
      id: row.id,
      provider: row.provider,
      accountEmail: row.accountEmail,
      brokenAt: row.brokenAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    meetings: {
      hosted: hostedClip.items,
      participations: participationClip.items,
      updates: meetingUpdateClip.items,
      chatMessages: meetingChatClip.items,
      attendance: attendanceClip.items,
    },
    wikiPages: wikiClip.items,
    supportMessages: supportClip.items,
    savedFilters: savedFilterClip.items,
    limits: {
      perCollection: COLLECTION_LIMIT,
      truncated: anyTruncated,
      attachmentEmbedBudgetBytes: EMBED_BUDGET_BYTES,
      attachmentEmbedBytesUsed: embedBytesUsed,
    },
    notes: [
      'This portable copy includes content you authored and files you uploaded.',
      'Secrets (passwords, MFA seeds, calendar OAuth tokens, push endpoints, meeting guest/dial codes) are never included.',
      'Attachment metadata is always listed; small files may be embedded as base64 when they fit the size budget.',
    ],
  };
}
