// server.js - RatScape Server with Enhanced Features & Events System
const express = require("express");
const socketio = require("socket.io");
const http = require("http");
const path = require("path");
const bcrypt = require("bcrypt");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");

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
  eventAttendees: [],
  userStatus: new Map() // Για real-time status tracking
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
  socket.username = username;
  
  // Update user status
  db.userStatus.set(username, {
    status: 'online',
    socketId: socket.id,
    lastSeen: new Date()
  });
  
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
    } else {
      // Χρησιμοποιούμε default avatar αν δεν υπάρχει
      try {
        const defaultAvatarPath = path.join(__dirname, 'public', 'default-avatar.png');
        if (fs.existsSync(defaultAvatarPath)) {
          const defaultAvatar = fs.readFileSync(defaultAvatarPath);
          profilePicture = `data:image/png;base64,${defaultAvatar.toString('base64')}`;
        }
      } catch (err) {
        console.log('Could not load default avatar:', err.message);
      }
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
      friends_count: 0,
      rooms_count: 0,
      events_attended: 0
    };

    db.users.push(user);

    // Create session
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
      user: { 
        username: user.username, 
        email: user.email,
        profile_picture: user.profile_picture 
      },
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      message: "Registration successful",
      user: { 
        username: user.username, 
        email: user.email,
        profile_picture: user.profile_picture 
      },
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
      user: { 
        username: user.username, 
        email: user.email,
        profile_picture: user.profile_picture 
      },
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Update user status
    user.status = "online";
    user.last_seen = new Date();

    res.json({
      success: true,
      message: "Login successful",
      user: { 
        username: user.username, 
        email: user.email,
        profile_picture: user.profile_picture 
      },
      sessionId,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/logout", authenticate, (req, res) => {
  const sessionId = req.headers["x-session-id"];
  const session = sessions.get(sessionId);
  
  if (session) {
    // Update user status to offline
    const username = session.user.username;
    const user = db.users.find(u => u.username === username);
    if (user) {
      user.status = "offline";
      user.last_seen = new Date();
    }
    
    // Remove from userStatus map
    db.userStatus.delete(username);
    
    sessions.delete(sessionId);
  }
  
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
    r.members && r.members.includes(username)
  ).length;

  const messages = db.messages.filter(
    (m) => m.sender === username
  ).length + db.privateMessages.filter(
    (m) => m.sender === username || m.receiver === username
  ).length;

  const events_attended = db.eventAttendees.filter(
    (ea) => ea.userId === username && ea.status === 'attending'
  ).length;

  res.json({
    success: true,
    profile: {
      username: user.username,
      email: user.email,
      profile_picture: user.profile_picture,
      status: user.status,
      created_at: user.created_at,
      last_seen: user.last_seen,
    },
    stats: {
      friends,
      rooms,
      messages,
      events_attended
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

    // Update session
    const sessionId = req.headers["x-session-id"];
    const session = sessions.get(sessionId);
    if (session) {
      session.user.profile_picture = profilePicture;
    }

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
      if (key !== 'password') {
        user[key] = updates[key];
      }
    });

    // Update session if username changed
    if (updates.username) {
      const sessionId = req.headers["x-session-id"];
      const session = sessions.get(sessionId);
      if (session) {
        session.user.username = updates.username;
      }
      
      // Update all references in friendships
      db.friendships.forEach(f => {
        if (f.user1 === username) f.user1 = updates.username;
        if (f.user2 === username) f.user2 = updates.username;
      });
      
      // Update all references in friend requests
      db.friendRequests.forEach(r => {
        if (r.from === username) r.from = updates.username;
        if (r.to === username) r.to = updates.username;
      });
      
      // Update all references in rooms
      db.rooms.forEach(r => {
        if (r.members && r.members.includes(username)) {
          const index = r.members.indexOf(username);
          r.members[index] = updates.username;
        }
      });
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        username: user.username,
        email: user.email,
        profile_picture: user.profile_picture
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

  // Get friends count
  const friendsCount = db.friendships.filter(
    (f) => f.user1 === username || f.user2 === username
  ).length;

  // Get rooms count
  const roomsCount = db.rooms.filter((r) => 
    r.members && r.members.includes(username)
  ).length;

  res.json({
    success: true,
    user: {
      username: user.username,
      status: user.status,
      profile_picture: user.profile_picture,
      created_at: user.created_at,
      last_seen: user.last_seen,
      friends_count: friendsCount,
      rooms_count: roomsCount
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
      (r.from === username1 && r.to === username2 && r.status === "pending") ||
      (r.from === username2 && r.to === username1 && r.status === "pending")
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

  if (!name || !username) {
    return res.status(400).json({ error: "Room name and username are required" });
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
    is_active: true,
    description: `${name} - Created by ${username}`,
    event_count: 0
  };

  db.rooms.push(room);

  res.json({
    success: true,
    message: "Room created successfully",
    roomId: room.id,
    inviteCode: room.invite_code,
    room: {
      id: room.id,
      name: room.name,
      invite_code: room.invite_code,
      created_by: room.created_by,
      member_count: 1,
      created_at: room.created_at
    }
  });
});

app.post("/join-room", authenticate, (req, res) => {
  const { inviteCode, username } = req.body;

  if (!inviteCode || !username) {
    return res.status(400).json({ error: "Invite code and username are required" });
  }

  const room = db.rooms.find((r) => r.invite_code === inviteCode);
  if (!room) {
    return res.status(404).json({ error: "Invalid invite code" });
  }

  if (!room.members) {
    room.members = [];
  }

  if (room.members.includes(username)) {
    return res.status(400).json({ error: "You are already a member of this room" });
  }

  room.members.push(username);

  // Notify room members
  io.to(room.id).emit("user_joined_room", {
    username,
    roomId: room.id,
    timestamp: new Date()
  });

  res.json({
    success: true,
    message: "Joined room successfully",
    roomId: room.id,
    roomName: room.name,
    inviteCode: room.invite_code,
    memberCount: room.members.length
  });
});

app.get("/user-rooms/:username", authenticate, (req, res) => {
  const { username } = req.params;
  const userRooms = db.rooms.filter((room) => 
    room.members && room.members.includes(username) && room.is_active !== false
  );

  res.json({
    success: true,
    rooms: userRooms.map((room) => ({
      id: room.id,
      name: room.name,
      invite_code: room.invite_code,
      created_at: room.created_at,
      member_count: room.members ? room.members.length : 0,
      created_by: room.created_by,
      event_count: room.event_count || 0,
      description: room.description || `${room.name} - Car meet room`
    })),
  });
});

app.post("/leave-room", authenticate, (req, res) => {
  const { roomId, username } = req.body;

  if (!roomId || !username) {
    return res.status(400).json({ error: "Room ID and username are required" });
  }

  const room = db.rooms.find((r) => r.id === roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  if (!room.members) {
    room.members = [];
  }

  // Remove user from members
  const memberIndex = room.members.indexOf(username);
  if (memberIndex !== -1) {
    room.members.splice(memberIndex, 1);
  }

  // Notify room members
  io.to(roomId).emit("user_left_room", {
    username,
    roomId,
    timestamp: new Date(),
    remainingMembers: room.members.length
  });

  // If room becomes empty and user was the creator, delete it
  if (room.members.length === 0 && room.created_by === username) {
    const roomIndex = db.rooms.findIndex((r) => r.id === roomId);
    if (roomIndex !== -1) {
      db.rooms.splice(roomIndex, 1);
    }
    
    res.json({
      success: true,
      message: "Room deleted (no members left)",
      roomDeleted: true
    });
  } else {
    res.json({
      success: true,
      message: "Left room successfully",
      remainingMembers: room.members.length
    });
  }
});

// Get room details
app.get("/room/:roomId", authenticate, (req, res) => {
  const { roomId } = req.params;
  
  const room = db.rooms.find((r) => r.id === roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  res.json({
    success: true,
    room: {
      id: room.id,
      name: room.name,
      invite_code: room.invite_code,
      created_by: room.created_by,
      created_at: room.created_at,
      member_count: room.members ? room.members.length : 0,
      members: room.members || [],
      description: room.description || '',
      event_count: room.event_count || 0
    }
  });
});

// ===== FRIENDS SYSTEM ROUTES =====
app.post("/send-friend-request", authenticate, (req, res) => {
  const { fromUser, toUser } = req.body;

  if (!fromUser || !toUser) {
    return res.status(400).json({ error: "Both usernames are required" });
  }

  // Check if users exist
  const fromUserExists = db.users.some((u) => u.username === fromUser);
  const toUserExists = db.users.some((u) => u.username === toUser);

  if (!fromUserExists || !toUserExists) {
    return res.status(404).json({ error: "User not found" });
  }

  if (fromUser === toUser) {
    return res.status(400).json({ error: "You cannot add yourself as a friend" });
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
      (r.from === fromUser && r.to === toUser && r.status === "pending") ||
      (r.from === toUser && r.to === fromUser && r.status === "pending")
  );

  if (existingRequest) {
    return res.status(400).json({ error: "Friend request already sent or received" });
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
  const receiverSocket = findSocketByUsername(toUser);
  if (receiverSocket) {
    receiverSocket.emit("friend_request", {
      from: fromUser,
      to: toUser,
      requestId: request.id,
      timestamp: new Date()
    });
  }

  // Store offline notification
  const notification = {
    id: uuidv4(),
    type: 'friend_request',
    recipient: toUser,
    sender: fromUser,
    message: `${fromUser} sent you a friend request`,
    data: { requestId: request.id },
    timestamp: new Date(),
    read: false
  };
  db.notifications.push(notification);

  res.json({
    success: true,
    message: "Friend request sent successfully",
    requestId: request.id
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
      id: r.id,
      friend_username: r.from,
      created_at: r.created_at,
    })),
    count: requests.length
  });
});

app.post("/respond-friend-request", authenticate, (req, res) => {
  const { username, friendUsername, accept } = req.body;

  if (!username || !friendUsername) {
    return res.status(400).json({ error: "Usernames are required" });
  }

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
    const friendship = {
      id: uuidv4(),
      user1: username,
      user2: friendUsername,
      created_at: new Date(),
    };

    db.friendships.push(friendship);
    request.status = "accepted";

    // Update friend counts for both users
    const user1 = db.users.find(u => u.username === username);
    const user2 = db.users.find(u => u.username === friendUsername);
    if (user1) user1.friends_count = (user1.friends_count || 0) + 1;
    if (user2) user2.friends_count = (user2.friends_count || 0) + 1;

    // Notify the requester
    const requesterSocket = findSocketByUsername(friendUsername);
    if (requesterSocket) {
      requesterSocket.emit("friend_request_accepted", {
        by: username,
        to: friendUsername,
        friendshipId: friendship.id
      });
    }

    // Store notification
    const notification = {
      id: uuidv4(),
      type: 'friend_request_accepted',
      recipient: friendUsername,
      sender: username,
      message: `${username} accepted your friend request`,
      timestamp: new Date(),
      read: false
    };
    db.notifications.push(notification);

    res.json({
      success: true,
      message: "Friend request accepted",
      friendshipId: friendship.id
    });
  } else {
    request.status = "declined";
    
    // Store notification
    const notification = {
      id: uuidv4(),
      type: 'friend_request_declined',
      recipient: friendUsername,
      sender: username,
      message: `${username} declined your friend request`,
      timestamp: new Date(),
      read: false
    };
    db.notifications.push(notification);

    res.json({
      success: true,
      message: "Friend request declined"
    });
  }
});

app.get("/friends/:username", authenticate, (req, res) => {
  const { username } = req.params;

  const friendships = db.friendships.filter(
    (f) => f.user1 === username || f.user2 === username
  );

  const friends = friendships.map((f) => {
    const friendUsername = f.user1 === username ? f.user2 : f.user1;
    const friend = db.users.find(u => u.username === friendUsername);
    
    return {
      friend_username: friendUsername,
      profile_picture: friend ? friend.profile_picture : null,
      status: friend ? friend.status : 'offline',
      created_at: f.created_at,
      last_seen: friend ? friend.last_seen : null
    };
  });

  res.json({
    success: true,
    friends,
    count: friends.length
  });
});

app.post("/remove-friend", authenticate, (req, res) => {
  const { username, friendUsername } = req.body;

  if (!username || !friendUsername) {
    return res.status(400).json({ error: "Usernames are required" });
  }

  // Remove friendship
  const friendshipIndex = db.friendships.findIndex(
    (f) =>
      (f.user1 === username && f.user2 === friendUsername) ||
      (f.user1 === friendUsername && f.user2 === username)
  );

  if (friendshipIndex !== -1) {
    db.friendships.splice(friendshipIndex, 1);
    
    // Update friend counts
    const user1 = db.users.find(u => u.username === username);
    const user2 = db.users.find(u => u.username === friendUsername);
    if (user1) user1.friends_count = Math.max(0, (user1.friends_count || 1) - 1);
    if (user2) user2.friends_count = Math.max(0, (user2.friends_count || 1) - 1);
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

  // Notify the other user if online
  const friendSocket = findSocketByUsername(friendUsername);
  if (friendSocket) {
    friendSocket.emit("friend_removed", {
      by: username,
      timestamp: new Date()
    });
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

  // Sort by date (oldest first)
  messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  res.json({
    success: true,
    messages: messages.map((m) => ({
      id: m.id,
      text: m.text,
      sender: m.sender,
      receiver: m.receiver,
      time: m.time,
      isFile: m.isFile,
      file_data: m.file_data,
      created_at: m.created_at
    })),
    count: messages.length
  });
});

app.post("/clear-room-messages", authenticate, (req, res) => {
  const { username, roomId, isPrivate, friendUsername } = req.body;

  let deletedCount = 0;

  if (isPrivate) {
    // Clear private messages (keep file messages)
    const originalLength = db.privateMessages.length;
    db.privateMessages = db.privateMessages.filter(
      (m) => !(
        ((m.sender === username && m.receiver === friendUsername) ||
         (m.sender === friendUsername && m.receiver === username)) &&
        !m.isFile
      )
    );
    deletedCount = originalLength - db.privateMessages.length;
    
    // Notify both users
    io.emit("messages_cleared", {
      type: 'private',
      user1: username,
      user2: friendUsername,
      clearedBy: username,
      deletedCount
    });
  } else {
    // Clear room messages (keep file messages)
    const originalLength = db.messages.length;
    db.messages = db.messages.filter(
      (m) => !(m.room_id === roomId && !m.isFile)
    );
    deletedCount = originalLength - db.messages.length;
    
    // Notify room members
    io.to(roomId).emit("messages_cleared", {
      type: 'group',
      roomId: roomId,
      clearedBy: username,
      deletedCount
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
        type: 'private',
        messageId: privateMessage.id
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
        type: 'group',
        messageId: message.id
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
  
  // Get unread notifications for this user
  const notifications = db.notifications.filter(
    n => n.recipient === username && !n.read
  );
  
  // Mark as read
  notifications.forEach(n => n.read = true);
  
  // Calculate unread message counts
  const privateUnread = {};
  const groupsUnread = {};
  
  // Count unread private messages
  db.privateMessages.forEach(msg => {
    if (msg.receiver === username) {
      if (!privateUnread[msg.sender]) {
        privateUnread[msg.sender] = 0;
      }
      privateUnread[msg.sender]++;
    }
  });
  
  // Count unread group messages (simplified)
  db.messages.forEach(msg => {
    const room = db.rooms.find(r => r.id === msg.room_id);
    if (room && room.members && room.members.includes(username)) {
      if (!groupsUnread[msg.room_id]) {
        groupsUnread[msg.room_id] = 0;
      }
      groupsUnread[msg.room_id]++;
    }
  });
  
  const totalUnread = Object.values(privateUnread).reduce((a, b) => a + b, 0) + 
                     Object.values(groupsUnread).reduce((a, b) => a + b, 0);
  
  res.json({
    success: true,
    notifications: notifications.slice(0, 20), // Limit to 20 most recent
    total: notifications.length,
    unread_count: totalUnread,
    summary: {
      private: privateUnread,
      groups: groupsUnread,
      total: totalUnread
    }
  });
});

// Mark notifications as read
app.post("/mark-notifications-read", authenticate, (req, res) => {
  const { username } = req.body;
  
  db.notifications.forEach(n => {
    if (n.recipient === username) {
      n.read = true;
    }
  });
  
  res.json({ success: true });
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
    
    // Check if user is room member
    if (!room.members || !room.members.includes(creator)) {
      return res.status(403).json({ error: 'You must be a room member to create events' });
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
      updated_at: new Date(),
      status: 'upcoming'
    };
    
    // Handle image upload
    if (req.file) {
      const imageBuffer = req.file.buffer;
      const imageBase64 = imageBuffer.toString('base64');
      const mimeType = req.file.mimetype;
      eventData.image = `data:${mimeType};base64,${imageBase64}`;
    } else {
      // Use default event image
      try {
        const defaultEventPath = path.join(__dirname, 'public', 'default-event.jpg');
        if (fs.existsSync(defaultEventPath)) {
          const defaultEvent = fs.readFileSync(defaultEventPath);
          eventData.image = `data:image/jpeg;base64,${defaultEvent.toString('base64')}`;
        }
      } catch (err) {
        console.log('Could not load default event image:', err.message);
      }
    }
    
    // Save event
    db.events.push(eventData);
    
    // Update room event count
    room.event_count = (room.event_count || 0) + 1;
    
    // Notify room members
    io.to(roomId).emit("new_event", {
      roomId,
      event: eventData,
      creator,
      timestamp: new Date()
    });
    
    // Store notifications for offline members
    room.members.forEach(member => {
      if (member !== creator) {
        const notification = {
          id: uuidv4(),
          type: 'new_event',
          recipient: member,
          sender: creator,
          message: `${creator} created a new event: ${title}`,
          data: { eventId: eventData.id, roomId },
          timestamp: new Date(),
          read: false
        };
        db.notifications.push(notification);
      }
    });
    
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
    
    // Check if room exists
    const room = db.rooms.find(r => r.id === roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Get events for this room
    const events = db.events.filter(e => e.roomId === roomId && e.status !== 'cancelled');
    
    // Sort by date (upcoming first)
    events.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Get attendance for each event
    const eventsWithAttendance = events.map(event => {
      const attendees = db.eventAttendees.filter(ea => ea.eventId === event.id);
      const attending = attendees.filter(a => a.status === 'attending');
      const interested = attendees.filter(a => a.status === 'interested');
      const maybe = attendees.filter(a => a.status === 'maybe');
      
      return {
        id: event.id,
        title: event.title,
        date: event.date,
        location: event.location,
        description: event.description,
        image: event.image,
        creator: event.creator,
        attendees: attending.length,
        interested: interested.length,
        maybe: maybe.length,
        isPrivate: event.isPrivate,
        created_at: event.created_at,
        status: event.status,
        total_attendance: attending.length + interested.length + maybe.length
      };
    });
    
    res.json({ 
      success: true, 
      events: eventsWithAttendance,
      count: eventsWithAttendance.length
    });
  } catch (error) {
    console.error('Error fetching room events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post("/join-event", authenticate, (req, res) => {
  try {
    const { eventId, userId, status = 'attending' } = req.body;
    
    if (!eventId || !userId) {
      return res.status(400).json({ error: 'Event ID and User ID are required' });
    }
    
    // Find event
    const event = db.events.find(e => e.id === eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Check if event is cancelled
    if (event.status === 'cancelled') {
      return res.status(400).json({ error: 'This event has been cancelled' });
    }
    
    // Check if user is already attending with any status
    const existingIndex = db.eventAttendees.findIndex(
      ea => ea.eventId === eventId && ea.userId === userId
    );
    
    if (existingIndex !== -1) {
      // Update existing attendance
      const oldStatus = db.eventAttendees[existingIndex].status;
      db.eventAttendees[existingIndex].status = status;
      db.eventAttendees[existingIndex].updated_at = new Date();
      
      // Update event counts
      if (oldStatus === 'attending') event.attendees = Math.max(0, (event.attendees || 1) - 1);
      if (oldStatus === 'interested') event.interested = Math.max(0, (event.interested || 1) - 1);
      if (oldStatus === 'maybe') event.maybe = Math.max(0, (event.maybe || 1) - 1);
    } else {
      // Add new attendee
      db.eventAttendees.push({
        id: uuidv4(),
        eventId,
        userId,
        status: status,
        joined_at: new Date(),
        updated_at: new Date()
      });
    }
    
    // Update event counts for new status
    if (status === 'attending') event.attendees = (event.attendees || 0) + 1;
    if (status === 'interested') event.interested = (event.interested || 0) + 1;
    if (status === 'maybe') event.maybe = (event.maybe || 0) + 1;
    
    event.updated_at = new Date();
    
    // Notify room members
    io.to(event.roomId).emit("event_updated", {
      roomId: event.roomId,
      event: {
        id: event.id,
        title: event.title,
        attendees: event.attendees,
        interested: event.interested,
        maybe: event.maybe,
        updated_at: event.updated_at
      },
      user: userId,
      status: status,
      action: existingIndex !== -1 ? 'updated' : 'joined'
    });
    
    // Notify event creator
    if (event.creator !== userId) {
      const creatorSocket = findSocketByUsername(event.creator);
      if (creatorSocket) {
        creatorSocket.emit("event_attendance_update", {
          eventId,
          userId,
          status,
          eventTitle: event.title
        });
      }
      
      // Store notification
      const notification = {
        id: uuidv4(),
        type: 'event_join',
        recipient: event.creator,
        sender: userId,
        message: `${userId} ${status} your event "${event.title}"`,
        data: { eventId, status },
        timestamp: new Date(),
        read: false
      };
      db.notifications.push(notification);
    }
    
    res.json({ 
      success: true, 
      message: `Successfully ${status} event`,
      attendance: {
        attending: event.attendees,
        interested: event.interested,
        maybe: event.maybe,
        total: event.attendees + event.interested + event.maybe
      }
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
          profile_picture: user ? user.profile_picture : null,
          joined_at: ea.joined_at,
          user_status: user ? user.status : 'offline'
        };
      });
    
    // Group by status
    const attending = attendees.filter(a => a.status === 'attending');
    const interested = attendees.filter(a => a.status === 'interested');
    const maybe = attendees.filter(a => a.status === 'maybe');
    
    res.json({ 
      success: true, 
      attendees: {
        all: attendees,
        attending,
        interested,
        maybe
      },
      counts: {
        attending: attending.length,
        interested: interested.length,
        maybe: maybe.length,
        total: attendees.length
      }
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
    
    // Get room info
    const room = db.rooms.find(r => r.id === event.roomId);
    
    // Get attendees
    const attendees = db.eventAttendees.filter(ea => ea.eventId === eventId);
    const attending = attendees.filter(a => a.status === 'attending');
    const interested = attendees.filter(a => a.status === 'interested');
    const maybe = attendees.filter(a => a.status === 'maybe');
    
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
        attendees: attending.length,
        interested: interested.length,
        maybe: maybe.length,
        isPrivate: event.isPrivate,
        created_at: event.created_at,
        updated_at: event.updated_at,
        status: event.status,
        roomId: event.roomId,
        roomName: room ? room.name : 'Unknown Room'
      },
      attendance: {
        attending: attending.length,
        interested: interested.length,
        maybe: maybe.length,
        total: attending.length + interested.length + maybe.length
      }
    });
  } catch (error) {
    console.error('Error fetching event details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update event
app.post("/update-event", authenticate, (req, res) => {
  try {
    const { eventId, updates } = req.body;
    
    const event = db.events.find(e => e.id === eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Check if user is event creator
    const sessionId = req.headers["x-session-id"];
    const session = sessions.get(sessionId);
    if (!session || session.user.username !== event.creator) {
      return res.status(403).json({ error: 'Only the event creator can update the event' });
    }
    
    // Update event
    Object.keys(updates).forEach(key => {
      if (key !== 'id' && key !== 'creator' && key !== 'created_at') {
        event[key] = updates[key];
      }
    });
    
    event.updated_at = new Date();
    
    // Notify room members
    io.to(event.roomId).emit("event_updated", {
      roomId: event.roomId,
      event: event,
      updatedBy: session.user.username
    });
    
    res.json({
      success: true,
      message: 'Event updated successfully',
      event: event
    });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel event
app.post("/cancel-event", authenticate, (req, res) => {
  try {
    const { eventId } = req.body;
    
    const event = db.events.find(e => e.id === eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Check if user is event creator
    const sessionId = req.headers["x-session-id"];
    const session = sessions.get(sessionId);
    if (!session || session.user.username !== event.creator) {
      return res.status(403).json({ error: 'Only the event creator can cancel the event' });
    }
    
    event.status = 'cancelled';
    event.updated_at = new Date();
    
    // Notify room members
    io.to(event.roomId).emit("event_cancelled", {
      roomId: event.roomId,
      eventId,
      eventTitle: event.title,
      cancelledBy: session.user.username
    });
    
    // Store notifications for attendees
    const attendees = db.eventAttendees.filter(ea => ea.eventId === eventId);
    attendees.forEach(attendee => {
      if (attendee.userId !== session.user.username) {
        const notification = {
          id: uuidv4(),
          type: 'event_cancelled',
          recipient: attendee.userId,
          sender: session.user.username,
          message: `${session.user.username} cancelled the event "${event.title}"`,
          data: { eventId },
          timestamp: new Date(),
          read: false
        };
        db.notifications.push(notification);
      }
    });
    
    res.json({
      success: true,
      message: 'Event cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== STATISTICS ROUTES =====
app.get("/stats/global", (req, res) => {
  const stats = {
    total_users: db.users.length,
    total_rooms: db.rooms.length,
    total_events: db.events.length,
    total_messages: db.messages.length + db.privateMessages.length,
    online_users: Array.from(db.userStatus.values()).filter(s => s.status === 'online').length,
    active_rooms: db.rooms.filter(r => r.is_active !== false).length,
    upcoming_events: db.events.filter(e => e.status === 'upcoming' && new Date(e.date) > new Date()).length,
    live_events: db.events.filter(e => e.status === 'upcoming' && 
      new Date(e.date) <= new Date() && 
      new Date(e.date) > new Date(Date.now() - 24 * 60 * 60 * 1000)).length
  };
  
  res.json({ success: true, stats });
});

app.get("/stats/user/:username", authenticate, (req, res) => {
  const { username } = req.params;
  
  const user = db.users.find(u => u.username === username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const userRooms = db.rooms.filter(r => r.members && r.members.includes(username));
  const userEvents = db.events.filter(e => e.creator === username);
  const attendingEvents = db.eventAttendees.filter(ea => ea.userId === username && ea.status === 'attending').length;
  
  const stats = {
    account_age: Math.floor((new Date() - new Date(user.created_at)) / (1000 * 60 * 60 * 24)),
    rooms_joined: userRooms.length,
    events_created: userEvents.length,
    events_attending: attendingEvents,
    friends_count: db.friendships.filter(f => f.user1 === username || f.user2 === username).length,
    messages_sent: db.messages.filter(m => m.sender === username).length + 
                  db.privateMessages.filter(m => m.sender === username).length,
    last_seen: user.last_seen,
    status: user.status
  };
  
  res.json({ success: true, stats });
});

// ===== SOCKET.IO EVENT HANDLERS =====
io.on("connection", (socket) => {
  console.log(`🔗 New connection: ${socket.username} (${socket.id})`);
  
  // Send welcome message
  socket.emit("connected", { 
    username: socket.username,
    timestamp: new Date(),
    onlineUsers: Array.from(db.userStatus.values()).filter(s => s.status === 'online').length
  });
  
  // Update user's rooms list
  const userRooms = db.rooms.filter(room => 
    room.members && room.members.includes(socket.username)
  );
  
  userRooms.forEach(room => {
    socket.join(room.id);
  });
  
  // Handle room joining
  socket.on("join room", ({ roomId, username }) => {
    console.log(`🚀 ${username} joining room: ${roomId}`);
    
    // Leave any previous rooms (except user's own room)
    const previousRooms = Array.from(socket.rooms).filter(room => 
      room !== socket.id && room !== `user_${socket.username}`
    );
    
    // Join new room
    socket.join(roomId);
    socket.join(`user_${socket.username}`);
    
    // Get room info
    const room = db.rooms.find((r) => r.id === roomId);
    if (room) {
      // Send room info
      socket.emit("room info", {
        id: room.id,
        name: room.name,
        invite_code: room.invite_code,
        created_by: room.created_by,
        created_at: room.created_at,
        description: room.description || '',
        member_count: room.members ? room.members.length : 0
      });
      
      // Send room members
      const members = (room.members || []).map((member) => {
        const user = db.users.find((u) => u.username === member);
        const status = db.userStatus.get(member);
        return {
          username: member,
          status: status ? status.status : (user ? user.status : "offline"),
          profile_picture: user ? user.profile_picture : null,
          last_seen: user ? user.last_seen : null
        };
      });
      
      socket.emit("room members", members);
      
      // Send recent messages (last 100)
      const messages = db.messages
        .filter((m) => m.room_id === roomId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .slice(-100);
      
      socket.emit("load messages", messages);
      
      // Send room events
      const events = db.events
        .filter(e => e.roomId === roomId && e.status !== 'cancelled')
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      
      socket.emit("room_events", events);
      
      // Notify other room members
      socket.to(roomId).emit("user_joined", {
        username,
        timestamp: new Date(),
        userInfo: {
          username,
          status: 'online',
          profile_picture: db.users.find(u => u.username === username)?.profile_picture
        }
      });
    }
  });
  
  // Handle chat messages
  socket.on("chat message", (data) => {
    const { room_id, text, sender, time } = data;
    
    if (!room_id || !text || !sender) {
      return;
    }
    
    console.log(`💬 ${sender} in room ${room_id}: ${text.substring(0, 50)}...`);
    
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
    
    // Store offline notifications for users not in the room
    const room = db.rooms.find(r => r.id === room_id);
    if (room && room.members) {
      room.members.forEach(member => {
        if (member !== sender) {
          const memberSocket = findSocketByUsername(member);
          if (!memberSocket || !memberSocket.rooms.has(room_id)) {
            // User is offline or not in room
            const notification = {
              id: uuidv4(),
              type: 'offline_group_message',
              recipient: member,
              sender: sender,
              message: text.length > 50 ? text.substring(0, 50) + '...' : text,
              data: { roomId: room_id, roomName: room.name },
              timestamp: new Date(),
              read: false
            };
            db.notifications.push(notification);
          }
        }
      });
    }
  });
  
  // Handle private messages
  socket.on("private message", (data) => {
    const { sender, receiver, text, time } = data;
    
    if (!sender || !receiver || !text) {
      return;
    }
    
    console.log(`🔒 ${sender} to ${receiver}: ${text.substring(0, 50)}...`);
    
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
    
    // Store offline notification if receiver is offline
    if (!receiverSocket) {
      const notification = {
        id: uuidv4(),
        type: 'offline_private_message',
        recipient: receiver,
        sender: sender,
        message: text.length > 50 ? text.substring(0, 50) + '...' : text,
        timestamp: new Date(),
        read: false
      };
      db.notifications.push(notification);
    }
  });
  
  // Handle typing indicator
  socket.on("typing", ({ roomId, username, isTyping }) => {
    socket.to(roomId).emit("user_typing", { username, isTyping });
  });
  
  // Handle get room members request
  socket.on("get room members", ({ roomId }) => {
    const room = db.rooms.find((r) => r.id === roomId);
    if (room) {
      const members = (room.members || []).map((member) => {
        const user = db.users.find((u) => u.username === member);
        const status = db.userStatus.get(member);
        return {
          username: member,
          status: status ? status.status : (user ? user.status : "offline"),
          profile_picture: user ? user.profile_picture : null,
          last_seen: user ? user.last_seen : null
        };
      });
      socket.emit("room members", members);
    }
  });
  
  // Handle get room info request
  socket.on("get room info", ({ roomId }) => {
    const room = db.rooms.find((r) => r.id === roomId);
    if (room) {
      socket.emit("room info", {
        id: room.id,
        name: room.name,
        invite_code: room.invite_code,
        created_by: room.created_by,
        created_at: room.created_at,
        description: room.description || '',
        member_count: room.members ? room.members.length : 0
      });
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
    console.log(`✅ ${socket.username} marking as read: ${type} from ${sender} in ${roomId}`);
    
    // Notify sender that messages were read
    if (type === 'private' && sender) {
      const senderSocket = findSocketByUsername(sender);
      if (senderSocket) {
        senderSocket.emit("unread_cleared", { 
          type, 
          sender: socket.username,
          receiver: sender 
        });
      }
    } else if (type === 'group' && roomId) {
      io.to(roomId).emit("unread_cleared", { 
        type, 
        sender: socket.username,
        roomId 
      });
    }
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
    
    // Notify all room members
    io.to(roomId).emit("new_event", { 
      roomId, 
      event,
      timestamp: new Date()
    });
  });
  
  socket.on("join_event", (data) => {
    const { eventId, userId, roomId, status = 'attending' } = data;
    console.log(`✅ ${userId} ${status} event ${eventId}`);
    
    // Update event in database (handled by HTTP route)
    // Just forward the notification
    io.to(roomId).emit("event_attendance", { 
      eventId, 
      userId, 
      status,
      timestamp: new Date()
    });
  });
  
  socket.on("event_message", (data) => {
    const { eventId, sender, message, roomId } = data;
    console.log(`💬 Event chat: ${sender} in ${eventId}: ${message.substring(0, 30)}...`);
    
    // Broadcast to all users in the room
    io.to(roomId).emit("event_message", {
      eventId,
      sender,
      message,
      timestamp: new Date(),
      roomId
    });
  });
  
  // Handle user status update
  socket.on("update_status", ({ status }) => {
    const user = db.users.find(u => u.username === socket.username);
    if (user) {
      user.status = status;
      user.last_seen = new Date();
      
      // Update userStatus map
      const userStatus = db.userStatus.get(socket.username);
      if (userStatus) {
        userStatus.status = status;
        userStatus.lastSeen = new Date();
      }
      
      // Notify friends and room members
      const userRooms = db.rooms.filter(room => 
        room.members && room.members.includes(socket.username)
      );
      
      userRooms.forEach(room => {
        io.to(room.id).emit("user_status_update", {
          username: socket.username,
          status,
          last_seen: user.last_seen
        });
      });
      
      // Notify friends
      const friendships = db.friendships.filter(f => 
        f.user1 === socket.username || f.user2 === socket.username
      );
      
      friendships.forEach(friendship => {
        const friendUsername = friendship.user1 === socket.username ? 
          friendship.user2 : friendship.user1;
        const friendSocket = findSocketByUsername(friendUsername);
        if (friendSocket) {
          friendSocket.emit("friend_status_update", {
            username: socket.username,
            status,
            last_seen: user.last_seen
          });
        }
      });
    }
  });
  
  // Handle ping (keep-alive)
  socket.on("ping", () => {
    socket.emit("pong", { timestamp: new Date() });
  });
  
  // Handle disconnect
  socket.on("disconnect", (reason) => {
    console.log(`🔌 ${socket.username} disconnected: ${reason}`);
    
    // Update user status
    const user = db.users.find((u) => u.username === socket.username);
    if (user) {
      user.status = "offline";
      user.last_seen = new Date();
    }
    
    // Remove from userStatus map
    db.userStatus.delete(socket.username);
    
    // Notify friends and room members
    const userRooms = db.rooms.filter(room => 
      room.members && room.members.includes(socket.username)
    );
    
    userRooms.forEach(room => {
      socket.to(room.id).emit("user_disconnected", {
        username: socket.username,
        roomId: room.id,
        timestamp: new Date(),
      });
    });
    
    // Notify friends
    const friendships = db.friendships.filter(f => 
      f.user1 === socket.username || f.user2 === socket.username
    );
    
    friendships.forEach(friendship => {
      const friendUsername = friendship.user1 === socket.username ? 
        friendship.user2 : friendship.user1;
      const friendSocket = findSocketByUsername(friendUsername);
      if (friendSocket) {
        friendSocket.emit("friend_offline", {
          username: socket.username,
          timestamp: new Date()
        });
      }
    });
  });
});

// Helper function to find socket by username
function findSocketByUsername(username) {
  if (!username) return null;
  
  const sockets = Array.from(io.sockets.sockets.values());
  return sockets.find((s) => s.username === username);
}

// ===== STATIC FILE SERVING =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/service-worker.js", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "service-worker.js"));
});

app.get("/manifest.json", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "manifest.json"));
});

// Serve PWA icons
app.get("/icon-:size.png", (req, res) => {
  const size = req.params.size;
  const iconPath = path.join(__dirname, "public", `icon-${size}.png`);
  
  if (fs.existsSync(iconPath)) {
    res.sendFile(iconPath);
  } else {
    // Fallback to a default icon if specific size doesn't exist
    const defaultIconPath = path.join(__dirname, "public", "icon-192x192.png");
    if (fs.existsSync(defaultIconPath)) {
      res.sendFile(defaultIconPath);
    } else {
      res.status(404).send("Icon not found");
    }
  }
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
  console.log(`📱 PWA enabled with service worker`);
  console.log(`🎪 Event system active`);
});
