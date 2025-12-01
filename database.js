// database.js - FIXED MongoDB Version
const mongoose = require('mongoose');

// MongoDB Connection String - ΧΡΗΣΙΜΟΠΟΙΗΣΕ ΤΟ ΔΙΚΟ ΣΟΥ!
const MONGODB_URI = process.env.MONGODB_URI || 'YOUR_MONGODB_CONNECTION_STRING_HERE';

// ===== SCHEMAS =====

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  status: { type: String, default: 'Online' },
  created_at: { type: Date, default: Date.now }
});

const roomSchema = new mongoose.Schema({
  room_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  invite_code: { type: String, required: true, unique: true },
  created_by: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

const roomMemberSchema = new mongoose.Schema({
  room_id: { type: String, required: true },
  username: { type: String, required: true },
  joined_at: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  room_id: { type: String, required: true },
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

// ===== ΝΕΟ SCHEMA: UNREAD MESSAGES =====
const unreadMessageSchema = new mongoose.Schema({
  user: { type: String, required: true, index: true },
  sender: { type: String, required: true },
  room_id: { type: String },
  message_id: { type: String },
  type: { type: String, enum: ['private', 'group'], required: true },
  count: { type: Number, default: 1 },
  last_message: { type: String },
  last_message_time: { type: Date, default: Date.now },
  created_at: { type: Date, default: Date.now }
});

// ===== MODELS =====
const User = mongoose.model('User', userSchema);
const Room = mongoose.model('Room', roomSchema);
const RoomMember = mongoose.model('RoomMember', roomMemberSchema);
const Message = mongoose.model('Message', messageSchema);
const PrivateMessage = mongoose.model('PrivateMessage', privateMessageSchema);
const Friend = mongoose.model('Friend', friendSchema);
const Session = mongoose.model('Session', sessionSchema);
const UnreadMessage = mongoose.model('UnreadMessage', unreadMessageSchema);

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
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const room = new Room({ 
      room_id: roomId,
      name, 
      invite_code: inviteCode, 
      created_by: createdBy 
    });
    await room.save();
    
    return { roomId: roomId, inviteCode };
  },

  getRoomByInviteCode: async function(inviteCode) {
    const room = await Room.findOne({ invite_code: inviteCode });
    if (room) {
      return {
        id: room.room_id,
        name: room.name,
        invite_code: room.invite_code,
        created_by: room.created_by,
        created_at: room.created_at
      };
    }
    return null;
  },

  getRoomById: async function(roomId) {
    const room = await Room.findOne({ room_id: roomId });
    if (room) {
      return {
        id: room.room_id,
        name: room.name,
        invite_code: room.invite_code,
        created_by: room.created_by,
        created_at: room.created_at
      };
    }
    return null;
  },

  addUserToRoom: async function(roomId, username) {
    const existing = await RoomMember.findOne({ room_id: roomId, username });
    if (!existing) {
      const member = new RoomMember({ room_id: roomId, username });
      await member.save();
    }
  },

  // 🔥 ΝΕΟ: Αφαίρεση χρήστη από δωμάτιο
  removeUserFromRoom: async function(roomId, username) {
    await RoomMember.deleteOne({ room_id: roomId, username });
    console.log(`✅ ${username} removed from room ${roomId}`);
  },

  isUserInRoom: async function(roomId, username) {
    const member = await RoomMember.findOne({ room_id: roomId, username });
    return !!member;
  },

  getUserRooms: async function(username) {
    const members = await RoomMember.find({ username });
    const rooms = [];
    
    for (const member of members) {
      const room = await Room.findOne({ room_id: member.room_id });
      if (room) {
        rooms.push({
          id: room.room_id,
          name: room.name,
          invite_code: room.invite_code,
          created_by: room.created_by,
          created_at: room.created_at
        });
      }
    }
    
    return rooms;
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
  },

  // ===== ΝΕΕΣ ΜΕΘΟΔΟΙ: UNREAD MESSAGES =====
  
  addUnreadMessage: async function(user, sender, type, room_id = null, message_data = null) {
    try {
      const query = { 
        user, 
        sender,
        type,
        room_id: room_id || null
      };
      
      const existing = await UnreadMessage.findOne(query);
      
      if (existing) {
        existing.count += 1;
        existing.last_message = message_data?.text || "New message";
        existing.last_message_time = new Date();
        await existing.save();
        console.log(`✅ Updated unread for ${user} from ${sender}: ${existing.count} messages`);
        return existing;
      } else {
        const unread = new UnreadMessage({
          user,
          sender,
          type,
          room_id,
          last_message: message_data?.text || "New message",
          message_id: message_data?.message_id || `msg_${Date.now()}`
        });
        await unread.save();
        console.log(`✅ Created unread for ${user} from ${sender}`);
        return unread;
      }
    } catch (error) {
      console.error("❌ Error adding unread message:", error);
      return null;
    }
  },

  getUnreadMessages: async function(user) {
    try {
      const unreads = await UnreadMessage.find({ user }).sort({ last_message_time: -1 });
      return unreads;
    } catch (error) {
      console.error("❌ Error getting unread messages:", error);
      return [];
    }
  },

  getUnreadCountForUser: async function(user, sender = null, type = null, room_id = null) {
    try {
      const query = { user };
      if (sender) query.sender = sender;
      if (type) query.type = type;
      if (room_id) query.room_id = room_id;
      
      const unread = await UnreadMessage.findOne(query);
      return unread ? unread.count : 0;
    } catch (error) {
      console.error("❌ Error getting unread count:", error);
      return 0;
    }
  },

  markAsRead: async function(user, sender = null, type = null, room_id = null) {
    try {
      const query = { user };
      if (sender) query.sender = sender;
      if (type) query.type = type;
      if (room_id) query.room_id = room_id;
      
      const result = await UnreadMessage.deleteMany(query);
      console.log(`✅ Marked as read for ${user}: ${result.deletedCount} messages`);
      return result.deletedCount > 0;
    } catch (error) {
      console.error("❌ Error marking messages as read:", error);
      return false;
    }
  },

  clearAllUnread: async function(user) {
    try {
      const result = await UnreadMessage.deleteMany({ user });
      console.log(`✅ Cleared all unread for ${user}: ${result.deletedCount} messages`);
      return result.deletedCount > 0;
    } catch (error) {
      console.error("❌ Error clearing all unread messages:", error);
      return false;
    }
  },

  getUnreadSummary: async function(user) {
    try {
      const unreads = await UnreadMessage.find({ user });
      
      const summary = {
        total: 0,
        private: {},
        groups: {}
      };
      
      unreads.forEach(unread => {
        summary.total += unread.count;
        
        if (unread.type === 'private') {
          summary.private[unread.sender] = unread.count;
        } else if (unread.type === 'group') {
          if (!summary.groups[unread.room_id]) {
            summary.groups[unread.room_id] = 0;
          }
          summary.groups[unread.room_id] += unread.count;
        }
      });
      
      return summary;
    } catch (error) {
      console.error("❌ Error getting unread summary:", error);
      return { total: 0, private: {}, groups: {} };
    }
  }
};

// Initialize database connection
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
    console.error("Connection string used:", MONGODB_URI.replace(/:[^:@]+@/, ':****@'));
    throw error;
  }
}

module.exports = { dbHelpers, initializeDatabase };
