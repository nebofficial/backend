const express = require('express');
const { auth, isAdmin } = require('../middleware/auth');
const Course = require('../models/Course');
const router = express.Router();

// Get all resources
router.get('/', auth, async (req, res) => {
    try {
        const courses = await Course.find({}, 'title resources');
        const resources = courses.reduce((allResources, course) => {
            return allResources.concat(
                course.resources.map(resource => ({
                    ...resource.toObject(),
                    courseName: course.title,
                    courseId: course._id
                }))
            );
        }, []);

        res.json({ success: true, resources });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Add a resource to a course
router.post('/', auth, isAdmin, async (req, res) => {
    try {
        const { courseId, title, type, url, description } = req.body;
        const course = await Course.findById(courseId);
        
        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }

        course.resources.push({ title, type, url, description });
        await course.save();

        res.status(201).json({
            success: true,
            resource: {
                ...course.resources[course.resources.length - 1].toObject(),
                courseName: course.title,
                courseId: course._id
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Update a resource
router.put('/:courseId/:resourceId', auth, isAdmin, async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId);
        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }

        const resource = course.resources.id(req.params.resourceId);
        if (!resource) {
            return res.status(404).json({ success: false, message: 'Resource not found' });
        }

        Object.assign(resource, req.body);
        await course.save();

        res.json({
            success: true,
            resource: {
                ...resource.toObject(),
                courseName: course.title,
                courseId: course._id
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Delete a resource
router.delete('/:courseId/:resourceId', auth, isAdmin, async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId);
        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }

        course.resources.pull(req.params.resourceId);
        await course.save();

        res.json({ success: true, message: 'Resource deleted successfully' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Delete a resource by resourceId only (find parent course and remove)
router.delete('/resource/:resourceId', auth, isAdmin, async (req, res) => {
    try {
        const course = await Course.findOne({ 'resources._id': req.params.resourceId });
        if (!course) {
            return res.status(404).json({ success: false, message: 'Resource not found' });
        }

        course.resources.pull(req.params.resourceId);
        await course.save();

        res.json({ success: true, message: 'Resource deleted successfully' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Also accept DELETE /:resourceId for clients that send resourceId directly
router.delete('/:resourceId', auth, isAdmin, async (req, res) => {
    try {
        const resourceId = req.params.resourceId;
        const course = await Course.findOne({ 'resources._id': resourceId });
        if (!course) {
            return res.status(404).json({ success: false, message: 'Resource not found' });
        }

        course.resources.pull(resourceId);
        await course.save();

        res.json({ success: true, message: 'Resource deleted successfully' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

module.exports = router;
