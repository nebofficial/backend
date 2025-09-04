const express = require('express');
const { auth } = require('../middleware/auth');
const Session = require('../models/Session');
const router = express.Router();
const SessionParticipant = require('../models/SessionParticipant');

// Get all sessions for a course
router.get('/', auth, async (req, res) => {
    try {
        const { courseId } = req.query;
        if (!courseId) {
            return res.status(400).json({ message: 'Course ID is required' });
        }

        const sessions = await Session.find({ courseId })
            .sort({ createdAt: -1 });
        res.json(sessions);
    } catch (error) {
        console.error('Error fetching sessions:', error);
        res.status(500).json({ message: error.message });
    }
});

// Get a single session by id
router.get('/:id', auth, async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        if (!session) return res.status(404).json({ message: 'Session not found' });
        res.json(session);
    } catch (error) {
        console.error('Error fetching session by id:', error);
        res.status(500).json({ message: error.message });
    }
});

// Create a new session
router.post('/', auth, async (req, res) => {
    try {
        const session = new Session({
            courseId: req.body.courseId,
            title: req.body.title,
            dateLabel: req.body.dateLabel,
            timeRange: req.body.timeRange,
            host: req.body.host,
            hostId: req.body.hostId,
            status: req.body.status || 'upcoming',
            summary: req.body.summary || ''
        });

        const savedSession = await session.save();

        // Always try to create a Zoom meeting synchronously when a session is created.
        try {
            const zoomRouter = require('../zoom');
            if (zoomRouter && typeof zoomRouter.createMeetingForSession === 'function') {
                try {
                    const result = await zoomRouter.createMeetingForSession(savedSession._id.toString(), { topic: savedSession.title, start_time: savedSession.dateLabel, timezone: 'Asia/Kathmandu' });
                    console.log('[sessions] Zoom meeting created for session', savedSession._id.toString(), result);
                    const resp = savedSession.toObject();
                    resp.zoomData = result.zoomData;
                    return res.status(201).json(resp);
                } catch (err) {
                    console.warn('[sessions] Zoom meeting creation failed for session', savedSession._id.toString(), err);
                    const resp = savedSession.toObject();
                    resp.zoomError = err;
                    return res.status(201).json(resp);
                }
            }
        } catch (e) {
            console.warn('[sessions] error invoking zoom helper', e);
        }

        // fallback: return saved session if zoom helper not available
        res.status(201).json(savedSession);
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(400).json({ message: error.message });
    }
});

// Update a session
router.put('/:id', auth, async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        const updates = ['title', 'dateLabel', 'timeRange', 'host', 'hostId', 'status', 'summary'];
        updates.forEach(update => {
            if (req.body[update] !== undefined) {
                session[update] = req.body[update];
            }
        });

        const updatedSession = await session.save();
        res.json(updatedSession);
    } catch (error) {
        console.error('Error updating session:', error);
        res.status(400).json({ message: error.message });
    }
});

// Delete a session
router.delete('/:id', auth, async (req, res) => {
    try {
        const result = await Session.deleteOne({ _id: req.params.id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Session not found' });
        }

        res.json({ message: 'Session deleted' });
    } catch (error) {
        console.error('Error deleting session:', error);
        res.status(500).json({ message: error.message });
    }
});

    // Get participants for a session (joins/leaves)
    router.get('/:id/participants', auth, async (req, res) => {
        try {
            const sessionId = req.params.id;
            const parts = await SessionParticipant.find({ sessionId }).sort({ joinedAt: 1 });
            res.json(parts);
        } catch (error) {
            console.error('Error fetching participants:', error);
            res.status(500).json({ message: error.message });
        }
    });

module.exports = router;
