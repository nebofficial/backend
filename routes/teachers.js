const express = require('express');
const { auth, isAdmin } = require('../middleware/auth');
const User = require('../models/User');
const router = express.Router();

// Get all teachers
router.get('/', auth, async (req, res) => {
    try {
        const teachers = await User.find({ role: 'teacher' }).select('-password');
        res.json(teachers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Add new teacher (admin only)
router.post('/', auth, isAdmin, async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        const existingTeacher = await User.findOne({ email });
        if (existingTeacher) {
            return res.status(400).json({ message: 'Teacher already exists' });
        }

        const teacher = new User({
            name,
            email,
            password,
            role: 'teacher'
        });

        await teacher.save();
        
        const teacherToReturn = teacher.toObject();
        delete teacherToReturn.password;

        res.status(201).json({
            message: 'Teacher added successfully',
            teacher: teacherToReturn
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update teacher (admin only)
router.put('/:id', auth, isAdmin, async (req, res) => {
    const updates = Object.keys(req.body);
    const allowedUpdates = ['name', 'email', 'password', 'avatar'];
    const isValidOperation = updates.every(update => allowedUpdates.includes(update));

    if (!isValidOperation) {
        return res.status(400).json({ message: 'Invalid updates' });
    }

    try {
        const teacher = await User.findById(req.params.id);
        if (!teacher || teacher.role !== 'teacher') {
            return res.status(404).json({ message: 'Teacher not found' });
        }

        updates.forEach(update => teacher[update] = req.body[update]);
        await teacher.save();
        
        const teacherToReturn = teacher.toObject();
        delete teacherToReturn.password;

        res.json(teacherToReturn);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Delete teacher (admin only)
router.delete('/:id', auth, isAdmin, async (req, res) => {
    try {
        const teacher = await User.findById(req.params.id);
        if (!teacher || teacher.role !== 'teacher') {
            return res.status(404).json({ message: 'Teacher not found' });
        }
        await teacher.remove();
        res.json({ message: 'Teacher deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
