// database.js - MongoDB Version for Production - FIXED
const mongoose = require('mongoose');

// MongoDB Connection String
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://mitsosjinavos_db_user:81dUjNKxRBiwQ2R5@ratscape.zgvlxzs.mongodb.net/ratscape?retryWrites=true&w=majority';

// ===== SCHEMAS =====

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  status: { type: String, default: 'Online' },
  created_at: { type: Date, default: Date.now }
});

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  invite_code: { type: String, required: true, unique: true },
  created_by: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

const roomMemberSchema = new mongoose.Schema({
  room_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  username: { type: String, required: true },
  joined_at: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  room_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  sender: { type: String, required: true },
  text: { type: String, required: true },
  time: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

const privateMessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  text: { type: String, required: true },
  time: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

const friendSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  status: { type: String, default: 'pending' },
  created_at: { type: Date, default: Date.now }
});

const sessionSchema = new mongoose.Schema({
  session_id: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  last_accessed: { type: Date, default: Date.now }
});

// ===== MODELS =====
const User = mongoose.model('User', userSchema);
const Room = mongoose.model('Room', roomSchema);
const RoomMember = mongoose.model('RoomMember', roomMemberSchema);
const Message = mongoose.model('Message', messageSchema);
const PrivateMessage = mongoose.model('PrivateMessage', privateMessageSchema);
const Friend = mongoose.model('Friend', friendSchema);
const Session = mongoose.model('Session', sessionSchema);

// ===== DATABASE HELPERS =====

const dbHelpers = {
  // User methods
  createUser: async function(email, username, password) {
    const user = new User({ email, username, password });
    await user.save();
    console.log("✅ User created permanently:", username);
  },

  findUserByEmail: async function(email) {
    return await User.findOne({ email });
  },

  findUserByUsername: async function(username) {
    return await User.findOne({ username });
  },

  saveUser: async function(user) {
    await User.updateOne({ username: user.username }, { status: user.status });
  },

  getAllUsers: async function() {
    return await User.find({});
  },

  // Room methods
  createRoom: async function(name, createdBy) {
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const room = new Room({ name, invite_code: inviteCode, created_by: createdBy });
    await room.save();
    return { roomId: room._id, inviteCode };
  },

  getRoomByInviteCode: async function(inviteCode) {
    return await Room.findOne({ invite_code: inviteCode });
  },

  getRoomById: async function(roomId) {
    return await Room.findById(roomId);
  },

  addUserToRoom: async function(roomId, username) {
    const existing = await RoomMember.findOne({ room_id: roomId, username });
    if (!existing) {
      const member = new RoomMember({ room_id: roomId, username });
      await member.save();
    }
  },

  isUserInRoom: async function(roomId, username) {
    const member = await RoomMember.findOne({ room_id: roomId, username });
    return !!member;
  },

  getUserRooms: async function(username) {
    const members = await RoomMember.find({ username }).populate('room_id');
    return members.map(m => ({
      id: m.room_id._id,
      name: m.room_id.name,
      invite_code: m.room_id.invite_code,
      created_by: m.room_id.created_by,
      created_at: m.room_id.created_at
    }));
  },

  getRoomMembers: async function(roomId) {
    const members = await RoomMember.find({ room_id: roomId });
    return members.map(m => ({ username: m.username, joined_at: m.joined_at }));
  },

  // Message methods
  saveMessage: async function(message) {
    const msg = new Message({
      room_id: message.room_id,
      sender: message.sender,
      text: message.text,
      time: message.time
    });
    await msg.save();
  },

  getRoomMessages: async function(roomId, userJoinedAt = null) {
    const query = { room_id: roomId };
    if (userJoinedAt) {
      query.created_at = { $gte: new Date(userJoinedAt) };
    }
    return await Message.find(query).sort({ created_at: 1 });
  },

  // Friend methods
  sendFriendRequest: async function(fromUser, toUser) {
    const existing = await Friend.findOne({
      $or: [
        { sender: fromUser, receiver: toUser },
        { sender: toUser, receiver: fromUser }
      ]
    });
    
    if (!existing) {
      const friend = new Friend({ sender: fromUser, receiver: toUser, status: 'pending' });
      await friend.save();
      console.log(`✅ Friend request: ${fromUser} → ${toUser}`);
    }
  },

  getPendingRequests: async function(username) {
    const requests = await Friend.find({ receiver: username, status: 'pending' });
    return requests.map(r => ({ friend_username: r.sender, created_at: r.created_at }));
  },

  respondToFriendRequest: async function(username, friendUsername, accept) {
    const newStatus = accept ? 'accepted' : 'rejected';
    await Friend.updateOne(
      { sender: friendUsername, receiver: username, status: 'pending' },
      { status: newStatus }
    );
    console.log(`✅ ${username} ${accept ? 'accepted' : 'rejected'} request from ${friendUsername}`);
  },

  getFriends: async function(username) {
    const friends = await Friend.find({
      $or: [
        { sender: username, status: 'accepted' },
        { receiver: username, status: 'accepted' }
      ]
    });
    
    return friends.map(f => ({
      friend_username: f.sender === username ? f.receiver : f.sender,
      created_at: f.created_at
    }));
  },

  areFriends: async function(user1, user2) {
    const friendship = await Friend.findOne({
      $or: [
        { sender: user1, receiver: user2, status: 'accepted' },
        { sender: user2, receiver: user1, status: 'accepted' }
      ]
    });
    return !!friendship;
  },

  hasPendingRequest: async function(user1, user2) {
    const request = await Friend.findOne({
      $or: [
        { sender: user1, receiver: user2, status: 'pending' },
        { sender: user2, receiver: user1, status: 'pending' }
      ]
    });
    return !!request;
  },

  removeFriend: async function(user1, user2) {
    await Friend.deleteOne({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    });
    console.log(`✅ Friendship removed: ${user1} ↔ ${user2}`);
  },

  // Private messages
  savePrivateMessage: async function(message) {
    const msg = new PrivateMessage({
      sender: message.sender,
      receiver: message.receiver,
      text: message.text,
      time: message.time
    });
    await msg.save();
  },

  getPrivateMessages: async function(user1, user2) {
    return await PrivateMessage.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    }).sort({ created_at: 1 });
  },

  // Session methods
  saveSession: async function(sessionId, sessionData) {
    await Session.updateOne(
      { session_id: sessionId },
      { 
        session_id: sessionId, 
        username: sessionData.username, 
        last_accessed: new Date() 
      },
      { upsert: true }
    );
  },

  getSession: async function(sessionId) {
    const session = await Session.findOne({ session_id: sessionId });
    if (session) {
      session.last_accessed = new Date();
      await session.save();
    }
    return session;
  },

  deleteSession: async function(sessionId) {
    await Session.deleteOne({ session_id: sessionId });
  },

  cleanupExpiredSessions: async function() {
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const expiredDate = new Date(Date.now() - oneWeek);
    await Session.deleteMany({ last_accessed: { $lt: expiredDate } });
  }
};

// 🔥 FIXED: Initialize database connection properly
async function initializeDatabase() {
  try {
    console.log("🔄 Connecting to MongoDB Atlas...");
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to MongoDB Atlas');
    console.log('✅ Database ready (MongoDB)');
    
    // Set up connection event handlers
    mongoose.connection.on('error', (err) => {
      console.error("❌ MongoDB connection error:", err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log("⚠️ MongoDB disconnected");
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log("✅ MongoDB reconnected");
    });
    
    return mongoose.connection;
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error);
    console.error("Connection string used:", MONGODB_URI.replace(/:[^:@]+@/, ':****@')); // Hide password
    throw error;
  }
}

module.exports = { dbHelpers, initializeDatabase };
