const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const { dbHelpers, db } = require("./database");

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(process.cwd())));

app.get("/", (req: any, res: any) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

// Enhanced session management
const userSessions = new Map(); // sessionId -> { username, createdAt }
const onlineUsers = new Map(); // username -> { socketId, currentRoom, sessionId }
const roomSockets = new Map(); // roomId -> Set of socketIds

// Session middleware - FIXED VERSION
function validateSession(req: any, res: any, next: any) {
  const sessionId = req.headers["x-session-id"];
  const username = req.params.username || req.body.username;

  // For some routes, username might not be in params or body
  if (!sessionId) {
    return res.status(401).json({ success: false, error: "Session required" });
  }

  const session = userSessions.get(sessionId);
  if (!session) {
    return res.status(401).json({ success: false, error: "Invalid session" });
  }

  // If username is provided, verify it matches session
  if (username && session.username !== username) {
    return res.status(401).json({ success: false, error: "Session mismatch" });
  }

  // Check session expiration (7 days)
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - session.createdAt > oneWeek) {
    userSessions.delete(sessionId);
    return res.status(401).json({ success: false, error: "Session expired" });
  }

  // Update session timestamp on successful validation
  session.createdAt = Date.now();

  next();
}

function getErrorMessage(error: any): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// Debug endpoint
app.get("/debug-users", async (req: any, res: any) => {
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

// Authentication routes
app.post("/register", async (req: any, res: any) => {
  try {
    const { email, username, password } = req.body;

    console.log("📝 Registration attempt:", { email, username });

    if (!email || !username || !password) {
      return res.status(400).json({ success: false, error: "All fields are required" });
    }

    if (password.length < 3) {
      return res
        .status(400)
        .json({ success: false, error: "Password must be at least 3 characters" });
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

// FIXED login endpoint
app.post("/login", async (req: any, res: any) => {
  try {
    const { email, password } = req.body;

    console.log("🔐 Login attempt for email:", email);

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

    // Create session
    const sessionId = "session_" + Date.now() + "_" + Math.random().toString(36).substring(2, 15);
    userSessions.set(sessionId, {
      username: user.username,
      createdAt: Date.now(),
    });

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
app.get("/verify-session/:username", async (req: any, res: any) => {
  try {
    const { username } = req.params;
    const sessionId = req.headers["x-session-id"];

    console.log("🔍 Verifying session for:", username, "session:", sessionId);

    if (!sessionId) {
      return res.status(401).json({ success: false, error: "Session ID required" });
    }

    const session = userSessions.get(sessionId);
    const user = await dbHelpers.findUserByUsername(username);

    if (session && session.username === username && user) {
      console.log("✅ Session verified:", username);

      // Update session timestamp
      session.createdAt = Date.now();

      res.json({
        success: true,
        user: {
          username: user.username,
          email: user.email,
        },
      });
    } else {
      console.log("❌ Invalid session for:", username);
      if (session) {
        userSessions.delete(sessionId);
      }
      res.status(401).json({ success: false, error: "Invalid session" });
    }
  } catch (error) {
    console.error("❌ Error verifying session:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

// Logout endpoint
app.post("/logout", async (req: any, res: any) => {
  try {
    const { username } = req.body;
    const sessionId = req.headers["x-session-id"];

    if (sessionId) {
      userSessions.delete(sessionId);
    }

    if (username) {
      await dbHelpers.saveUser({ username, status: "Offline" });
    }

    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("❌ Error during logout:", error);
    res.json({ success: true }); // Always return success for logout
  }
});

// Protected routes with session validation
app.post("/create-room", validateSession, async (req: any, res: any) => {
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

app.post("/join-room", validateSession, async (req: any, res: any) => {
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

app.get("/user-rooms/:username", validateSession, async (req: any, res: any) => {
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
app.post("/send-friend-request", validateSession, async (req: any, res: any) => {
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

app.post("/respond-friend-request", validateSession, async (req: any, res: any) => {
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

app.get("/pending-requests/:username", validateSession, async (req: any, res: any) => {
  try {
    const { username } = req.params;
    const requests = await dbHelpers.getPendingRequests(username);
    res.json({ success: true, requests });
  } catch (error) {
    console.error("❌ Error getting pending requests:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.get("/friends/:username", validateSession, async (req: any, res: any) => {
  try {
    const { username } = req.params;
    const friends = await dbHelpers.getFriends(username);
    res.json({ success: true, friends });
  } catch (error) {
    console.error("❌ Error getting friends:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

app.post("/remove-friend", validateSession, async (req: any, res: any) => {
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

app.get("/private-messages/:user1/:user2", validateSession, async (req: any, res: any) => {
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

// Socket.IO connection with session validation
io.on("connection", async (socket: any) => {
  console.log("🔗 User connected:", socket.id);

  let currentUsername: string | null = null;
  let currentRoomId: string | null = null;
  let currentSessionId: string | null = null;

  socket.on("authenticate", async (data: { username: string; sessionId: string }) => {
    try {
      const { username, sessionId } = data;

      const session = userSessions.get(sessionId);
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
      console.error("❌ Error during authentication:", error);
      socket.emit("session_expired");
    }
  });

  socket.on("join room", async (data: { roomId: string; username: string; sessionId: string }) => {
    try {
      const { roomId, username, sessionId } = data;

      // Validate session
      const session = userSessions.get(sessionId);
      if (!session || session.username !== username) {
        socket.emit("session_expired");
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

      const member = await dbHelpers.getRoomMembers(roomId);
      const userJoinedAt = member.find((m) => m.username === username)?.joined_at;
      const messages = await dbHelpers.getRoomMessages(roomId, userJoinedAt);
      socket.emit("load messages", messages);

      const members = await dbHelpers.getRoomMembers(roomId);
      io.to(roomId).emit("room members", members);

      const room = await dbHelpers.getRoomById(roomId);
      socket.emit("room info", room);

      console.log(`💬 ${username} joined room:`, roomId);
    } catch (error) {
      console.error("❌ Error joining room:", getErrorMessage(error));
      socket.emit("error", { message: "Failed to join room" });
    }
  });

  socket.on("chat message", async (data: any) => {
    try {
      if (!currentRoomId || !currentUsername || !currentSessionId) {
        socket.emit("session_expired");
        return;
      }

      // Validate session for each message
      const session = userSessions.get(currentSessionId);
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
    } catch (error) {
      console.error("❌ Error saving message:", getErrorMessage(error));
    }
  });

  socket.on("private message", async (data: any) => {
    try {
      const { sender, receiver, text, time } = data;

      if (!currentSessionId) {
        socket.emit("session_expired");
        return;
      }

      // Validate session
      const session = userSessions.get(currentSessionId);
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
      console.log("🔒 Private message from:", sender, "to:", receiver);
    } catch (error) {
      console.error("❌ Error saving private message:", getErrorMessage(error));
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

      console.log("👤 User left:", currentUsername);
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

// Clean up expired sessions periodically
setInterval(
  () => {
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const [sessionId, session] of userSessions.entries()) {
      if (now - session.createdAt > oneWeek) {
        userSessions.delete(sessionId);
        console.log("🧹 Cleaned expired session:", sessionId);
      }
    }
  },
  60 * 60 * 1000
); // Run every hour

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 RatScape Server running on port ${PORT}`);
  console.log(`📱 Available at: http://localhost:${PORT}`);
  console.log(`💬 Enhanced security with session management`);
});
