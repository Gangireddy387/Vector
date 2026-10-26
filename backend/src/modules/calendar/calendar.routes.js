import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import * as service from './calendar.service.js';
import { createEventSchema, deleteEventQuery, listEventsQuery, updateEventSchema } from './calendar.validation.js';

/** Everyone in the organization plans their days here; each person only ever sees their own events. */
const router = Router();

router.get('/calendar/events', validate({ query: listEventsQuery }), async (req, res) =>
  res.json({ events: await service.listEvents(req.organization.id, req.user.id, req.filters) }),
);
router.post('/calendar/events', validate({ body: createEventSchema }), async (req, res) =>
  res.status(201).json({ events: await service.createEvents(req.organization.id, req.user, req.body) }),
);
router.patch('/calendar/events/:eventId', validate({ body: updateEventSchema }), async (req, res) =>
  res.json({ event: await service.updateEvent(req.organization.id, req.user, req.params.eventId, req.body) }),
);
router.delete('/calendar/events/:eventId', validate({ query: deleteEventQuery }), async (req, res) =>
  res.json({ removedIds: await service.deleteEvent(req.organization.id, req.user.id, req.params.eventId, req.filters.scope) }),
);

export default router;
