import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import LinkPreview from './LinkPreview';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';

const socket = io('http://localhost:3001', {
  withCredentials: true,
  transports: ['websocket', 'polling']
});

const USER = {
  username: 'Lycan',
  avatar: `https://api.dicebear.com/7.x/thumbs/svg?seed=Lycan`
};

const DEFAULT_PROJECTS = [
  { id: 'main', name: 'Main Project', icon: '📊' },
  { id: 'frontend', name: 'Frontend Dev', icon: '🎨' },
  { id: 'backend', name: 'Backend Dev', icon: '⚙️' },
  { id: 'mobile', name: 'Mobile App', icon: '📱' },
  { id: 'design', name: 'Design System', icon: '🎯' }
];

const DEFAULT_CHANNELS = {
  main: ['general', 'announcements', 'resources'],
  frontend: ['react', 'vue', 'css'],
  backend: ['node', 'python', 'databases'],
  mobile: ['react-native', 'flutter', 'testing'],
  design: ['ui', 'ux', 'assets']
};

// Available project icons for selection
const PROJECT_ICONS = [
  '📊', '🎨', '⚙️', '📱', '🎯', '📝', '🔧', '🚀', '💻', '🎮',
  '📚', '🔍', '🛠️', '📈', '🤖', '🎵', '🎬', '📷', '🔐', '☁️'
];

marked.setOptions({
  breaks: true,
  highlight: function (code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  }
});

function App() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [message, setMessage] = useState('');
  const [currentProject, setCurrentProject] = useState('main');
  const [currentChannel, setCurrentChannel] = useState('general');
  const [projects, setProjects] = useState(DEFAULT_PROJECTS);
  const [channels, setChannels] = useState(DEFAULT_CHANNELS);
  const [messages, setMessages] = useState({});
  const [showMemberList, setShowMemberList] = useState(true);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', icon: '📊' });
  const [showEditor, setShowEditor] = useState(false);
  const keysPressed = useRef({});
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [newChannel, setNewChannel] = useState('');
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [userStatus, setUserStatus] = useState('online');

  // Mock online members data
  const onlineMembers = [
    { username: 'Lycan', status: 'online', avatar: USER.avatar },
    { username: 'Alice', status: 'idle', avatar: `https://api.dicebear.com/7.x/thumbs/svg?seed=Alice` },
    { username: 'Bob', status: 'dnd', avatar: `https://api.dicebear.com/7.x/thumbs/svg?seed=Bob` },
    { username: 'Charlie', status: 'offline', avatar: `https://api.dicebear.com/7.x/thumbs/svg?seed=Charlie` },
  ];

  // Add these status options
  const STATUS_OPTIONS = [
    { id: 'online', label: 'Online', emoji: '🟢' },
    { id: 'idle', label: 'Idle', emoji: '🌙' },
    { id: 'dnd', label: 'Do Not Disturb', emoji: '⛔' },
    { id: 'invisible', label: 'Invisible', emoji: '⭕' }
  ];

  // Fetch initial projects and messages
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/projects');
        const data = await response.json();
        if (data.length > 0) {
          setProjects(data);
          // Update channels based on fetched projects
          const projectChannels = {};
          data.forEach(project => {
            projectChannels[project.id] = project.channels;
          });
          setChannels(projectChannels);
        }
      } catch (error) {
        console.error('Error fetching projects:', error);
      }
    };

    fetchProjects();
  }, []);

  // Fetch messages when changing channels
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        console.log('Fetching messages for:', currentProject, currentChannel);
        const response = await fetch(`http://localhost:3001/api/messages/${currentProject}/${currentChannel}`);
        const data = await response.json();
        console.log('Received messages from server:', data);
        
        setMessages(prev => {
          const newMessages = {
            ...prev,
            [`${currentProject}-${currentChannel}`]: data
          };
          console.log('Updated messages state:', newMessages);
          return newMessages;
        });
      } catch (error) {
        console.error('Error fetching messages:', error);
      }
    };

    fetchMessages();
  }, [currentProject, currentChannel]);

  // Socket.IO event handlers
  useEffect(() => {
    socket.on('receive-message', (msg) => {
      console.log('Received message from server:', msg);
      setMessages(prev => ({
        ...prev,
        [msg.channel]: [...(prev[msg.channel] || []), msg]
      }));
    });

    socket.on('message-deleted', ({ messageId, channel }) => {
      setMessages(prev => ({
        ...prev,
        [channel]: prev[channel]?.filter(msg => msg._id !== messageId) || []
      }));
    });

    socket.on('message-error', (error) => {
      console.error('Message failed to send:', error);
    });

    socket.on('project-created', (project) => {
      setProjects(prev => [...prev, project]);
      setChannels(prev => ({
        ...prev,
        [project.id]: project.channels
      }));
    });

    socket.on('project-deleted', (projectId) => {
      console.log('Received project-deleted event:', projectId);
      setProjects(prev => {
        console.log('Current projects:', prev);
        const updated = prev.filter(p => p.id !== projectId);
        console.log('Updated projects:', updated);
        return updated;
      });
      
      setChannels(prev => {
        const newChannels = { ...prev };
        delete newChannels[projectId];
        return newChannels;
      });

      // If we're in the deleted project, switch to main
      if (currentProject === projectId) {
        setCurrentProject('main');
        setCurrentChannel('general');
      }
    });

    return () => {
      socket.off('receive-message');
      socket.off('message-deleted');
      socket.off('message-error');
      socket.off('project-created');
      socket.off('project-deleted');
    };
  }, [currentProject]);

  useEffect(() => {
    if (sessionId) {
      socket.emit('join-session', sessionId);
      console.log(`Joined session: ${sessionId}`);
    }
  }, [sessionId]);

  const sendMessage = () => {
    if (message.trim() === '') return;
    const msgObj = {
      user: USER,
      text: message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      channel: `${currentProject}-${currentChannel}`
    };
    
    console.log('Sending message:', msgObj);
    socket.emit('send-message', msgObj);
    setMessage('');
  };

  const handleAddProject = () => {
    if (!newProject.name.trim()) return;
    
    const projectId = newProject.name.toLowerCase().replace(/\s+/g, '-');
    const newProjectObj = {
      id: projectId,
      name: newProject.name,
      icon: newProject.icon,
      channels: ['general', 'resources']
    };

    // Emit project creation event to server
    socket.emit('create-project', newProjectObj);

    setShowProjectModal(false);
    setNewProject({ name: '', icon: '📊' });
    setCurrentProject(projectId);
    setCurrentChannel('general');
  };

  const currentMessages = messages[`${currentProject}-${currentChannel}`] || [];

  console.log('Current state:', {
    currentProject,
    currentChannel,
    messages,
    currentMessages: messages[`${currentProject}-${currentChannel}`]
  });

  // Add deleteMessage function
  const deleteMessage = async (messageId, channel) => {
    try {
      const response = await fetch(`http://localhost:3001/api/messages/${messageId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete message');
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  };

  const handleEditorChange = (value) => {
    setMessage(value);
  };

  const determineLanguage = (codeSnippet) => {
    if (codeSnippet.includes('def ')) return 'python';
    if (codeSnippet.includes('function ')) return 'javascript';
    if (codeSnippet.includes('class ')) return 'python';
    return 'javascript';
  };

  useEffect(() => {
    const downHandler = (e) => {
      keysPressed.current[e.key] = true;
      if (keysPressed.current['.'] && e.key === 'd') {
        setShowEditor(true);
      }
    };

    const upHandler = (e) => {
      delete keysPressed.current[e.key];
    };

    window.addEventListener('keydown', downHandler);
    window.addEventListener('keyup', upHandler);

    return () => {
      window.removeEventListener('keydown', downHandler);
      window.removeEventListener('keyup', upHandler);
    };
  }, []);

  const openInCodespace = async () => {
    const repoUrl = 'https://github.com/yourusername/your-repo-name'; // Replace with your repo URL
    window.open(`https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=${encodeURIComponent(repoUrl.split('github.com/')[1])}`, '_blank');
  };

  const deleteProject = async (projectId) => {
    if (projectId === 'main') {
      alert("Cannot delete the main project!");
      return;
    }

    try {
      // First, test if we can reach the server at all
      const testResponse = await fetch('http://localhost:3001/test');
      console.log('Test response:', await testResponse.json());

      // Then try a test delete
      const testDelete = await fetch(`http://localhost:3001/test/${projectId}`, {
        method: 'DELETE'
      });
      console.log('Test delete response:', await testDelete.json());

      // If those work, try the actual delete
      const response = await fetch(`http://localhost:3001/api/projects/${projectId}`, {
        method: 'DELETE'
      });
      console.log('Actual delete response:', response);

      if (!response.ok) {
        const text = await response.text();
        console.log('Error response text:', text);
        throw new Error('Failed to delete project');
      }

      // Update local state
      setProjects(prev => prev.filter(p => p.id !== projectId));
      
      if (currentProject === projectId) {
        setCurrentProject('main');
        setCurrentChannel('general');
      }

    } catch (error) {
      console.error('Error:', error);
      alert('Failed to delete project');
    }
  };

  const handleAddChannel = async () => {
    if (!newChannel.trim()) return;
    
    try {
      const channelId = newChannel.toLowerCase().replace(/\s+/g, '-');
      
      const response = await fetch(`http://localhost:3001/api/projects/${currentProject}/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ channelId })
      });

      if (!response.ok) {
        throw new Error('Failed to create channel');
      }

      // Update local state
      setChannels(prev => ({
        ...prev,
        [currentProject]: [...(prev[currentProject] || []), channelId]
      }));

      // Reset form
      setNewChannel('');
      setShowChannelModal(false);
    } catch (error) {
      console.error('Error creating channel:', error);
      alert('Failed to create channel');
    }
  };

  // Add this useEffect for handling clicks outside the profile card
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showProfileCard && !event.target.closest('.user-info') && !event.target.closest('.profile-card')) {
        setShowProfileCard(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfileCard]);

  // Add this function to handle channel deletion
  const deleteChannel = async (channelId) => {
    if (channelId === 'general') {
      alert("Cannot delete the general channel!");
      return;
    }

    if (window.confirm('Are you sure you want to delete this channel?')) {
      try {
        const response = await fetch(`http://localhost:3001/api/projects/${currentProject}/channels/${channelId}`, {
          method: 'DELETE'
        });

        if (response.ok) {
          // Update local state
          setChannels(prev => ({
            ...prev,
            [currentProject]: prev[currentProject].filter(ch => ch !== channelId)
          }));

          // If we're in the deleted channel, switch to general
          if (currentChannel === channelId) {
            setCurrentChannel('general');
          }
        }
      } catch (error) {
        console.error('Error deleting channel:', error);
      }
    }
  };

  return (
    <div className="app">
      <div className="sidebar">
        <div className="projects-list">
          {projects.map((project) => (
            <div
              key={project.id}
              className="project-item"
              title={project.name}
            >
              <div
                className={`project-icon ${currentProject === project.id ? 'active' : ''}`}
                onClick={() => {
                  setCurrentProject(project.id);
                  setCurrentChannel(channels[project.id][0]);
                }}
              >
                {project.icon}
                {project.id !== 'main' && (
                  <button
                    className="delete-project"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Are you sure you want to delete this project?')) {
                        deleteProject(project.id);
                      }
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
          <div 
            className="project-icon add-project" 
            title="Add Project"
            onClick={() => setShowProjectModal(true)}
          >
            +
          </div>
        </div>
      </div>

      {/* Project Creation Modal */}
      {showProjectModal && (
        <div className="modal-overlay">
          <div className="project-modal">
            <div className="modal-header">
              <h2>Create New Project</h2>
              <button 
                className="close-modal"
                onClick={() => setShowProjectModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-content">
              <div className="input-group">
                <label>PROJECT NAME</label>
                <input
                  type="text"
                  placeholder="Enter project name"
                  value={newProject.name}
                  onChange={(e) => setNewProject(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="input-group">
                <label>PROJECT ICON</label>
                <div className="icon-grid">
                  {PROJECT_ICONS.map((icon) => (
                    <div
                      key={icon}
                      className={`icon-option ${newProject.icon === icon ? 'selected' : ''}`}
                      onClick={() => setNewProject(prev => ({ ...prev, icon }))}
                    >
                      {icon}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="cancel-button"
                onClick={() => setShowProjectModal(false)}
              >
                Cancel
              </button>
              <button 
                className="create-button"
                onClick={handleAddProject}
                disabled={!newProject.name.trim()}
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="channels">
        <div className="project-header">
          <h2>{projects.find(p => p.id === currentProject)?.name}</h2>
        </div>
        <div className="channel-groups">
          <div className="channel-group">
            <div className="channel-group-header">
              <span className="chevron">▼</span> Text Channels
              <button 
                className="add-channel-button"
                onClick={() => setShowChannelModal(true)}
                title="Add Channel"
              >
                +
              </button>
            </div>
            {channels[currentProject]?.map((channel) => (
              <div
                key={channel}
                className={`channel ${currentChannel === channel ? 'active' : ''}`}
              >
                <div 
                  className="channel-name"
                  onClick={() => setCurrentChannel(channel)}
                >
                  <span className="channel-hash">#</span>
                  {channel}
                </div>
                {channel !== 'general' && (
                  <button
                    className="delete-channel"
                    onClick={() => deleteChannel(channel)}
                    title="Delete Channel"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Channel Creation Modal */}
        {showChannelModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h2>Create Text Channel</h2>
                <button 
                  className="close-modal"
                  onClick={() => setShowChannelModal(false)}
                >
                  ×
                </button>
              </div>
              
              <div className="modal-body">
                <div className="input-group">
                  <label>CHANNEL NAME</label>
                  <div className="channel-input-wrapper">
                    <span className="channel-hash">#</span>
                    <input
                      type="text"
                      value={newChannel}
                      onChange={(e) => setNewChannel(e.target.value)}
                      placeholder="new-channel"
                      maxLength={25}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button 
                  className="cancel-button"
                  onClick={() => {
                    setNewChannel('');
                    setShowChannelModal(false);
                  }}
                >
                  Cancel
                </button>
                <button 
                  className="create-button"
                  onClick={handleAddChannel}
                  disabled={!newChannel.trim()}
                >
                  Create Channel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="user-controls">
          <div 
            className="user-info"
            onClick={() => setShowProfileCard(!showProfileCard)}
          >
            <img src={USER.avatar} alt="avatar" className="avatar" />
            <div className="user-details">
              <div className="username">{USER.username}</div>
              <div className="status">
                {STATUS_OPTIONS.find(status => status.id === userStatus)?.emoji} {userStatus}
              </div>
            </div>
          </div>

          {/* Profile Card Popup */}
          {showProfileCard && (
            <div className="profile-card">
              <div className="profile-card-header">
                <img src={USER.avatar} alt="avatar" className="profile-avatar" />
                <div className="profile-banner"></div>
              </div>
              
              <div className="profile-card-body">
                <div className="profile-username">
                  {USER.username}
                  <span className="profile-tag">#0001</span>
                </div>
                
                <div className="profile-divider"></div>
                
                <div className="profile-section">
                  <h4>DISCORD MEMBER SINCE</h4>
                  <p>{new Date().toLocaleDateString()}</p>
                </div>
                
                <div className="profile-divider"></div>
                
                <div className="profile-status-picker">
                  <h4>SET STATUS</h4>
                  {STATUS_OPTIONS.map(status => (
                    <div
                      key={status.id}
                      className={`status-option ${userStatus === status.id ? 'active' : ''}`}
                      onClick={() => setUserStatus(status.id)}
                    >
                      <span className="status-emoji">{status.emoji}</span>
                      {status.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="chat">
        <div className="chat-header">
          <div className="chat-header-left">
            <span className="channel-hash">#</span>
            {currentChannel}
          </div>
          <div className="chat-header-right">
            <button 
              className="editor-button"
              onClick={() => setShowEditor(true)}
              title="Press '.d' to open editor"
            >
              <span className="editor-icon">📝</span>
              Editor
            </button>
            <button 
              className="codespace-button"
              onClick={openInCodespace}
            >
              <span className="codespace-icon">⚡</span>
              Open in Codespace
            </button>
            <button onClick={() => setShowMemberList(!showMemberList)}>
              {showMemberList ? 'Hide Members' : 'Show Members'}
            </button>
          </div>
        </div>

        <div className="chat-container">
          <div className="messages">
            {(messages[`${currentProject}-${currentChannel}`] || []).map((msg, idx) => (
              <div className="message" key={msg._id || idx}>
                <img src={msg.user.avatar} alt="avatar" className="avatar" />
                <div className="message-content">
                  <div className="message-header">
                    <span className="username">{msg.user.username}</span>
                    <span className="timestamp">{msg.time}</span>
                    {msg.user.username === USER.username && (
                      <button 
                        className="delete-message"
                        onClick={async () => {
                          try {
                            const response = await fetch(`http://localhost:3001/api/messages/${msg._id}`, {
                              method: 'DELETE'
                            });
                            if (response.ok) {
                              // Remove message locally
                              setMessages(prev => ({
                                ...prev,
                                [`${currentProject}-${currentChannel}`]: prev[`${currentProject}-${currentChannel}`]
                                  .filter(m => m._id !== msg._id)
                              }));
                            }
                          } catch (error) {
                            console.error('Error deleting message:', error);
                          }
                        }}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                  <div
                    className="message-text"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
                  ></div>
                  {extractFirstLink(msg.text) && (
                    <LinkPreview url={extractFirstLink(msg.text)} />
                  )}
                </div>
              </div>
            ))}
          </div>

          {showMemberList && (
            <div className="members-list">
              <h3>Members - {onlineMembers.length}</h3>
              {onlineMembers.map((member) => (
                <div key={member.username} className="member">
                  <img src={member.avatar} alt="avatar" className="avatar" />
                  <span className="member-name">{member.username}</span>
                  <span className={`status-indicator ${member.status}`}></span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="input-bar">
          <textarea
            placeholder={`Message #${currentChannel}`}
            value={message}
            rows={1}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              const lines = message.split('\n');
              const lastLine = lines[lines.length - 1];

              if (e.key === 'Enter') {
                if (e.shiftKey) return;
                if (isInCodeBlock(message)) return;
                if (lastLine.trim() === '```') {
                  e.preventDefault();
                  setMessage((prev) => prev + '\n');
                  return;
                }
                e.preventDefault();
                sendMessage();
              }
            }}
          />
        </div>
      </div>

      {showEditor && (
        <div className="editor-modal">
          <div className="editor-header">
            <span>Live Editor</span>
            <button onClick={() => setShowEditor(false)}>Close</button>
          </div>
          <Editor
            height="90vh"
            language={determineLanguage(message)}
            value={message}
            theme="vs-dark"
            onChange={handleEditorChange}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              automaticLayout: true,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              formatOnPaste: true,
              formatOnType: true,
              tabSize: 2,
              autoClosingBrackets: 'always'
            }}
          />
        </div>
      )}
    </div>
  );
}

function renderMarkdown(text) {
  const raw = marked.parse(text);
  return DOMPurify.sanitize(raw);
}

function extractFirstLink(text) {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

function isInCodeBlock(text) {
  const codeBlocks = (text.match(/```/g) || []).length;
  return codeBlocks % 2 !== 0;
}

export default App;
