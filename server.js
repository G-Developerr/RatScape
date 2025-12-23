// server.js - COMPLETE FIXED VERSION WITH ALL ENDPOINTS
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { dbHelpers, initializeDatabase } = require("./database.js");
const multer = require('multer');

const app = express();
const server = createServer(app);

// WebSocket config
const io = new Server(server, {
  cors: {
    origin: ["https://ratscape.onrender.com", "http://localhost:3000", "http://localhost:10000", "http://localhost:5500", "http://127.0.0.1:5500"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors({
  origin: ["https://ratscape.onrender.com", "http://localhost:3000", "http://localhost:5500", "http://127.0.0.1:5500"],
  credentials: true
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Debugging middleware
app.use((req, res, next) => {
  if (req.path.includes('upload') || req.path.includes('video') || req.path.includes('file')) {
    console.log(`\n🔍 [${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log(`📦 Headers:`, {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
      'origin': req.headers['origin']
    });
  }
  next();
});

// Upload directories
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const VIDEO_UPLOAD_DIR = path.join(UPLOAD_DIR, 'videos');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log('✅ Created uploads directory');
}

if (!fs.existsSync(VIDEO_UPLOAD_DIR)) {
  fs.mkdirSync(VIDEO_UPLOAD_DIR, { recursive: true });
  console.log('✅ Created videos directory');
}

// Multer configuration
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  },
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|txt|mp4|webm|ogg|mov|avi|mpeg|mkv|wmv|flv/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image, video, PDF, Word and text files are allowed'));
  }
});

const videoChunks = new Map();

// Serve static files
app.use(express.static(path.join(__dirname)));

if (fs.existsSync(UPLOAD_DIR)) {
  app.use('/uploads', express.static(UPLOAD_DIR));
  console.log('✅ Serving static files from /uploads');
}

// ===== ROUTES =====

// Basic routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/test", (req, res) => {
  res.sendFile(path.join(__dirname, "test.html"));
});

// 🔥 Debug endpoint
app.get("/ping", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString()
  });
});

// 🔥 Simple test endpoint
app.post("/simple-test", upload.single('file'), (req, res) => {
  try {
    console.log("🧪 Simple test endpoint called");
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file received",
        receivedBody: Object.keys(req.body)
      });
    }
    
    res.json({
      success: true,
      message: "Test successful",
      fileInfo: {
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      }
    });
    
  } catch (error) {
    console.error("Test error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Memory sessions as fallback
const userSessions = new Map();
const onlineUsers = new Map();
const roomSockets = new Map();

// Enhanced session middleware using database
async function validateSession(req, res, next) {
  const sessionId = req.headers["x-session-id"];
  const username = req.params.username || req.body.username;

  if (!sessionId) {
    return res.status(401).json({ success: false, error: "Session required" });
  }

  try {
    let session = await dbHelpers.getSession(sessionId) || userSessions.get(sessionId);
    
    if (!session) {
      return res.status(401).json({ success: false, error: "Invalid session" });
    }

    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const sessionTime = new Date(session.last_accessed || session.createdAt).getTime();
    
    if (Date.now() - sessionTime > oneWeek) {
      await dbHelpers.deleteSession(sessionId);
      userSessions.delete(sessionId);
      return res.status(401).json({ success: false, error: "Session expired" });
    }

    if (username && session.username !== username) {
      return res.status(401).json({ success: false, error: "Session mismatch" });
    }

    next();
  } catch (error) {
    console.error("Session validation error:", error);
    return res.status(500).json({ success: false, error: "Session error" });
  }
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// ===== VIDEO UPLOAD ENDPOINTS =====

app.post("/upload-video-chunk", upload.single('videoChunk'), async (req, res) => {
  console.log("🚀 Video chunk upload endpoint called");
  
  try {
    if (!req.file) {
      console.log("❌ No file received");
      return res.status(400).json({
        success: false,
        error: "No video chunk uploaded",
        details: "Make sure you're sending a file with field name 'videoChunk'"
      });
    }
    
    console.log(`✅ File received: ${req.file.originalname} (${req.file.size} bytes)`);
    
    const { chunkIndex, totalChunks, videoId, fileName, fileType, fileSize } = req.body;
    
    console.log("📦 Chunk data:", { chunkIndex, totalChunks, videoId });
    
    if (chunkIndex === undefined || totalChunks === undefined) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        required: ["chunkIndex", "totalChunks"]
      });
    }
    
    const finalVideoId = videoId || `video_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const chunkIdx = parseInt(chunkIndex);
    const totalChunksNum = parseInt(totalChunks);
    
    if (!videoChunks.has(finalVideoId)) {
      videoChunks.set(finalVideoId, {
        chunks: new Array(totalChunksNum),
        totalChunks: totalChunksNum,
        fileName: fileName || req.file.originalname || 'video',
        fileType: fileType || req.file.mimetype || 'video/mp4',
        fileSize: parseInt(fileSize) || req.file.size,
        createdAt: Date.now()
      });
    }
    
    const videoData = videoChunks.get(finalVideoId);
    videoData.chunks[chunkIdx] = req.file.buffer;
    
    const uploadedChunks = videoData.chunks.filter(chunk => chunk !== undefined).length;
    const progressPercent = Math.round((uploadedChunks / videoData.totalChunks) * 100);
    
    console.log(`✅ Chunk ${chunkIdx + 1}/${videoData.totalChunks} stored`);
    
    res.json({
      success: true,
      chunkIndex: chunkIdx,
      totalChunks: videoData.totalChunks,
      uploadedChunks: uploadedChunks,
      videoId: finalVideoId,
      fileName: videoData.fileName,
      progress: progressPercent,
      message: `Chunk ${chunkIdx + 1}/${videoData.totalChunks} uploaded successfully`
    });
    
  } catch (error) {
    console.error("❌ Video chunk upload error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message
    });
  }
});

app.post("/combine-video-chunks", async (req, res) => {
  try {
    const { videoId, fileName, fileType, fileSize, sender, type, roomId, receiver } = req.body;
    
    if (!videoId) {
      return res.status(400).json({ success: false, error: "Video ID required" });
    }
    
    if (!videoChunks.has(videoId)) {
      return res.status(400).json({ success: false, error: "Video not found" });
    }
    
    const videoData = videoChunks.get(videoId);
    
    const missingChunks = [];
    for (let i = 0; i < videoData.totalChunks; i++) {
      if (!videoData.chunks[i]) {
        missingChunks.push(i);
      }
    }
    
    if (missingChunks.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Not all chunks uploaded",
        missingChunks: missingChunks
      });
    }
    
    console.log(`🎬 Combining ${videoData.totalChunks} chunks for video: ${videoData.fileName}`);
    
    const combinedBuffer = Buffer.concat(videoData.chunks);
    
    const fileId = `video_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const uniqueFileName = `${fileId}_${(fileName || videoData.fileName).replace(/[^a-zA-Z0-9.]/g, '_')}`;
    
    let fileUrl = null;
    let base64Preview = '';
    
    if (fs.existsSync(VIDEO_UPLOAD_DIR)) {
      try {
        const filePath = path.join(VIDEO_UPLOAD_DIR, uniqueFileName);
        fs.writeFileSync(filePath, combinedBuffer);
        fileUrl = `/uploads/videos/${uniqueFileName}`;
        console.log(`✅ Video saved to disk: ${filePath}`);
      } catch (diskError) {
        console.error("❌ Could not save video to disk:", diskError.message);
      }
    }
    
    if (combinedBuffer.length > 0) {
      const previewBuffer = combinedBuffer.slice(0, Math.min(1024 * 1024, combinedBuffer.length));
      base64Preview = `data:${videoData.fileType};base64,${previewBuffer.toString('base64')}`;
    }
    
    if (!fileUrl) {
      fileUrl = `data:${videoData.fileType};base64,${combinedBuffer.toString('base64')}`;
    }
    
    function formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    const formattedFileSize = formatFileSize(videoData.fileSize);
    
    if (type === 'private') {
      await dbHelpers.savePrivateMessage({
        sender: sender,
        receiver: receiver,
        text: `🎬 Video: ${videoData.fileName}`,
        time: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        isFile: true,
        video_data: {
          fileId: fileId,
          fileName: videoData.fileName,
          fileType: videoData.fileType,
          fileSize: formattedFileSize,
          fileUrl: fileUrl,
          preview: base64Preview
        }
      });
    } else {
      await dbHelpers.saveMessage({
        room_id: roomId,
        sender: sender,
        text: `🎬 Video: ${videoData.fileName}`,
        time: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        isFile: true,
        video_data: {
          fileId: fileId,
          fileName: videoData.fileName,
          fileType: videoData.fileType,
          fileSize: formattedFileSize,
          fileUrl: fileUrl,
          preview: base64Preview
        }
      });
    }
    
    const videoDataWs = {
      fileId: fileId,
      fileName: videoData.fileName,
      fileType: videoData.fileType,
      fileSize: formattedFileSize,
      fileUrl: fileUrl,
      preview: base64Preview,
      sender: sender,
      time: new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      isVideo: true
    };
    
    if (type === 'private') {
      videoDataWs.receiver = receiver;
      videoDataWs.type = 'private';
      
      const receiverData = onlineUsers.get(receiver);
      if (receiverData) {
        io.to(receiverData.socketId).emit("video_upload", videoDataWs);
      }
      
      const senderData = onlineUsers.get(sender);
      if (senderData) {
        io.to(senderData.socketId).emit("video_upload", videoDataWs);
      }
    } else {
      videoDataWs.room_id = roomId;
      videoDataWs.type = 'group';
      
      io.to(roomId).emit("video_upload", videoDataWs);
    }
    
    videoChunks.delete(videoId);
    
    console.log(`✅ Video uploaded successfully: ${videoData.fileName}`);
    
    res.json({
      success: true,
      fileUrl: fileUrl,
      fileName: videoData.fileName,
      fileSize: formattedFileSize,
      fileType: videoData.fileType,
      fileId: fileId,
      preview: base64Preview,
      message: "Video uploaded successfully"
    });
    
  } catch (error) {
    console.error("❌ Error combining video chunks:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== FILE UPLOAD ENDPOINT =====

app.post("/upload-file", upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }
    
    const { roomId, sender, type, receiver } = req.body;
    const sessionId = req.headers["x-session-id"];
    
    console.log("📁 File upload request:", {
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      sender: sender,
      type: type,
      roomId: roomId || 'private'
    });
    
    if (!sender || !type) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    
    let session;
    if (sessionId) {
      session = await dbHelpers.getSession(sessionId) || userSessions.get(sessionId);
    }
    
    if (!session || session.username !== sender) {
      return res.status(400).json({ success: false, error: "Invalid session" });
    }
    
    if (req.file.mimetype.startsWith('video/')) {
      return res.status(400).json({
        success: false,
        error: "Please use video upload for videos (supports up to 100MB)"
      });
    }
    
    const fileBuffer = req.file.buffer;
    const base64File = `data:${req.file.mimetype};base64,${fileBuffer.toString('base64')}`;
    
    function formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    let savedFile = null;
    if (type === 'private') {
      savedFile = await dbHelpers.savePrivateMessage({
        sender: sender,
        receiver: receiver,
        text: `📁 File: ${req.file.originalname}`,
        time: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        isFile: true,
        file_data: {
          fileId: fileId,
          fileName: req.file.originalname,
          fileType: req.file.mimetype,
          fileSize: formatFileSize(req.file.size),
          fileUrl: base64File
        }
      });
    } else {
      savedFile = await dbHelpers.saveMessage({
        room_id: roomId,
        sender: sender,
        text: `📁 File: ${req.file.originalname}`,
        time: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        isFile: true,
        file_data: {
          fileId: fileId,
          fileName: req.file.originalname,
          fileType: req.file.mimetype,
          fileSize: formatFileSize(req.file.size),
          fileUrl: base64File
        }
      });
    }
    
    const fileData = {
      fileId: fileId,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: formatFileSize(req.file.size),
      fileUrl: base64File,
      sender: sender,
      time: new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      isFile: true
    };
    
    if (type === 'private') {
      fileData.receiver = receiver;
      fileData.type = 'private';
      
      const receiverData = onlineUsers.get(receiver);
      if (receiverData) {
        io.to(receiverData.socketId).emit("file_upload", fileData);
      }
      
      const senderData = onlineUsers.get(sender);
      if (senderData) {
        io.to(senderData.socketId).emit("file_upload", fileData);
      }
    } else {
      fileData.room_id = roomId;
      fileData.type = 'group';
      
      io.to(roomId).emit("file_upload", fileData);
    }
    
    console.log(`✅ File uploaded successfully: ${req.file.originalname}`);
    
    res.json({
      success: true,
      fileUrl: base64File,
      fileName: req.file.originalname,
      fileSize: formatFileSize(req.file.size),
      fileType: req.file.mimetype,
      fileId: fileId,
      message: "File uploaded successfully"
    });
    
  } catch (error) {
    console.error("❌ Error uploading file:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to upload file"
    });
  }
});

// ===== PROFILE ENDPOINTS =====

app.get("/get-profile-picture/:username", async (req, res) => {
  try {
    const { username } = req.params;
    
    const user = await dbHelpers.findUserByUsername(username);
    
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    
    res.json({
      success: true,
      profile_picture: user.profile_picture || null
    });
    
  } catch (error) {
    console.error("Error getting profile picture:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.get("/offline-notifications/:username", validateSession, async (req, res) => {
  try {
    const { username } = req.params;
    
    const unreads = await dbHelpers.getUnreadMessages(username);
    const pendingRequests = await dbHelpers.getPendingRequests(username);
    
    const notifications = [];
    
    const privateUnreads = unreads.filter(u => u.type === 'private');
    for (const unread of privateUnreads) {
      notifications.push({
        id: `unread_${unread._id}`,
        type: 'offline_private_message',
        sender: unread.sender,
        message: unread.last_message || "New message",
        timestamp: unread.last_message_time,
        count: unread.count,
        action: {
          type: 'private_message',
          sender: unread.sender
        }
      });
    }
    
    const groupUnreads = unreads.filter(u => u.type === 'group');
    for (const unread of groupUnreads) {
      const room = await dbHelpers.getRoomById(unread.room_id);
      notifications.push({
        id: `unread_${unread._id}`,
        type: 'offline_group_message',
        sender: unread.sender,
        roomId: unread.room_id,
        roomName: room ? room.name : 'Unknown Room',
        message: unread.last_message || "New message",
        timestamp: unread.last_message_time,
        count: unread.count,
        action: {
          type: 'room_message',
          roomId: unread.room_id,
          sender: unread.sender
        }
      });
    }
    
    for (const request of pendingRequests) {
      notifications.push({
        id: `request_${request._id}`,
        type: 'offline_friend_request',
        sender: request.friend_username,
        timestamp: request.created_at,
        action: {
          type: 'friend_request',
          from: request.friend_username
        }
      });
    }
    
    notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const totalUnread = unreads.reduce((sum, u) => sum + u.count, 0);
    
    res.json({
      success: true,
      notifications: notifications,
      total: notifications.length,
      unread_count: totalUnread,
      summary: await dbHelpers.getUnreadSummary(username)
    });
    
  } catch (error) {
    console.error("Error getting offline notifications:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.post("/mark-as-read", validateSession, async (req, res) => {
  try {
    const { username, sender, type, room_id } = req.body;
    
    if (!username) {
      return res.status(400).json({ success: false, error: "Username required" });
    }
    
    const success = await dbHelpers.markAsRead(username, sender, type, room_id);
    
    res.json({
      success: success,
      message: "Marked as read"
    });
    
  } catch (error) {
    console.error("Error marking as read:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.get("/unread-summary/:username", validateSession, async (req, res) => {
  try {
    const { username } = req.params;
    
    const summary = await dbHelpers.getUnreadSummary(username);
    
    res.json({
      success: true,
      summary: summary
    });
    
  } catch (error) {
    console.error("Error getting unread summary:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.get("/user-profile/:username", validateSession, async (req, res) => {
  try {
    const { username } = req.params;
    
    const user = await dbHelpers.findUserByUsername(username);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    
    const friends = await dbHelpers.getFriends(username);
    const rooms = await dbHelpers.getUserRooms(username);
    const messages = await dbHelpers.getUserStats(username);
    
    const profile = {
      username: user.username,
      email: user.email,
      status: user.status,
      created_at: user.created_at,
      profile_picture: user.profile_picture || null
    };
    
    const stats = {
      friends: friends.length,
      rooms: rooms.length,
      messages: messages || 0
    };
    
    res.json({
      success: true,
      profile: profile,
      stats: stats
    });
    
  } catch (error) {
    console.error("Error getting user profile:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.get("/user-info/:targetUsername", async (req, res) => {
  try {
    const { targetUsername } = req.params;
    const sessionId = req.headers["x-session-id"];
    
    console.log("🔍 User info request for:", targetUsername);
    
    if (!sessionId) {
      return res.status(401).json({ success: false, error: "Session required" });
    }
    
    const session = await dbHelpers.getSession(sessionId) || userSessions.get(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: "Invalid session" });
    }
    
    const requestingUser = await dbHelpers.findUserByUsername(session.username);
    if (!requestingUser) {
      return res.status(401).json({ success: false, error: "Requesting user not found" });
    }
    
    const targetUser = await dbHelpers.findUserByUsername(targetUsername);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    
    const userInfo = {
      username: targetUser.username,
      status: targetUser.status || "Offline",
      created_at: targetUser.created_at,
      profile_picture: targetUser.profile_picture || null
    };
    
    console.log("✅ User info retrieved for:", targetUsername);
    
    res.json({
      success: true,
      user: userInfo
    });
    
  } catch (error) {
    console.error("❌ Error getting user info:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.get("/check-friendship/:username/:friendUsername", async (req, res) => {
  try {
    const { username, friendUsername } = req.params;
    const sessionId = req.headers["x-session-id"];
    
    console.log("🔍 Checking friendship between:", username, "and", friendUsername);
    
    if (!sessionId) {
      return res.status(401).json({ success: false, error: "Session required" });
    }
    
    const session = await dbHelpers.getSession(sessionId) || userSessions.get(sessionId);
    if (!session || session.username !== username) {
      return res.status(401).json({ success: false, error: "Invalid session" });
    }
    
    if (!username || !friendUsername) {
      return res.status(400).json({ success: false, error: "Both usernames required" });
    }
    
    const areFriends = await dbHelpers.areFriends(username, friendUsername);
    const hasPendingRequest = await dbHelpers.hasPendingRequest(username, friendUsername);
    
    console.log("✅ Friendship check result:", { areFriends, hasPendingRequest });
    
    res.json({
      success: true,
      areFriends: areFriends,
      hasPendingRequest: hasPendingRequest
    });
    
  } catch (error) {
    console.error("❌ Error checking friendship:", error);
    res.status(500).json({
      success: false,
      error: getErrorMessage(error)
    });
  }
});

app.post("/update-profile", validateSession, async (req, res) => {
  try {
    const { username, updates } = req.body;
    
    if (updates.username) {
      const existingUser = await dbHelpers.findUserByUsername(updates.username);
      if (existingUser && existingUser.username !== username) {
        return res.status(400).json({ success: false, error: "Username already taken" });
      }
    }
    
    if (updates.email) {
      const existingEmail = await dbHelpers.findUserByEmail(updates.email);
      if (existingEmail && existingEmail.username !== username) {
        return res.status(400).json({ success: false, error: "Email already registered" });
      }
    }
    
    const updated = await dbHelpers.updateUser(username, updates);
    
    if (updated) {
      res.json({
        success: true,
        message: "Profile updated successfully",
        user: {
          username: updates.username || username,
          email: updates.email
        }
      });
    } else {
      res.status(500).json({ success: false, error: "Failed to update profile" });
    }
    
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.post("/change-password", validateSession, async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;
    
    const user = await dbHelpers.findUserByUsername(username);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    
    if (user.password !== currentPassword) {
      return res.status(401).json({ success: false, error: "Current password is incorrect" });
    }
    
    const updated = await dbHelpers.updateUserPassword(username, newPassword);
    
    if (updated) {
      res.json({
        success: true,
        message: "Password changed successfully"
      });
    } else {
      res.status(500).json({ success: false, error: "Failed to change password" });
    }
    
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.post("/upload-profile-picture", validateSession, upload.single('profile_picture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }
    
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ success: false, error: "Username required" });
    }
    
    console.log("📸 Processing uploaded image for user:", username, "File size:", req.file.size, "bytes");
    
    const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    
    await dbHelpers.updateUser(username, { profile_picture: base64Image });
    
    console.log("✅ Profile picture saved as Base64 for user:", username);
    
    res.json({
      success: true,
      profile_picture: base64Image,
      message: "Profile picture updated successfully"
    });
    
  } catch (error) {
    console.error("❌ Error uploading profile picture:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to upload profile picture"
    });
  }
});

app.post("/register", upload.single('avatar'), async (req, res) => {
  try {
    const { email, username, password } = req.body;
    
    console.log("🔍 Registration attempt:", { email, username });
    
    if (!email || !username || !password) {
      return res.status(400).json({ success: false, error: "All fields are required" });
    }
    
    if (password.length < 3) {
      return res.status(400).json({ success: false, error: "Password must be at least 3 characters" });
    }
    
    let existingEmail, existingUsername;
    try {
      existingEmail = await dbHelpers.findUserByEmail(email);
      existingUsername = await dbHelpers.findUserByUsername(username);
    } catch (dbError) {
      console.error("❌ Database error during user check:", dbError);
      return res.status(500).json({
        success: false,
        error: "Database error during registration",
      });
    }
    
    if (existingEmail) {
      return res.status(400).json({ success: false, error: "Email already registered" });
    }
    
    if (existingUsername) {
      return res.status(400).json({ success: false, error: "Username already taken" });
    }
    
    try {
      let profilePicture = null;
      
      if (req.file) {
        console.log("📸 Processing avatar for registration:", req.file.filename);
        
        profilePicture = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        console.log("✅ Avatar converted to Base64, length:", profilePicture.length);
      }
      
      await dbHelpers.createUser(email, username, password, profilePicture);
      console.log("✅ User created successfully:", username);
      
      res.json({
        success: true,
        message: "Account created successfully! You can now login.",
        profile_picture: profilePicture
      });
    } catch (createError) {
      console.error("❌ Error creating user in database:", createError);
      return res.status(500).json({
        success: false,
        error: "Failed to create user account. Please try again.",
      });
    }
  } catch (error) {
    console.error("❌ Unexpected error during registration:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during registration",
    });
  }
});

// ===== AUTHENTICATION ENDPOINTS =====

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log("🔍 Login attempt for email:", email);
    
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password required" });
    }
    
    let user;
    try {
      user = await dbHelpers.findUserByEmail(email);
      console.log("📊 User lookup result:", user ? "User found" : "User not found");
    } catch (dbError) {
      console.error("❌ Database error during login:", dbError);
      return res.status(500).json({
        success: false,
        error: "Database error during login",
      });
    }
    
    if (!user) {
      console.log("❌ User not found for email:", email);
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }
    
    if (user.password !== password) {
      console.log("❌ Invalid password for user:", user.username);
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }
    
    const sessionId = "session_" + Date.now() + "_" + Math.random().toString(36).substring(2, 15);
    const sessionData = {
      username: user.username,
      createdAt: Date.now(),
    };
    
    await dbHelpers.saveSession(sessionId, sessionData);
    userSessions.set(sessionId, sessionData);
    
    try {
      await dbHelpers.saveUser({ username: user.username, status: "Online" });
      console.log("✅ Login successful for user:", user.username);
    } catch (statusError) {
      console.error("⚠️ Could not update user status:", statusError);
    }
    
    res.json({
      success: true,
      user: {
        email: user.email,
        username: user.username,
        profile_picture: user.profile_picture
      },
      sessionId: sessionId,
    });
  } catch (error) {
    console.error("❌ Unexpected error during login:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during login",
    });
  }
});

app.get("/verify-session/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const sessionId = req.headers["x-session-id"];
    
    console.log("🔍 Verifying session for:", username, "session:", sessionId);
    
    if (!sessionId) {
      return res.status(401).json({ success: false, error: "Session ID required" });
    }
    
    const session = await dbHelpers.getSession(sessionId) || userSessions.get(sessionId);
    const user = await dbHelpers.findUserByUsername(username);
    
    if (session && session.username === username && user) {
      console.log("✅ Session verified:", username);
      res.json({
        success: true,
        user: {
          username: user.username,
          email: user.email,
          profile_picture: user.profile_picture
        },
      });
    } else {
      console.log("❌ Invalid session for:", username);
      await dbHelpers.deleteSession(sessionId);
      userSessions.delete(sessionId);
      res.status(401).json({ success: false, error: "Invalid session" });
    }
  } catch (error) {
    console.error("❌ Error verifying session:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.post("/logout", async (req, res) => {
  try {
    const { username } = req.body;
    const sessionId = req.headers["x-session-id"];
    
    if (sessionId) {
      await dbHelpers.deleteSession(sessionId);
      userSessions.delete(sessionId);
    }
    
    if (username) {
      await dbHelpers.saveUser({ username: username, status: "Offline" });
    }
    
    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("❌ Error during logout:", error);
    res.json({ success: true });
  }
});

// ===== ROOM ENDPOINTS =====

app.post("/leave-room", validateSession, async (req, res) => {
  try {
    const { roomId, username } = req.body;
    
    if (!roomId || !username) {
      return res.status(400).json({ success: false, error: "Room ID and username required" });
    }
    
    const isMember = await dbHelpers.isUserInRoom(roomId, username);
    if (!isMember) {
      return res.status(400).json({ success: false, error: "You are not a member of this room" });
    }
    
    await dbHelpers.removeUserFromRoom(roomId, username);
    
    console.log(`✅ ${username} left room ${roomId}`);
    
    const roomMembers = await dbHelpers.getRoomMembers(roomId);
    
    io.to(roomId).emit("room members", roomMembers);
    io.to(roomId).emit("user_left", { username, roomId });
    
    res.json({
      success: true,
      message: "Left room successfully",
    });
  } catch (error) {
    console.error("❌ Error leaving room:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.post("/create-room", validateSession, async (req, res) => {
  try {
    const { name, username } = req.body;
    
    if (!name || !username) {
      return res.status(400).json({ success: false, error: "Name and username required" });
    }
    
    const { roomId, inviteCode } = await dbHelpers.createRoom(name, username);
    await dbHelpers.addUserToRoom(roomId, username);
    
    res.json({
      success: true,
      roomId,
      inviteCode,
      message: "Room created successfully",
    });
  } catch (error) {
    console.error("❌ Error creating room:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.post("/join-room", validateSession, async (req, res) => {
  try {
    const { inviteCode, username } = req.body;
    
    if (!inviteCode || !username) {
      return res.status(400).json({ success: false, error: "Invite code and username required" });
    }
    
    const room = await dbHelpers.getRoomByInviteCode(inviteCode);
    if (!room) {
      return res.status(200).json({
        success: false,
        error: "Invalid invite code"
      });
    }
    
    await dbHelpers.addUserToRoom(room.id, username);
    
    res.json({
      success: true,
      roomId: room.id,
      roomName: room.name,
      message: "Joined room successfully",
    });
  } catch (error) {
    console.error("❌ Error joining room:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.get("/user-rooms/:username", validateSession, async (req, res) => {
  try {
    const { username } = req.params;
    const rooms = await dbHelpers.getUserRooms(username);
    res.json({ success: true, rooms });
  } catch (error) {
    console.error("❌ Error getting user rooms:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.post("/clear-room-messages", validateSession, async (req, res) => {
  try {
    const { roomId, username, isPrivate, friendUsername } = req.body;
    
    if (!username) {
      return res.status(400).json({ success: false, error: "Username required" });
    }
    
    console.log(`🗑️ Clear messages request:`, { roomId, username, isPrivate, friendUsername });
    
    if (isPrivate) {
      if (!friendUsername) {
        return res.status(400).json({ success: false, error: "Friend username required for private chat" });
      }
      
      const result = await dbHelpers.getPrivateMessageModel().deleteMany({
        $or: [
          { sender: username, receiver: friendUsername },
          { sender: friendUsername, receiver: username }
        ]
      });
      
      console.log(`✅ Deleted ${result.deletedCount} private messages between ${username} and ${friendUsername}`);
      
      io.emit("messages_cleared", {
        type: 'private',
        user1: username,
        user2: friendUsername
      });
      
      res.json({
        success: true,
        deletedCount: result.deletedCount,
        message: "Private messages cleared successfully"
      });
      
    } else {
      if (!roomId) {
        return res.status(400).json({ success: false, error: "Room ID required" });
      }
      
      const isMember = await dbHelpers.isUserInRoom(roomId, username);
      if (!isMember) {
        return res.status(403).json({ success: false, error: "You are not a member of this room" });
      }
      
      const result = await dbHelpers.getMessageModel().deleteMany({ room_id: roomId });
      
      console.log(`✅ Deleted ${result.deletedCount} messages from room ${roomId}`);
      
      io.to(roomId).emit("messages_cleared", {
        type: 'group',
        roomId: roomId
      });
      
      res.json({
        success: true,
        deletedCount: result.deletedCount,
        message: "Room messages cleared successfully"
      });
    }
    
  } catch (error) {
    console.error("❌ Error clearing messages:", error);
    res.status(500).json({
      success: false,
      error: "Failed to clear messages"
    });
  }
});

// ===== FRIEND ENDPOINTS =====

app.post("/send-friend-request", validateSession, async (req, res) => {
  try {
    const { fromUser, toUser } = req.body;
    
    if (!fromUser || !toUser) {
      return res.status(400).json({ success: false, error: "Both usernames required" });
    }
    
    if (fromUser === toUser) {
      return res.status(400).json({ success: false, error: "Cannot add yourself as friend" });
    }
    
    const targetUser = await dbHelpers.findUserByUsername(toUser);
    if (!targetUser) {
      return res.status(200).json({ success: false, error: "User not found" });
    }
    
    const areAlreadyFriends = await dbHelpers.areFriends(fromUser, toUser);
    if (areAlreadyFriends) {
      return res.status(200).json({ success: false, error: "Already friends" });
    }
    
    const hasPendingRequest = await dbHelpers.hasPendingRequest(fromUser, toUser);
    if (hasPendingRequest) {
      return res.status(200).json({ success: false, error: "Friend request already sent" });
    }
    
    await dbHelpers.sendFriendRequest(fromUser, toUser);
    
    const targetSocket = onlineUsers.get(toUser);
    if (targetSocket) {
      io.to(targetSocket.socketId).emit("friend_request", { from: fromUser });
    }
    
    res.json({
      success: true,
      message: `Friend request sent to ${toUser}!`,
    });
  } catch (error) {
    console.error("❌ Error sending friend request:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.post("/respond-friend-request", validateSession, async (req, res) => {
  try {
    const { username, friendUsername, accept } = req.body;
    
    if (!username || !friendUsername) {
      return res.status(400).json({ success: false, error: "Both usernames required" });
    }
    
    await dbHelpers.respondToFriendRequest(username, friendUsername, accept);
    
    const senderSocket = onlineUsers.get(friendUsername);
    if (senderSocket && accept) {
      io.to(senderSocket.socketId).emit("friend_request_accepted", { by: username });
    }
    
    res.json({
      success: true,
      message: accept ? `You are now friends with ${friendUsername}!` : "Friend request declined",
    });
  } catch (error) {
    console.error("❌ Error responding to friend request:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.get("/pending-requests/:username", validateSession, async (req, res) => {
  try {
    const { username } = req.params;
    const requests = await dbHelpers.getPendingRequests(username);
    res.json({ success: true, requests });
  } catch (error) {
    console.error("❌ Error getting pending requests:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.get("/friends/:username", validateSession, async (req, res) => {
  try {
    const { username } = req.params;
    const friends = await dbHelpers.getFriends(username);
    res.json({ success: true, friends });
  } catch (error) {
    console.error("❌ Error getting friends:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.post("/remove-friend", validateSession, async (req, res) => {
  try {
    const { username, friendUsername } = req.body;
    
    if (!username || !friendUsername) {
      return res.status(400).json({ success: false, error: "Both usernames required" });
    }
    
    await dbHelpers.removeFriend(username, friendUsername);
    
    res.json({
      success: true,
      message: "Friend removed",
    });
  } catch (error) {
    console.error("❌ Error removing friend:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.get("/private-messages/:user1/:user2", validateSession, async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    
    const areFriends = await dbHelpers.areFriends(user1, user2);
    if (!areFriends) {
      return res.status(403).json({ success: false, error: "Not friends" });
    }
    
    const messages = await dbHelpers.getPrivateMessages(user1, user2);
    res.json({ success: true, messages });
  } catch (error) {
    console.error("❌ Error getting private messages:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

// ===== ERROR HANDLERS =====

// Global error handler
app.use((err, req, res, next) => {
  console.error('🔥 Global error handler:', err.message);
  console.error('🔥 Error stack:', err.stack);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large',
        message: 'Maximum file size is 100MB'
      });
    }
    
    return res.status(400).json({
      success: false,
      error: 'File upload error',
      message: err.message
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler για API endpoints
app.use((req, res, next) => {
  const isApiRequest = req.path.startsWith('/upload') ||
    req.path.startsWith('/api') ||
    req.accepts('json') === 'json';
  
  if (isApiRequest) {
    console.log(`❌ API endpoint not found: ${req.method} ${req.path}`);
    
    return res.status(404).json({
      success: false,
      error: "API endpoint not found",
      path: req.path
    });
  }
  
  next();
});

// ===== SOCKET.IO =====

io.on("connection", async (socket) => {
  console.log("🔗 User connected:", socket.id);
  
  let currentUsername = null;
  let currentRoomId = null;
  let currentSessionId = null;
  
  socket.on("authenticate", async (data) => {
    try {
      const { username, sessionId } = data;
      
      const session = await dbHelpers.getSession(sessionId) || userSessions.get(sessionId);
      if (!session || session.username !== username) {
        socket.emit("session_expired");
        return;
      }
      
      currentUsername = username;
      currentSessionId = sessionId;
      onlineUsers.set(username, {
        socketId: socket.id,
        currentRoom: null,
        sessionId: sessionId,
      });
      
      await dbHelpers.saveUser({ username, status: "Online" });
      console.log("✅ User authenticated:", username);
      
      const unreadSummary = await dbHelpers.getUnreadSummary(username);
      socket.emit("unread_summary", unreadSummary);
      
    } catch (error) {
      console.error("❌ Error during authentication:", error);
      socket.emit("session_expired");
    }
  });
  
  socket.on("join room", async (data) => {
    try {
      const { roomId, username, sessionId } = data;
      console.log("🚀 Attempting to join room:", { roomId, username });
      
      const session = await dbHelpers.getSession(sessionId) || userSessions.get(sessionId);
      if (!session || session.username !== username) {
        socket.emit("session_expired");
        return;
      }
      
      const room = await dbHelpers.getRoomById(roomId);
      if (!room) {
        console.log("❌ Room not found:", roomId);
        socket.emit("error", { message: "Room not found" });
        return;
      }
      
      const isMember = await dbHelpers.isUserInRoom(roomId, username);
      if (!isMember) {
        console.log("❌ User not member of room:", { username, roomId });
        socket.emit("error", { message: "You are not a member of this room" });
        return;
      }
      
      if (currentRoomId) {
        socket.leave(currentRoomId);
        const roomSocketSet = roomSockets.get(currentRoomId);
        if (roomSocketSet) {
          roomSocketSet.delete(socket.id);
        }
      }
      
      socket.join(roomId);
      currentRoomId = roomId;
      currentUsername = username;
      currentSessionId = sessionId;
      
      if (!roomSockets.has(roomId)) {
        roomSockets.set(roomId, new Set());
      }
      roomSockets.get(roomId).add(socket.id);
      
      if (onlineUsers.has(username)) {
        onlineUsers.get(username).currentRoom = roomId;
      }
      
      const members = await dbHelpers.getRoomMembers(roomId);
      const userJoinedAt = members.find((m) => m.username === username)?.joined_at;
      const messages = await dbHelpers.getRoomMessages(roomId, userJoinedAt);
      
      await dbHelpers.markAsRead(username, null, 'group', roomId);
      socket.emit("unread_cleared", { type: 'group', roomId: roomId });
      
      socket.emit("load messages", messages);
      socket.emit("room members", members);
      socket.emit("room info", room);
      
      socket.to(roomId).emit("room members", members);
      
      console.log(`✅ ${username} successfully joined room: ${room.name} (${roomId})`);
      
    } catch (error) {
      console.error("❌ Error joining room:", error);
      socket.emit("error", { message: "Failed to join room: " + error.message });
    }
  });
  
  socket.on("leave_room", async (data) => {
    try {
      const { roomId, username } = data;
      
      if (!roomId || !username) {
        console.log("❌ Invalid leave room request");
        return;
      }
      
      console.log(`🚪 User ${username} leaving room ${roomId}`);
      
      await dbHelpers.removeUserFromRoom(roomId, username);
      
      socket.emit("leave_room_success", { roomId });
      
      const members = await dbHelpers.getRoomMembers(roomId);
      socket.to(roomId).emit("room members", members);
      socket.to(roomId).emit("user_left", { username, roomId });
      
      console.log(`✅ ${username} left room ${roomId}`);
      
    } catch (error) {
      console.error("❌ Error in leave_room event:", error);
    }
  });
  
  socket.on("chat message", async (data) => {
    try {
      if (!currentRoomId || !currentUsername || !currentSessionId) {
        socket.emit("session_expired");
        return;
      }
      
      const session = await dbHelpers.getSession(currentSessionId) || userSessions.get(currentSessionId);
      if (!session || session.username !== currentUsername) {
        socket.emit("session_expired");
        return;
      }
      
      const messageData = {
        ...data,
        room_id: currentRoomId,
        sender: currentUsername,
      };
      
      await dbHelpers.saveMessage(messageData);
      io.to(currentRoomId).emit("chat message", messageData);
      
      console.log(`💬 Message in ${currentRoomId} from ${currentUsername}`);
      
      if (data.isFile) {
        console.log(`📁 File sent in ${currentRoomId}: ${data.fileName || 'Unknown file'}`);
      }
      
      const roomMembers = await dbHelpers.getRoomMembers(currentRoomId);
      const messageId = `gm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      for (const member of roomMembers) {
        if (member.username !== currentUsername) {
          await dbHelpers.addUnreadMessage(
            member.username,
            currentUsername,
            'group',
            currentRoomId,
            {
              text: data.text || (data.isFile ? `📁 File: ${data.fileName}` : "New message"),
              message_id: messageId
            }
          );
          
          const memberData = onlineUsers.get(member.username);
          if (memberData) {
            if (memberData.currentRoom !== currentRoomId) {
              io.to(memberData.socketId).emit("notification", {
                type: data.isFile ? "file_upload" : "group_message",
                sender: currentUsername,
                roomId: currentRoomId,
                roomName: (await dbHelpers.getRoomById(currentRoomId))?.name || "Room",
                message: data.isFile ?
                  `📁 Sent a file: ${data.fileName}` :
                  (data.text.substring(0, 50) + (data.text.length > 50 ? "..." : "")),
                timestamp: Date.now(),
                action: {
                  type: 'room_message',
                  roomId: currentRoomId,
                  sender: currentUsername
                }
              });
            }
            
            io.to(memberData.socketId).emit("unread_update", {
              type: 'group',
              roomId: currentRoomId,
              sender: currentUsername,
              count: await dbHelpers.getUnreadCountForUser(member.username, currentUsername, 'group', currentRoomId)
            });
          }
        }
      }
      
    } catch (error) {
      console.error("❌ Error saving message:", getErrorMessage(error));
    }
  });
  
  socket.on("private message", async (data) => {
    try {
      const { sender, receiver, text, time } = data;
      
      if (!currentSessionId) {
        socket.emit("session_expired");
        return;
      }
      
      const session = await dbHelpers.getSession(currentSessionId) || userSessions.get(currentSessionId);
      if (!session || session.username !== sender) {
        socket.emit("session_expired");
        return;
      }
      
      const areFriends = await dbHelpers.areFriends(sender, receiver);
      if (!areFriends) {
        socket.emit("error", { message: "You can only message friends" });
        return;
      }
      
      await dbHelpers.savePrivateMessage({ sender, receiver, text, time });
      
      const messageId = `pm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await dbHelpers.addUnreadMessage(receiver, sender, 'private', null, {
        text,
        message_id: messageId
      });
      
      const receiverData = onlineUsers.get(receiver);
      if (receiverData) {
        io.to(receiverData.socketId).emit("private message", data);
        
        io.to(receiverData.socketId).emit("notification", {
          type: "private_message",
          sender: sender,
          message: text.substring(0, 50) + (text.length > 50 ? "..." : ""),
          timestamp: Date.now(),
          action: {
            type: 'private_message',
            sender: sender
          }
        });
        
        io.to(receiverData.socketId).emit("unread_update", {
          type: 'private',
          sender: sender,
          count: await dbHelpers.getUnreadCountForUser(receiver, sender, 'private')
        });
      }
      
      socket.emit("private message", data);
      console.log("🔒 Private message from:", sender, "to:", receiver);
      
    } catch (error) {
      console.error("❌ Error saving private message:", getErrorMessage(error));
    }
  });
  
  socket.on("file_upload", async (data) => {
    try {
      if (!currentSessionId) {
        socket.emit("session_expired");
        return;
      }
      
      const session = await dbHelpers.getSession(currentSessionId) || userSessions.get(sessionId);
      if (!session || session.username !== data.sender) {
        socket.emit("session_expired");
        return;
      }
      
      console.log("📁 File upload via WebSocket:", data);
      
      if (data.type === 'private') {
        const receiverData = onlineUsers.get(data.receiver);
        if (receiverData) {
          io.to(receiverData.socketId).emit("file_upload", data);
        }
      } else {
        io.to(data.room_id).emit("file_upload", data);
      }
    } catch (error) {
      console.error("❌ Error handling file upload:", error);
    }
  });
  
  socket.on("video_upload_chunk", async (data) => {
    try {
      console.log("📦 WebSocket video chunk:", data.chunkIndex);
    } catch (error) {
      console.error("❌ WebSocket video upload error:", error);
    }
  });
  
  socket.on("mark_as_read", async (data) => {
    try {
      const { type, sender, roomId } = data;
      
      if (!currentUsername) return;
      
      await dbHelpers.markAsRead(currentUsername, sender, type, roomId);
      
      socket.emit("unread_cleared", { type, sender, roomId });
      
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  });
  
  socket.on("get_unread_summary", async () => {
    try {
      if (!currentUsername) return;
      
      const summary = await dbHelpers.getUnreadSummary(currentUsername);
      socket.emit("unread_summary", summary);
      
    } catch (error) {
      console.error("Error getting unread summary:", error);
    }
  });
  
  socket.on("get room info", async (data) => {
    try {
      const { roomId } = data;
      const room = await dbHelpers.getRoomById(roomId);
      socket.emit("room info", room);
    } catch (error) {
      console.error("❌ Error getting room info:", error);
    }
  });
  
  socket.on("get room members", async (data) => {
    try {
      const { roomId } = data;
      const members = await dbHelpers.getRoomMembers(roomId);
      socket.emit("room members", members);
    } catch (error) {
      console.error("❌ Error getting room members:", error);
    }
  });
  
  socket.on("disconnect", async () => {
    console.log("🔌 User disconnected:", socket.id);
    
    if (currentUsername && currentRoomId) {
      console.log(`📡 ${currentUsername} disconnected from room ${currentRoomId} (still a member)`);
      
      try {
        const members = await dbHelpers.getRoomMembers(currentRoomId);
        io.to(currentRoomId).emit("room members", members);
        io.to(currentRoomId).emit("user_disconnected", {
          username: currentUsername,
          roomId: currentRoomId
        });
      } catch (error) {
        console.error("❌ Error updating disconnect status:", error);
      }
    }
    
    if (currentUsername) {
      onlineUsers.delete(currentUsername);
      
      try {
        await dbHelpers.saveUser({ username: currentUsername, status: "Offline" });
      } catch (error) {
        console.error("❌ Error updating user status:", error);
      }
      
      console.log("💤 User left:", currentUsername);
    }
    
    if (currentRoomId) {
      const roomSocketSet = roomSockets.get(currentRoomId);
      if (roomSocketSet) {
        roomSocketSet.delete(socket.id);
        if (roomSocketSet.size === 0) {
          roomSockets.delete(currentRoomId);
        }
      }
    }
  });
});

// ===== CLEANUP FUNCTIONS =====

setInterval(async () => {
  try {
    await dbHelpers.cleanupExpiredSessions();
    console.log("🧹 Cleaned expired sessions from database");
    
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (const [sessionId, session] of userSessions.entries()) {
      if (now - session.createdAt > oneWeek) {
        userSessions.delete(sessionId);
      }
    }
  } catch (error) {
    console.error("Error cleaning expired sessions:", error);
  }
}, 60 * 60 * 1000);

setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  const videoIds = Array.from(videoChunks.keys());
  
  videoIds.forEach(videoId => {
    const videoData = videoChunks.get(videoId);
    if (videoData && videoData.createdAt < oneHourAgo) {
      videoChunks.delete(videoId);
      console.log(`🧹 Cleaned up old video chunks: ${videoId}`);
    }
  });
}, 30 * 60 * 1000);

setInterval(async () => {
  try {
    const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
    if (fs.existsSync(VIDEO_UPLOAD_DIR)) {
      const files = fs.readdirSync(VIDEO_UPLOAD_DIR);
      
      files.forEach(file => {
        const filePath = path.join(VIDEO_UPLOAD_DIR, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < sevenDaysAgo) {
          fs.unlinkSync(filePath);
          console.log(`🧹 Cleaned up old video file: ${file}`);
        }
      });
    }
  } catch (error) {
    console.error("Error cleaning up video files:", error);
  }
}, 24 * 60 * 60 * 1000);

// ===== START SERVER =====

async function startServer() {
  try {
    await initializeDatabase();
    
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 RatScape Server running on port ${PORT}`);
      console.log(`📱 Available at: http://localhost:${PORT}`);
      console.log(`🔗 Test endpoints:`);
      console.log(`   GET  /ping - Server status`);
      console.log(`   POST /simple-test - Test upload`);
      console.log(`📦 Max file size: 100MB`);
      console.log(`🔍 Debugging: ENABLED`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
