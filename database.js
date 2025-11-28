// database.js - FIXED VERSION - Μόνο ο παραλήπτης βλέπει pending requests
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

// Database initialization
async function initializeDatabase() {
    const db = await open({
        filename: path.join(process.cwd(), 'chat.db'),
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            status TEXT DEFAULT 'Online',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            invite_code TEXT UNIQUE NOT NULL,
            created_by TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS room_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id INTEGER,
            username TEXT NOT NULL,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(room_id) REFERENCES rooms(id),
            UNIQUE(room_id, username)
        );
        
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id INTEGER,
            sender TEXT NOT NULL,
            text TEXT NOT NULL,
            time TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(room_id) REFERENCES rooms(id)
        );
        
        CREATE TABLE IF NOT EXISTS private_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT NOT NULL,
            receiver TEXT NOT NULL,
            text TEXT NOT NULL,
            time TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT NOT NULL,
            receiver TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(sender, receiver)
        );

        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    console.log("✅ Database tables initialized successfully");
    return db;
}

const dbHelpers = {
    createUser: async function(email, username, password) {
        const db = await initializeDatabase();
        await db.run(
            'INSERT INTO users (email, username, password) VALUES (?, ?, ?)',
            [email, username, password]
        );
        console.log("✅ User created permanently:", username);
    },

    findUserByEmail: async function(email) {
        const db = await initializeDatabase();
        return await db.get('SELECT * FROM users WHERE email = ?', [email]);
    },

    findUserByUsername: async function(username) {
        const db = await initializeDatabase();
        return await db.get('SELECT * FROM users WHERE username = ?', [username]);
    },

    saveUser: async function(user) {
        const db = await initializeDatabase();
        await db.run(
            'UPDATE users SET status = ? WHERE username = ?',
            [user.status, user.username]
        );
    },

    createRoom: async function(name, createdBy) {
        const db = await initializeDatabase();
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        const result = await db.run(
            'INSERT INTO rooms (name, invite_code, created_by) VALUES (?, ?, ?)',
            [name, inviteCode, createdBy]
        );

        return { roomId: result.lastID, inviteCode };
    },

    getRoomByInviteCode: async function(inviteCode) {
        const db = await initializeDatabase();
        return await db.get('SELECT * FROM rooms WHERE invite_code = ?', [inviteCode]);
    },

    getRoomById: async function(roomId) {
        const db = await initializeDatabase();
        return await db.get('SELECT * FROM rooms WHERE id = ?', [roomId]);
    },

    addUserToRoom: async function(roomId, username) {
        const db = await initializeDatabase();
        await db.run(
            'INSERT OR IGNORE INTO room_members (room_id, username) VALUES (?, ?)',
            [roomId, username]
        );
    },

    isUserInRoom: async function(roomId, username) {
        const db = await initializeDatabase();
        const result = await db.get(
            'SELECT 1 FROM room_members WHERE room_id = ? AND username = ?',
            [roomId, username]
        );
        return !!result;
    },

    getUserRooms: async function(username) {
        const db = await initializeDatabase();
        return await db.all(`
            SELECT r.* FROM rooms r
            JOIN room_members rm ON r.id = rm.room_id
            WHERE rm.username = ?
            ORDER BY r.created_at DESC
        `, [username]);
    },

    getRoomMembers: async function(roomId) {
        const db = await initializeDatabase();
        return await db.all(`
            SELECT username, joined_at FROM room_members 
            WHERE room_id = ? 
            ORDER BY joined_at
        `, [roomId]);
    },

    saveMessage: async function(message) {
        const db = await initializeDatabase();
        await db.run(
            'INSERT INTO messages (room_id, sender, text, time) VALUES (?, ?, ?, ?)',
            [message.room_id, message.sender, message.text, message.time]
        );
    },

    getRoomMessages: async function(roomId, userJoinedAt = null) {
        const db = await initializeDatabase();
        let query = 'SELECT * FROM messages WHERE room_id = ? ORDER BY created_at';
        let params = [roomId];
        
        if (userJoinedAt) {
            query = 'SELECT * FROM messages WHERE room_id = ? AND created_at >= ? ORDER BY created_at';
            params = [roomId, userJoinedAt];
        }
        
        return await db.all(query, params);
    },

    getAllUsers: async function() {
        const db = await initializeDatabase();
        return await db.all('SELECT * FROM users');
    },

    // 🔥 FIXED: Τώρα αποθηκεύει sender/receiver χωρίς sorting
    sendFriendRequest: async function(fromUser, toUser) {
        const db = await initializeDatabase();
        
        await db.run(
            'INSERT OR IGNORE INTO friends (sender, receiver, status) VALUES (?, ?, "pending")',
            [fromUser, toUser]
        );
        console.log(`✅ Friend request: ${fromUser} → ${toUser}`);
    },

    // 🔥 FIXED: Επιστρέφει ΜΟΝΟ τα requests που ο χρήστης είναι RECEIVER
    getPendingRequests: async function(username) {
        const db = await initializeDatabase();
        return await db.all(`
            SELECT 
                sender as friend_username,
                created_at
            FROM friends 
            WHERE receiver = ? AND status = 'pending'
            ORDER BY created_at DESC
        `, [username]);
    },

    // 🔥 FIXED: Ενημερώνει το σωστό request (sender → receiver)
    respondToFriendRequest: async function(username, friendUsername, accept) {
        const db = await initializeDatabase();
        const newStatus = accept ? 'accepted' : 'rejected';
        
        // Ο username είναι receiver, ο friendUsername είναι sender
        await db.run(
            'UPDATE friends SET status = ? WHERE sender = ? AND receiver = ?',
            [newStatus, friendUsername, username]
        );
        console.log(`✅ ${username} ${accept ? 'accepted' : 'rejected'} request from ${friendUsername}`);
    },

    // 🔥 FIXED: Επιστρέφει φίλους από ΚΑΘΕ κατεύθυνση
    getFriends: async function(username) {
        const db = await initializeDatabase();
        return await db.all(`
            SELECT 
                CASE 
                    WHEN sender = ? THEN receiver
                    ELSE sender
                END as friend_username,
                created_at
            FROM friends 
            WHERE (sender = ? OR receiver = ?) AND status = 'accepted'
            ORDER BY created_at DESC
        `, [username, username, username]);
    },

    // 🔥 FIXED: Ελέγχει και τις 2 κατευθύνσεις
    areFriends: async function(user1, user2) {
        const db = await initializeDatabase();
        
        const result = await db.get(
            `SELECT 1 FROM friends 
             WHERE ((sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?))
             AND status = 'accepted'`,
            [user1, user2, user2, user1]
        );
        return !!result;
    },

    // 🔥 FIXED: Ελέγχει και τις 2 κατευθύνσεις για pending
    hasPendingRequest: async function(user1, user2) {
        const db = await initializeDatabase();
        
        const result = await db.get(
            `SELECT 1 FROM friends 
             WHERE ((sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?))
             AND status = 'pending'`,
            [user1, user2, user2, user1]
        );
        return !!result;
    },

    // 🔥 FIXED: Διαγράφει friendship από οποιαδήποτε κατεύθυνση
    removeFriend: async function(user1, user2) {
        const db = await initializeDatabase();
        
        await db.run(
            `DELETE FROM friends 
             WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)`,
            [user1, user2, user2, user1]
        );
        console.log(`✅ Friendship removed: ${user1} ↔ ${user2}`);
    },

    savePrivateMessage: async function(message) {
        const db = await initializeDatabase();
        await db.run(
            'INSERT INTO private_messages (sender, receiver, text, time) VALUES (?, ?, ?, ?)',
            [message.sender, message.receiver, message.text, message.time]
        );
    },

    getPrivateMessages: async function(user1, user2) {
        const db = await initializeDatabase();
        return await db.all(`
            SELECT * FROM private_messages 
            WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
            ORDER BY created_at
        `, [user1, user2, user2, user1]);
    },

    saveSession: async function(sessionId, sessionData) {
        const db = await initializeDatabase();
        await db.run(
            `INSERT OR REPLACE INTO sessions (session_id, username, last_accessed) 
             VALUES (?, ?, datetime('now'))`,
            [sessionId, sessionData.username]
        );
    },

    getSession: async function(sessionId) {
        const db = await initializeDatabase();
        const session = await db.get(
            'SELECT * FROM sessions WHERE session_id = ?',
            [sessionId]
        );
        
        if (session) {
            await db.run(
                'UPDATE sessions SET last_accessed = datetime("now") WHERE session_id = ?',
                [sessionId]
            );
        }
        
        return session;
    },

    deleteSession: async function(sessionId) {
        const db = await initializeDatabase();
        await db.run('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
    },

    cleanupExpiredSessions: async function() {
        const db = await initializeDatabase();
        await db.run(
            'DELETE FROM sessions WHERE last_accessed < datetime("now", "-7 days")'
        );
    }
};

module.exports = { dbHelpers, initializeDatabase };
