const express = require('express');
const Course = require('../models/Course');
const router = express.Router();

// GET / - aggregate students across courses and include course info
router.get('/', async (req, res) => {
    try {
    // Find courses with students populated (include role so we can exclude non-user accounts)
    const courses = await Course.find({}, 'title students').populate('students', 'name email profilePic role');

        const studentMap = new Map();

        courses.forEach(course => {
            const courseId = course._id;
            const courseName = course.title;
            (course.students || []).forEach(student => {
                if (!student) return;
                const id = student._id.toString();
                if (!studentMap.has(id)) {
                    studentMap.set(id, {
                        _id: id,
                        name: student.name,
                        email: student.email,
                        role: student.role || 'user',
                        profilePic: student.profilePic || undefined,
                        courses: []
                    });
                }
                const s = studentMap.get(id);
                s.courses.push({ courseId, courseName, enrolledDate: undefined });
            });
        });

        const students = Array.from(studentMap.values());
        res.json({ success: true, students });
    } catch (error) {
        console.error('[students] Aggregation error:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
