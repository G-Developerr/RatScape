// server.js - FIXED FRIEND REQUESTS
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const { dbHelpers } = require("./database.js");

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["https://ratscape.onrender.com", "http://localhost:3000", "http://localhost:10000"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

app.use(cors({
  origin: ["https://ratscape.onrender.com", "http://localhost:3000"],
  credentials: true
}));
app.use(express.json());

app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/test", (req, res) => {
  res.sendFile(path.join(__dirname, "test.html"));
});

const userSessions = new Map();
const onlineUsers = new Map();
const roomSockets = new Map();

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

    await dbHelpers.updateSessionAccess(sessionId);
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
    });
  }
});

// Authentication routes
app.post("/register", async (req, res) => {
  try {
    const { email, username, password } = req.body;

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
      res.json({
        success: true,
        message: "Account created successfully! You can now login.",
      });
    } catch (createError) {
      return res.status(500).json({
        success: false,
        error: "Failed to create user account. Please try again.",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Internal server error during registration",
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password required" });
    }

    let user;
    try {
      user = await dbHelpers.findUserByEmail(email);
    } catch (dbError) {
      return res.status(500).json({
        success: false,
        error: "Database error during login",
      });
    }

    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }

    if (user.password !== password) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }

    const sessionId = "session_" + Date.now() + "_" + Math.random().toString(36).substring(2, 15);
    const sessionData = {
      username: user.username,
      createdAt: new Date().toISOString(),
    };

    await dbHelpers.saveSession(sessionId, sessionData);
    userSessions.set(sessionId, sessionData);

    try {
      await dbHelpers.saveUser({ username: user.username, status: "Online" });
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

    if (!sessionId) {
      return res.status(401).json({ success: false, error: "Session ID required" });
    }

    const session = await dbHelpers.getSession(sessionId) || userSessions.get(sessionId);
    const user = await dbHelpers.findUserByUsername(username);

    if (session && session.username === username && user) {
      await dbHelpers.updateSessionAccess(sessionId);
      
      res.json({
        success: true,
        user: {
          username: user.username,
          email: user.email,
        },
      });
    } else {
      if (session) {
        await dbHelpers.deleteSession(sessionId);
        userSessions.delete(sessionId);
      }
      res.status(401).json({ success: false, error: "Invalid session" });
    }
  } catch (error) {
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
      await dbHelpers.saveUser({ username, status: "Offline" });
    }

    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    res.json({ success: true });
  }
});

// Protected routes
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
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.get("/user-rooms/:username", validateSession, async (req, res) => {
  try {
    const { username } = req.params;
    const rooms = await dbHelpers.getUserRooms(username);
    res.json({ success: true, rooms });
  } catch (error) {
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

// Friend routes - COMPLETELY FIXED
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

    console.log(`🔄 Friend request response: ${username} responding to ${friendUsername}, accept: ${accept}`);

    await dbHelpers.respondToFriendRequest(username, friendUsername, accept);

    // Notify the sender that their request was accepted
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

// FIXED: Get pending requests (requests sent TO the user)
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

// Get sent requests (requests sent BY the user)
app.get("/sent-requests/:username", validateSession, async (req, res) => {
  try {
    const { username } = req.params;
    const requests = await dbHelpers.getSentRequests(username);
    res.json({ success: true, requests });
  } catch (error) {
    console.error("❌ Error getting sent requests:", error);
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

// Socket.IO connection
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

      socket.emit("load messages", messages);
      socket.emit("room members", members);
      socket.emit("room info", room);

      socket.to(roomId).emit("room members", members);

      console.log(`✅ ${username} joined room: ${room.name}`);
      
    } catch (error) {
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

      const receiverData = onlineUsers.get(receiver);
      if (receiverData) {
        io.to(receiverData.socketId).emit("private message", data);
      }

      socket.emit("private message", data);
    } catch (error) {
      console.error("❌ Error saving private message:", getErrorMessage(error));
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 RatScape Server running on port ${PORT}`);
  console.log(`📱 Available at: http://localhost:${PORT}`);
  console.log(`💬 Enhanced security with session management`);
});
