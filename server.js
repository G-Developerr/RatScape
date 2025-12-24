// server.js - COMPLETE FIXED VERSION WITH WORKING CHUNKED VIDEO UPLOAD
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

// 🔥 ΚΡΙΤΙΚΗ ΑΛΛΑΓΗ: Μειώστε τα limits για Render compatibility
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// FIXED: WebSocket config for Render
const io = new Server(server, {
  cors: {
    origin: ["https://ratscape.onrender.com", "http://localhost:3000", "http://localhost:10000"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors({
  origin: ["https://ratscape.onrender.com", "http://localhost:3000", "http://localhost:10000"],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Session-ID', 'Authorization']
}));

// Χειριστείτε OPTIONS requests για CORS
app.options('*', cors());

// 🔥 ΑΠΛΟΠΟΙΗΣΗ: Χωρίς directories για τώρα - θα χρησιμοποιήσουμε μόνο memory
console.log('ℹ️ Using memory storage for video chunks');

// 🔥 ΚΡΙΤΙΚΗ ΑΛΛΑΓΗ: Απλοποιημένο multer configuration
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { 
      fileSize: 5 * 1024 * 1024, // 5MB ανά chunk - ΑΥΤΟ ΕΙΝΑΙ ΚΡΙΤΙΚΟ
      fields: 10,
      files: 1,
      parts: 15
    }
});

// 🔥 ΚΡΙΤΙΚΗ ΑΛΛΑΓΗ: Προσθήκη error handler για multer
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        console.error('❌ Multer Error:', error.code, error.message);
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'Chunk too large. Maximum size per chunk is 5MB'
            });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                success: false,
                error: 'Unexpected file field'
            });
        }
        return res.status(400).json({
            success: false,
            error: 'File upload error: ' + error.message
        });
    } else if (error) {
        console.error('❌ General Error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
    next();
});

// 🔥 ΑΠΛΟΠΟΙΗΜΕΝΟ: Store video chunks temporarily
const videoChunks = new Map();

// Serve static files correctly for Render
app.use(express.static(path.join(__dirname)));

// 🔥 ΚΡΙΤΙΚΗ ΑΛΛΑΓΗ: Health check endpoint πρώτα
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/test", (req, res) => {
  res.sendFile(path.join(__dirname, "test.html"));
});

app.get("/health", (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    videoChunks: videoChunks.size,
    memory: process.memoryUsage().rss / 1024 / 1024 + 'MB'
  });
});

// 🔥 ΚΡΙΤΙΚΟ ENDPOINT: Upload video chunk - ΑΠΛΟΠΟΙΗΜΕΝΟ
app.post("/upload-video-chunk", upload.single('videoChunk'), async (req, res) => {
    console.log('🎬 Chunk upload started');
    
    try {
        // 1. Βασική validation
        if (!req.file) {
            console.log('❌ No file in request');
            return res.status(400).json({ 
                success: false, 
                error: "No chunk data received" 
            });
        }
        
        // 2. Λήψη δεδομένων
        const sessionId = req.headers["x-session-id"];
        const { sender, chunkIndex, totalChunks, videoId } = req.body;
        
        console.log('📋 Received:', {
            sender: sender,
            chunkIndex: chunkIndex,
            totalChunks: totalChunks,
            videoId: videoId,
            chunkSize: req.file.size
        });
        
        // 3. Session validation (απλοποιημένη)
        if (!sessionId || !sender) {
            return res.status(401).json({ 
                success: false, 
                error: "Authentication required" 
            });
        }
        
        // 4. Αποθήκευση chunk (απλοποιημένη)
        if (!videoChunks.has(videoId)) {
            console.log(`🆕 New video session: ${videoId}`);
            videoChunks.set(videoId, {
                chunks: [],
                metadata: req.body,
                createdAt: Date.now()
            });
        }
        
        const videoData = videoChunks.get(videoId);
        videoData.chunks.push({
            index: parseInt(chunkIndex),
            data: req.file.buffer,
            size: req.file.size
        });
        
        // 5. Απάντηση επιτυχίας
        res.json({
            success: true,
            chunkIndex: chunkIndex,
            totalChunks: totalChunks,
            uploadedChunks: videoData.chunks.length,
            message: `Chunk ${parseInt(chunkIndex) + 1}/${totalChunks} uploaded`
        });
        
        console.log(`✅ Chunk ${parseInt(chunkIndex) + 1}/${totalChunks} saved`);
        
    } catch (error) {
        console.error('❌ Chunk upload error:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            error: "Failed to process chunk: " + error.message
        });
    }
});

// 🔥 ΚΡΙΤΙΚΟ ENDPOINT: Combine video chunks - ΑΠΛΟΠΟΙΗΜΕΝΟ
app.post("/combine-video-chunks", express.json(), async (req, res) => {
    console.log('🎬 Combine request started');
    
    try {
        const { videoId, sender, sessionId } = req.body;
        
        if (!videoId || !videoChunks.has(videoId)) {
            return res.status(400).json({ 
                success: false, 
                error: "Video session not found" 
            });
        }
        
        const videoData = videoChunks.get(videoId);
        const totalChunks = parseInt(videoData.metadata.totalChunks);
        
        // Έλεγχος αν έχουν ανεβεί όλα τα chunks
        if (videoData.chunks.length !== totalChunks) {
            return res.status(400).json({ 
                success: false, 
                error: `Not all chunks uploaded. Have ${videoData.chunks.length}/${totalChunks}` 
            });
        }
        
        // Ταξινόμηση chunks κατά index
        videoData.chunks.sort((a, b) => a.index - b.index);
        
        // Συνδυασμός chunks
        const chunks = videoData.chunks.map(c => c.data);
        const combinedBuffer = Buffer.concat(chunks);
        
        console.log(`✅ Combined ${totalChunks} chunks into ${combinedBuffer.length} bytes`);
        
        // Δημιουργία Base64
        const base64Video = `data:video/mp4;base64,${combinedBuffer.toString('base64')}`;
        
        // Αποθήκευση μηνύματος
        const messageData = {
            sender: sender,
            text: `🎬 Video: ${videoData.metadata.fileName}`,
            time: new Date().toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            }),
            isFile: true,
            file_data: {
                fileId: videoId,
                fileName: videoData.metadata.fileName,
                fileType: videoData.metadata.fileType || 'video/mp4',
                fileSize: (combinedBuffer.length / (1024 * 1024)).toFixed(2) + ' MB',
                fileUrl: base64Video
            },
            video_data: {
                fileId: videoId,
                fileName: videoData.metadata.fileName,
                fileType: videoData.metadata.fileType || 'video/mp4',
                fileSize: (combinedBuffer.length / (1024 * 1024)).toFixed(2) + ' MB',
                fileUrl: base64Video
            }
        };
        
        // Αποθήκευση ανάλογα με τον τύπο
        if (videoData.metadata.type === 'private') {
            await dbHelpers.savePrivateMessage({
                ...messageData,
                receiver: videoData.metadata.receiver
            });
            
            // WebSocket notifications
            const receiverData = onlineUsers.get(videoData.metadata.receiver);
            if (receiverData) {
                io.to(receiverData.socketId).emit("video_upload", {
                    ...messageData.file_data,
                    sender: sender,
                    receiver: videoData.metadata.receiver,
                    time: messageData.time,
                    type: 'private'
                });
            }
        } else {
            await dbHelpers.saveMessage({
                ...messageData,
                room_id: videoData.metadata.roomId
            });
            
            // WebSocket to room
            io.to(videoData.metadata.roomId).emit("video_upload", {
                ...messageData.file_data,
                sender: sender,
                room_id: videoData.metadata.roomId,
                time: messageData.time,
                type: 'group'
            });
        }
        
        // Καθαρισμός
        videoChunks.delete(videoId);
        
        res.json({
            success: true,
            message: "Video uploaded successfully",
            fileUrl: base64Video,
            fileName: videoData.metadata.fileName
        });
        
        console.log(`✅ Video ${videoId} saved successfully`);
        
    } catch (error) {
        console.error('❌ Combine error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: "Failed to combine chunks: " + error.message
        });
    }
});

// Βοηθητική συνάρτηση
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

// Memory sessions
const userSessions = new Map();
const onlineUsers = new Map();
const roomSockets = new Map();

// Session middleware
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

// ===== ΑΡΧΙΚΑ ENDPOINTS (από το πρωτότυπο) =====

// Authentication routes
app.post("/login", express.json(), async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("🔍 Login attempt for email:", email);

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password required" });
    }

    let user = await dbHelpers.findUserByEmail(email);
    
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }

    if (user.password !== password) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }

    const sessionId = "session_" + Date.now() + "_" + Math.random().toString(36).substring(2, 15);
    const sessionData = {
      username: user.username,
      createdAt: Date.now(),
    };

    await dbHelpers.saveSession(sessionId, sessionData);
    userSessions.set(sessionId, sessionData);

    await dbHelpers.saveUser({ username: user.username, status: "Online" });

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
    console.error("❌ Login error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

app.get("/verify-session/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const sessionId = req.headers["x-session-id"];

    if (!sessionId) {
      return res.status(401).json({ success: false, error: "Session ID required" });
    }

    const session = await dbHelpers.getSession(sessionId) || userSessions.get(sessionId);
    const user = await dbHelpers.findUserByUsername(username);

    if (session && session.username === username && user) {
      res.json({
        success: true,
        user: {
          username: user.username,
          email: user.email,
          profile_picture: user.profile_picture
        },
      });
    } else {
      await dbHelpers.deleteSession(sessionId);
      userSessions.delete(sessionId);
      res.status(401).json({ success: false, error: "Invalid session" });
    }
  } catch (error) {
    console.error("❌ Session verification error:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

// Upload profile picture
app.post("/upload-profile-picture", validateSession, upload.single('profile_picture'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: "No file uploaded" });
        }
        
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ success: false, error: "Username required" });
        }
        
        const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        
        await dbHelpers.updateUser(username, { profile_picture: base64Image });
        
        res.json({
            success: true,
            profile_picture: base64Image,
            message: "Profile picture updated successfully"
        });
        
    } catch (error) {
        console.error("❌ Profile picture error:", error);
        res.status(500).json({ 
            success: false, 
            error: error.message || "Failed to upload profile picture" 
        });
    }
});

// Upload file (non-video)
app.post("/upload-file", upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: "No file uploaded" });
        }
        
        const { roomId, sender, type, receiver } = req.body;
        const sessionId = req.headers["x-session-id"];
        
        if (!sender || !type) {
            return res.status(400).json({ success: false, error: "Missing required fields" });
        }
        
        // Αν είναι video, χρησιμοποίησε το chunked
        if (req.file.mimetype.startsWith('video/')) {
            return res.status(400).json({ 
                success: false, 
                error: "Please use video upload for videos" 
            });
        }
        
        const base64File = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        if (type === 'private') {
            await dbHelpers.savePrivateMessage({
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
            await dbHelpers.saveMessage({
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
        console.error("❌ File upload error:", error);
        res.status(500).json({ 
            success: false, 
            error: error.message || "Failed to upload file" 
        });
    }
});

// ===== ΥΠΟΛΟΙΠΑ ENDPOINTS (από το πρωτότυπο) =====

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
    console.error("Profile picture error:", error);
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
            messages: 0
        };
        
        res.json({
            success: true,
            profile: profile,
            stats: stats
        });
        
    } catch (error) {
        console.error("User profile error:", error);
        res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
});

app.post("/logout", express.json(), async (req, res) => {
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
    console.error("❌ Logout error:", error);
    res.json({ success: true });
  }
});

app.post("/create-room", validateSession, express.json(), async (req, res) => {
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
    console.error("❌ Create room error:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.post("/join-room", validateSession, express.json(), async (req, res) => {
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
    console.error("❌ Join room error:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.get("/user-rooms/:username", validateSession, async (req, res) => {
  try {
    const { username } = req.params;
    const rooms = await dbHelpers.getUserRooms(username);
    res.json({ success: true, rooms });
  } catch (error) {
    console.error("❌ User rooms error:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

// Friend routes
app.post("/send-friend-request", validateSession, express.json(), async (req, res) => {
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

    res.json({
      success: true,
      message: `Friend request sent to ${toUser}!`,
    });
  } catch (error) {
    console.error("❌ Friend request error:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.get("/friends/:username", validateSession, async (req, res) => {
  try {
    const { username } = req.params;
    const friends = await dbHelpers.getFriends(username);
    res.json({ success: true, friends });
  } catch (error) {
    console.error("❌ Friends error:", error);
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
    console.error("❌ Private messages error:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

// ===== SOCKET.IO CONNECTION =====

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
      
    } catch (error) {
      console.error("❌ Authentication error:", error);
      socket.emit("session_expired");
    }
  });

  socket.on("join room", async (data) => {
    try {
      const { roomId, username, sessionId } = data;

      const session = await dbHelpers.getSession(sessionId) || userSessions.get(sessionId);
      if (!session || session.username !== username) {
        socket.emit("session_expired");
        return;
      }

      const room = await dbHelpers.getRoomById(roomId);
      if (!room) {
        socket.emit("error", { message: "Room not found" });
        return;
      }

      const isMember = await dbHelpers.isUserInRoom(roomId, username);
      if (!isMember) {
        socket.emit("error", { message: "You are not a member of this room" });
        return;
      }

      if (currentRoomId) {
        socket.leave(currentRoomId);
      }

      socket.join(roomId);
      currentRoomId = roomId;
      currentUsername = username;
      currentSessionId = sessionId;

      if (onlineUsers.has(username)) {
        onlineUsers.get(username).currentRoom = roomId;
      }

      const members = await dbHelpers.getRoomMembers(roomId);
      const messages = await dbHelpers.getRoomMessages(roomId);

      socket.emit("load messages", messages);
      socket.emit("room members", members);
      socket.emit("room info", room);

      socket.to(roomId).emit("room members", members);

      console.log(`✅ ${username} joined room: ${room.name}`);
      
    } catch (error) {
      console.error("❌ Join room error:", error);
      socket.emit("error", { message: "Failed to join room" });
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

    } catch (error) {
      console.error("❌ Chat message error:", error);
    }
  });

  socket.on("private message", async (data) => {
    try {
      const { sender, receiver, text, time } = data;

      const areFriends = await dbHelpers.areFriends(sender, receiver);
      if (!areFriends) {
        socket.emit("error", { message: "You can only message friends" });
        return;
      }

      await dbHelpers.savePrivateMessage({ sender, receiver, text, time });

      const receiverData = onlineUsers.get(receiver);
      if (receiverData) {
        io.to(receiverData.socketId).emit("private message", data);
      }

      socket.emit("private message", data);
      
    } catch (error) {
      console.error("❌ Private message error:", error);
    }
  });

  socket.on("video_upload", async (data) => {
    try {
      if (data.type === 'private') {
        const receiverData = onlineUsers.get(data.receiver);
        if (receiverData) {
          io.to(receiverData.socketId).emit("video_upload", data);
        }
      } else {
        io.to(data.room_id).emit("video_upload", data);
      }
    } catch (error) {
      console.error("❌ Video upload error:", error);
    }
  });

  socket.on("disconnect", async () => {
    console.log("🔌 User disconnected:", socket.id);

    if (currentUsername) {
      onlineUsers.delete(currentUsername);

      try {
        await dbHelpers.saveUser({ username: currentUsername, status: "Offline" });
      } catch (error) {
        console.error("❌ Status update error:", error);
      }
    }
  });
});

// Cleanup intervals
setInterval(async () => {
  try {
    await dbHelpers.cleanupExpiredSessions();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (const [sessionId, session] of userSessions.entries()) {
      if (now - session.createdAt > oneWeek) {
        userSessions.delete(sessionId);
      }
    }
  } catch (error) {
    console.error("Cleanup error:", error);
  }
}, 60 * 60 * 1000);

setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [videoId, videoData] of videoChunks.entries()) {
    if (videoData.createdAt < oneHourAgo) {
      videoChunks.delete(videoId);
      console.log(`🧹 Cleaned old video chunks: ${videoId}`);
    }
  }
}, 30 * 60 * 1000);

// 🔥 ΚΡΙΤΙΚΗ ΑΛΛΑΓΗ: Simplified server start
async function startServer() {
  try {
    await initializeDatabase();
    console.log('✅ Database initialized');
    
    const PORT = process.env.PORT || 3000;
    server.listen(PPORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`💾 Memory limit: 5MB per chunk`);
      console.log(`🎬 Video chunks in memory: Supported`);
      console.log(`🔧 Render compatible: Yes`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
