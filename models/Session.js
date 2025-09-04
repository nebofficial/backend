const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    dateLabel: {
        type: String,
        required: true
    },
    timeRange: {
        type: String,
        required: true
    },
    host: {
        type: String,
        required: true
    },
    hostId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['upcoming', 'live', 'completed'],
        default: 'upcoming'
    },
    summary: {
        type: String,
        default: ''
    },
    attendees: [{
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        name: String
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    zoomData: {
        meetingId: String,
        joinUrl: String,
        startUrl: String,
        password: String
    }
});

module.exports = mongoose.model('Session', sessionSchema);
