import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireFeature } from '../plans/plan.service.js';
import * as service from './calendar.service.js';
import { createEventSchema, deleteEventQuery, eventIdParams, listEventsQuery, updateEventSchema } from './calendar.validation.js';

/** Everyone in the organization plans their days here; each person only ever sees their own events. */
const router = Router();
const calendarFeature = requireFeature('calendar');

router.get('/calendar/events', calendarFeature, validate({ query: listEventsQuery }), async (req, res) =>
  res.json({ events: await service.listEvents(req.organization.id, req.user.id, req.filters) }),
);
router.post('/calendar/events', calendarFeature, validate({ body: createEventSchema }), async (req, res) =>
  res.status(201).json({ events: await service.createEvents(req.organization.id, req.user, req.body) }),
);
router.patch('/calendar/events/:eventId', calendarFeature, validate({ params: eventIdParams, body: updateEventSchema }), async (req, res) =>
  res.json({ event: await service.updateEvent(req.organization.id, req.user, req.params.eventId, req.body) }),
);
router.delete('/calendar/events/:eventId', calendarFeature, validate({ params: eventIdParams, query: deleteEventQuery }), async (req, res) =>
  res.json({ removedIds: await service.deleteEvent(req.organization.id, req.user.id, req.params.eventId, req.filters.scope) }),
);

export default router;
