const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",  // Change this to match your client port
    methods: ["GET", "POST", "DELETE"]
  }
});

app.use(cors());
app.use(express.json());

// Add logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Add this console log to see if the route is registered
console.log('Available routes:', app._router.stack.filter(r => r.route).map(r => r.route.path));

// Add these test routes at the top of your routes
app.get('/test', (req, res) => {
  res.json({ message: 'Basic test route works' });
});

app.delete('/test/:id', (req, res) => {
  res.json({ message: `Delete test works for id: ${req.params.id}` });
});

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/discord-clone', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Add MongoDB connection handlers
mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection error:', error);
});

mongoose.connection.once('open', () => {
  console.log('MongoDB connected successfully');
});

// MongoDB Models
const Message = mongoose.model('Message', {
  user: {
    username: String,
    avatar: String
  },
  text: String,
  time: String,
  projectId: String,
  channelId: String,
  createdAt: { type: Date, default: Date.now }
});

const Project = mongoose.model('Project', {
  id: String,
  name: String,
  icon: String,
  channels: [String],
  createdAt: { type: Date, default: Date.now }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    console.log(`User ${socket.id} joined session: ${sessionId}`);
  });

  socket.on('send-message', async (msg) => {
    try {
      console.log('Server received message:', msg);
      const [projectId, channelId] = msg.channel.split('-');
      
      const newMessage = new Message({
        user: msg.user,
        text: msg.text,
        time: msg.time,
        projectId,
        channelId
      });
      
      const savedMessage = await newMessage.save();
      console.log('Saved message to MongoDB:', savedMessage);

      const messageToSend = {
        ...msg,
        _id: savedMessage._id
      };
      
      console.log('Broadcasting message to clients:', messageToSend);
      io.emit('receive-message', messageToSend);
    } catch (error) {
      console.error('Error saving message:', error);
      socket.emit('message-error', { error: 'Failed to save message' });
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
  });
});

// API Routes
app.get('/api/messages/:projectId/:channel', async (req, res) => {
  try {
    const { projectId, channel } = req.params;
    console.log('Fetching messages for:', { projectId, channel });
    
    const messages = await Message.find({
      projectId,
      channelId: channel
    })
    .sort({ createdAt: 1 });
    
    console.log('Found messages:', messages);
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Error fetching messages' });
  }
});

app.get('/api/projects', async (req, res) => {
  try {
    const projects = await Project.find();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add delete message endpoint
app.delete('/api/messages/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const deletedMessage = await Message.findByIdAndDelete(messageId);
    
    if (deletedMessage) {
      // Notify all clients about the deleted message
      io.emit('message-deleted', {
        messageId,
        channel: `${deletedMessage.projectId}-${deletedMessage.channelId}`
      });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Message not found' });
    }
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Error deleting message' });
  }
});

// Delete project
app.delete('/api/projects/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    console.log('Attempting to delete project:', projectId);

    // Find and delete the project
    const deletedProject = await Project.findOneAndDelete({ id: projectId });
    console.log('Delete result:', deletedProject);

    if (deletedProject) {
      // Delete associated messages
      await Message.deleteMany({ projectId });
      console.log('Deleted associated messages for project:', projectId);
      
      // Notify all clients
      io.emit('project-deleted', projectId);
      
      res.json({ success: true, message: 'Project deleted successfully' });
    } else {
      res.status(404).json({ error: 'Project not found' });
    }
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add a test endpoint to verify the server is working
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working' });
});

// Add an endpoint to check existing projects
app.get('/api/projects/debug', async (req, res) => {
  try {
    const projects = await Project.find();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new endpoint for creating channels
app.post('/api/projects/:projectId/channels', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { channelId } = req.body;

    // Find the project
    const project = await Project.findOne({ id: projectId });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if channel already exists
    if (project.channels.includes(channelId)) {
      return res.status(400).json({ error: 'Channel already exists' });
    }

    // Add the new channel
    project.channels.push(channelId);
    await project.save();

    // Notify all clients
    io.emit('channel-created', { projectId, channelId });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error creating channel:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add delete channel endpoint
app.delete('/api/projects/:projectId/channels/:channelId', async (req, res) => {
  try {
    const { projectId, channelId } = req.params;

    // Don't allow deleting the general channel
    if (channelId === 'general') {
      return res.status(400).json({ error: 'Cannot delete the general channel' });
    }

    // Find the project
    const project = await Project.findOne({ id: projectId });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Remove the channel
    project.channels = project.channels.filter(ch => ch !== channelId);
    await project.save();

    // Delete all messages in this channel
    await Message.deleteMany({ projectId, channelId });

    // Notify all clients
    io.emit('channel-deleted', { projectId, channelId });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});