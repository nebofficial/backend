const express = require('express');
const { auth, isAdmin } = require('../middleware/auth');
const User = require('../models/User');
const router = express.Router();

// Get admin dashboard stats
router.get('/dashboard', auth, isAdmin, async (req, res) => {
    try {
        const stats = await Promise.all([
            User.countDocuments({ role: 'user' }),
            User.countDocuments({ role: 'teacher' }),
            // Add more stats as needed
        ]);

        res.json({
            totalUsers: stats[0],
            totalTeachers: stats[1],
            // Add more stats here
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create admin (super admin only)
router.post('/create', auth, isAdmin, async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // Check if requester is super admin
        if (req.user.email !== process.env.SUPER_ADMIN_EMAIL) {
            return res.status(403).json({ message: 'Only super admin can create other admins' });
        }

        const existingAdmin = await User.findOne({ email });
        if (existingAdmin) {
            return res.status(400).json({ message: 'Admin already exists' });
        }

        const admin = new User({
            name,
            email,
            password,
            role: 'admin'
        });

        await admin.save();
        
        const adminToReturn = admin.toObject();
        delete adminToReturn.password;

        res.status(201).json({
            message: 'Admin created successfully',
            admin: adminToReturn
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Get all admins (super admin only)
router.get('/all', auth, isAdmin, async (req, res) => {
    try {
        // Check if requester is super admin
        if (req.user.email !== process.env.SUPER_ADMIN_EMAIL) {
            return res.status(403).json({ message: 'Only super admin can view all admins' });
        }

        const admins = await User.find({ role: 'admin' }).select('-password');
        res.json(admins);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
