// database.js - RatScape MongoDB Database - ENHANCED VERSION WITH FILE STORAGE & EVENTS
const mongoose = require('mongoose');

// 🔥 ΣΗΜΑΝΤΙΚΟ: Χρησιμοποιεί το MONGODB_URI από το Render Environment
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ratscape';

console.log('🔍 Attempting to connect to MongoDB...');
console.log('📍 Connection string exists:', !!process.env.MONGODB_URI);

// ===== SCHEMAS =====

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    status: { type: String, default: 'Online' },
    profile_picture: { type: String, default: null },
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
    isFile: { type: Boolean, default: false },
    file_data: {
        fileId: { type: String },
        fileName: { type: String },
        fileType: { type: String },
        fileSize: { type: String },
        fileUrl: { type: String }
    },
    created_at: { type: Date, default: Date.now }
});

const privateMessageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    receiver: { type: String, required: true },
    text: { type: String, required: true },
    time: { type: String, required: true },
    isFile: { type: Boolean, default: false },
    file_data: {
        fileId: { type: String },
        fileName: { type: String },
        fileType: { type: String },
        fileSize: { type: String },
        fileUrl: { type: String }
    },
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

// 🔥 ΝΕΟ: FILE STORAGE SCHEMA
const fileSchema = new mongoose.Schema({
    file_id: { type: String, required: true, unique: true },
    room_id: { type: String },
    sender: { type: String, required: true },
    receiver: { type: String },
    file_name: { type: String, required: true },
    file_type: { type: String, required: true },
    file_size: { type: Number, required: true },
    file_data: { type: String, required: true }, // Base64 encoded
    created_at: { type: Date, default: Date.now }
});

// 🔥 ΝΕΟ: EVENTS SCHEMA - ΕΝΗΜΕΡΩΜΕΝΗ ΜΕ ΑΝΤΊΣΤΟΙΧΟ ΠΕΔΙΟ ID ΚΑΙ ROOM_ID
const eventSchema = new mongoose.Schema({
    event_id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    date: { type: Date, required: true },
    location: { type: String, required: true },
    created_by: { type: String, required: true },
    max_participants: { type: Number, default: 0 }, // 0 = unlimited
    participants: [{ type: String }], // Array of usernames
    is_public: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now },
    // 🔥 ΝΕΟ: Προσθήκη πεδίου για φωτογραφία event
    photo: { type: String, default: null }, // Base64 string
    // 🔥 ΚΡΙΤΙΚΗ ΠΡΟΣΘΗΚΗ: Προσθήκη πεδίου για room ID
    room_id: { type: String, default: null } // Αναφορά στο αντίστοιχο room
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
const File = mongoose.model('File', fileSchema); // 🔥 ΝΕΟ: File model
const Event = mongoose.model('Event', eventSchema); // 🔥 ΝΕΟ: Event model

// ===== DATABASE HELPERS =====

const dbHelpers = {
    // User methods
    createUser: async function(email, username, password, profile_picture = null) {
        const user = new User({
            email,
            username,
            password,
            profile_picture: profile_picture || null
        });
        await user.save();
        console.log("✅ User created permanently:", username);
        return user;
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

    updateUser: async function(username, updates) {
        const user = await User.findOne({ username });
        if (!user) return false;

        Object.keys(updates).forEach(key => {
            if (updates[key] !== undefined) {
                user[key] = updates[key];
            }
        });

        await user.save();
        return true;
    },

    updateUserPassword: async function(username, newPassword) {
        const user = await User.findOne({ username });
        if (!user) return false;

        user.password = newPassword;
        await user.save();
        return true;
    },

    getUserStats: async function(username) {
        const user = await User.findOne({ username });
        if (!user) return null;

        const friends = await this.getFriends(username);
        const rooms = await this.getUserRooms(username);

        const messages = await Message.countDocuments({
            $or: [
                { sender: username },
                { room_id: { $in: rooms.map(r => r.id) } }
            ]
        });

        return messages;
    },

    getUserProfilePicture: async function(username) {
        const user = await User.findOne({ username });
        return user ? user.profile_picture : null;
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
            time: message.time,
            isFile: message.isFile || false,
            file_data: message.file_data || null
        });
        await msg.save();
        return msg;
    },

    getRoomMessages: async function(roomId, userJoinedAt = null) {
        const query = { room_id: roomId };
        if (userJoinedAt) {
            query.created_at = { $gte: new Date(userJoinedAt) };
        }
        return await Message.find(query).sort({ created_at: 1 });
    },

    // 🔥 ΒΟΗΘΗΤΙΚΗ ΣΥΝΑΡΤΗΣΗ: Μορφοποίηση μεγέθους αρχείου
    formatFileSize: function(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    // 🔥 ΝΕΟ: File storage methods
    saveFile: async function(fileData) {
        try {
            const file = new File({
                file_id: fileData.fileId,
                room_id: fileData.roomId,
                sender: fileData.sender,
                receiver: fileData.receiver,
                file_name: fileData.fileName,
                file_type: fileData.fileType,
                file_size: fileData.fileSize,
                file_data: fileData.base64Data
            });
            await file.save();
            console.log(`✅ File saved: ${fileData.fileName} (${fileData.fileId})`);
            return file;
        } catch (error) {
            console.error("❌ Error saving file:", error);
            throw error;
        }
    },

    getFilesByRoom: async function(roomId) {
        return await File.find({ room_id: roomId }).sort({ created_at: -1 });
    },

    getFilesByUser: async function(username) {
        return await File.find({ 
            $or: [
                { sender: username },
                { receiver: username }
            ]
        }).sort({ created_at: -1 });
    },

    getFileById: async function(fileId) {
        return await File.findOne({ file_id: fileId });
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
        await Friend.updateOne({ sender: friendUsername, receiver: username, status: 'pending' }, { status: newStatus });
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
            time: message.time,
            isFile: message.isFile || false,
            file_data: message.file_data || null
        });
        await msg.save();
        return msg;
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
        await Session.updateOne({ session_id: sessionId }, {
            session_id: sessionId,
            username: sessionData.username,
            last_accessed: new Date()
        }, { upsert: true });
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

    // Unread Messages methods
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
                existing.last_message = (message_data && message_data.text) || "New message";
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
                    last_message: (message_data && message_data.text) || "New message",
                    message_id: (message_data && message_data.message_id) || `msg_${Date.now()}`
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
    },

    // 🔥 ΝΕΟ: Cleanup old files (optional, για διαχείριση χώρου)
    cleanupOldFiles: async function(days = 30) {
        try {
            const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
            const result = await File.deleteMany({ created_at: { $lt: cutoffDate } });
            console.log(`🧹 Cleaned up ${result.deletedCount} old files (older than ${days} days)`);
            return result.deletedCount;
        } catch (error) {
            console.error("❌ Error cleaning up old files:", error);
            return 0;
        }
    },

    // 🔥 ΝΕΟ: Get user upload statistics
    getUserFileStats: async function(username) {
        try {
            const filesSent = await File.countDocuments({ sender: username });
            const filesReceived = await File.countDocuments({ receiver: username });
            const totalSize = await File.aggregate([
                { 
                    $match: { 
                        $or: [
                            { sender: username },
                            { receiver: username }
                        ]
                    } 
                },
                { $group: { _id: null, total: { $sum: "$file_size" } } }
            ]);
            
            return {
                files_sent: filesSent,
                files_received: filesReceived,
                total_files: filesSent + filesReceived,
                total_size: totalSize[0] ? totalSize[0].total : 0
            };
        } catch (error) {
            console.error("❌ Error getting user file stats:", error);
            return { files_sent: 0, files_received: 0, total_files: 0, total_size: 0 };
        }
    },

    // 🔥 ΚΡΙΤΙΚΗ ΑΛΛΑΓΗ: Προσθήκη μεθόδου για να επιστρέφει το Message model
    getMessageModel: function() {
        return Message;
    },

    // 🔥 ΚΡΙΤΙΚΗ ΑΛΛΑΓΗ: Προσθήκη μεθόδου για να επιστρέφει το PrivateMessage model
    getPrivateMessageModel: function() {
        return PrivateMessage;
    },

    // 🔥 ΚΡΙΤΙΚΗ ΑΛΛΑΓΗ: Προσθήκη μεθόδου για να επιστρέφει το File model
    getFileModel: function() {
        return File;
    },

    // 🔥 ΝΕΟ: Event methods - ΕΝΗΜΕΡΩΜΕΝΕΣ ΜΕ ROOM FUNCTIONALITY

    // 🔥 ΚΡΙΤΙΚΗ ΠΡΟΣΘΗΚΗ: Αυτόματη δημιουργία room για event
    autoCreateEventRoom: async function(eventData, username) {
        try {
            // Δημιουργία μοναδικού κωδικού για το room
            const inviteCode = `EVENT_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
            const roomId = `event_room_${eventData.event_id}`;
            
            // Δημιουργία room για το event
            const room = new Room({
                room_id: roomId,
                name: `📅 ${eventData.title}`,
                invite_code: inviteCode,
                created_by: username,
                created_at: new Date()
            });
            await room.save();
            
            // Προσθήκη του δημιουργού στο room
            await RoomMember.create({
                room_id: roomId,
                username: username,
                joined_at: new Date()
            });
            
            console.log(`✅ Auto-created room for event "${eventData.title}": ${roomId}`);
            
            return {
                roomId: roomId,
                inviteCode: inviteCode,
                roomName: room.name
            };
        } catch (error) {
            console.error("❌ Error creating event room:", error);
            return null;
        }
    },

    // 🔥 ΕΝΗΜΕΡΩΜΕΝΗ ΜΕΘΟΔΟΣ: Δημιουργία event με αυτόματη δημιουργία room
    createEvent: async function(eventData) {
        const eventId = `event_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        const event = new Event({
            event_id: eventId,
            title: eventData.title,
            description: eventData.description,
            date: eventData.date,
            location: eventData.location,
            created_by: eventData.created_by,
            max_participants: eventData.max_participants || 0,
            participants: [eventData.created_by], // Creator is automatically a participant
            is_public: eventData.is_public !== false, // Default to true
            created_at: new Date(),
            // 🔥 ΝΕΟ: Προσθήκη φωτογραφίας αν υπάρχει
            photo: eventData.photo || null,
            room_id: null // Θα συμπληρωθεί παρακάτω
        });
        
        await event.save();
        console.log(`✅ Event created: ${eventData.title} by ${eventData.created_by}`);
        
        // 🔥 ΚΡΙΤΙΚΟ: Αυτόματη δημιουργία room για το event
        try {
            const roomInfo = await this.autoCreateEventRoom({
                ...event.toObject(),
                event_id: eventId
            }, eventData.created_by);
            
            if (roomInfo) {
                // Αποθήκευση του room ID στο event για μελλοντική αναφορά
                event.room_id = roomInfo.roomId;
                await event.save();
                console.log(`✅ Room ${roomInfo.roomId} linked to event ${eventId}`);
            }
        } catch (roomError) {
            console.error("⚠️ Could not create room for event, but event was created:", roomError);
            // Συνεχίζουμε ακόμα κι αν αποτύχει η δημιουργία room
        }
        
        return event;
    },

    // 🔥 ΚΡΙΤΙΚΗ ΠΡΟΣΘΗΚΗ: Μέθοδος για να βρίσκει το room ID από event ID
    getEventRoomId: async function(eventId) {
        const event = await Event.findOne({ event_id: eventId });
        if (event && event.room_id) {
            return event.room_id;
        }
        return null;
    },

    // 🔥 ΚΡΙΤΙΚΗ ΠΡΟΣΘΗΚΗ: Μέθοδος για αυτόματη προσθήκη συμμετεχόντων στο room όταν γίνονται join στο event
    addParticipantToEventRoom: async function(eventId, username) {
        try {
            const event = await Event.findOne({ event_id: eventId });
            if (!event || !event.room_id) {
                console.log(`ℹ️ No room found for event ${eventId}`);
                return false;
            }
            
            // Έλεγχος αν ο χρήστης είναι ήδη στο room
            const isAlreadyMember = await RoomMember.findOne({
                room_id: event.room_id,
                username: username
            });
            
            if (!isAlreadyMember) {
                // Προσθήκη χρήστη στο room
                await RoomMember.create({
                    room_id: event.room_id,
                    username: username,
                    joined_at: new Date()
                });
                console.log(`✅ Added ${username} to event room ${event.room_id}`);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error("❌ Error adding participant to event room:", error);
            return false;
        }
    },

    // 🔥 ΚΡΙΤΙΚΗ ΠΡΟΣΘΗΚΗ: Μέθοδος για να βρίσκει event από room ID
    getEventByRoomId: async function(roomId) {
        const event = await Event.findOne({ room_id: roomId });
        if (event) {
            return {
                id: event.event_id,
                title: event.title,
                description: event.description,
                date: event.date,
                location: event.location,
                created_by: event.created_by,
                max_participants: event.max_participants,
                participants: event.participants,
                is_public: event.is_public,
                created_at: event.created_at,
                participant_count: event.participants.length,
                photo: event.photo || null,
                room_id: event.room_id
            };
        }
        return null;
    },

    getAllEvents: async function(username = null) {
        let query = {};
        
        // Αν δοθεί username, επέστρεψε public events + events που ο χρήστης δημιούργησε/ενέταξε
        if (username) {
            query = {
                $or: [
                    { is_public: true },
                    { created_by: username },
                    { participants: username }
                ]
            };
        }
        
        return await Event.find(query).sort({ date: 1 }); // Ταξινόμηση κατά ημερομηνία
    },

    getEventById: async function(eventId) {
        const event = await Event.findOne({ event_id: eventId });
        if (event) {
            return {
                id: event.event_id,
                title: event.title,
                description: event.description,
                date: event.date,
                location: event.location,
                created_by: event.created_by,
                max_participants: event.max_participants,
                participants: event.participants,
                is_public: event.is_public,
                created_at: event.created_at,
                participant_count: event.participants.length,
                // 🔥 ΝΕΟ: Προσθήκη φωτογραφίας και room_id
                photo: event.photo || null,
                room_id: event.room_id || null
            };
        }
        return null;
    },

    // 🔥 ΚΡΙΤΙΚΗ ΑΛΛΑΓΗ: Προσθήκη getEventByEventId για συμβατότητα με client-side code
    getEventByEventId: async function(eventId) {
        const event = await Event.findOne({ event_id: eventId });
        if (event) {
            return {
                id: event.event_id,
                title: event.title,
                description: event.description,
                date: event.date,
                location: event.location,
                created_by: event.created_by,
                max_participants: event.max_participants,
                participants: event.participants,
                is_public: event.is_public,
                created_at: event.created_at,
                participant_count: event.participants.length,
                // 🔥 ΝΕΟ: Προσθήκη φωτογραφίας και room_id
                photo: event.photo || null,
                room_id: event.room_id || null
            };
        }
        return null;
    },

    joinEvent: async function(eventId, username) {
        const event = await Event.findOne({ event_id: eventId });
        if (!event) {
            throw new Error("Event not found");
        }
        
        // Έλεγχος αν έχει φτάσει το μέγιστο όριο συμμετεχόντων
        if (event.max_participants > 0 && event.participants.length >= event.max_participants) {
            throw new Error("Event is full");
        }
        
        // Έλεγχος αν ο χρήστης είναι ήδη συμμετέχων
        if (event.participants.includes(username)) {
            return event; // Already joined
        }
        
        event.participants.push(username);
        await event.save();
        
        // 🔥 ΚΡΙΤΙΚΗ ΠΡΟΣΘΗΚΗ: Προσθήκη χρήστη στο event room
        if (event.room_id) {
            await this.addParticipantToEventRoom(eventId, username);
        }
        
        console.log(`✅ ${username} joined event: ${event.title}`);
        return event;
    },

    leaveEvent: async function(eventId, username) {
        const event = await Event.findOne({ event_id: eventId });
        if (!event) {
            throw new Error("Event not found");
        }
        
        // Ο δημιουργός δεν μπορεί να φύγει από το event
        if (event.created_by === username) {
            throw new Error("Creator cannot leave the event");
        }
        
        const participantIndex = event.participants.indexOf(username);
        if (participantIndex > -1) {
            event.participants.splice(participantIndex, 1);
            await event.save();
            
            // 🔥 ΚΡΙΤΙΚΗ ΠΡΟΣΘΗΚΗ: Αφαίρεση χρήστη από το event room
            if (event.room_id) {
                await this.removeUserFromRoom(event.room_id, username);
            }
            
            console.log(`✅ ${username} left event: ${event.title}`);
        }
        
        return event;
    },

   // 🔥 FIXED VERSION - Ελέγχει αν υπάρχει το event ΠΡΙΝ τη διαγραφή
    deleteEvent: async function(eventId, username) {
        console.log("🔥 deleteEvent called:", { eventId, username });
        
        // 🔥 ΚΡΙΤΙΚΟ: Έλεγχος αν το event υπάρχει ΠΡΙΝ προσπαθήσουμε να το διαγράψουμε
        const event = await Event.findOne({ event_id: eventId });
        
        if (!event) {
            console.error(`❌ Event not found: ${eventId}`);
            throw new Error("Event not found");
        }
        
        console.log("🔍 Found event:", {
            id: event.event_id,
            title: event.title,
            created_by: event.created_by,
            requesting_user: username
        });
        
        // 🔥 ΚΡΙΤΙΚΗ ΔΙΟΡΘΩΣΗ: Καλύτερος έλεγχος για admin
        const isAdmin = username && username.toLowerCase() === "vf-rat";
        
        if (isAdmin) {
            // Admin μπορεί να διαγράψει ΟΠΟΙΟΔΗΠΟΤΕ event
            const result = await Event.deleteOne({ event_id: eventId });
            console.log(`✅ Admin "${username}" deleted event: "${event.title}" (${result.deletedCount} deleted)`);
            
            // 🔥 ΚΡΙΤΙΚΗ ΠΡΟΣΘΗΚΗ: Διαγραφή του αντίστοιχου room
            if (event.room_id) {
                await Room.deleteOne({ room_id: event.room_id });
                await RoomMember.deleteMany({ room_id: event.room_id });
                console.log(`✅ Deleted associated room: ${event.room_id}`);
            }
            
            // 🔥 ΚΡΙΤΙΚΗ ΔΙΟΡΘΩΣΗ: Επιστροφή του αποτελέσματος αντί για πάντα true
            if (result.deletedCount === 1) {
                console.log(`✅ SUCCESS: Event "${event.title}" deleted from database`);
                return true;
            } else {
                console.error(`❌ FAILED: Event "${event.title}" NOT deleted from database`);
                throw new Error("Failed to delete event from database");
            }
        }
        
        // Έλεγχος αν ο χρήστης είναι ο δημιουργός
        const isCreator = event.created_by === username;
        
        if (!isCreator) {
            console.error(`❌ Permission denied: ${username} cannot delete event created by ${event.created_by}`);
            throw new Error("Only the creator can delete this event");
        }
        
        // Ο δημιουργός διαγράφει το event
        const result = await Event.deleteOne({ event_id: eventId });
        console.log(`✅ Event deleted: "${event.title}" by ${username} (${result.deletedCount} deleted)`);
        
        // 🔥 ΚΡΙΤΙΚΗ ΠΡΟΣΘΗΚΗ: Διαγραφή του αντίστοιχου room
        if (event.room_id) {
            await Room.deleteOne({ room_id: event.room_id });
            await RoomMember.deleteMany({ room_id: event.room_id });
            console.log(`✅ Deleted associated room: ${event.room_id}`);
        }
        
        // 🔥 ΚΡΙΤΙΚΗ ΔΙΟΡΘΩΣΗ: Επιστροφή του αποτελέσματος αντί για πάντα true
        if (result.deletedCount === 1) {
            console.log(`✅ SUCCESS: Event "${event.title}" deleted from database`);
            return true;
        } else {
            console.error(`❌ FAILED: Event "${event.title}" NOT deleted from database`);
            throw new Error("Failed to delete event from database");
        }
    },
    
    // 🔥 ΚΡΙΤΙΚΗ ΠΡΟΣΘΗΚΗ: Ειδική μέθοδος που χρησιμοποιείται από τον client API
    deleteEventById: async function(eventId, username) {
        console.log("🔥 deleteEventById called:", { eventId, username });
        
        // Χρησιμοποιούμε την υπάρχουσα deleteEvent για συμβατότητα
        return await this.deleteEvent(eventId, username);
    },

    updateEvent: async function(eventId, username, updates) {
        const event = await Event.findOne({ event_id: eventId });
        if (!event) {
            throw new Error("Event not found");
        }
        
        // Μόνο ο δημιουργός μπορεί να ενημερώσει το event
        if (event.created_by !== username && username !== "Vf-Rat") {
            throw new Error("Only the creator can update this event");
        }
        
        // Ενημέρωση πεδίων
        Object.keys(updates).forEach(key => {
            if (updates[key] !== undefined && key !== 'participants' && key !== 'room_id') {
                event[key] = updates[key];
            }
        });
        
        await event.save();
        console.log(`✅ Event updated: ${event.title}`);
        return event;
    },

    getUserEvents: async function(username) {
        // Events που ο χρήστης δημιούργησε ή συμμετέχει
        return await Event.find({
            $or: [
                { created_by: username },
                { participants: username }
            ]
        }).sort({ date: 1 });
    },

    // 🔥 ΒΟΗΘΗΤΙΚΗ: Δημιουργία sample events αν δεν υπάρχουν - ΔΙΟΡΘΩΜΕΝΗ
    createSampleEvents: async function() {
        try {
            // Έλεγχος αν υπάρχουν sample events
            const existingEvents = await Event.find({ 
                created_by: { $in: ["admin", "demo"] }
            });
            
            // Αν δεν υπάρχουν sample events, δημιουργήστε τα
            if (existingEvents.length === 0) {
                console.log("📅 Creating sample events...");
                
                const sampleEvents = [
                    {
                        event_id: `event_sample_${Date.now()}_1`,
                        title: "Car Meet & Coffee",
                        description: "Weekly car meet for all enthusiasts. Bring your car, share stories, and enjoy coffee together!",
                        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                        location: "Downtown Parking Lot",
                        created_by: "admin",
                        max_participants: 50,
                        participants: ["admin", "demo"],
                        is_public: true,
                        created_at: new Date(),
                        // 🔥 ΝΕΟ: Δεν προσθέτουμε φωτογραφία στα sample events
                        photo: null,
                        room_id: null // Θα δημιουργηθεί όταν πραγματικά δημιουργηθεί
                    },
                    {
                        event_id: `event_sample_${Date.now()}_2`,
                        title: "Mountain Drive",
                        description: "Scenic drive through mountain roads. Perfect for sports cars and photography enthusiasts.",
                        date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                        location: "Mountain Road Starting Point",
                        created_by: "demo",
                        max_participants: 30,
                        participants: ["demo", "admin"],
                        is_public: true,
                        created_at: new Date(),
                        // 🔥 ΝΕΟ: Δεν προσθέτουμε φωτογραφία στα sample events
                        photo: null,
                        room_id: null // Θα δημιουργηθεί όταν πραγματικά δημιουργηθεί
                    }
                ];
                
                // Δημιουργία sample events
                for (const sampleEvent of sampleEvents) {
                    await Event.create(sampleEvent);
                    console.log(`✅ Created sample event: ${sampleEvent.title}`);
                }
                console.log("✅ Sample events created");
            } else {
                console.log("📅 Sample events already exist, skipping...");
            }
        } catch (error) {
            console.error("❌ Error creating sample events:", error);
        }
    },

    // ΒΗΜΑ 2: Αφαίρεση/επεξεργασία της συνάρτησης clearSampleEvents - ΒΕΛΤΙΩΜΕΝΗ
    clearSampleEvents: async function(username) {
        if (username.toLowerCase() !== "vf-rat") {
            throw new Error("Only admin can clear sample events");
        }
        
        // Διαγραφή ΟΛΩΝ των events που είναι από admin ή demo
        const result = await Event.deleteMany({ 
            created_by: { $in: ["admin", "demo"] }
        });
        
        // 🔥 ΝΕΟ: Επίσης, διαγραφή ΟΛΩΝ των παλιών events που είναι samples
        const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 ημέρες
        const oldResult = await Event.deleteMany({
            $or: [
                { title: { $in: ["Car Meet & Coffee", "Mountain Drive"] } },
                { created_at: { $lt: cutoffDate }, created_by: { $ne: "Vf-Rat" } }
            ]
        });
        
        const totalDeleted = result.deletedCount + oldResult.deletedCount;
        
        console.log(`🧹 Admin cleared ${totalDeleted} events (samples + old)`);
        return { 
            deletedCount: totalDeleted,
            samples: result.deletedCount,
            old: oldResult.deletedCount
        };
    },

    // ΒΗΜΑ 3: Ενημέρωση της deleteAllEvents συνάρτησης - ΒΕΛΤΙΩΜΕΝΗ
    deleteAllEvents: async function(username) {
        if (username.toLowerCase() !== "vf-rat") {
            throw new Error("Only admin can delete all events");
        }
        
        // 🔥 ΠΡΟΣΟΧΗ: Διαγράφουμε ΟΛΑ τα events εκτός από αυτά του admin
        const result = await Event.deleteMany({
            created_by: { $ne: "Vf-Rat" } // Δεν διαγράφουμε events του admin
        });
        
        console.log(`🔥 Admin ${username} deleted ${result.deletedCount} user events`);
        
        // 🔥 ΝΕΟ: Διαγραφή και των sample event patterns
        const samplePatterns = await Event.deleteMany({
            title: { $in: ["Car Meet & Coffee", "Mountain Drive"] }
        });
        
        console.log(`🗑️ Also deleted ${samplePatterns.deletedCount} sample pattern events`);
        
        return { 
            deletedCount: result.deletedCount,
            samplePatterns: samplePatterns.deletedCount,
            message: `Deleted ${result.deletedCount} user events and ${samplePatterns.deletedCount} sample patterns`
        };
    },

    // 🔥 ΚΡΙΤΙΚΗ ΠΡΟΣΘΗΚΗ: Διαγραφή συγκεκριμένου event από admin - με case insensitive check
    deleteEventAsAdmin: async function(eventId, username) {
        console.log("🔥 deleteEventAsAdmin called:", { eventId, username });
        
        // Case insensitive check για τον admin
        if (username.toLowerCase() !== "vf-rat") {
            throw new Error("Only admin can delete events");
        }
        
        const event = await Event.findOne({ event_id: eventId });
        if (!event) {
            throw new Error("Event not found");
        }
        
        console.log("📝 Deleting event:", event.title);
        
        await Event.deleteOne({ event_id: eventId });
        console.log(`✅ Admin ${username} deleted event: "${event.title}"`);
        return true;
    },

    // 🔥 ΚΡΙΤΙΚΗ ΠΡΟΣΘΗΚΗ: Έλεγχος αν υπάρχει το event πριν την εμφάνιση
    checkEventExists: async function(eventId) {
        const event = await Event.findOne({ event_id: eventId });
        return !!event;
    }
};

// 🔥 FIXED: Initialize database connection με καλύτερο error handling
async function initializeDatabase() {
    try {
        console.log("🔄 Connecting to MongoDB...");

        // Έλεγχος αν υπάρχει MONGODB_URI
        if (!process.env.MONGODB_URI) {
            console.warn("⚠️ WARNING: MONGODB_URI not found in environment variables!");
            console.warn("⚠️ Using local MongoDB. This will NOT work on Render!");
        }

        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 10000, // 10 seconds timeout
            socketTimeoutMS: 45000,
            // 🔥 ΠΡΟΣΘΗΚΗ: Retry configuration
            retryWrites: true,
            retryReads: true,
            maxPoolSize: 10
        });

        console.log('✅ Database connected successfully to:', mongoose.connection.host);
        console.log('📊 Database name:', mongoose.connection.name);

        // Connection event handlers
        mongoose.connection.on('error', (err) => {
            console.error("❌ MongoDB connection error:", err.message);
        });

        mongoose.connection.on('disconnected', () => {
            console.log("⚠️ MongoDB disconnected. Attempting to reconnect...");
        });

        mongoose.connection.on('reconnected', () => {
            console.log("✅ MongoDB reconnected successfully");
        });

        mongoose.connection.on('connected', () => {
            console.log("🔗 MongoDB connection established");
        });

        // 🔥 ΠΡΟΣΘΗΚΗ: Δημιουργία admin user αν δεν υπάρχει
        async function createAdminIfNotExists() {
            try {
                const adminUser = await dbHelpers.findUserByUsername("Vf-Rat");
                if (!adminUser) {
                    console.log("👑 Creating admin user...");
                    await dbHelpers.createUser(
                        "mitsosjinavos@gmail.com",
                        "Vf-Rat",
                        "Lion2623",
                        null
                    );
                    console.log("✅ Admin user created");
                } else {
                    console.log("✅ Admin user already exists");
                }
            } catch (error) {
                console.error("❌ Error creating admin user:", error);
            }
        }

        // 🔥 ΝΕΟ: Create indexes για καλύτερη απόδοση
        await File.createIndexes();
        await UnreadMessage.createIndexes();
        await Event.createIndexes();
        await Room.createIndexes();
        
        console.log('📈 Database indexes created successfully');
        console.log('💾 File storage system: ENABLED');
        console.log('📅 Events system: ENABLED');
        console.log('🏠 Event Rooms system: ENABLED');
        console.log('📊 File schema: READY');
        console.log('📅 Event schema: READY');

        // 🔥 Δημιουργία admin user
        await createAdminIfNotExists();

        // ΒΗΜΑ 1: Αφαίρεση της αυτόματης δημιουργίας sample events
        // 🔥 ΣΗΜΑΝΤΙΚΟ: ΔΕΝ δημιουργούμε πια sample events αυτόματα
        // await dbHelpers.createSampleEvents();
        console.log("📅 Sample events: DISABLED (only user-created events)");

        return mongoose.connection;
    } catch (error) {
        console.error("❌ Failed to connect to database:");
        console.error("Error message:", error.message);
        console.error("Error name:", error.name);

        // 🔥 Πιο χρήσιμα error messages
        if (error.name === 'MongooseServerSelectionError') {
            console.error("❌ Cannot reach MongoDB server. Check:");
            console.error("   1. Is MONGODB_URI environment variable set correctly in Render?");
            console.error("   2. Is MongoDB Atlas cluster running?");
            console.error("   3. Is the IP address whitelisted in MongoDB Atlas (0.0.0.0/0)?");
            console.error("   4. Is the database user password correct?");
        }

        throw error;
    }
}

// 🔥 Εξαγωγή και των models για χρήση στο server.js
module.exports = { 
    dbHelpers, 
    initializeDatabase,
    User,
    Room,
    RoomMember,
    Message,
    PrivateMessage,
    Friend,
    Session,
    UnreadMessage,
    File,
    Event  // 🔥 ΝΕΟ
};
