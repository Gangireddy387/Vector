import { COMMANDS } from './chat.assistant.js';
import * as chatService from './chat.service.js';

export const list = async (req, res) => res.json({ ...(await chatService.listMessages(req.params.projectId, req.filters)), commands: COMMANDS });

export const create = async (req, res) => res.status(201).json(await chatService.postMessage(req.params.projectId, req.user, req.body.body));

export const update = async (req, res) => res.json({ message: await chatService.editMessage(req.params.messageId, req.user, req.body.body) });

export const remove = async (req, res) => {
  await chatService.deleteMessage(req.params.messageId, req.user);
  res.status(204).end();
};

export const followups = async (req, res) => res.json(await chatService.listIssueFollowups(req.issue));
