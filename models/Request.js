const mongoose = require('mongoose');

const RequestSchema = new mongoose.Schema({
  message: { type: String, required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'leave'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

  // Virtual for backward compatibility
  RequestSchema.virtual('courseId').get(function() {
    return this.course;
  });

module.exports = mongoose.model('Request', RequestSchema);
