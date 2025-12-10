// server.js - COMPLETE FIXED VERSION WITH MONGODB & UNREAD SYSTEM
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const { dbHelpers, initializeDatabase } = require("./database.js");
const multer = require('multer');
const sharp = require('sharp'); // 🔥 ΝΕΟ: Για auto-resize εικόνων
const fs = require('fs').promises;

const app = express();
const server = createServer(app);

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
  origin: ["https://ratscape.onrender.com", "http://localhost:3000"],
  credentials: true
}));
app.use(express.json());

// Βεβαιώσου ότι ο φάκελος uploads υπάρχει
const ensureUploadsDir = async () => {
  const uploadsDir = path.join(__dirname, 'uploads');
  try {
    await fs.access(uploadsDir);
  } catch {
    await fs.mkdir(uploadsDir, { recursive: true });
  }
};

// 🔥 ΒΕΛΤΙΩΣΗ: Configure multer με auto-resize
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        await ensureUploadsDir();
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, 'avatar-' + uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { 
      fileSize: 10 * 1024 * 1024, // 🔥 ΑΥΞΗΣΗ: 10MB limit για μεγαλύτερες φωτογραφίες
    },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif|webp|bmp|tiff/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP, BMP, TIFF)'));
    }
});

// 🔥 ΒΕΛΤΙΩΣΗ: Συνάρτηση για auto-resize και optimization εικόνων
async function processAndResizeImage(filePath) {
  try {
    const outputPath = filePath.replace(/(\.[\w\d]+)$/, '_resized$1');
    
    // Auto-resize σε 150x150 pixels με διατήρηση aspect ratio
    await sharp(filePath)
      .resize(150, 150, {
        fit: 'cover',
        position: 'center',
        withoutEnlargement: false // Επιτρέπει μεγέθυνση αν η εικόνα είναι πολύ μικρή
      })
      .jpeg({ 
        quality: 85,
        progressive: true,
        optimizeScans: true
      })
      .toFile(outputPath);
    
    // Διαγραφή του αρχικού αρχείου
    await fs.unlink(filePath);
    
    return outputPath;
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
}

// Serve static files correctly for Render
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/test", (req, res) => {
  res.sendFile(path.join(__dirname, "test.html"));
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
    // Try database first, then memory fallback
    let session = await dbHelpers.getSession(sessionId) || userSessions.get(sessionId);
    
    if (!session) {
      return res.status(401).json({ success: false, error: "Invalid session" });
    }

    // Check session expiration (7 days)
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const sessionTime = new Date(session.last_accessed || session.createdAt).getTime();
    
    if (Date.now() - sessionTime > oneWeek) {
      await dbHelpers.deleteSession(sessionId);
      userSessions.delete(sessionId);
      return res.status(401).json({ success: false, error: "Session expired" });
    }

    // If username is provided, verify it matches session
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

// Debug endpoint
app.get("/debug-users", async (req, res) => {
  try {
    const users = await dbHelpers.getAllUsers();
    res.json({
      success: true,
      users: users,
      total: users.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
      message: "Cannot access users table",
    });
  }
});

// ===== ΝΕΟ ENDPOINT: OFFLINE NOTIFICATIONS =====
app.get("/offline-notifications/:username", validateSession, async (req, res) => {
  try {
    const { username } = req.params;
    
    // Φόρτωση unread messages
    const unreads = await dbHelpers.getUnreadMessages(username);
    
    // Φόρτωση pending friend requests
    const pendingRequests = await dbHelpers.getPendingRequests(username);
    
    // Δημιουργία notifications array
    const notifications = [];
    
    // Προσθήκη unread private messages
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
    
    // Προσθήκη unread group messages
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
    
    // Προσθήκη pending friend requests
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
    
    // Ταξινόμηση κατά timestamp (νέα πρώτα)
    notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Συνολικό count
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

// ===== ΝΕΟ ENDPOINT: MARK AS READ =====
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

// ===== ΝΕΟ ENDPOINT: GET UNREAD SUMMARY =====
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

// ===== ΝΕΑ ENDPOINTS: PROFILE SYSTEM =====

// User profile endpoint
app.get("/user-profile/:username", validateSession, async (req, res) => {
    try {
        const { username } = req.params;
        
        const user = await dbHelpers.findUserByUsername(username);
        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        
        // Get user statistics
        const friends = await dbHelpers.getFriends(username);
        const rooms = await dbHelpers.getUserRooms(username);
        
        // Get messages count (simplified)
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

// ===== ΝΕΑ ENDPOINTS: USER INFO SYSTEM =====

// User info endpoint (για άλλους χρήστες) - FIXED VERSION
app.get("/user-info/:targetUsername", async (req, res) => {
  try {
    const { targetUsername } = req.params;
    const sessionId = req.headers["x-session-id"];

    console.log("🔍 User info request for:", targetUsername, "session:", sessionId);

    // Check session
    if (!sessionId) {
      return res.status(401).json({ success: false, error: "Session required" });
    }

    // Get session from database or memory
    const session = await dbHelpers.getSession(sessionId) || userSessions.get(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: "Invalid session" });
    }

    // Get the user making the request
    const requestingUser = await dbHelpers.findUserByUsername(session.username);
    if (!requestingUser) {
      return res.status(401).json({ success: false, error: "Requesting user not found" });
    }

    // Get the target user
    const targetUser = await dbHelpers.findUserByUsername(targetUsername);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Create user info response
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

// ===== ΝΕΟ ENDPOINT: CHECK FRIENDSHIP STATUS =====
app.get("/check-friendship/:username/:friendUsername", async (req, res) => {
  try {
    const { username, friendUsername } = req.params;
    const sessionId = req.headers["x-session-id"];

    console.log("🔍 Checking friendship between:", username, "and", friendUsername);

    if (!sessionId) {
      return res.status(401).json({ success: false, error: "Session required" });
    }

    // Validate session
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

// Update profile endpoint
app.post("/update-profile", validateSession, async (req, res) => {
    try {
        const { username, updates } = req.body;
        
        // Check if new username is taken
        if (updates.username) {
            const existingUser = await dbHelpers.findUserByUsername(updates.username);
            if (existingUser && existingUser.username !== username) {
                return res.status(400).json({ success: false, error: "Username already taken" });
            }
        }
        
        // Check if new email is taken
        if (updates.email) {
            const existingEmail = await dbHelpers.findUserByEmail(updates.email);
            if (existingEmail && existingEmail.username !== username) {
                return res.status(400).json({ success: false, error: "Email already registered" });
            }
        }
        
        // Update user in database
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

// Change password endpoint
app.post("/change-password", validateSession, async (req, res) => {
    try {
        const { username, currentPassword, newPassword } = req.body;
        
        const user = await dbHelpers.findUserByUsername(username);
        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        
        // Check current password
        if (user.password !== currentPassword) {
            return res.status(401).json({ success: false, error: "Current password is incorrect" });
        }
        
        // Update password
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

// 🔥 ΒΕΛΤΙΩΣΗ: Upload profile picture endpoint με AUTO-RESIZE
app.post("/upload-profile-picture", validateSession, upload.single('profile_picture'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: "No file uploaded" });
        }
        
        const { username } = req.body;
        
        console.log("📸 Processing uploaded image:", req.file.filename);
        
        // 🔥 AUTO-RESIZE τη φωτογραφία σε 150x150 pixels
        const resizedImagePath = await processAndResizeImage(req.file.path);
        
        // Δημιουργία relative path για το resized image
        const profilePicture = '/uploads/' + path.basename(resizedImagePath);
        
        // Save to database
        await dbHelpers.updateUser(username, { profile_picture: profilePicture });
        
        console.log("✅ Profile picture resized and saved for user:", username);
        
        res.json({
            success: true,
            profile_picture: profilePicture + "?t=" + Date.now(), // Προσθήκη timestamp για cache busting
            message: "Profile picture updated successfully"
        });
        
    } catch (error) {
        console.error("❌ Error uploading profile picture:", error);
        
        // Clean up αν υπάρχει πρόβλημα
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (cleanupError) {
                console.error("Error cleaning up file:", cleanupError);
            }
        }
        
        res.status(500).json({ 
            success: false, 
            error: error.message || "Failed to upload and process profile picture" 
        });
    }
});

// 🔥 ΒΕΛΤΙΩΣΗ: Updated registration endpoint με AUTO-RESIZE avatar
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
            await dbHelpers.createUser(email, username, password);
            console.log("✅ User created successfully:", username);

            // 🔥 Handle avatar με AUTO-RESIZE αν παρέχεται
            if (req.file) {
                console.log("📸 Processing avatar for registration:", req.file.filename);
                
                try {
                    // AUTO-RESIZE τη φωτογραφία σε 150x150 pixels
                    const resizedImagePath = await processAndResizeImage(req.file.path);
                    
                    // Δημιουργία relative path
                    const profilePicture = '/uploads/' + path.basename(resizedImagePath);
                    
                    // Save to database
                    await dbHelpers.updateUser(username, { 
                        profile_picture: profilePicture 
                    });
                    
                    console.log("✅ Avatar resized and saved for user:", username);
                } catch (resizeError) {
                    console.error("❌ Error resizing avatar:", resizeError);
                    // Συνέχισε χωρίς avatar αν υπάρχει πρόβλημα
                }
            }

            res.json({
                success: true,
                message: "Account created successfully! You can now login.",
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

// ===== ΥΠΑΡΧΟΝΤΑ ENDPOINTS (ΜΕΝΟΥΝ ΑΚΛΑΔΑ) =====

// Authentication routes
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

    // Create session - SAVE TO DATABASE
    const sessionId = "session_" + Date.now() + "_" + Math.random().toString(36).substring(2, 15);
    const sessionData = {
      username: user.username,
      createdAt: Date.now(),
    };

    // Save to both database and memory (fallback)
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

// FIXED session verification endpoint
app.get("/verify-session/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const sessionId = req.headers["x-session-id"];

    console.log("🔍 Verifying session for:", username, "session:", sessionId);

    if (!sessionId) {
      return res.status(401).json({ success: false, error: "Session ID required" });
    }

    // Check both database and memory
    const session = await dbHelpers.getSession(sessionId) || userSessions.get(sessionId);
    const user = await dbHelpers.findUserByUsername(username);

    if (session && session.username === username && user) {
      console.log("✅ Session verified:", username);
      res.json({
        success: true,
        user: {
          username: user.username,
          email: user.email,
        },
      });
    } else {
      console.log("❌ Invalid session for:", username);
      // Clean up invalid session
      await dbHelpers.deleteSession(sessionId);
      userSessions.delete(sessionId);
      res.status(401).json({ success: false, error: "Invalid session" });
    }
  } catch (error) {
    console.error("❌ Error verifying session:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

// Logout endpoint
app.post("/logout", async (req, res) => {
  try {
    const { username } = req.body;
    const sessionId = req.headers["x-session-id"];

    if (sessionId) {
      await dbHelpers.deleteSession(sessionId);
      userSessions.delete(sessionId);
    }

    if (username) {
      await dbHelpers.saveUser({ username, status: "Offline" });
    }

    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("❌ Error during logout:", error);
    res.json({ success: true });
  }
});

// ===== ΝΕΟ ENDPOINT: LEAVE ROOM =====
app.post("/leave-room", validateSession, async (req, res) => {
  try {
    const { roomId, username } = req.body;

    if (!roomId || !username) {
      return res.status(400).json({ success: false, error: "Room ID and username required" });
    }

    // Αφαίρεση χρήστη από το δωμάτιο
    await dbHelpers.removeUserFromRoom(roomId, username);
    
    console.log(`✅ ${username} left room ${roomId}`);

    res.json({
      success: true,
      message: "Left room successfully",
    });
  } catch (error) {
    console.error("❌ Error leaving room:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

// Protected routes with session validation
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
      return res.status(404).json({ success: false, error: "Invalid invite code" });
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

// Friend routes with session validation
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
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const areAlreadyFriends = await dbHelpers.areFriends(fromUser, toUser);
    if (areAlreadyFriends) {
      return res.status(400).json({ success: false, error: "Already friends" });
    }

    const hasPendingRequest = await dbHelpers.hasPendingRequest(fromUser, toUser);
    if (hasPendingRequest) {
      return res.status(400).json({ success: false, error: "Friend request already sent" });
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

// ===== SOCKET.IO CONNECTION WITH ENHANCED UNREAD SYSTEM =====

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
      
      // Στέλνουμε unread summary μόλις συνδεθεί ο χρήστης
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

      // 🔥 Mark group messages as read όταν μπαίνεις στο room
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

      // 🔥 UNREAD SYSTEM: Προσθήκη unread για όλους εκτός από τον αποστολέα
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
              text: data.text,
              message_id: messageId
            }
          );
          
          const memberData = onlineUsers.get(member.username);
          if (memberData) {
            // Στέλνουμε real-time notification μόνο αν δεν είναι στο ίδιο room
            if (memberData.currentRoom !== currentRoomId) {
              io.to(memberData.socketId).emit("notification", {
                type: "group_message",
                sender: currentUsername,
                roomId: currentRoomId,
                roomName: (await dbHelpers.getRoomById(currentRoomId))?.name || "Room",
                message: data.text.substring(0, 50) + (data.text.length > 50 ? "..." : ""),
                timestamp: Date.now(),
                action: {
                  type: 'room_message',
                  roomId: currentRoomId,
                  sender: currentUsername
                }
              });
            }
            
            // Στέλνουμε unread update
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
      
      // 🔥 UNREAD SYSTEM: Προσθήκη unread για τον receiver
      const messageId = `pm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await dbHelpers.addUnreadMessage(receiver, sender, 'private', null, {
        text,
        message_id: messageId
      });

      const receiverData = onlineUsers.get(receiver);
      if (receiverData) {
        io.to(receiverData.socketId).emit("private message", data);
        
        // Στέλνουμε notification
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
        
        // Στέλνουμε unread update
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

  // 🔥 ΝΕΟ EVENT: Mark messages as read
  socket.on("mark_as_read", async (data) => {
    try {
      const { type, sender, roomId } = data;
      
      if (!currentUsername) return;
      
      await dbHelpers.markAsRead(currentUsername, sender, type, roomId);
      
      // Ενημέρωση client - μόνο στον συγκεκριμένο χρήστη
      socket.emit("unread_cleared", { type, sender, roomId });
      
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  });

  // 🔥 ΝΕΟ EVENT: Get unread summary
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
        } else {
          const members = await dbHelpers.getRoomMembers(currentRoomId);
          socket.to(currentRoomId).emit("room members", members);
        }
      }
    }
  });
});

// Clean up expired sessions periodically
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

// 🔥 FIXED: Start server ONLY after database connection
async function startServer() {
  try {
    // Wait for database to connect
    await initializeDatabase();
    
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 RatScape Server running on port ${PORT}`);
      console.log(`📱 Available at: http://localhost:${PORT}`);
      console.log(`💬 Enhanced security with session management`);
      console.log(`📬 UNREAD MESSAGES SYSTEM: ENABLED`);
      console.log(`👤 PROFILE SYSTEM: ENABLED`);
      console.log(`👤 USER INFO SYSTEM: ENABLED`);
      console.log(`🔔 NOTIFICATION TIMEOUT: 5 SECONDS`);
      console.log(`🌐 WebSocket transports: ${io.engine.opts.transports}`);
      console.log(`📸 IMAGE AUTO-RESIZE: ENABLED (150x150 pixels)`);
      console.log(`👥 ROOM CAPACITY: UNLIMITED`);
      console.log(`📁 SUPPORTED IMAGES: JPEG, PNG, GIF, WebP, BMP, TIFF`);
      console.log(`💾 MAX FILE SIZE: 10MB`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Start the server
startServer();
