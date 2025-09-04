const express = require('express');
const { auth } = require('../middleware/auth');
const Course = require('../models/Course');
const router = express.Router();

// Get all classes across courses
router.get('/', auth, async (req, res) => {
    try {
        const courses = await Course.find({}, 'title classes');
        const classes = courses.reduce((all, course) => {
            return all.concat(
                course.classes.map(cls => ({
                    ...cls.toObject(),
                    courseName: course.title,
                    courseId: course._id
                }))
            );
        }, []);

        res.json({ success: true, classes });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
