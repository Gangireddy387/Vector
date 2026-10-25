import * as attachmentService from './attachment.service.js';

export const list = async (req, res) => res.json({ attachments: await attachmentService.listAttachments(req.issue.id) });

export const upload = async (req, res) =>
  res.status(201).json({ attachments: await attachmentService.saveAttachments(req.issue, req.user, req.files) });

export const download = async (req, res) => {
  const file = await attachmentService.getDownload(req.params.attachmentId, req.user.id);
  res.type(file.mimeType);
  res.download(file.path, file.fileName);
};

export const remove = async (req, res) => {
  await attachmentService.deleteAttachment(req.params.attachmentId, req.user.id);
  res.status(204).end();
};
