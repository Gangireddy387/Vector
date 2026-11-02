import * as attachmentService from './attachment.service.js';

export const list = async (req, res) => res.json({ attachments: await attachmentService.listAttachments(req.issue.id) });

export const upload = async (req, res) =>
  res.status(201).json({ attachments: await attachmentService.saveAttachments(req.issue, req.user, req.files) });

/** Types a browser could run as a page or script; they are always handed over as plain downloads. */
const ACTIVE_TYPES = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript)/i;

export const download = async (req, res) => {
  const file = await attachmentService.getDownload(req.params.attachmentId, req.user.id);
  res.type(ACTIVE_TYPES.test(file.mimeType ?? '') ? 'application/octet-stream' : file.mimeType || 'application/octet-stream');
  res.download(file.path, file.fileName);
};

export const remove = async (req, res) => {
  await attachmentService.deleteAttachment(req.params.attachmentId, req.user.id);
  res.status(204).end();
};
