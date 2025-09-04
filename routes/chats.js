const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const { auth, isAdmin } = require('../middleware/auth');
const socket = require('../utils/socket');

// Admin: list all chats (summary)
router.get('/', auth, isAdmin, async (req, res) => {
  try {
    const items = await Chat.find({}).populate('user', 'name email role').sort({ updatedAt: -1 });
    res.json(items);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to list chats' });
  }
});

// Get chat for current user
router.get('/me', auth, async (req, res) => {
  try {
    const targetUser = req.user._id;
    let chat = await Chat.findOne({ user: targetUser }).populate('user', 'name email role');
    if (!chat) {
      chat = new Chat({ user: targetUser, messages: [] });
      await chat.save();
      chat = await Chat.findById(chat._id).populate('user', 'name email role');
    }
    res.json(chat);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to get chat' });
  }
});

// Get chat for admin by userId
router.get('/:userId', auth, isAdmin, async (req, res) => {
  try {
    const targetUser = req.params.userId;
    let chat = await Chat.findOne({ user: targetUser }).populate('user', 'name email role');
    if (!chat) {
      chat = new Chat({ user: targetUser, messages: [] });
      await chat.save();
      chat = await Chat.findById(chat._id).populate('user', 'name email role');
    }
    res.json(chat);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to get chat' });
  }
});

// Post a message in current user's chat
router.post('/me/message', auth, async (req, res) => {
  try {
    const targetUser = req.user._id;
    const { text, attachments } = req.body;
    const sender = req.user.role === 'admin' ? 'admin' : 'user';
    let chat = await Chat.findOne({ user: targetUser });
    if (!chat) {
      chat = new Chat({ user: targetUser, messages: [] });
    }
    chat.messages.push({ sender, text, attachments: attachments || [] });
    await chat.save();
    const populated = await Chat.findById(chat._id).populate('user', 'name email role');

    const io = socket.getIO();
    if (io) {
      io.to(String(targetUser)).emit('chat:message', populated);
      io.emit('chat:updated', { userId: String(targetUser), last: populated.messages[populated.messages.length -1] });
    }

    res.json(populated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to post message' });
  }
});

// Admin: post a message to a specific user's chat
router.post('/:userId/message', auth, isAdmin, async (req, res) => {
  try {
    const targetUser = req.params.userId;
    const { text, attachments } = req.body;
    const sender = 'admin';
    let chat = await Chat.findOne({ user: targetUser });
    if (!chat) {
      chat = new Chat({ user: targetUser, messages: [] });
    }
    chat.messages.push({ sender, text, attachments: attachments || [] });
    await chat.save();
    const populated = await Chat.findById(chat._id).populate('user', 'name email role');

    const io = socket.getIO();
    if (io) {
      io.to(String(targetUser)).emit('chat:message', populated);
      io.emit('chat:updated', { userId: String(targetUser), last: populated.messages[populated.messages.length -1] });
    }

    res.json(populated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to post message' });
  }
});

// Edit a message (user can edit own, admin can edit any)
router.put('/:userId/message/:msgIdx', auth, async (req, res) => {
  try {
    const targetUser = req.params.userId === 'me' ? req.user._id : req.params.userId;
    if (req.params.userId !== 'me' && req.user.role !== 'admin') return res.status(403).json({ message: 'Access denied' });
    const idx = parseInt(req.params.msgIdx, 10);
    const { text } = req.body;
    const chat = await Chat.findOne({ user: targetUser });
    if (!chat || !chat.messages[idx]) return res.status(404).json({ message: 'Message not found' });
    // If not admin, ensure the message sender is 'user'
    if (req.user.role !== 'admin' && chat.messages[idx].sender !== 'user') return res.status(403).json({ message: 'Cannot edit this message' });
    chat.messages[idx].text = text;
    await chat.save();
    const populated = await Chat.findById(chat._id).populate('user', 'name email role');
    const io = socket.getIO();
    if (io) io.to(String(targetUser)).emit('chat:message', populated);
    res.json(populated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to edit message' });
  }
});

// Delete a message (user can delete own, admin can delete any)
router.delete('/:userId/message/:msgIdx', auth, async (req, res) => {
  try {
    const targetUser = req.params.userId === 'me' ? req.user._id : req.params.userId;
    if (req.params.userId !== 'me' && req.user.role !== 'admin') return res.status(403).json({ message: 'Access denied' });
    const idx = parseInt(req.params.msgIdx, 10);
    const chat = await Chat.findOne({ user: targetUser });
    if (!chat || !chat.messages[idx]) return res.status(404).json({ message: 'Message not found' });
    if (req.user.role !== 'admin' && chat.messages[idx].sender !== 'user') return res.status(403).json({ message: 'Cannot delete this message' });
    chat.messages.splice(idx, 1);
    await chat.save();
    const populated = await Chat.findById(chat._id).populate('user', 'name email role');
    const io = socket.getIO();
    if (io) io.to(String(targetUser)).emit('chat:message', populated);
    res.json(populated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to delete message' });
  }
});

module.exports = router;
