const mongoose = require('mongoose');

const sessionParticipantSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  participantId: { type: String }, // Zoom participant id if available
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String },
  userEmail: { type: String },
  joinedAt: { type: Date },
  leftAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SessionParticipant', sessionParticipantSchema);
