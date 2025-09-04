const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['pdf', 'video', 'document', 'link','image','audio', 'other', 'zip', 'rar', 'ppt', 'xls', 'xlsx', 'doc', 'docx', 'txt', 'csv', 'mp3', 'mp4', 'avi', 'mkv', 'flv', 'mov', 'wmv', 'webm', 'ogg', 'ogv', 'svg', 'gif', 'png', 'jpg', 'jpeg', 'bmp', 'tiff', 'ico', 'psd', 'ai', 'eps', 'indd', 'raw', 'json', 'xml', 'yaml', 'html', 'css', 'js', 'ts', 'php', 'py', 'rb', 'java', 'c', 'cpp', 'cs', 'go', 'swift', 'kotlin', 'rust', 'dart', 'lua', 'perl', 'shell', 'sql', 'pl', 'hs', 'clj', 'cljs', 'coffee', 'less', 'scss', 'stylus', 'sass', 'vue', 'react', 'angular', 'ember', 'backbone', 'svelte', 'lit', 'riot', 'preact', 'mithril', 'marko', 'youtube','inferno', 'hyperapp', 'cyclejs', 'elm'],
        required: true
    },
    url: {
        type: String,
        required: true
    },
    description: String,
    uploadedAt: {
        type: Date,
        default: Date.now
    }
});

const courseSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    duration: {
        type: String,
        required: true
    },
    realPrice: {
        type: Number,
        required: true
    },
    offPrice: {
        type: Number,
        required: true
    },
   
    coverImage: {
        type: String
    },
    instructor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    students: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    resources: [resourceSchema],
    classes: [{
        title: {
            type: String,
            required: true
        },
        date: {
            type: Date,
            required: true
        },
        startTime: {
            type: String,
            required: true
        },
        endTime: {
            type: String,
            required: true
        },
        description: String,
        meetingLink: String
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
courseSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Course = mongoose.model('Course', courseSchema);

module.exports = Course;
