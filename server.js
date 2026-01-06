// server.js - RatScape Server with Enhanced Features & Events System
const express = require("express");
const socketio = require("socket.io");
const http = require("http");
const path = require("path");
const bcrypt = require("bcrypt");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = socketio(server);
const PORT = process.env.PORT || 3000;

// Database simulation (in production use MongoDB/PostgreSQL)
const db = {
  users: [],
  rooms: [],
  messages: [],
  privateMessages: [],
  friendRequests: [],
  friendships: [],
  notifications: [],
  events: [],
  eventAttendees: []
};

// Session management
const sessions = new Map();

// File upload configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 
                         'application/pdf', 'text/plain', 
                         'application/msword', 
                         'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

// Authentication middleware
const authenticate = (req, res, next) => {
  const sessionId = req.headers["x-session-id"];
  if (!sessionId) {
    return res.status(401).json({ error: "No session ID provided" });
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(401).json({ error: "Invalid session" });
  }

  if (session.expires < Date.now()) {
    sessions.delete(sessionId);
    return res.status(401).json({ error: "Session expired" });
  }

  req.user = session.user;
  next();
};

// Generate session ID
const generateSessionId = () => {
  return uuidv4();
};

// Socket.IO authentication middleware
io.use((socket, next) => {
  const { username, sessionId } = socket.handshake.auth;
  if (!username || !sessionId) {
    return next(new Error("Authentication required"));
  }

  const session = sessions.get(sessionId);
  if (!session || session.user.username !== username) {
    return next(new Error("Invalid session"));
  }

  socket.user = session.user;
  socket.sessionId = sessionId;
  next();
});

// ===== AUTHENTICATION ROUTES =====
app.post("/register", upload.single('avatar'), async (req, res) => {
  try {
    const { email, username, password } = req.body;

    // Validation
    if (!email || !username || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Check if user exists
    const existingUser = db.users.find(
      (u) => u.email === email || u.username === username
    );
    if (existingUser) {
      return res.status(400).json({ 
        error: existingUser.email === email ? "Email already exists" : "Username already exists" 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Process avatar
    let profilePicture = null;
    if (req.file) {
      const imageBuffer = req.file.buffer;
      const imageBase64 = imageBuffer.toString('base64');
      const mimeType = req.file.mimetype;
      profilePicture = `data:${mimeType};base64,${imageBase64}`;
    }

    // Create user
    const user = {
      id: uuidv4(),
      email,
      username,
      password: hashedPassword,
      profile_picture: profilePicture,
      created_at: new Date(),
      status: "online",
      last_seen: new Date(),
    };

    db.users.push(user);

    // Create session
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
      user: { username: user.username, email: user.email },
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      message: "Registration successful",
      user: { username: user.username, email: user.email },
      sessionId,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = db.users.find((u) => u.email === email);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Create session
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
      user: { username: user.username, email: user.email },
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Update user status
    user.status = "online";
    user.last_seen = new Date();

    res.json({
      success: true,
      message: "Login successful",
      user: { username: user.username, email: user.email },
      sessionId,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/logout", authenticate, (req, res) => {
  const sessionId = req.headers["x-session-id"];
  sessions.delete(sessionId);
  res.json({ success: true, message: "Logged out successfully" });
});

app.get("/verify-session/:username", authenticate, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

// ===== USER PROFILE ROUTES =====
app.get("/user-profile/:username", authenticate, (req, res) => {
  const { username } = req.params;
  const user = db.users.find((u) => u.username === username);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Get statistics
  const friends = db.friendships.filter(
    (f) => f.user1 === username || f.user2 === username
  ).length;

  const rooms = db.rooms.filter((r) => 
    r.members.includes(username)
  ).length;

  const messages = db.messages.filter(
    (m) => m.sender === username
  ).length + db.privateMessages.filter(
    (m) => m.sender === username || m.receiver === username
  ).length;

  res.json({
    success: true,
    profile: {
      username: user.username,
      email: user.email,
      profile_picture: user.profile_picture,
      status: user.status,
      created_at: user.created_at,
    },
    stats: {
      friends,
      rooms,
      messages,
    },
  });
});

app.get("/get-profile-picture/:username", (req, res) => {
  const { username } = req.params;
  const user = db.users.find((u) => u.username === username);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    success: true,
    profile_picture: user.profile_picture,
  });
});

app.post("/upload-profile-picture", authenticate, upload.single("profile_picture"), (req, res) => {
  try {
    const { username } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const user = db.users.find((u) => u.username === username);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Convert image to base64
    const imageBuffer = req.file.buffer;
    const imageBase64 = imageBuffer.toString('base64');
    const mimeType = req.file.mimetype;
    const profilePicture = `data:${mimeType};base64,${imageBase64}`;

    // Update user profile picture
    user.profile_picture = profilePicture;

    // Notify all connected sockets
    io.emit("profile_picture_updated", {
      username: user.username,
      profile_picture: profilePicture,
    });

    res.json({
      success: true,
      message: "Profile picture updated successfully",
      profile_picture: profilePicture,
    });
  } catch (error) {
    console.error("Error uploading profile picture:", error);
    res.status(500).json({ error: "Failed to upload profile picture" });
  }
});

app.post("/update-profile", authenticate, (req, res) => {
  try {
    const { username, updates } = req.body;
    
    const user = db.users.find((u) => u.username === username);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if new username already exists
    if (updates.username && updates.username !== username) {
      const existingUser = db.users.find((u) => u.username === updates.username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }
    }

    // Update user
    Object.keys(updates).forEach((key) => {
      user[key] = updates[key];
    });

    // Update session if username changed
    if (updates.username) {
      const sessionId = req.headers["x-session-id"];
      const session = sessions.get(sessionId);
      if (session) {
        session.user.username = updates.username;
      }
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

app.post("/change-password", authenticate, async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;

    const user = db.users.find((u) => u.username === username);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// ===== USER INFO ROUTES =====
app.get("/user-info/:username", authenticate, (req, res) => {
  const { username } = req.params;
  const user = db.users.find((u) => u.username === username);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    success: true,
    user: {
      username: user.username,
      status: user.status,
      profile_picture: user.profile_picture,
      created_at: user.created_at,
    },
  });
});

app.get("/check-friendship/:username1/:username2", authenticate, (req, res) => {
  const { username1, username2 } = req.params;

  // Check if already friends
  const areFriends = db.friendships.some(
    (f) =>
      (f.user1 === username1 && f.user2 === username2) ||
      (f.user1 === username2 && f.user2 === username1)
  );

  // Check if pending request exists
  const hasPendingRequest = db.friendRequests.some(
    (r) =>
      (r.from === username1 && r.to === username2) ||
      (r.from === username2 && r.to === username1)
  );

  res.json({
    success: true,
    areFriends,
    hasPendingRequest,
  });
});

// ===== ROOM ROUTES =====
app.post("/create-room", authenticate, (req, res) => {
  const { name, username } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Room name is required" });
  }

  // Generate unique invite code
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  const room = {
    id: uuidv4(),
    name,
    invite_code: inviteCode,
    created_by: username,
    members: [username],
    created_at: new Date(),
  };

  db.rooms.push(room);

  res.json({
    success: true,
    message: "Room created successfully",
    roomId: room.id,
    inviteCode: room.invite_code,
  });
});

app.post("/join-room", authenticate, (req, res) => {
  const { inviteCode, username } = req.body;

  const room = db.rooms.find((r) => r.invite_code === inviteCode);
  if (!room) {
    return res.status(404).json({ error: "Invalid invite code" });
  }

  if (room.members.includes(username)) {
    return res.status(400).json({ error: "You are already a member of this room" });
  }

  room.members.push(username);

  res.json({
    success: true,
    message: "Joined room successfully",
    roomId: room.id,
    roomName: room.name,
  });
});

app.get("/user-rooms/:username", authenticate, (req, res) => {
  const { username } = req.params;
  const userRooms = db.rooms.filter((room) => room.members.includes(username));

  res.json({
    success: true,
    rooms: userRooms.map((room) => ({
      id: room.id,
      name: room.name,
      invite_code: room.invite_code,
      created_at: room.created_at,
      member_count: room.members.length,
    })),
  });
});

app.post("/leave-room", authenticate, (req, res) => {
  const { roomId, username } = req.body;

  const room = db.rooms.find((r) => r.id === roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  // Remove user from members
  const memberIndex = room.members.indexOf(username);
  if (memberIndex !== -1) {
    room.members.splice(memberIndex, 1);
  }

  // If room becomes empty, delete it
  if (room.members.length === 0) {
    const roomIndex = db.rooms.findIndex((r) => r.id === roomId);
    if (roomIndex !== -1) {
      db.rooms.splice(roomIndex, 1);
    }
  }

  res.json({
    success: true,
    message: "Left room successfully",
  });
});

// ===== FRIENDS SYSTEM ROUTES =====
app.post("/send-friend-request", authenticate, (req, res) => {
  const { fromUser, toUser } = req.body;

  // Check if users exist
  const fromUserExists = db.users.some((u) => u.username === fromUser);
  const toUserExists = db.users.some((u) => u.username === toUser);

  if (!fromUserExists || !toUserExists) {
    return res.status(404).json({ error: "User not found" });
  }

  // Check if they're already friends
  const alreadyFriends = db.friendships.some(
    (f) =>
      (f.user1 === fromUser && f.user2 === toUser) ||
      (f.user1 === toUser && f.user2 === fromUser)
  );

  if (alreadyFriends) {
    return res.status(400).json({ error: "Already friends" });
  }

  // Check if request already exists
  const existingRequest = db.friendRequests.find(
    (r) =>
      (r.from === fromUser && r.to === toUser) ||
      (r.from === toUser && r.to === fromUser)
  );

  if (existingRequest) {
    return res.status(400).json({ error: "Friend request already sent" });
  }

  // Create friend request
  const request = {
    id: uuidv4(),
    from: fromUser,
    to: toUser,
    status: "pending",
    created_at: new Date(),
  };

  db.friendRequests.push(request);

  // Send notification to receiver
  io.emit("friend_request", {
    from: fromUser,
    to: toUser,
    requestId: request.id,
  });

  res.json({
    success: true,
    message: "Friend request sent successfully",
  });
});

app.get("/pending-requests/:username", authenticate, (req, res) => {
  const { username } = req.params;
  const requests = db.friendRequests.filter(
    (r) => r.to === username && r.status === "pending"
  );

  res.json({
    success: true,
    requests: requests.map((r) => ({
      friend_username: r.from,
      created_at: r.created_at,
    })),
  });
});

app.post("/respond-friend-request", authenticate, (req, res) => {
  const { username, friendUsername, accept } = req.body;

  // Find the request
  const requestIndex = db.friendRequests.findIndex(
    (r) => r.from === friendUsername && r.to === username && r.status === "pending"
  );

  if (requestIndex === -1) {
    return res.status(404).json({ error: "Friend request not found" });
  }

  const request = db.friendRequests[requestIndex];

  if (accept) {
    // Create friendship
    db.friendships.push({
      id: uuidv4(),
      user1: username,
      user2: friendUsername,
      created_at: new Date(),
    });

    request.status = "accepted";

    // Notify the requester
    io.emit("friend_request_accepted", {
      by: username,
      to: friendUsername,
    });
  } else {
    request.status = "declined";
  }

  res.json({
    success: true,
    message: accept ? "Friend request accepted" : "Friend request declined",
  });
});

app.get("/friends/:username", authenticate, (req, res) => {
  const { username } = req.params;

  const friendships = db.friendships.filter(
    (f) => f.user1 === username || f.user2 === username
  );

  const friends = friendships.map((f) => ({
    friend_username: f.user1 === username ? f.user2 : f.user1,
    created_at: f.created_at,
  }));

  res.json({
    success: true,
    friends,
  });
});

app.post("/remove-friend", authenticate, (req, res) => {
  const { username, friendUsername } = req.body;

  // Remove friendship
  const friendshipIndex = db.friendships.findIndex(
    (f) =>
      (f.user1 === username && f.user2 === friendUsername) ||
      (f.user1 === friendUsername && f.user2 === username)
  );

  if (friendshipIndex !== -1) {
    db.friendships.splice(friendshipIndex, 1);
  }

  // Remove any pending requests
  const requestIndex = db.friendRequests.findIndex(
    (r) =>
      ((r.from === username && r.to === friendUsername) ||
        (r.from === friendUsername && r.to === username)) &&
      r.status === "pending"
  );

  if (requestIndex !== -1) {
    db.friendRequests.splice(requestIndex, 1);
  }

  res.json({
    success: true,
    message: "Friend removed successfully",
  });
});

// ===== MESSAGES ROUTES =====
app.get("/private-messages/:username1/:username2", authenticate, (req, res) => {
  const { username1, username2 } = req.params;

  const messages = db.privateMessages.filter(
    (m) =>
      (m.sender === username1 && m.receiver === username2) ||
      (m.sender === username2 && m.receiver === username1)
  );

  res.json({
    success: true,
    messages: messages.map((m) => ({
      text: m.text,
      sender: m.sender,
      receiver: m.receiver,
      time: m.time,
      isFile: m.isFile,
      file_data: m.file_data,
    })),
  });
});

app.post("/clear-room-messages", authenticate, (req, res) => {
  const { username, roomId, isPrivate, friendUsername } = req.body;

  let deletedCount = 0;

  if (isPrivate) {
    // Clear private messages
    const originalLength = db.privateMessages.length;
    db.privateMessages = db.privateMessages.filter(
      (m) => !(
        ((m.sender === username && m.receiver === friendUsername) ||
         (m.sender === friendUsername && m.receiver === username)) &&
        !m.isFile // Keep file messages for now
      )
    );
    deletedCount = originalLength - db.privateMessages.length;
  } else {
    // Clear room messages
    const originalLength = db.messages.length;
    db.messages = db.messages.filter(
      (m) => !(m.room_id === roomId && !m.isFile)
    );
    deletedCount = originalLength - db.messages.length;
  }

  // Notify all users in the room/chat
  if (isPrivate) {
    io.emit("messages_cleared", {
      type: 'private',
      user1: username,
      user2: friendUsername,
      clearedBy: username
    });
  } else {
    io.emit("messages_cleared", {
      type: 'group',
      roomId: roomId,
      clearedBy: username
    });
  }

  res.json({
    success: true,
    deletedCount,
    message: "Messages cleared successfully",
  });
});

// ===== FILE UPLOAD ROUTES =====
app.post("/upload-file", authenticate, upload.single("file"), (req, res) => {
  try {
    const { roomId, sender, type, receiver } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Process file
    const fileBuffer = req.file.buffer;
    const fileBase64 = fileBuffer.toString('base64');
    const mimeType = req.file.mimetype;
    const fileUrl = `data:${mimeType};base64,${fileBase64}`;

    const fileData = {
      fileId: uuidv4(),
      fileName: req.file.originalname,
      fileType: mimeType,
      fileSize: req.file.size,
      fileUrl: fileUrl,
      uploadedAt: new Date(),
    };

    // Save message to database
    if (type === 'private') {
      const privateMessage = {
        id: uuidv4(),
        sender,
        receiver,
        text: `📁 ${req.file.originalname}`,
        time: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        isFile: true,
        file_data: fileData,
        created_at: new Date(),
      };
      
      db.privateMessages.push(privateMessage);
      
      // Emit to both users
      io.emit("file_upload", {
        ...fileData,
        sender,
        receiver,
        time: privateMessage.time,
        type: 'private'
      });
      
    } else {
      const message = {
        id: uuidv4(),
        room_id: roomId,
        sender,
        text: `📁 ${req.file.originalname}`,
        time: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        isFile: true,
        file_data: fileData,
        created_at: new Date(),
      };
      
      db.messages.push(message);
      
      // Emit to room
      io.to(roomId).emit("file_upload", {
        ...fileData,
        sender,
        room_id: roomId,
        time: message.time,
        type: 'group'
      });
    }

    res.json({
      success: true,
      message: "File uploaded successfully",
      fileData,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// ===== NOTIFICATION SYSTEM ROUTES =====
app.get("/offline-notifications/:username", authenticate, (req, res) => {
  const { username } = req.params;
  
  // In a real app, you would fetch from database
  // For now, return empty array
  const notifications = [];
  
  // Calculate summary
  const privateUnread = {};
  const groupsUnread = {};
  
  res.json({
    success: true,
    notifications,
    total: notifications.length,
    summary: {
      private: privateUnread,
      groups: groupsUnread,
      total: Object.values(privateUnread).reduce((a, b) => a + b, 0) + 
             Object.values(groupsUnread).reduce((a, b) => a + b, 0)
    }
  });
});

// ===== EVENT SYSTEM ROUTES =====
app.post("/create-event", authenticate, upload.single("image"), (req, res) => {
  try {
    const { title, date, location, description, isPrivate, roomId, creator } = req.body;
    
    // Validate
    if (!title || !date || !location || !roomId || !creator) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if room exists
    const room = db.rooms.find(r => r.id === roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Create event
    const eventData = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      date: new Date(date),
      location,
      description: description || '',
      isPrivate: isPrivate === 'true',
      roomId,
      creator,
      attendees: 0,
      interested: 0,
      maybe: 0,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    // Handle image upload
    if (req.file) {
      const imageBuffer = req.file.buffer;
      const imageBase64 = imageBuffer.toString('base64');
      const mimeType = req.file.mimetype;
      eventData.image = `data:${mimeType};base64,${imageBase64}`;
    }
    
    // Save event
    db.events.push(eventData);
    
    res.json({ 
      success: true, 
      message: 'Event created successfully',
      event: eventData
    });
    
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get("/room-events/:roomId", authenticate, (req, res) => {
  try {
    const { roomId } = req.params;
    
    // Get events for this room
    const events = db.events.filter(e => e.roomId === roomId);
    
    // Sort by date (upcoming first)
    events.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    res.json({ 
      success: true, 
      events: events.map(e => ({
        id: e.id,
        title: e.title,
        date: e.date,
        location: e.location,
        description: e.description,
        image: e.image,
        creator: e.creator,
        attendees: e.attendees,
        interested: e.interested,
        maybe: e.maybe,
        isPrivate: e.isPrivate,
        created_at: e.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching room events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post("/join-event", authenticate, (req, res) => {
  try {
    const { eventId, userId, roomId } = req.body;
    
    // Find event
    const event = db.events.find(e => e.id === eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Check if user is already attending
    const existingAttendance = db.eventAttendees.find(
      ea => ea.eventId === eventId && ea.userId === userId
    );
    
    if (!existingAttendance) {
      // Add attendee
      db.eventAttendees.push({
        id: uuidv4(),
        eventId,
        userId,
        status: 'attending',
        joined_at: new Date()
      });
      
      // Update event count
      event.attendees = (event.attendees || 0) + 1;
    }
    
    res.json({ 
      success: true, 
      message: 'Successfully joined event',
      attendees: event.attendees
    });
  } catch (error) {
    console.error('Error joining event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get("/event-attendees/:eventId", authenticate, (req, res) => {
  try {
    const { eventId } = req.params;
    
    // Get attendees for this event
    const attendees = db.eventAttendees
      .filter(ea => ea.eventId === eventId)
      .map(ea => {
        const user = db.users.find(u => u.username === ea.userId);
        return {
          username: ea.userId,
          status: ea.status,
          profile_picture: user ? user.profile_picture : null
        };
      });
    
    res.json({ 
      success: true, 
      attendees 
    });
  } catch (error) {
    console.error('Error fetching attendees:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get("/event-details/:eventId", authenticate, (req, res) => {
  try {
    const { eventId } = req.params;
    
    const event = db.events.find(e => e.id === eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json({
      success: true,
      event: {
        id: event.id,
        title: event.title,
        date: event.date,
        location: event.location,
        description: event.description,
        image: event.image,
        creator: event.creator,
        attendees: event.attendees,
        interested: event.interested,
        maybe: event.maybe,
        isPrivate: event.isPrivate,
        created_at: event.created_at
      }
    });
  } catch (error) {
    console.error('Error fetching event details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== SOCKET.IO EVENT HANDLERS =====
io.on("connection", (socket) => {
  console.log(`🔗 New connection: ${socket.user.username}`);

  // Update user status
  const user = db.users.find((u) => u.username === socket.user.username);
  if (user) {
    user.status = "online";
    user.last_seen = new Date();
  }

  // Authenticate
  socket.emit("authenticated", { username: socket.user.username });

  // Handle room joining
  socket.on("join room", ({ roomId, username }) => {
    console.log(`🚀 ${username} joining room: ${roomId}`);
    
    // Leave any previous rooms
    const previousRooms = Array.from(socket.rooms).filter(room => room !== socket.id);
    previousRooms.forEach(room => socket.leave(room));
    
    socket.join(roomId);
    
    // Notify room
    socket.to(roomId).emit("user_joined", {
      username,
      timestamp: new Date(),
    });
    
    // Send room info
    const room = db.rooms.find((r) => r.id === roomId);
    if (room) {
      socket.emit("room info", room);
      
      // Send room members
      const members = room.members.map((member) => {
        const user = db.users.find((u) => u.username === member);
        return {
          username: member,
          status: user ? user.status : "offline",
          joined_at: new Date(), // You might want to store actual join date
        };
      });
      
      socket.emit("room members", members);
      
      // Send recent messages
      const messages = db.messages
        .filter((m) => m.room_id === roomId)
        .slice(-50); // Last 50 messages
      
      socket.emit("load messages", messages);
    }
  });

  // Handle chat messages
  socket.on("chat message", (data) => {
    const { room_id, text, sender, time } = data;
    
    console.log(`💬 ${sender} in room ${room_id}: ${text.substring(0, 30)}...`);

    const message = {
      id: uuidv4(),
      room_id,
      text,
      sender,
      time: time || new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      created_at: new Date(),
    };

    // Save to database
    db.messages.push(message);

    // Emit to room
    io.to(room_id).emit("chat message", message);
    
    // Send notification to offline users in the room
    const room = db.rooms.find(r => r.id === room_id);
    if (room) {
      room.members.forEach(member => {
        if (member !== sender) {
          // Check if member is online
          const memberSocket = findSocketByUsername(member);
          if (!memberSocket) {
            // Store offline notification
            const notification = {
              id: uuidv4(),
              type: 'offline_group_message',
              recipient: member,
              sender: sender,
              message: text,
              roomId: room_id,
              timestamp: new Date(),
              read: false
            };
            // Save to database (not implemented here)
          }
        }
      });
    }
  });

  // Handle private messages
  socket.on("private message", (data) => {
    const { sender, receiver, text, time } = data;
    
    console.log(`🔒 ${sender} to ${receiver}: ${text.substring(0, 30)}...`);

    const message = {
      id: uuidv4(),
      sender,
      receiver,
      text,
      time: time || new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      created_at: new Date(),
    };

    // Save to database
    db.privateMessages.push(message);

    // Find receiver's socket
    const receiverSocket = findSocketByUsername(receiver);
    if (receiverSocket) {
      receiverSocket.emit("private message", message);
    }
    
    // Also send to sender (for their own UI)
    socket.emit("private message", message);
    
    // Send notification if receiver is offline
    if (!receiverSocket) {
      const notification = {
        id: uuidv4(),
        type: 'offline_private_message',
        recipient: receiver,
        sender: sender,
        message: text,
        timestamp: new Date(),
        read: false
      };
      // Save to database (not implemented here)
    }
  });

  // Handle get room members request
  socket.on("get room members", ({ roomId }) => {
    const room = db.rooms.find((r) => r.id === roomId);
    if (room) {
      const members = room.members.map((member) => {
        const user = db.users.find((u) => u.username === member);
        return {
          username: member,
          status: user ? user.status : "offline",
          joined_at: new Date(),
        };
      });
      socket.emit("room members", members);
    }
  });

  // Handle get room info request
  socket.on("get room info", ({ roomId }) => {
    const room = db.rooms.find((r) => r.id === roomId);
    if (room) {
      socket.emit("room info", room);
    }
  });

  // Handle leave room
  socket.on("leave_room", ({ roomId, username }) => {
    console.log(`👋 ${username} leaving room: ${roomId}`);
    
    socket.leave(roomId);
    
    // Notify room
    socket.to(roomId).emit("user_left", {
      username,
      roomId,
      timestamp: new Date(),
    });
    
    socket.emit("leave_room_success", { roomId });
  });

  // Handle mark as read
  socket.on("mark_as_read", ({ type, sender, roomId }) => {
    console.log(`✅ Marking as read: ${type} from ${sender} in ${roomId}`);
    
    // Notify sender that messages were read
    if (type === 'private' && sender) {
      const senderSocket = findSocketByUsername(sender);
      if (senderSocket) {
        senderSocket.emit("unread_cleared", { type, sender: socket.user.username });
      }
    } else if (type === 'group' && roomId) {
      io.to(roomId).emit("unread_cleared", { 
        type, 
        sender: socket.user.username,
        roomId 
      });
    }
  });

  // Handle user typing
  socket.on("typing", ({ roomId, username, isTyping }) => {
    socket.to(roomId).emit("user_typing", { username, isTyping });
  });

  // Handle file upload notification
  socket.on("file_uploaded", (data) => {
    if (data.room_id) {
      socket.to(data.room_id).emit("file_upload", data);
    } else if (data.receiver) {
      const receiverSocket = findSocketByUsername(data.receiver);
      if (receiverSocket) {
        receiverSocket.emit("file_upload", data);
      }
    }
  });

  // ===== EVENT SYSTEM SOCKET HANDLERS =====
  socket.on("new_event", (data) => {
    const { roomId, event } = data;
    console.log(`🎪 New event in room ${roomId}: ${event.title}`);
    
    // Save event to database (already done via HTTP)
    // Notify all room members
    io.to(roomId).emit("new_event", { roomId, event });
  });
  
  socket.on("join_event", (data) => {
    const { eventId, userId, roomId } = data;
    console.log(`✅ ${userId} joining event ${eventId}`);
    
    // Update event in database
    const event = db.events.find(e => e.id === eventId);
    if (event) {
      event.attendees = (event.attendees || 0) + 1;
      
      // Notify room
      io.to(roomId).emit("event_updated", { roomId, event });
      
      // Send notification to event creator
      const creatorSocket = findSocketByUsername(event.creator);
      if (creatorSocket && creatorSocket.id !== socket.id) {
        creatorSocket.emit("notification", {
          type: 'event_join',
          sender: userId,
          message: `${userId} joined your event "${event.title}"`,
          eventId
        });
      }
    }
  });
  
  socket.on("event_message", (data) => {
    const { eventId, sender, message, roomId } = data;
    console.log(`💬 Event chat: ${sender} in ${eventId}: ${message.substring(0, 30)}...`);
    
    // Broadcast to all users viewing this event
    io.to(roomId).emit("event_message", {
      eventId,
      sender,
      message,
      timestamp: new Date(),
      roomId
    });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`🔌 ${socket.user.username} disconnected`);
    
    // Update user status
    const user = db.users.find((u) => u.username === socket.user.username);
    if (user) {
      user.status = "offline";
      user.last_seen = new Date();
    }
    
    // Notify rooms user was in
    const userRooms = Array.from(socket.rooms).filter(room => room !== socket.id);
    userRooms.forEach(roomId => {
      socket.to(roomId).emit("user_disconnected", {
        username: socket.user.username,
        roomId,
        timestamp: new Date(),
      });
    });
  });
});

// Helper function to find socket by username
function findSocketByUsername(username) {
  const sockets = Array.from(io.sockets.sockets.values());
  return sockets.find((s) => s.user && s.user.username === username);
}

// ===== STATIC FILE SERVING =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/service-worker.js", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "service-worker.js"));
});

// ===== ERROR HANDLING =====
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🐀 RatScape ready for car meets!`);
});
