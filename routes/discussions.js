const express = require('express');
const router = express.Router();
const Discussion = require('../models/Discussion');
const { auth, isAdmin } = require('../middleware/auth');

// Create a discussion (user)
router.post('/', auth, async (req, res) => {
  try {
    const { course, title, body, attachments } = req.body;
    if (!course) return res.status(400).json({ message: 'course is required' });
  const discussion = new Discussion({ course, author: req.user._id, title, body, attachments: attachments || [] });
  await discussion.save();
  const populated = await Discussion.findById(discussion._id).populate('author', 'name email role').populate('course', 'title');
    res.json(populated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to create discussion' });
  }
});

// List discussions, optionally filter by course
router.get('/', auth, async (req, res) => {
  try {
  const { courseId, mine } = req.query;
  const q = {};
  if (courseId) q.course = courseId;
  if (mine === 'true') q.author = req.user._id;
  const items = await Discussion.find(q).sort({ createdAt: -1 }).populate('author', 'name email role').populate('course', 'title').populate('replies.author', 'name email role');
    res.json(items);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to list discussions' });
  }
});

// Reply to a discussion (admin or discussion author)
router.post('/:id/reply', auth, async (req, res) => {
  try {
    const { text, attachments } = req.body;
    const discussion = await Discussion.findById(req.params.id);
    if (!discussion) return res.status(404).json({ message: 'Not found' });
    // allow reply if admin or original author
    if (req.user.role !== 'admin' && discussion.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    discussion.replies.push({ author: req.user._id, text, attachments: attachments || [] });
    await discussion.save();
  const populated = await Discussion.findById(discussion._id).populate('author', 'name email role').populate('replies.author', 'name email role');
    res.json(populated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to reply' });
  }
});

module.exports = router;
