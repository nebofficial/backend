const express = require('express');
const { auth, isAdmin } = require('../middleware/auth');
const router = express.Router();
const Request = require('../models/Request');
const User = require('../models/User');

// Create a new course request (authenticated users)
router.post('/', auth, async (req, res) => {
  try {
    const { message, courseId, course } = req.body;
    const courseRef = courseId || course;
    if (!courseRef) return res.status(400).json({ message: 'courseId required' });
    const request = new Request({
      message,
      course: courseRef,
      user: req.user._id,
    });
    await request.save();
    res.status(201).json({ message: 'Request created', request });
  } catch (err) {
    console.error('[requests] create error', err);
    res.status(500).json({ message: 'Failed to create request' });
  }
});

// Get requests for a course
router.get('/', async (req, res) => {
  try {
    const { courseId } = req.query;
    if (!courseId) return res.status(400).json({ message: 'courseId required' });
    // Populate user (name, email, avatar) and course (title, duration)
    const requests = await Request.find({ course: courseId })
      .populate('user', 'name email avatar')
      .populate({ path: 'course', select: 'title duration' })
      .sort({ createdAt: -1 });
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch requests' });
  }
});

// Get the authenticated user's request status for a specific course
router.get('/status', auth, async (req, res) => {
  try {
    const { courseId } = req.query;
    if (!courseId) return res.status(400).json({ message: 'courseId required' });
    const reqDoc = await Request.findOne({ course: courseId, user: req.user._id }).populate('course', 'title');
    if (!reqDoc) return res.json({ request: null });
    res.json({ request: reqDoc });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch request status' });
  }
});

// Get all requests for authenticated user
router.get('/my', auth, async (req, res) => {
  try {
    // populate course fully so client gets coverImage, resources, classes etc.
    const requests = await Request.find({ user: req.user._id })
      .populate({ path: 'course' })
      .sort({ createdAt: -1 });
    res.json({ requests });
  } catch (err) {
    console.error('[requests] my error', err);
    res.status(500).json({ message: 'Failed to fetch user requests' });
  }
});

// Delete a request (admin)
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    const reqDoc = await Request.findByIdAndDelete(req.params.id);
    if (!reqDoc) return res.status(404).json({ message: 'Request not found' });
    res.json({ success: true, message: 'Request deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete request' });
  }
});

// Accept a request (admin) - set status and add user to course students
router.patch('/:id/accept', auth, isAdmin, async (req, res) => {
  try {
    const reqDoc = await Request.findById(req.params.id);
    if (!reqDoc) return res.status(404).json({ message: 'Request not found' });
    reqDoc.status = 'accepted';
    await reqDoc.save();
    // add user to course.students if not already
    const Course = require('../models/Course');
    const courseDoc = await Course.findById(reqDoc.course);
    if (courseDoc) {
      const userId = reqDoc.user;
      if (!courseDoc.students) courseDoc.students = [];
      if (!courseDoc.students.find(s => String(s) === String(userId))) {
        courseDoc.students.push(userId);
        await courseDoc.save();
      }
    }
    res.json({ success: true, request: reqDoc });
  } catch (err) {
    console.error('[requests] accept error', err);
    res.status(500).json({ message: 'Failed to accept request' });
  }
});

// Reject a request (admin) - set status to rejected
router.patch('/:id/reject', auth, isAdmin, async (req, res) => {
  try {
    const reqDoc = await Request.findById(req.params.id);
    if (!reqDoc) return res.status(404).json({ message: 'Request not found' });
    reqDoc.status = 'rejected';
    await reqDoc.save();
    res.json({ success: true, request: reqDoc });
  } catch (err) {
    console.error('[requests] reject error', err);
    res.status(500).json({ message: 'Failed to reject request' });
  }
});

module.exports = router;
