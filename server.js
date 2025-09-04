const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const teacherRoutes = require('./routes/teachers');
const adminRoutes = require('./routes/admin');


dotenv.config();
const app = express();

// Middleware
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Quick health / connectivity check: respond to GET / with a simple message
app.get('/', (req, res) => {
  try {
    console.log(`[GET /] hit from ${req.ip} - headers: ${JSON.stringify(req.headers && { host: req.headers.host })}`);
  } catch (e) {}
  // Return a simple text response to allow quick connectivity checks from devices/emulators
  res.setHeader('Content-Type', 'text/plain');
  res.send('hi url=localhost:5000');
});

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/shyamSirOnline')
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('SIGINT received: closing MongoDB connection');
    try {
        await mongoose.disconnect();
    } catch (e) {}
    process.exit(0);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/admin', adminRoutes);


// ...existing code...
app.use('/api/requests', require('./routes/requests'));
app.use('/api/discussions', require('./routes/discussions'));
app.use('/api/chats', require('./routes/chats'));
// Mount specific child routes first to avoid route param conflicts (e.g. ':id' capturing 'classes')
app.use('/api/courses/classes', require('./routes/classes'));
app.use('/api/courses/resources', require('./routes/resources'));
app.use('/api/courses/students', require('./routes/students'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/sessions', require('./routes/sessions'));

// Mount Zoom signature endpoints
app.use('/api/zoom', require('./zoom'));


// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Listen on all network interfaces

// Start http server and attach Socket.IO
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });
const socketUtil = require('./utils/socket');
socketUtil.setIO(io);

io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);
  // allow clients to join a room using their user id
  socket.on('join', (room) => {
    try { socket.join(String(room)); } catch (e) {}
  });
  socket.on('disconnect', () => {
    // console.log('Socket disconnected', socket.id);
  });
});

server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
    console.log('For local access, use your machine\'s IP address');
});
