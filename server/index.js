const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/discord-clone', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((error) => {
  console.error('MongoDB connection error:', error);
});

// MongoDB Models
const Message = mongoose.model('Message', {
  user: {
    username: String,
    avatar: String
  },
  text: String,
  time: String,
  channel: String,
  projectId: String,
  createdAt: { type: Date, default: Date.now }
});

const Project = mongoose.model('Project', {
  id: String,
  name: String,
  icon: String,
  channels: [String],
  createdAt: { type: Date, default: Date.now }
});

let sessions = {}; // Store sessions

// Endpoint to generate an invite link
app.post('/create-invite', (req, res) => {
  const sessionId = uuidv4();
  sessions[sessionId] = { participants: [] };
  const inviteLink = `http://localhost:3000/join/${sessionId}`;
  res.json({ inviteLink });
});

// API Routes for Discord clone functionality
app.get('/api/messages/:projectId/:channel', async (req, res) => {
  try {
    const { projectId, channel } = req.params;
    const messages = await Message.find({
      channel: `${projectId}-${channel}`
    }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching messages' });
  }
});

app.get('/api/projects', async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: 1 });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching projects' });
  }
});

// Handle socket connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-session', (sessionId) => {
    if (sessions[sessionId]) {
      sessions[sessionId].participants.push(socket.id);
      console.log(`User ${socket.id} joined session ${sessionId}`);
    } else {
      console.log('Invalid session');
    }
  });

  socket.on('send-message', async (msg) => {
    try {
      // Save message to MongoDB
      const newMessage = new Message({
        user: msg.user,
        text: msg.text,
        time: msg.time,
        channel: msg.channel,
        projectId: msg.channel.split('-')[0]
      });
      await newMessage.save();

      // Broadcast message to all clients
      io.emit('receive-message', msg);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  socket.on('create-project', async (project) => {
    try {
      const newProject = new Project(project);
      await newProject.save();
      io.emit('project-created', project);
    } catch (error) {
      console.error('Error creating project:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove user from all sessions they were part of
    Object.keys(sessions).forEach(sessionId => {
      sessions[sessionId].participants = sessions[sessionId].participants.filter(
        id => id !== socket.id
      );
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
