const express = require('express');
const { auth, isAdmin } = require('../middleware/auth');
const Course = require('../models/Course');
const router = express.Router();

// Create a new course
router.post('/', auth, isAdmin, async (req, res) => {
    try {
    console.log('[courses] Create payload:', req.body);
        const course = new Course({
            ...req.body,
            instructor: req.user._id
        });
        await course.save();
        await course.populate('instructor', 'name email');
    res.status(201).json({ success: true, course });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Get all courses with filters
router.get('/', auth, async (req, res) => {
    try {
        const { category, search, active } = req.query;
        const filter = {};

        if (category) filter.category = category;
        if (active !== undefined) filter.isActive = active === 'true';
        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const courses = await Course.find(filter)
            .populate('instructor', 'name email')
            .sort('-createdAt');

        res.json({ success: true, courses });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get courses related to the current authenticated user (instructor or enrolled student)
router.get('/my', auth, async (req, res) => {
    try {
        const userId = req.user._id;
        // find courses where user is instructor or a student
        const courses = await Course.find({ $or: [ { instructor: userId }, { students: userId } ] })
            .populate('instructor', 'name email')
            .populate('students', 'name email')
            .sort('-createdAt');

        // Return full course objects (resources/classes are subdocuments already)
        res.json({ success: true, courses });
    } catch (error) {
        console.error('[courses] /my error', error);
        res.status(500).json({ message: error.message });
    }
});

// Get a specific course
router.get('/:id', auth, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id)
            .populate('instructor', 'name email')
            .populate('students', 'name email');

        if (!course) {
            return res.status(404).json({ message: 'Course not found' });
        }
    res.json({ success: true, course });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update a course
router.put('/:id', auth, isAdmin, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) {
            return res.status(404).json({ message: 'Course not found' });
        }

        Object.keys(req.body).forEach(key => {
            course[key] = req.body[key];
        });

        await course.save();
        await course.populate('instructor', 'name email');
    res.json({ success: true, course });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Delete a course
router.delete('/:id', auth, isAdmin, async (req, res) => {
    try {
        const course = await Course.findByIdAndDelete(req.params.id);
        if (!course) {
            return res.status(404).json({ message: 'Course not found' });
        }
    res.json({ success: true, message: 'Course deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Add a class to course
router.post('/:id/classes', auth, isAdmin, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) {
            return res.status(404).json({ message: 'Course not found' });
        }

        course.classes.push(req.body);
        await course.save();
    res.status(201).json({ success: true, course });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

    // Delete a class from a course
    router.delete('/:id/classes/:classId', auth, isAdmin, async (req, res) => {
        try {
            const course = await Course.findById(req.params.id);
            if (!course) return res.status(404).json({ message: 'Course not found' });

            const classId = req.params.classId;
            const cls = course.classes.id(classId);
            if (!cls) return res.status(404).json({ message: 'Class not found' });

            cls.remove();
            await course.save();
            return res.json({ success: true, message: 'Class removed', course });
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    });

// Add a resource to course
router.post('/:id/resources', auth, isAdmin, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) {
            return res.status(404).json({ message: 'Course not found' });
        }

        course.resources.push(req.body);
        await course.save();
    res.status(201).json({ success: true, course });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Add student to course
router.post('/:id/students', auth, isAdmin, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) {
            return res.status(404).json({ message: 'Course not found' });
        }

        const studentId = req.body.studentId;
        if (!course.students.includes(studentId)) {
            course.students.push(studentId);
            await course.save();
        }

        await course.populate('students', 'name email');
    res.json({ success: true, course });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Remove student from course
router.delete('/:id/students/:studentId', auth, isAdmin, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) {
            return res.status(404).json({ message: 'Course not found' });
        }

        course.students = course.students.filter(
            student => student.toString() !== req.params.studentId
        );
        await course.save();
        await course.populate('students', 'name email');
        res.json(course);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Authenticated user leaves a course
router.post('/:id/leave', auth, async (req, res) => {
    try {
    // debug: log params and body to help trace 500s during leave flow
    console.log('[courses] leave request params:', req.params, 'body:', req.body);
    const courseId = req.params.id;
    if (!req.user || !req.user._id) return res.status(401).json({ message: 'Unauthorized' });
    const userId = req.user._id;
        const course = await Course.findById(courseId);
        if (!course) return res.status(404).json({ message: 'Course not found' });

        // remove student if present
        course.students = (course.students || []).filter(s => String(s) !== String(userId));
        await course.save();

        // Create or update a Request document with status 'leave' for audit
        const Request = require('../models/Request');
        let reqDoc = await Request.findOne({ course: courseId, user: userId });
        if (!reqDoc) {
            reqDoc = new Request({ message: 'User left course', course: courseId, user: userId, status: 'leave' });
        } else {
            reqDoc.status = 'leave';
            // defensive: req.body may be undefined when client doesn't send a body
            reqDoc.message = (req.body && req.body.message) ? req.body.message : 'User left course';
        }
        await reqDoc.save();

        res.json({ success: true, message: 'Left course', course, request: reqDoc });
    } catch (error) {
        console.error('[courses] leave error', error);
        const msg = error && error.message ? error.message : String(error || 'Internal server error');
        res.status(500).json({ message: msg });
    }
});

module.exports = router;
