const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const router = express.Router();

// Helper to generate 8-digit OTP
function generateOTP() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// Create nodemailer transporter with SSL/TLS settings
const transporter = nodemailer.createTransport({
    host: 'mail.nebofficial.com',
    port: 465,
    secure: true,
    auth: {
        user: 'test@nebofficial.com',
        pass: 'test@nebofficial.com',  // Using the password directly for testing
        type: 'login'  // Explicitly set auth type
    },
    tls: {
        rejectUnauthorized: false,
        ciphers: 'SSLv3'
    },
    // Respect EMAIL_DEBUG env var to enable verbose SMTP debug logs
//  debug: true,
//     logger: true,

    debug: process.env.EMAIL_DEBUG === 'true',
    logger: process.env.EMAIL_DEBUG === 'true',
    authMethod: 'PLAIN'  // Explicitly set auth method
});

// Verify SMTP connection on server start
transporter.verify(function(error, success) {
    if (error) {
        // console.error('SMTP connection error:', error);
    } else {
        // console.log('SMTP server is ready to send emails');
    }
});

async function sendVerificationEmail(to, code) {
    if (!process.env.EMAIL_ENABLED) {
        // console.log('Email sending is disabled. Would have sent:', { to, code });
        return;
    }

    // console.log('Attempting to send email to:', to);
    
    // Test SMTP connection before sending
    try {
        // console.log('Testing SMTP connection...');
        await new Promise((resolve, reject) => {
            transporter.verify(function(error, success) {
                if (error) {
                    // console.error('SMTP Verification failed:', {
                    //     error: error.message,
                    //     code: error.code,
                    //     command: error.command,
                    //     responseCode: error.responseCode,
                    //     response: error.response
                    // });
                    reject(error);
                } else {
                    // console.log('SMTP Connection verified successfully');
                    // console.log('Server is ready to take our messages');
                    resolve(success);
                }
            });
        });

        // Additional connection test
        const testConnection = await transporter.verify();
        // console.log('Additional connection test result:', testConnection);

    } catch (verifyError) {
        // console.error('SMTP Connection verification failed:', {
        //     message: verifyError.message,
        //     code: verifyError.code,
        //     command: verifyError.command,
        //     stack: verifyError.stack
        // });
        throw new Error('SMTP connection failed: ' + verifyError.message);
    }

    const mailOptions = {
        from: '"ShyamSir Online Academy" <test@nebofficial.com>',
        to,
        subject: 'Your ShyamSirOnline verification code',
        text: `Your verification code is: ${code}`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">ShyamSir Online Academy</h2>
                <p style="font-size: 16px; color: #666;">Your verification code is:</p>
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
                    <h1 style="color: #007bff; margin: 0; font-size: 32px;">${code}</h1>
                </div>
                <p style="font-size: 14px; color: #888;">This code will expire in 15 minutes.</p>
            </div>
        `,
        headers: {
            'X-Priority': '1',
            'X-MSMail-Priority': 'High'
        }
    };

    try {
        // console.log('Sending email with options:', {
        //     to: mailOptions.to,
        //     from: mailOptions.from,
        //     subject: mailOptions.subject
        // });

        const info = await transporter.sendMail(mailOptions);
        // console.log('Email sent successfully:', {
        //     messageId: info.messageId,
        //     response: info.response
        // });
        return info;
    } catch (error) {
        // console.error('Failed to send email:', {
        //     error: error.message,
        //     code: error.code,
        //     command: error.command,
        //     responseCode: error.responseCode
        // });
        throw error;
    }
}

// Register (creates user and sends OTP)
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: 'User already exists' });

        const user = new User({ name, email, password, role: role || 'user' });

        // Attach OTP and expiry (15 minutes)
        const code = generateOTP();
        user.emailVerification = {
            code,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        };

        await user.save();

        try {
            await sendVerificationEmail(user.email, code);
        } catch (mailErr) {
            // Log and continue; user was created but email failed
            // console.error('Email send error:', mailErr);
        }

        res.status(201).json({ message: 'User created. Verification code sent to email.' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Resend OTP
router.post('/resend-otp', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.emailVerified) return res.status(400).json({ message: 'Email already verified' });

        const code = generateOTP();
        user.emailVerification = { code, expiresAt: new Date(Date.now() + 15 * 60 * 1000) };
        await user.save();

        try {
            await sendVerificationEmail(user.email, code);
        } catch (mailErr) {
            // console.error('Email send error:', mailErr);
        }

        res.json({ message: 'Verification code resent' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, code } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.emailVerified) return res.status(400).json({ message: 'Email already verified' });
        if (!user.emailVerification || user.emailVerification.code !== code) return res.status(400).json({ message: 'Invalid code' });
        if (user.emailVerification.expiresAt < new Date()) return res.status(400).json({ message: 'Code expired' });

        user.emailVerified = true;
        user.emailVerification = undefined;
        await user.save();

        // Issue long-lived token (25 years)
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '25y' }
        );

        res.json({ message: 'Email verified', token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        // console.log('Login attempt:', req.body);
        const { email, password } = req.body;
        
        if (!email || !password) {
            // console.log('Missing email or password');
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await User.findOne({ email });
        // console.log('User found:', user ? 'Yes' : 'No');
        
        if (!user) {
            // console.log('User not found');
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await user.comparePassword(password);
        // console.log('Password match:', isMatch ? 'Yes' : 'No');
        
        if (!isMatch) {
            // console.log('Password does not match');
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (!user.emailVerified) {
            // console.log('Email not verified');
            return res.status(403).json({ message: 'Email not verified. Please verify your email first.' });
        }

        const token = jwt.sign(
            { userId: user._id }, 
            process.env.JWT_SECRET || 'your-secret-key', 
            { expiresIn: '25y' }
        );

        // console.log('Login successful for:', email);
        
        res.status(200).json({ 
            success: true,
            message: 'Logged in successfully', 
            token, 
            user: { 
                id: user._id, 
                name: user.name, 
                email: user.email, 
                role: user.role 
            } 
        });
    } catch (error) {
        // console.error('Login error:', error);
        res.status(500).json({ 
            success: false,
            message: 'An error occurred during login. Please try again.' 
        });
    }
});

// Forgot Password - send OTP
router.post('/forgot-password', async (req, res) => {
    // console.log('Received forgot password request:', req.body);
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // console.log('Looking up user with email:', email);
        const user = await User.findOne({ email });
        
        if (!user) {
            // console.log('No user found with email:', email);
            return res.status(404).json({
                success: false,
                message: 'No account found with this email'
            });
        }

        // Generate OTP for password reset
        const code = generateOTP();
        // console.log('Generated OTP for user:', email);

        user.passwordReset = {
            code,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
        };

        try {
            // console.log('Attempting to save user with new OTP');
            await user.save();
            // console.log('Successfully saved user with new OTP');
        } catch (saveErr) {
            // console.error('Error saving user with new OTP:', saveErr);
            return res.status(500).json({
                success: false,
                message: 'Failed to process request. Please try again.'
            });
        }

        // Send password reset email
        try {
            // console.log('Attempting to send verification email');
            await sendVerificationEmail(user.email, code);
            // console.log('Successfully sent verification email');
            
            res.json({
                success: true,
                message: 'Password reset code sent to your email'
            });
        } catch (mailErr) {
            // console.error('Failed to send password reset email:', mailErr);
            
            // Remove the OTP since email failed
            user.passwordReset = undefined;
            await user.save();
            
            res.status(500).json({
                success: false,
                message: 'Failed to send reset code. Please try again.'
            });
        }
    } catch (error) {
        // console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred. Please try again.'
        });
    }
});

// Reset Password with OTP verification
router.post('/reset-password', async (req, res) => {
    // console.log('Reset password request received:', { email: req.body.email });
    try {
        const { email, otp, newPassword } = req.body;
        
        if (!email || !otp || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Email, OTP, and new password are required'
            });
        }

        // console.log('Looking for user:', email);
        const user = await User.findOne({ email });

        if (!user) {
            // console.log('User not found:', email);
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // console.log('Verifying OTP for user:', { 
        //     hasOTP: !!user.passwordReset, 
        //     otpMatches: user.passwordReset?.code === otp,
        //     isExpired: user.passwordReset?.expiresAt < new Date()
        // });

        // Verify OTP
        if (!user.passwordReset || 
            user.passwordReset.code !== otp || 
            user.passwordReset.expiresAt < new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset code'
            });
        }

        // Check if new password is same as current password
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({
                success: false,
                message: 'New password must be different from your current password'
            });
        }

        // console.log('Hashing new password');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        // console.log('Updating user password directly in database');
        // Update password directly to avoid double hashing
        await User.updateOne(
            { _id: user._id },
            { 
                $set: { password: hashedPassword },
                $unset: { passwordReset: "" }
            }
        );
        
        // console.log('Password reset successful');
        res.json({
            success: true,
            message: 'Password has been reset successfully. Please login with your new password.'
        });

        res.json({
            success: true,
            message: 'Password has been reset successfully'
        });
    } catch (error) {
        // console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset password. Please try again.'
        });
    }
});

// Logout - blacklist token
router.post('/logout', async (req, res) => {
    try {
        const authHeader = req.header('Authorization');
        const token = authHeader?.replace('Bearer ', '');
        if (!token) return res.status(400).json({ message: 'No token provided' });
        const decoded = jwt.decode(token);
        const expMs = decoded && decoded.exp ? decoded.exp * 1000 : Date.now() + 1000 * 60 * 60;
        const { add } = require('../utils/tokenBlacklist');
        add(token, expMs);
        res.json({ message: 'Logged out' });
    } catch (e) {
        // console.error('Logout error', e);
        res.status(500).json({ message: 'Logout failed' });
    }
});

module.exports = router;
