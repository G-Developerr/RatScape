// client.js - RatRoom Client with Enhanced Security, Notifications & UNREAD SYSTEM
const socket = io();

// Current user state
let currentUser = {
    username: null,
    email: null,
    authenticated: false,
    sessionId: null,
};

// Current room state
let currentRoom = {
    id: null,
    name: null,
    inviteCode: null,
};

// ===== UNREAD MESSAGES SYSTEM =====
let unreadMessages = {
    private: {},    // {friendUsername: count}
    groups: {},     // {roomId: count}
    total: 0
};

// ===== USER INFO SYSTEM =====
let currentViewedUser = null;

// ===== BEAUTIFUL NOTIFICATION SYSTEM WITH CLICKABLE =====

function showNotification(message, type = "info", title = null, action = null, unreadCount = 1) {
    const container = document.getElementById("notification-container");
    if (!container) {
        createNotificationContainer();
    }

    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    
    if (action) {
        notification.dataset.action = JSON.stringify(action);
    }

    // Set icon based on type
    let icon, notificationTitle;
    switch (type) {
        case "success":
            icon = "✓";
            notificationTitle = title || "Success";
            break;
        case "error":
            icon = "✕";
            notificationTitle = title || "Error";
            break;
        case "warning":
            icon = "⚠";
            notificationTitle = title || "Warning";
            break;
        default:
            icon = "ℹ";
            notificationTitle = title || "Info";
    }

    // Προσθήκη unread count στο message αν υπάρχει
    let displayMessage = message;
    if (unreadCount > 1) {
        displayMessage = `(${unreadCount}) ${message}`;
    }

    notification.innerHTML = `
        <div class="notification-icon">${icon}</div>
        <div class="notification-content">
            <div class="notification-title">${notificationTitle}</div>
            <div class="notification-message">${displayMessage}</div>
        </div>
        <button class="notification-close">×</button>
    `;

    // Προσθήκη unread count badge αν είναι > 1
    if (unreadCount > 1) {
        const countBadge = document.createElement('div');
        countBadge.className = 'notification-count-badge';
        countBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        notification.appendChild(countBadge);
    }

    document.getElementById("notification-container").appendChild(notification);

    // CLICK HANDLER για notifications με action
    if (action) {
        notification.style.cursor = 'pointer';
        notification.classList.add('clickable');
        
        notification.addEventListener('click', function(e) {
            if (!e.target.classList.contains('notification-close')) {
                handleNotificationAction(action);
                hideNotification(notification);
                
                // Auto-clear unread όταν πατάς το notification
                if (action.type === 'private_message') {
                    clearUnread('private', action.sender);
                } else if (action.type === 'room_message') {
                    clearUnread('group', action.sender, action.roomId);
                }
            }
        });
        
        // Hover effect
        notification.addEventListener('mouseenter', function() {
            this.style.transform = 'translateX(-5px)';
            this.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.8)';
        });
        
        notification.addEventListener('mouseleave', function() {
            this.style.transform = '';
            this.style.boxShadow = '';
        });
    }

    // Animate in
    setTimeout(() => {
        notification.classList.add("active");
    }, 10);

    // Add close event
    notification.querySelector(".notification-close").addEventListener("click", (e) => {
        e.stopPropagation();
        hideNotification(notification);
    });

    // Auto hide after 8 seconds για notifications με action
    if (action) {
        setTimeout(() => {
            if (notification.parentElement) {
                hideNotification(notification);
            }
        }, 8000);
    } else if (type !== "error") {
        setTimeout(() => {
            if (notification.parentElement) {
                hideNotification(notification);
            }
        }, 5000);
    }

    return notification;
}

function hideNotification(notification) {
    notification.classList.remove("active");
    notification.classList.add("hiding");

    setTimeout(() => {
        if (notification.parentElement) {
            notification.parentElement.removeChild(notification);
        }
    }, 300);
}

function createNotificationContainer() {
    const container = document.createElement("div");
    container.id = "notification-container";
    container.className = "notification-container";
    document.body.appendChild(container);
}

// ===== CONFIRMATION MODAL SYSTEM =====

function showConfirmationModal(message, title = "Confirm", onConfirm = null, onCancel = null) {
    // Δημιουργία modal container αν δεν υπάρχει
    let modal = document.getElementById("confirmation-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "confirmation-modal";
        modal.className = "modal";
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="confirmation-title">Confirm</h3>
                    <button class="close-modal-btn" id="close-confirmation-modal">×</button>
                </div>
                <div class="form-container active">
                    <div class="form-group" style="text-align: center; padding: 20px 0;">
                        <p id="confirmation-message" style="font-size: 1rem; color: var(--text); margin: 0;"></p>
                    </div>
                    <div class="modal-buttons">
                        <button class="btn btn-primary" id="confirm-yes-btn">Yes</button>
                        <button class="btn btn-secondary" id="confirm-no-btn">No</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Προσθήκη event listeners
        document.getElementById("close-confirmation-modal").addEventListener("click", hideConfirmationModal);
        document.getElementById("confirm-no-btn").addEventListener("click", hideConfirmationModal);
        
        document.getElementById("confirm-yes-btn").addEventListener("click", function() {
            if (onConfirm) onConfirm();
            hideConfirmationModal();
        });
    }
    
    // Ορισμός μηνύματος και τίτλου
    document.getElementById("confirmation-title").textContent = title;
    document.getElementById("confirmation-message").textContent = message;
    
    // Εμφάνιση modal
    modal.classList.add("active");
}

function hideConfirmationModal() {
    const modal = document.getElementById("confirmation-modal");
    if (modal) {
        modal.classList.remove("active");
    }
}

// ===== UNREAD SYSTEM FUNCTIONS =====

let lastClearTime = 0;
const CLEAR_DEBOUNCE_TIME = 1000; // 1 δευτερόλεπτο

// Καθαρισμός unread messages - FIXED για console spam
function clearUnread(type, sender, roomId = null) {
    const now = Date.now();
    
    // Debounce για να αποφύγουμε πολλαπλά calls
    if (now - lastClearTime < CLEAR_DEBOUNCE_TIME) {
        return;
    }
    
    lastClearTime = now;
    
    if (type === 'private') {
        if (unreadMessages.private[sender]) {
            delete unreadMessages.private[sender];
        }
    } else if (type === 'group') {
        if (unreadMessages.groups[roomId]) {
            delete unreadMessages.groups[roomId];
        }
    }
    
    updateUnreadBadges();
    
    // Ενημέρωση server μόνο αν υπάρχουν όντως δεδομένα
    if (type || sender || roomId) {
        socket.emit('mark_as_read', { type, sender, roomId });
    }
}

// Προσθήκη unread message
function addUnreadMessage(type, sender, roomId = null) {
    const key = roomId || sender;
    
    if (type === 'private') {
        if (!unreadMessages.private[sender]) {
            unreadMessages.private[sender] = 0;
        }
        unreadMessages.private[sender]++;
    } else if (type === 'group') {
        if (!unreadMessages.groups[roomId]) {
            unreadMessages.groups[roomId] = 0;
        }
        unreadMessages.groups[roomId]++;
    }
    
    updateUnreadBadges();
    
    // Ενημέρωση UI αν είμαστε στη σωστή σελίδα
    updateFriendsListBadges();
    updateRoomsListBadges();
}

// Ενημέρωση όλων των badges
function updateUnreadBadges() {
    // Υπολογισμός total
    const privateTotal = Object.values(unreadMessages.private).reduce((a, b) => a + b, 0);
    const groupsTotal = Object.values(unreadMessages.groups).reduce((a, b) => a + b, 0);
    unreadMessages.total = privateTotal + groupsTotal;
    
    // Ενημέρωση title
    updateTitleBadge();
    
    // Ενημέρωση navigation buttons
    updateNavBadges();
}

// Ενημέρωση badge στο title
function updateTitleBadge() {
    if (unreadMessages.total > 0) {
        document.title = `(${unreadMessages.total}) RatScape`;
    } else {
        document.title = 'RatScape';
    }
}

// Ενημέρωση badges στο navigation
function updateNavBadges() {
    const friendsBtn = document.getElementById('my-friends-btn');
    const roomsBtn = document.getElementById('my-rooms-btn');
    
    if (friendsBtn) {
        const privateTotal = Object.values(unreadMessages.private).reduce((a, b) => a + b, 0);
        updateButtonBadge(friendsBtn, privateTotal, 'friends');
    }
    
    if (roomsBtn) {
        const groupsTotal = Object.values(unreadMessages.groups).reduce((a, b) => a + b, 0);
        updateButtonBadge(roomsBtn, groupsTotal, 'rooms');
    }
}

// Προσθήκη/ενημέρωση badge σε button
function updateButtonBadge(button, count, type) {
    // Αφαίρεση υπάρχοντος badge
    const existingBadge = button.querySelector('.nav-badge');
    if (existingBadge) {
        existingBadge.remove();
    }
    
    // Προσθήκη νέου badge αν υπάρχουν unread
    if (count > 0) {
        const badge = document.createElement('span');
        badge.className = 'nav-badge';
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.cssText = `
            position: absolute;
            top: -5px;
            right: -5px;
            background: var(--accent-red);
            color: white;
            border-radius: 10px;
            min-width: 20px;
            height: 20px;
            font-size: 0.7rem;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 5px;
            font-weight: bold;
            box-shadow: 0 2px 5px rgba(0,0,0,0.5);
            z-index: 100;
            animation: badgePop 0.3s ease-out;
        `;
        
        button.style.position = 'relative';
        button.appendChild(badge);
    }
}

// Ενημέρωση badges στη λίστα φίλων
function updateFriendsListBadges() {
    const friendCards = document.querySelectorAll('.friend-card:not(.pending)');
    friendCards.forEach(card => {
        const nameElement = card.querySelector('.friend-name');
        if (nameElement) {
            const friendName = nameElement.textContent;
            const unreadCount = unreadMessages.private[friendName] || 0;
            
            // Αφαίρεση υπάρχοντος badge
            const existingBadge = card.querySelector('.friend-badge');
            if (existingBadge) {
                existingBadge.remove();
            }
            
            // Προσθήκη νέου badge
            if (unreadCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'friend-badge';
                badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                badge.style.cssText = `
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: var(--accent-red);
                    color: white;
                    border-radius: 10px;
                    min-width: 20px;
                    height: 20px;
                    font-size: 0.7rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 5px;
                    font-weight: bold;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.5);
                    z-index: 1;
                    animation: badgePop 0.3s ease-out;
                `;
                
                card.style.position = 'relative';
                card.appendChild(badge);
            }
        }
    });
}

// Ενημέρωση badges στη λίστα δωματίων
function updateRoomsListBadges() {
    const roomCards = document.querySelectorAll('.room-card');
    roomCards.forEach(card => {
        const enterBtn = card.querySelector('.enter-room-btn');
        if (enterBtn) {
            const roomId = enterBtn.dataset.roomId;
            const unreadCount = unreadMessages.groups[roomId] || 0;
            
            // Αφαίρεση υπάρχοντος badge
            const existingBadge = card.querySelector('.room-badge');
            if (existingBadge) {
                existingBadge.remove();
            }
            
            // Προσθήκη νέου badge
            if (unreadCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'room-badge';
                badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                badge.style.cssText = `
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: var(--accent-red);
                    color: white;
                    border-radius: 10px;
                    min-width: 20px;
                    height: 20px;
                    font-size: 0.7rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 5px;
                    font-weight: bold;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.5);
                    z-index: 1;
                    animation: badgePop 0.3s ease-out;
                `;
                
                card.style.position = 'relative';
                card.appendChild(badge);
            }
        }
    });
}

// Φόρτωση offline notifications όταν συνδέεται ο χρήστης
async function loadOfflineNotifications() {
    if (!currentUser.authenticated) return;
    
    try {
        const response = await fetch(`/offline-notifications/${currentUser.username}`, {
            headers: {
                "X-Session-ID": currentUser.sessionId,
            },
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                console.log(`📬 Loaded ${data.total} offline notifications`);
                
                // Αρχικοποίηση unreadMessages από summary
                if (data.summary) {
                    unreadMessages.private = data.summary.private || {};
                    unreadMessages.groups = data.summary.groups || {};
                    unreadMessages.total = data.summary.total || 0;
                    updateUnreadBadges();
                }
                
                // Εμφάνιση welcome notification
                if (data.total > 0) {
                    setTimeout(() => {
                        showNotification(
                            `You have ${data.unread_count} unread messages`,
                            "info",
                            "Welcome Back!",
                            null,
                            data.unread_count
                        );
                    }, 1000);
                }
                
                // Εμφάνιση λεπτομερών notifications
                data.notifications.forEach((notification, index) => {
                    setTimeout(() => {
                        let type = "info";
                        let title = "Notification";
                        
                        switch (notification.type) {
                            case 'offline_private_message':
                                type = "info";
                                title = "Unread Message";
                                break;
                            case 'offline_group_message':
                                type = "info";
                                title = "Unread Group Message";
                                break;
                            case 'offline_friend_request':
                                type = "info";
                                title = "Pending Friend Request";
                                break;
                        }
                        
                        showNotification(
                            `${notification.sender}: ${notification.message || 'Friend request'}`,
                            type,
                            title,
                            notification.action,
                            notification.count || 1
                        );
                    }, 1500 + (index * 300));
                });
            }
        }
    } catch (error) {
        console.error("Error loading offline notifications:", error);
    }
}

// ===== HANDLE NOTIFICATION ACTIONS =====

function handleNotificationAction(action) {
    console.log("🔔 Handling notification action:", action);
    
    hideAllModals();
    
    switch (action.type) {
        case 'private_message':
            const friendUsername = action.sender;
            if (friendUsername) {
                // Clear unread για αυτόν τον φίλο
                clearUnread('private', friendUsername);
                
                // Πήγαινε στη σελίδα φίλων
                loadUserFriends();
                showPage("friends-page");
                
                // Highlight και άνοιγμα chat
                setTimeout(() => {
                    highlightAndOpenFriendChat(friendUsername);
                }, 800);
            }
            break;
            
        case 'room_message':
            if (action.roomId) {
                // Clear unread για αυτό το room
                clearUnread('group', action.sender, action.roomId);
                
                // Πήγαινε στη σελίδα δωματίων
                loadUserRooms();
                showPage("rooms-page");
                
                // Highlight και είσοδος στο room
                setTimeout(() => {
                    highlightAndEnterRoom(action.roomId);
                }, 800);
            }
            break;
            
        case 'friend_request':
            // Πήγαινε στη σελίδα φίλων
            loadUserFriends();
            showPage("friends-page");
            
            // Highlight pending requests
            setTimeout(() => {
                highlightPendingRequests();
            }, 800);
            break;
            
        case 'friend_request_accepted':
            // Πήγαινε στη σελίδα φίλων
            loadUserFriends();
            showPage("friends-page");
            break;
    }
}

// Βοηθητικές συναρτήσεις για highlight
function highlightAndOpenFriendChat(friendUsername) {
    const friendCards = document.querySelectorAll('.friend-card:not(.pending)');
    friendCards.forEach(card => {
        const nameElement = card.querySelector('.friend-name');
        if (nameElement && nameElement.textContent === friendUsername) {
            // Προσθήκη animation
            card.style.animation = 'highlightPulse 2s ease-in-out';
            card.style.border = '2px solid var(--accent-red)';
            
            // Κάνε click στο chat button
            const chatBtn = card.querySelector('.chat-friend-btn');
            if (chatBtn) {
                setTimeout(() => {
                    chatBtn.click();
                }, 1000);
            }
        }
    });
}

function highlightAndEnterRoom(roomId) {
    const roomCards = document.querySelectorAll('.room-card');
    roomCards.forEach(card => {
        const enterBtn = card.querySelector('.enter-room-btn');
        if (enterBtn && enterBtn.dataset.roomId === roomId) {
            card.style.animation = 'highlightPulse 2s ease-in-out';
            card.style.border = '2px solid var(--accent-red)';
            
            setTimeout(() => {
                enterBtn.click();
            }, 1500);
        }
    });
}

function highlightPendingRequests() {
    const pendingSection = document.querySelector('.pending-requests-list');
    if (pendingSection) {
        pendingSection.scrollIntoView({ behavior: 'smooth' });
        pendingSection.style.animation = 'highlightPulse 2s ease-in-out';
        pendingSection.style.border = '2px solid var(--accent-red)';
        pendingSection.style.padding = '10px';
        pendingSection.style.borderRadius = 'var(--radius)';
    }
}

// ===== UTILITY FUNCTIONS =====

function showPage(pageId) {
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    document.getElementById(pageId).classList.add("active");

    if (currentUser.authenticated) {
        saveCurrentPage(pageId);
    }
}

function showModal(modalId) {
    document.getElementById(modalId).classList.add("active");
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.remove("active");
}

function hideAllModals() {
    document.querySelectorAll(".modal").forEach((m) => m.classList.remove("active"));
}

function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function saveUserToLocalStorage(user) {
    localStorage.setItem(
        "ratroom_user",
        JSON.stringify({
            username: user.username,
            email: user.email,
            authenticated: user.authenticated,
            sessionId: user.sessionId,
            timestamp: Date.now(),
        })
    );
}

function getUserFromLocalStorage() {
    const userData = localStorage.getItem("ratroom_user");
    if (!userData) return null;

    try {
        const user = JSON.parse(userData);
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - user.timestamp > oneWeek) {
            clearUserFromLocalStorage();
            return null;
        }
        return user;
    } catch (error) {
        clearUserFromLocalStorage();
        return null;
    }
}

function clearUserFromLocalStorage() {
    localStorage.removeItem("ratroom_user");
    localStorage.removeItem("ratroom_last_page");
}

function saveCurrentPage(pageId) {
    localStorage.setItem("ratroom_last_page", pageId);
}

function getLastPage() {
    return localStorage.getItem("ratroom_last_page") || "home-page";
}

// ===== UI UPDATE FUNCTIONS =====

function updateUIForAuthState() {
    const loggedOutNav = document.getElementById("nav-logged-out");
    const loggedInNav = document.getElementById("nav-logged-in");
    const homeCTALoggedOut = document.getElementById("home-cta-logged-out");
    const homeCTALoggedIn = document.getElementById("home-cta-logged-in");
    const navUsername = document.getElementById("nav-username");

    if (currentUser.authenticated) {
        loggedOutNav.style.display = "none";
        loggedInNav.style.display = "flex";
        homeCTALoggedOut.style.display = "none";
        homeCTALoggedIn.style.display = "block";
        navUsername.textContent = currentUser.username;

        socket.emit("authenticate", {
            username: currentUser.username,
            sessionId: currentUser.sessionId,
        });

        document.getElementById("display-my-username").textContent = currentUser.username;
        
        // Φόρτωση offline notifications όταν συνδέεται
        setTimeout(() => {
            loadOfflineNotifications();
        }, 1000);
        
    } else {
        loggedOutNav.style.display = "flex";
        loggedInNav.style.display = "none";
        homeCTALoggedOut.style.display = "block";
        homeCTALoggedIn.style.display = "none";
        localStorage.removeItem("ratroom_last_page");
    }
}

function addMessageToChat(message) {
    const messagesContainer = document.getElementById("messages-container");
    const messageDiv = document.createElement("div");
    const isOwn = message.sender === currentUser.username;

    messageDiv.className = `message ${isOwn ? "own" : "other"}`;
    messageDiv.innerHTML = `
    <div class="message-header">
      <span class="message-sender">${message.sender}</span>
      <span class="message-time">${message.time || getCurrentTime()}</span>
    </div>
    <div class="message-text">${message.text}</div>
  `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateRoomMembers(members) {
    const membersList = document.getElementById("room-members-list");
    membersList.innerHTML = "";

    members.forEach((member) => {
        const memberDiv = document.createElement("div");
        memberDiv.className = "member-item";
        memberDiv.innerHTML = `
      <div class="member-avatar">${member.username.substring(0, 2).toUpperCase()}</div>
      <div class="member-info">
        <span class="member-name">${member.username}</span>
        <span class="member-joined">${new Date(member.joined_at).toLocaleDateString()}</span>
      </div>
    `;
        
        // Προσθήκη click event για να ανοίγει το user info modal
        memberDiv.addEventListener("click", (e) => {
            e.stopPropagation();
            showUserInfo(member.username);
        });
        
        membersList.appendChild(memberDiv);
    });
}

function loadUserRooms() {
    if (!currentUser.authenticated) return;

    fetch(`/user-rooms/${currentUser.username}`, {
            headers: {
                "X-Session-ID": currentUser.sessionId,
            },
        })
        .then((res) => {
            if (!res.ok) throw new Error("Session expired");
            return res.json();
        })
        .then((data) => {
            if (data.success) {
                displayUserRooms(data.rooms);
            }
        })
        .catch((error) => {
            console.error("Error loading rooms:", error);
            if (error.message === "Session expired") {
                handleSessionExpired();
            }
        });
}

function displayUserRooms(rooms) {
    const roomsList = document.getElementById("rooms-list");
    roomsList.innerHTML = "";

    if (rooms.length === 0) {
        roomsList.innerHTML = `
      <div class="no-rooms">
        <p>You haven't joined any rooms yet.</p>
        <p>Create a new room or join with an invite code!</p>
      </div>
    `;
        return;
    }

    rooms.forEach((room) => {
        const roomCard = document.createElement("div");
        roomCard.className = "room-card";
        roomCard.innerHTML = `
      <div class="room-card-header">
        <h3>${room.name}</h3>
        <span class="room-invite-code">${room.invite_code}</span>
      </div>
      <div class="room-card-footer">
        <span class="room-created">Created ${new Date(room.created_at).toLocaleDateString()}</span>
        <button class="btn btn-primary btn-sm enter-room-btn" data-room-id="${room.id}">Enter Room</button>
      </div>
    `;

        roomCard.querySelector(".enter-room-btn").addEventListener("click", () => {
            enterRoom(room.id, room.name, room.invite_code);
            
            // Clear unread όταν μπαίνεις στο room
            clearUnread('group', null, room.id);
        });

        roomsList.appendChild(roomCard);
    });
    
    // Ενημέρωση badges μετά τη φόρτωση
    updateRoomsListBadges();
}

function enterRoom(roomId, roomName, inviteCode) {
    console.log("🚀 Entering room:", { roomId, roomName, inviteCode });
    
    currentRoom = { id: roomId, name: roomName, inviteCode: inviteCode };

    // Update UI
    document.getElementById("room-name-sidebar").textContent = roomName;
    document.getElementById("room-name-header").textContent = roomName;
    document.getElementById("room-invite-code").textContent = inviteCode;

    // Clear messages
    document.getElementById("messages-container").innerHTML = "";

    // Emit join room
    console.log("📡 Emitting join room event...");
    
    socket.emit("join room", {
        roomId: roomId,
        username: currentUser.username,
        sessionId: currentUser.sessionId,
    });

    showPage("chat-page");
    
    // Request room data after a short delay
    setTimeout(() => {
        socket.emit("get room info", { roomId: roomId });
        socket.emit("get room members", { roomId: roomId });
    }, 500);
}

// ===== FRIENDS SYSTEM FUNCTIONS =====

async function loadUserFriends() {
    if (!currentUser.authenticated) return;

    try {
        const [friendsResponse, pendingResponse] = await Promise.all([
            fetch(`/friends/${currentUser.username}`, {
                headers: {
                    "X-Session-ID": currentUser.sessionId,
                },
            }),
            fetch(`/pending-requests/${currentUser.username}`, {
                headers: {
                    "X-Session-ID": currentUser.sessionId,
                },
            }),
        ]);

        if (!friendsResponse.ok || !pendingResponse.ok) {
            throw new Error("Session expired");
        }

        const friendsData = await friendsResponse.json();
        const pendingData = await pendingResponse.json();

        if (friendsData.success && pendingData.success) {
            displayUserFriends(friendsData.friends, pendingData.requests);
            document.getElementById("display-my-username").textContent = currentUser.username;
        }
    } catch (error) {
        console.error("Error loading friends:", error);
        if (error.message === "Session expired") {
            handleSessionExpired();
        }
    }
}

function displayUserFriends(friends, pendingRequests) {
    const friendsList = document.getElementById("friends-list");
    friendsList.innerHTML = "";

    if (pendingRequests.length > 0) {
        const pendingSection = document.createElement("div");
        pendingSection.className = "friends-section";
        pendingSection.innerHTML = `
            <h3>Pending Friend Requests</h3>
            <div class="pending-requests-list">
                ${pendingRequests
                  .map(
                    (request) => `
                    <div class="friend-card pending">
                        <div class="friend-info">
                            <div class="friend-avatar">${request.friend_username.substring(0, 2).toUpperCase()}</div>
                            <div class="friend-details">
                                <span class="friend-name">${request.friend_username}</span>
                                <span class="friend-since">Request sent ${new Date(request.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div class="friend-actions">
                            <button class="btn btn-success btn-sm accept-request-btn" data-friend="${request.friend_username}">✓ Accept</button>
                            <button class="btn btn-danger btn-sm decline-request-btn" data-friend="${request.friend_username}">✗ Decline</button>
                        </div>
                    </div>
                `
                  )
                  .join("")}
            </div>
        `;
        friendsList.appendChild(pendingSection);

        pendingSection.querySelectorAll(".accept-request-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const friendUsername = e.target.dataset.friend;
                handleRespondToFriendRequest(friendUsername, true);
            });
        });

        pendingSection.querySelectorAll(".decline-request-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const friendUsername = e.target.dataset.friend;
                handleRespondToFriendRequest(friendUsername, false);
            });
        });
    }

    const friendsSection = document.createElement("div");
    friendsSection.className = "friends-section";

    if (friends.length === 0 && pendingRequests.length === 0) {
        friendsSection.innerHTML = `
            <div class="no-friends">
                <p>You haven't added any friends yet.</p>
                <p>Add friends to start private conversations!</p>
            </div>
        `;
    } else if (friends.length > 0) {
        friendsSection.innerHTML = `
            <h3>Your Friends (${friends.length})</h3>
            <div class="friends-list">
                ${friends
                  .map(
                    (friend) => `
                    <div class="friend-card">
                        <div class="friend-info">
                            <div class="friend-avatar">${friend.friend_username.substring(0, 2).toUpperCase()}</div>
                            <div class="friend-details">
                                <span class="friend-name">${friend.friend_username}</span>
                                <span class="friend-since">Friends since ${new Date(friend.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div class="friend-actions">
                            <button class="btn btn-primary btn-sm chat-friend-btn" data-friend="${friend.friend_username}">💬 Chat</button>
                            <button class="btn btn-danger btn-sm remove-friend-btn" data-friend="${friend.friend_username}">Remove</button>
                        </div>
                    </div>
                `
                  )
                  .join("")}
            </div>
        `;

        friendsSection.querySelectorAll(".chat-friend-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const friendUsername = e.target.dataset.friend;
                startPrivateChatWithFriend(friendUsername);
                
                // Clear unread όταν ανοίγεις chat
                clearUnread('private', friendUsername);
            });
        });

        friendsSection.querySelectorAll(".remove-friend-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const friendUsername = e.target.dataset.friend;
                showConfirmationModal(
                    `Remove ${friendUsername} from friends?`,
                    "Remove Friend",
                    () => handleRemoveFriend(friendUsername)
                );
            });
        });
    }

    friendsList.appendChild(friendsSection);
    
    // Ενημέρωση badges μετά τη φόρτωση
    updateFriendsListBadges();
}

// ===== FRIENDS SYSTEM FUNCTIONS - FIXED =====

async function handleAddFriend(friendUsername) {
    const trimmedUsername = friendUsername.trim();
    
    if (!trimmedUsername) {
        showNotification("Please enter a username!", "warning", "Missing Info");
        return;
    }

    if (trimmedUsername.toLowerCase() === currentUser.username.toLowerCase()) {
        showNotification("You cannot add yourself as a friend!", "warning", "Invalid Action");
        return;
    }

    try {
        const response = await fetch("/send-friend-request", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                fromUser: currentUser.username,
                toUser: trimmedUsername,
            }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showNotification(data.message, "success", "Friend Request Sent");
            hideAllModals();
            document.getElementById("friend-username-input").value = "";
            loadUserFriends();
        } else {
            let errorMessage = data.error || "Failed to send friend request";
            let errorTitle = "Friend Request Failed";

            if (response.status === 404) {
                errorMessage = `User "${trimmedUsername}" does not exist!`;
                errorTitle = "User Not Found";
            } else if (response.status === 400) {
                if (data.error.includes("Already friends")) {
                    errorTitle = "Already Friends";
                } else if (data.error.includes("already sent")) {
                    errorTitle = "Request Already Sent";
                }
            } else if (response.status === 401) {
                handleSessionExpired();
                return;
            }

            showNotification(errorMessage, "error", errorTitle);
        }
    } catch (error) {
        console.error("Error sending friend request:", error);
        showNotification(
            "Connection error. Please check your internet and try again.",
            "error",
            "Connection Error"
        );
    }
}

async function handleRespondToFriendRequest(friendUsername, accept) {
    try {
        const response = await fetch("/respond-friend-request", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                username: currentUser.username,
                friendUsername: friendUsername,
                accept: accept,
            }),
        });

        if (!response.ok) {
            throw new Error("Session expired");
        }

        const data = await response.json();

        if (data.success) {
            showNotification(data.message, "success", accept ? "Friend Added" : "Request Declined");
            loadUserFriends();
        } else {
            showNotification(data.error || "Failed to respond to request", "error", "Action Failed");
        }
    } catch (error) {
        if (error.message === "Session expired") {
            handleSessionExpired();
        } else {
            showNotification(
                "Error responding to request: " + error.message,
                "error",
                "Connection Error"
            );
        }
    }
}

async function handleRemoveFriend(friendUsername) {
    try {
        const response = await fetch("/remove-friend", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                username: currentUser.username,
                friendUsername: friendUsername,
            }),
        });

        if (!response.ok) {
            throw new Error("Session expired");
        }

        const data = await response.json();

        if (data.success) {
            showNotification("Friend removed", "info", "Friend Removed");
            loadUserFriends();
        } else {
            showNotification(data.error || "Failed to remove friend", "error", "Action Failed");
        }
    } catch (error) {
        if (error.message === "Session expired") {
            handleSessionExpired();
        } else {
            showNotification("Error removing friend: " + error.message, "error", "Connection Error");
        }
    }
}

function startPrivateChatWithFriend(friendUsername) {
    // Δημιουργία μοναδικού κωδικού για το private chat
    const privateChatId = `private_${currentUser.username}_${friendUsername}_${Date.now()}`;
    const privateInviteCode = `PRV_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    currentRoom = {
        id: privateChatId,
        name: friendUsername,
        inviteCode: privateInviteCode,
        isPrivate: true,
    };

    document.getElementById("room-name-sidebar").textContent = friendUsername;
    document.getElementById("room-name-header").textContent = `Private Chat with ${friendUsername}`;
    document.getElementById("room-invite-code").textContent = privateInviteCode;
    document.getElementById("sidebar-username").textContent = currentUser.username;
    document.getElementById("sidebar-avatar").textContent = currentUser.username
        .substring(0, 2)
        .toUpperCase();

    document.getElementById("room-description").textContent =
        `Private conversation with ${friendUsername}`;
    document.getElementById("room-status").textContent = "Private chat";

    document.getElementById("room-members-list").innerHTML = `
        <div class="member-item">
            <div class="member-avatar">${currentUser.username.substring(0, 2).toUpperCase()}</div>
            <div class="member-info">
                <span class="member-name">${currentUser.username}</span>
                <span class="member-joined">You</span>
            </div>
        </div>
        <div class="member-item">
            <div class="member-avatar">${friendUsername.substring(0, 2).toUpperCase()}</div>
            <div class="member-info">
                <span class="member-name">${friendUsername}</span>
                <span class="member-joined">Friend</span>
            </div>
        </div>
    `;

    document.getElementById("messages-container").innerHTML = "";
    loadPrivateMessages(friendUsername);
    showPage("chat-page");
}

async function loadPrivateMessages(friendUsername) {
    try {
        const response = await fetch(`/private-messages/${currentUser.username}/${friendUsername}`, {
            headers: {
                "X-Session-ID": currentUser.sessionId,
            },
        });

        if (!response.ok) {
            throw new Error("Session expired");
        }

        const data = await response.json();

        if (data.success) {
            const messagesContainer = document.getElementById("messages-container");
            messagesContainer.innerHTML = "";
            data.messages.forEach((msg) => addMessageToChat(msg));
        }
    } catch (error) {
        if (error.message === "Session expired") {
            handleSessionExpired();
        } else {
            console.error("Error loading private messages:", error);
        }
    }
}

// ===== USER INFO SYSTEM FUNCTIONS =====

// Βοηθητική συνάρτηση για avatar colors
function getAvatarColor(username) {
    const colors = [
        "#8B0000", "#1A1A1A", "#228B22", "#FFA500", "#4285F4",
        "#9932CC", "#20B2AA", "#FF4500", "#4682B4", "#32CD32"
    ];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

async function showUserInfo(username) {
    if (!username || username === currentUser.username) return;
    
    currentViewedUser = username;
    
    try {
        // Φόρτωση βασικών στοιχείων χρήστη
        const response = await fetch(`/user-info/${username}`, {
            headers: {
                "X-Session-ID": currentUser.sessionId,
            },
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                handleSessionExpired();
                return;
            }
            throw new Error(`Server returned ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            updateUserInfoModal(data.user);
            showModal("user-info-modal");
            
            // Check friendship status
            await checkFriendshipStatus(username);
        } else {
            showNotification(data.error || "Could not load user information", "error", "Error");
        }
    } catch (error) {
        console.error("Error loading user info:", error);
        showNotification("Could not load user information. Please try again.", "error", "Error");
    }
}

async function checkFriendshipStatus(friendUsername) {
    try {
        const response = await fetch(`/check-friendship/${currentUser.username}/${friendUsername}`, {
            headers: {
                "X-Session-ID": currentUser.sessionId,
            },
        });
        
        if (response.ok) {
            const data = await response.json();
            const addFriendBtn = document.getElementById("add-as-friend-btn");
            
            if (data.success) {
                if (data.areFriends) {
                    addFriendBtn.style.display = 'none';
                } else if (data.hasPendingRequest) {
                    addFriendBtn.innerHTML = '<i class="fas fa-clock"></i> Request Pending';
                    addFriendBtn.disabled = true;
                    addFriendBtn.style.display = 'block';
                } else {
                    addFriendBtn.innerHTML = '<i class="fas fa-user-plus"></i> Add Friend';
                    addFriendBtn.disabled = false;
                    addFriendBtn.style.display = 'block';
                }
            }
        }
    } catch (error) {
        console.error("Error checking friendship status:", error);
        // Μην εμφανίσεις error, απλά μην δείξεις το κουμπί
        const addFriendBtn = document.getElementById("add-as-friend-btn");
        addFriendBtn.style.display = 'none';
    }
}

function updateUserInfoModal(user) {
    document.getElementById("user-info-title").textContent = `${user.username}'s Profile`;
    document.getElementById("user-info-username").textContent = user.username;
    document.getElementById("user-info-status").textContent = user.status || "Offline";
    document.getElementById("user-info-status").className = `info-value status-${user.status?.toLowerCase() || 'offline'}`;
    
    if (user.created_at) {
        const joinedDate = new Date(user.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        document.getElementById("user-info-joined").textContent = joinedDate;
    } else {
        document.getElementById("user-info-joined").textContent = "Unknown";
    }
    
    // Profile picture
    if (user.profile_picture) {
        document.getElementById("user-info-image").src = user.profile_picture;
    } else {
        // Default avatar αν δεν έχει εικόνα
        const initials = user.username.substring(0, 2).toUpperCase();
        const color = getAvatarColor(user.username);
        const avatarElement = document.getElementById("user-info-image");
        if (avatarElement) {
            // Δημιουργία SVG avatar αν λείπει η εικόνα
            avatarElement.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="${color}" rx="60"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="40" fill="white" text-anchor="middle" dy=".3em">${initials}</text></svg>`;
        }
    }
    
    const addFriendBtn = document.getElementById("add-as-friend-btn");
    const sendMessageBtn = document.getElementById("send-private-message-btn");
    const mutualRoomsBtn = document.getElementById("view-mutual-rooms-btn");
    
    if (user.username === currentUser.username) {
        addFriendBtn.style.display = 'none';
        sendMessageBtn.disabled = true;
        sendMessageBtn.innerHTML = '<i class="fas fa-user"></i> This is you';
        sendMessageBtn.classList.remove("btn-primary");
        sendMessageBtn.classList.add("btn-secondary");
        mutualRoomsBtn.disabled = true;
        mutualRoomsBtn.innerHTML = '<i class="fas fa-door-open"></i> No mutual rooms';
    } else {
        // Αρχικά κρύψε το κουμπί μέχρι να ελεγχθεί η φιλία
        addFriendBtn.style.display = 'none';
        sendMessageBtn.disabled = false;
        sendMessageBtn.innerHTML = '<i class="fas fa-comment"></i> Send Message';
        sendMessageBtn.classList.remove("btn-secondary");
        sendMessageBtn.classList.add("btn-primary");
        mutualRoomsBtn.disabled = false;
        mutualRoomsBtn.innerHTML = '<i class="fas fa-door-open"></i> Mutual Rooms';
    }
}

// Make member items clickable for user info
function makeMemberItemsClickable() {
    const memberItems = document.querySelectorAll(".member-item");
    memberItems.forEach(item => {
        item.style.cursor = "pointer";
        
        item.addEventListener("mouseenter", function() {
            this.style.backgroundColor = "rgba(51, 51, 51, 0.5)";
            this.style.transform = "translateX(5px)";
        });
        
        item.addEventListener("mouseleave", function() {
            this.style.backgroundColor = "";
            this.style.transform = "";
        });
        
        item.addEventListener("click", function(e) {
            e.stopPropagation();
            const nameElement = this.querySelector(".member-name");
            if (nameElement) {
                showUserInfo(nameElement.textContent);
            }
        });
    });
}

// ===== AUTHENTICATION FUNCTIONS =====

async function handleLogin(email, password) {
    try {
        const response = await fetch("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (data.success) {
            currentUser = {
                username: data.user.username,
                email: data.user.email,
                authenticated: true,
                sessionId: data.sessionId,
            };

            saveUserToLocalStorage(currentUser);
            updateUIForAuthState();
            hideAllModals();
            showNotification("Welcome back, " + currentUser.username + "!", "success", "Welcome!");

            socket.emit("authenticate", {
                username: currentUser.username,
                sessionId: currentUser.sessionId,
            });

            loadUserRooms();
        } else {
            showNotification(data.error || "Login failed", "error", "Login Error");
        }
    } catch (error) {
        showNotification("Login error: " + error.message, "error", "Connection Error");
    }
}

async function handleRegister(email, username, password, confirmPassword) {
    if (password !== confirmPassword) {
        showNotification("Passwords do not match!", "error", "Registration Error");
        return;
    }

    try {
        const formData = new FormData();
        formData.append("email", email);
        formData.append("username", username);
        formData.append("password", password);
        
        const avatarInput = document.getElementById("register-avatar-input");
        if (avatarInput.files[0]) {
            formData.append("avatar", avatarInput.files[0]);
        }
        
        const response = await fetch("/register", {
            method: "POST",
            body: formData,
        });

        const data = await response.json();

        if (data.success) {
            showNotification("Account created! Please login.", "success", "Registration Successful");
            hideAllModals();
            showModal("login-modal");
        } else {
            showNotification(data.error || "Registration failed", "error", "Registration Error");
        }
    } catch (error) {
        showNotification("Registration error: " + error.message, "error", "Connection Error");
    }
}

function handleLogout() {
    if (currentUser.authenticated) {
        fetch("/logout", {
            method: "POST",
            headers: {
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                username: currentUser.username,
            }),
        }).catch((error) => {
            console.error("Logout error:", error);
        });
    }

    currentUser = { username: null, email: null, authenticated: false, sessionId: null };
    currentRoom = { id: null, name: null, inviteCode: null };
    
    // Clear local unread data
    unreadMessages = { private: {}, groups: {}, total: 0 };
    updateUnreadBadges();
    
    clearUserFromLocalStorage();
    updateUIForAuthState();
    showPage("home-page");
    showNotification("Logged out successfully!", "info", "Goodbye!");

    socket.disconnect();
    socket.connect();
}

function handleSessionExpired() {
    showNotification("Session expired. Please login again.", "error", "Session Expired");
    handleLogout();
}

// ===== ROOM FUNCTIONS =====

async function handleCreateRoom(roomName) {
    if (!roomName.trim()) {
        showNotification("Please enter a room name!", "warning", "Missing Info");
        return;
    }

    try {
        const response = await fetch("/create-room", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({ name: roomName, username: currentUser.username }),
        });

        if (!response.ok) {
            throw new Error("Session expired");
        }

        const data = await response.json();

        if (data.success) {
            showNotification(`Room created! Invite code: ${data.inviteCode}`, "success", "Room Created");
            hideAllModals();
            document.getElementById("room-name-input").value = "";
            enterRoom(data.roomId, roomName, data.inviteCode);
        } else {
            showNotification(data.error || "Failed to create room", "error", "Room Creation Failed");
        }
    } catch (error) {
        if (error.message === "Session expired") {
            handleSessionExpired();
        } else {
            showNotification("Error creating room: " + error.message, "error", "Connection Error");
        }
    }
}

async function handleJoinRoom(inviteCode) {
    if (!inviteCode.trim()) {
        showNotification("Please enter an invite code!", "warning", "Missing Info");
        return;
    }

    try {
        const response = await fetch("/join-room", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                inviteCode: inviteCode.trim(),
                username: currentUser.username,
            }),
        });

        if (!response.ok) {
            throw new Error("Session expired");
        }

        const data = await response.json();

        if (data.success) {
            showNotification("Joined room successfully!", "success", "Room Joined");
            hideAllModals();
            document.getElementById("invite-code-input").value = "";
            enterRoom(data.roomId, data.roomName, inviteCode.trim());
        } else {
            showNotification(data.error || "Failed to join room", "error", "Join Room Failed");
        }
    } catch (error) {
        if (error.message === "Session expired") {
            handleSessionExpired();
        } else {
            showNotification("Error joining room: " + error.message, "error", "Connection Error");
        }
    }
}

// 🔥 FIXED: LEAVE ROOM FUNCTION
async function handleLeaveRoom() {
    if (!currentRoom.id || currentRoom.isPrivate) return;
    
    showConfirmationModal(
        "Are you sure you want to leave this room?",
        "Leave Room",
        async () => {
            try {
                const response = await fetch("/leave-room", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Session-ID": currentUser.sessionId,
                    },
                    body: JSON.stringify({
                        roomId: currentRoom.id,
                        username: currentUser.username,
                    }),
                });

                if (!response.ok) {
                    throw new Error("Session expired");
                }

                const data = await response.json();

                if (data.success) {
                    showNotification("Left room successfully!", "info", "Room Left");
                    showPage("rooms-page");
                    loadUserRooms();
                    
                    // Reset current room
                    currentRoom = { id: null, name: null, inviteCode: null };
                } else {
                    showNotification(data.error || "Failed to leave room", "error", "Action Failed");
                }
            } catch (error) {
                if (error.message === "Session expired") {
                    handleSessionExpired();
                } else {
                    showNotification("Error leaving room: " + error.message, "error", "Connection Error");
                }
            }
        }
    );
}

// 🔥 FIXED: Το κύριο πρόβλημα - remove duplicate addMessageToChat call
function handleSendMessage() {
    const input = document.getElementById("message-input");
    const text = input.value.trim();

    if (!text || !currentRoom.id) return;

    const messageData = {
        text: text,
        sender: currentUser.username,
        time: getCurrentTime(),
    };

    if (currentRoom.isPrivate) {
        const friendUsername = currentRoom.name;
        messageData.receiver = friendUsername;
        socket.emit("private message", messageData);
    } else {
        messageData.room_id = currentRoom.id;
        socket.emit("chat message", messageData);
    }

    input.value = "";
    input.style.height = "auto";
}

// ===== PROFILE SYSTEM FUNCTIONS =====

async function loadUserProfile() {
    if (!currentUser.authenticated) return;
    
    try {
        const response = await fetch(`/user-profile/${currentUser.username}`, {
            headers: {
                "X-Session-ID": currentUser.sessionId,
            },
        });
        
        if (!response.ok) {
            throw new Error("Failed to load profile");
        }
        
        const data = await response.json();
        
        if (data.success) {
            updateProfileUI(data.profile);
            updateProfileStats(data.stats);
        }
    } catch (error) {
        console.error("Error loading profile:", error);
        showNotification("Could not load profile information", "error", "Profile Error");
    }
}

function updateProfileUI(profile) {
    // Basic info
    document.getElementById("profile-username").textContent = profile.username || currentUser.username;
    document.getElementById("profile-email").textContent = profile.email || currentUser.email;
    document.getElementById("info-username").textContent = profile.username || currentUser.username;
    document.getElementById("info-email").textContent = profile.email || currentUser.email;
    document.getElementById("info-status").textContent = profile.status || "Online";
    document.getElementById("info-status").className = `info-value status-${profile.status?.toLowerCase() || 'online'}`;
    
    // Joined date
    if (profile.created_at) {
        const joinedDate = new Date(profile.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        document.getElementById("info-joined").textContent = joinedDate;
    }
    
    // Profile picture
    if (profile.profile_picture) {
        document.getElementById("profile-image").src = profile.profile_picture;
        document.getElementById("profile-image").style.display = 'block';
    } else {
        document.getElementById("profile-image").src = 'default-avatar.png';
    }
}

function updateProfileStats(stats) {
    document.getElementById("stat-friends").textContent = stats.friends || 0;
    document.getElementById("stat-rooms").textContent = stats.rooms || 0;
    document.getElementById("stat-messages").textContent = stats.messages || 0;
}

function showProfilePage() {
    loadUserProfile();
    showPage("profile-page");
}

// Profile picture upload
async function uploadProfilePicture(file) {
    if (!file) return;
    
    const formData = new FormData();
    formData.append("profile_picture", file);
    formData.append("username", currentUser.username);
    
    try {
        const response = await fetch("/upload-profile-picture", {
            method: "POST",
            headers: {
                "X-Session-ID": currentUser.sessionId,
            },
            body: formData,
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showNotification("Profile picture updated!", "success", "Profile Updated");
                document.getElementById("profile-image").src = data.profile_picture + "?t=" + Date.now();
            }
        }
    } catch (error) {
        console.error("Error uploading profile picture:", error);
        showNotification("Failed to upload profile picture", "error", "Upload Error");
    }
}

// Edit profile
async function saveProfileChanges(username, email, profilePicture) {
    try {
        const updateData = {};
        if (username && username !== currentUser.username) {
            updateData.username = username;
        }
        if (email && email !== currentUser.email) {
            updateData.email = email;
        }
        
        if (Object.keys(updateData).length === 0 && !profilePicture) {
            showNotification("No changes to save", "info", "No Changes");
            return;
        }
        
        const response = await fetch("/update-profile", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                username: currentUser.username,
                updates: updateData
            }),
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                // Update current user if username changed
                if (data.user) {
                    currentUser.username = data.user.username;
                    currentUser.email = data.user.email;
                    updateUIForAuthState();
                }
                
                showNotification("Profile updated successfully!", "success", "Profile Updated");
                hideAllModals();
                loadUserProfile();
            }
        }
    } catch (error) {
        console.error("Error updating profile:", error);
        showNotification("Failed to update profile", "error", "Update Error");
    }
}

// Change password
async function changePassword(currentPassword, newPassword, confirmPassword) {
    if (newPassword !== confirmPassword) {
        showNotification("Passwords do not match!", "error", "Password Error");
        return;
    }
    
    try {
        const response = await fetch("/change-password", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                username: currentUser.username,
                currentPassword: currentPassword,
                newPassword: newPassword
            }),
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showNotification("Password changed successfully!", "success", "Password Changed");
                hideAllModals();
            } else {
                showNotification(data.error || "Failed to change password", "error", "Password Error");
            }
        }
    } catch (error) {
        console.error("Error changing password:", error);
        showNotification("Failed to change password", "error", "Connection Error");
    }
}

// ===== SOCKET EVENT HANDLERS =====

socket.on("connect", () => {
    console.log("🔗 Connected to server");
    if (currentUser.authenticated) {
        socket.emit("authenticate", {
            username: currentUser.username,
            sessionId: currentUser.sessionId,
        });
    }
});

socket.on("load messages", (messages) => {
    console.log("💬 Received messages:", messages.length);
    const messagesContainer = document.getElementById("messages-container");
    messagesContainer.innerHTML = "";
    messages.forEach((msg) => addMessageToChat(msg));
});

socket.on("chat message", (message) => {
    if (message.room_id === currentRoom.id) {
        addMessageToChat(message);
    } else if (message.sender !== currentUser.username) {
        // Προσθήκη unread για group message
        addUnreadMessage('group', message.sender, message.room_id);
        
        showNotification(
            `New message from ${message.sender} in a room`, 
            "info", 
            "New Room Message",
            {
                type: 'room_message',
                roomId: message.room_id,
                sender: message.sender
            }
        );
    }
});

socket.on("private message", (message) => {
    const isFromCurrentFriend =
        message.sender === currentRoom.name || message.receiver === currentRoom.name;
    if (currentRoom.isPrivate && isFromCurrentFriend) {
        addMessageToChat(message);
    } else if (message.sender !== currentUser.username) {
        // Προσθήκη unread για private message
        addUnreadMessage('private', message.sender);
        
        showNotification(
            `New private message from ${message.sender}: ${message.text.substring(0, 30)}...`, 
            "info", 
            "New Message",
            {
                type: 'private_message',
                sender: message.sender
            }
        );
    }
});

// 🔥 ΝΕΟ: Unread summary από server
socket.on("unread_summary", (summary) => {
    console.log("📊 Received unread summary:", summary);
    
    unreadMessages.private = summary.private || {};
    unreadMessages.groups = summary.groups || {};
    unreadMessages.total = summary.total || 0;
    
    updateUnreadBadges();
    updateFriendsListBadges();
    updateRoomsListBadges();
});

// 🔥 ΝΕΟ: Real-time unread updates
socket.on("unread_update", (data) => {
    console.log("📬 Unread update:", data);
    
    if (data.type === 'private') {
        addUnreadMessage('private', data.sender);
    } else if (data.type === 'group') {
        addUnreadMessage('group', data.sender, data.roomId);
    }
});

// 🔥 ΝΕΟ: Unread cleared confirmation - FIXED για console spam
socket.on("unread_cleared", (data) => {
    // Μόνο αν έχουμε πραγματικά δεδομένα
    if (data && (data.type || data.sender || data.roomId)) {
        console.log("✅ Unread cleared:", data);
        clearUnread(data.type, data.sender, data.roomId);
    }
});

// 🔥 ΝΕΟ: Server notifications με actions
socket.on("notification", (data) => {
    console.log("🔔 Server notification:", data);
    
    let notificationType = "info";
    let title = "Notification";
    
    switch (data.type) {
        case 'private_message':
            notificationType = "info";
            title = "New Message";
            addUnreadMessage('private', data.sender);
            break;
        case 'group_message':
            notificationType = "info";
            title = "Group Message";
            addUnreadMessage('group', data.sender, data.roomId);
            break;
        case 'friend_request':
            notificationType = "info";
            title = "Friend Request";
            break;
        case 'friend_request_accepted':
            notificationType = "success";
            title = "Friend Request Accepted";
            break;
    }
    
    showNotification(
        `${data.sender}: ${data.message || 'Friend request'}`,
        notificationType,
        title,
        data.action,
        data.count || 1
    );
});

socket.on("room members", (members) => {
    console.log("👥 Received room members:", members);
    if (!currentRoom.isPrivate) {
        updateRoomMembers(members);
        document.getElementById("room-status").textContent = `${members.length} members`;
        
        // Make member items clickable για το user info modal
        setTimeout(makeMemberItemsClickable, 100);
    }
});

socket.on("room info", (room) => {
    console.log("📦 Received room info:", room);
    if (room && room.id === currentRoom.id) {
        document.getElementById("room-name-sidebar").textContent = room.name;
        document.getElementById("room-name-header").textContent = room.name;
        document.getElementById("room-description").textContent = `Created by ${room.created_by}`;
    }
});

socket.on("friend_request", (data) => {
    showNotification(
        `New friend request from ${data.from}`, 
        "info", 
        "Friend Request",
        {
            type: 'friend_request',
            from: data.from
        }
    );
    if (document.getElementById("friends-page").classList.contains("active")) {
        loadUserFriends();
    }
});

socket.on("friend_request_accepted", (data) => {
    showNotification(
        `${data.by} accepted your friend request!`, 
        "success", 
        "Friend Request Accepted",
        {
            type: 'friend_request_accepted',
            by: data.by
        }
    );
    if (document.getElementById("friends-page").classList.contains("active")) {
        loadUserFriends();
    }
});

socket.on("session_expired", () => {
    handleSessionExpired();
});

socket.on("error", (data) => {
    showNotification(data.message, "error", "Error");
});

socket.on("disconnect", (reason) => {
    console.log("🔌 Disconnected from server:", reason);
    if (reason === "io server disconnect") {
        socket.connect();
    }
});

socket.on("connect_error", (error) => {
    console.error("🔌 Connection error:", error);
});

// ===== EVENT LISTENERS =====

function initializeEventListeners() {
    document.getElementById("home-btn").addEventListener("click", () => showPage("home-page"));
    document.getElementById("my-rooms-btn").addEventListener("click", () => {
        loadUserRooms();
        showPage("rooms-page");
    });

    document.getElementById("my-friends-btn").addEventListener("click", () => {
        loadUserFriends();
        showPage("friends-page");
    });

    // ΠΡΟΣΘΗΚΗ: Profile button listener
    document.getElementById("my-profile-btn").addEventListener("click", showProfilePage);

    document.getElementById("logout-btn").addEventListener("click", handleLogout);

    document
        .getElementById("login-nav-btn")
        .addEventListener("click", () => showModal("login-modal"));
    document
        .getElementById("home-login-btn")
        .addEventListener("click", () => showModal("login-modal"));

    document
        .getElementById("register-nav-btn")
        .addEventListener("click", () => showModal("register-modal"));
    document
        .getElementById("home-register-btn")
        .addEventListener("click", () => showModal("register-modal"));

    document
        .getElementById("create-room-btn")
        .addEventListener("click", () => showModal("create-room-modal"));
    document
        .getElementById("create-room-btn-2")
        .addEventListener("click", () => showModal("create-room-modal"));

    document
        .getElementById("join-room-btn")
        .addEventListener("click", () => showModal("join-room-modal"));
    document
        .getElementById("join-room-btn-2")
        .addEventListener("click", () => showModal("join-room-modal"));

    document.getElementById("add-friend-btn").addEventListener("click", () => {
        showModal("add-friend-modal");
    });

    document.querySelectorAll(".close-modal-btn").forEach((btn) => {
        btn.addEventListener("click", hideAllModals);
    });

    document.querySelectorAll('[id$="-cancel"]').forEach((btn) => {
        btn.addEventListener("click", hideAllModals);
    });

    document.getElementById("switch-to-register").addEventListener("click", () => {
        hideAllModals();
        showModal("register-modal");
    });

    document.getElementById("switch-to-login").addEventListener("click", () => {
        hideAllModals();
        showModal("login-modal");
    });

    document.getElementById("login-submit").addEventListener("click", () => {
        const email = document.getElementById("login-email").value;
        const password = document.getElementById("login-password").value;
        handleLogin(email, password);
    });

    document.getElementById("register-submit").addEventListener("click", () => {
        const email = document.getElementById("register-email").value;
        const username = document.getElementById("register-username").value;
        const password = document.getElementById("register-password").value;
        const confirm = document.getElementById("register-confirm").value;
        handleRegister(email, username, password, confirm);
    });

    document.getElementById("create-room-submit").addEventListener("click", () => {
        const roomName = document.getElementById("room-name-input").value;
        handleCreateRoom(roomName);
    });

    document.getElementById("join-room-submit").addEventListener("click", () => {
        const inviteCode = document.getElementById("invite-code-input").value;
        handleJoinRoom(inviteCode);
    });

    document.getElementById("add-friend-submit").addEventListener("click", () => {
        const friendUsername = document.getElementById("friend-username-input").value;
        handleAddFriend(friendUsername);
    });

    const chatForm = document.getElementById("chat-form");
    const messageInput = document.getElementById("message-input");

    chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        handleSendMessage();
    });

    messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    messageInput.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = this.scrollHeight + "px";
    });

    document.getElementById("copy-invite-btn").addEventListener("click", () => {
        const inviteCode = document.getElementById("room-invite-code").textContent;
        navigator.clipboard.writeText(inviteCode).then(() => {
            showNotification("Invite code copied!", "success", "Copied!");
        });
    });

    document.getElementById("copy-username-btn").addEventListener("click", () => {
        const username = document.getElementById("display-my-username").textContent;
        navigator.clipboard.writeText(username).then(() => {
            showNotification("Username copied!", "success", "Copied!");
        });
    });

// 🔥 FIXED: LEAVE ROOM FUNCTION
async function handleLeaveRoom() {
    if (!currentRoom.id || currentRoom.isPrivate) return;
    
    showConfirmationModal(
        "Are you sure you want to leave this room?",
        "Leave Room",
        async () => {
            try {
                const response = await fetch("/leave-room", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Session-ID": currentUser.sessionId,
                    },
                    body: JSON.stringify({
                        roomId: currentRoom.id,
                        username: currentUser.username,
                    }),
                });

                if (!response.ok) {
                    throw new Error("Session expired");
                }

                const data = await response.json();

                if (data.success) {
                    showNotification("Left room successfully!", "info", "Room Left");
                    showPage("rooms-page");
                    loadUserRooms();
                    
                    // Reset current room
                    currentRoom = { id: null, name: null, inviteCode: null };
                } else {
                    showNotification(data.error || "Failed to leave room", "error", "Action Failed");
                }
            } catch (error) {
                if (error.message === "Session expired") {
                    handleSessionExpired();
                } else {
                    showNotification("Error leaving room: " + error.message, "error", "Connection Error");
                }
            }
        }
    );
}

// 🔥 FIXED: Το κύριο πρόβλημα - remove duplicate addMessageToChat call
function handleSendMessage() {
    const input = document.getElementById("message-input");
    const text = input.value.trim();

    if (!text || !currentRoom.id) return;

    const messageData = {
        text: text,
        sender: currentUser.username,
        time: getCurrentTime(),
    };

    if (currentRoom.isPrivate) {
        const friendUsername = currentRoom.name;
        messageData.receiver = friendUsername;
        socket.emit("private message", messageData);
    } else {
        messageData.room_id = currentRoom.id;
        socket.emit("chat message", messageData);
    }

    input.value = "";
    input.style.height = "auto";
}

// ===== PROFILE SYSTEM FUNCTIONS =====

async function loadUserProfile() {
    if (!currentUser.authenticated) return;
    
    try {
        const response = await fetch(`/user-profile/${currentUser.username}`, {
            headers: {
                "X-Session-ID": currentUser.sessionId,
            },
        });
        
        if (!response.ok) {
            throw new Error("Failed to load profile");
        }
        
        const data = await response.json();
        
        if (data.success) {
            updateProfileUI(data.profile);
            updateProfileStats(data.stats);
        }
    } catch (error) {
        console.error("Error loading profile:", error);
        showNotification("Could not load profile information", "error", "Profile Error");
    }
}

function updateProfileUI(profile) {
    // Basic info
    document.getElementById("profile-username").textContent = profile.username || currentUser.username;
    document.getElementById("profile-email").textContent = profile.email || currentUser.email;
    document.getElementById("info-username").textContent = profile.username || currentUser.username;
    document.getElementById("info-email").textContent = profile.email || currentUser.email;
    document.getElementById("info-status").textContent = profile.status || "Online";
    document.getElementById("info-status").className = `info-value status-${profile.status?.toLowerCase() || 'online'}`;
    
    // Joined date
    if (profile.created_at) {
        const joinedDate = new Date(profile.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        document.getElementById("info-joined").textContent = joinedDate;
    }
    
    // Profile picture
    if (profile.profile_picture) {
        document.getElementById("profile-image").src = profile.profile_picture;
        document.getElementById("profile-image").style.display = 'block';
    } else {
        document.getElementById("profile-image").src = 'default-avatar.png';
    }
}

function updateProfileStats(stats) {
    document.getElementById("stat-friends").textContent = stats.friends || 0;
    document.getElementById("stat-rooms").textContent = stats.rooms || 0;
    document.getElementById("stat-messages").textContent = stats.messages || 0;
}

function showProfilePage() {
    loadUserProfile();
    showPage("profile-page");
}

// Profile picture upload
async function uploadProfilePicture(file) {
    if (!file) return;
    
    const formData = new FormData();
    formData.append("profile_picture", file);
    formData.append("username", currentUser.username);
    
    try {
        const response = await fetch("/upload-profile-picture", {
            method: "POST",
            headers: {
                "X-Session-ID": currentUser.sessionId,
            },
            body: formData,
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showNotification("Profile picture updated!", "success", "Profile Updated");
                document.getElementById("profile-image").src = data.profile_picture + "?t=" + Date.now();
            }
        }
    } catch (error) {
        console.error("Error uploading profile picture:", error);
        showNotification("Failed to upload profile picture", "error", "Upload Error");
    }
}

// Edit profile
async function saveProfileChanges(username, email, profilePicture) {
    try {
        const updateData = {};
        if (username && username !== currentUser.username) {
            updateData.username = username;
        }
        if (email && email !== currentUser.email) {
            updateData.email = email;
        }
        
        if (Object.keys(updateData).length === 0 && !profilePicture) {
            showNotification("No changes to save", "info", "No Changes");
            return;
        }
        
        const response = await fetch("/update-profile", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                username: currentUser.username,
                updates: updateData
            }),
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                // Update current user if username changed
                if (data.user) {
                    currentUser.username = data.user.username;
                    currentUser.email = data.user.email;
                    updateUIForAuthState();
                }
                
                showNotification("Profile updated successfully!", "success", "Profile Updated");
                hideAllModals();
                loadUserProfile();
            }
        }
    } catch (error) {
        console.error("Error updating profile:", error);
        showNotification("Failed to update profile", "error", "Update Error");
    }
}

// Change password
async function changePassword(currentPassword, newPassword, confirmPassword) {
    if (newPassword !== confirmPassword) {
        showNotification("Passwords do not match!", "error", "Password Error");
        return;
    }
    
    try {
        const response = await fetch("/change-password", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                username: currentUser.username,
                currentPassword: currentPassword,
                newPassword: newPassword
            }),
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showNotification("Password changed successfully!", "success", "Password Changed");
                hideAllModals();
            } else {
                showNotification(data.error || "Failed to change password", "error", "Password Error");
            }
        }
    } catch (error) {
        console.error("Error changing password:", error);
        showNotification("Failed to change password", "error", "Connection Error");
    }
}

// ===== SOCKET EVENT HANDLERS =====

socket.on("connect", () => {
    console.log("🔗 Connected to server");
    if (currentUser.authenticated) {
        socket.emit("authenticate", {
            username: currentUser.username,
            sessionId: currentUser.sessionId,
        });
    }
});

socket.on("load messages", (messages) => {
    console.log("💬 Received messages:", messages.length);
    const messagesContainer = document.getElementById("messages-container");
    messagesContainer.innerHTML = "";
    messages.forEach((msg) => addMessageToChat(msg));
});

socket.on("chat message", (message) => {
    if (message.room_id === currentRoom.id) {
        addMessageToChat(message);
    } else if (message.sender !== currentUser.username) {
        // Προσθήκη unread για group message
        addUnreadMessage('group', message.sender, message.room_id);
        
        showNotification(
            `New message from ${message.sender} in a room`, 
            "info", 
            "New Room Message",
            {
                type: 'room_message',
                roomId: message.room_id,
                sender: message.sender
            }
        );
    }
});

socket.on("private message", (message) => {
    const isFromCurrentFriend =
        message.sender === currentRoom.name || message.receiver === currentRoom.name;
    if (currentRoom.isPrivate && isFromCurrentFriend) {
        addMessageToChat(message);
    } else if (message.sender !== currentUser.username) {
        // Προσθήκη unread για private message
        addUnreadMessage('private', message.sender);
        
        showNotification(
            `New private message from ${message.sender}: ${message.text.substring(0, 30)}...`, 
            "info", 
            "New Message",
            {
                type: 'private_message',
                sender: message.sender
            }
        );
    }
});

// 🔥 ΝΕΟ: Unread summary από server
socket.on("unread_summary", (summary) => {
    console.log("📊 Received unread summary:", summary);
    
    unreadMessages.private = summary.private || {};
    unreadMessages.groups = summary.groups || {};
    unreadMessages.total = summary.total || 0;
    
    updateUnreadBadges();
    updateFriendsListBadges();
    updateRoomsListBadges();
});

// 🔥 ΝΕΟ: Real-time unread updates
socket.on("unread_update", (data) => {
    console.log("📬 Unread update:", data);
    
    if (data.type === 'private') {
        addUnreadMessage('private', data.sender);
    } else if (data.type === 'group') {
        addUnreadMessage('group', data.sender, data.roomId);
    }
});

// 🔥 ΝΕΟ: Unread cleared confirmation - FIXED για console spam
socket.on("unread_cleared", (data) => {
    // Μόνο αν έχουμε πραγματικά δεδομένα
    if (data && (data.type || data.sender || data.roomId)) {
        console.log("✅ Unread cleared:", data);
        clearUnread(data.type, data.sender, data.roomId);
    }
});

// 🔥 ΝΕΟ: Server notifications με actions
socket.on("notification", (data) => {
    console.log("🔔 Server notification:", data);
    
    let notificationType = "info";
    let title = "Notification";
    
    switch (data.type) {
        case 'private_message':
            notificationType = "info";
            title = "New Message";
            addUnreadMessage('private', data.sender);
            break;
        case 'group_message':
            notificationType = "info";
            title = "Group Message";
            addUnreadMessage('group', data.sender, data.roomId);
            break;
        case 'friend_request':
            notificationType = "info";
            title = "Friend Request";
            break;
        case 'friend_request_accepted':
            notificationType = "success";
            title = "Friend Request Accepted";
            break;
    }
    
    showNotification(
        `${data.sender}: ${data.message || 'Friend request'}`,
        notificationType,
        title,
        data.action,
        data.count || 1
    );
});

socket.on("room members", (members) => {
    console.log("👥 Received room members:", members);
    if (!currentRoom.isPrivate) {
        updateRoomMembers(members);
        document.getElementById("room-status").textContent = `${members.length} members`;
        
        // Make member items clickable για το user info modal
        setTimeout(makeMemberItemsClickable, 100);
    }
});

socket.on("room info", (room) => {
    console.log("📦 Received room info:", room);
    if (room && room.id === currentRoom.id) {
        document.getElementById("room-name-sidebar").textContent = room.name;
        document.getElementById("room-name-header").textContent = room.name;
        document.getElementById("room-description").textContent = `Created by ${room.created_by}`;
    }
});

socket.on("friend_request", (data) => {
    showNotification(
        `New friend request from ${data.from}`, 
        "info", 
        "Friend Request",
        {
            type: 'friend_request',
            from: data.from
        }
    );
    if (document.getElementById("friends-page").classList.contains("active")) {
        loadUserFriends();
    }
});

socket.on("friend_request_accepted", (data) => {
    showNotification(
        `${data.by} accepted your friend request!`, 
        "success", 
        "Friend Request Accepted",
        {
            type: 'friend_request_accepted',
            by: data.by
        }
    );
    if (document.getElementById("friends-page").classList.contains("active")) {
        loadUserFriends();
    }
});

socket.on("session_expired", () => {
    handleSessionExpired();
});

socket.on("error", (data) => {
    showNotification(data.message, "error", "Error");
});

socket.on("disconnect", (reason) => {
    console.log("🔌 Disconnected from server:", reason);
    if (reason === "io server disconnect") {
        socket.connect();
    }
});

socket.on("connect_error", (error) => {
    console.error("🔌 Connection error:", error);
});

// ===== EVENT LISTENERS =====

function initializeEventListeners() {
    document.getElementById("home-btn").addEventListener("click", () => showPage("home-page"));
    document.getElementById("my-rooms-btn").addEventListener("click", () => {
        loadUserRooms();
        showPage("rooms-page");
    });

    document.getElementById("my-friends-btn").addEventListener("click", () => {
        loadUserFriends();
        showPage("friends-page");
    });

    // ΠΡΟΣΘΗΚΗ: Profile button listener
    document.getElementById("my-profile-btn").addEventListener("click", showProfilePage);

    document.getElementById("logout-btn").addEventListener("click", handleLogout);

    document
        .getElementById("login-nav-btn")
        .addEventListener("click", () => showModal("login-modal"));
    document
        .getElementById("home-login-btn")
        .addEventListener("click", () => showModal("login-modal"));

    document
        .getElementById("register-nav-btn")
        .addEventListener("click", () => showModal("register-modal"));
    document
        .getElementById("home-register-btn")
        .addEventListener("click", () => showModal("register-modal"));

    document
        .getElementById("create-room-btn")
        .addEventListener("click", () => showModal("create-room-modal"));
    document
        .getElementById("create-room-btn-2")
        .addEventListener("click", () => showModal("create-room-modal"));

    document
        .getElementById("join-room-btn")
        .addEventListener("click", () => showModal("join-room-modal"));
    document
        .getElementById("join-room-btn-2")
        .addEventListener("click", () => showModal("join-room-modal"));

    document.getElementById("add-friend-btn").addEventListener("click", () => {
        showModal("add-friend-modal");
    });

    document.querySelectorAll(".close-modal-btn").forEach((btn) => {
        btn.addEventListener("click", hideAllModals);
    });

    document.querySelectorAll('[id$="-cancel"]').forEach((btn) => {
        btn.addEventListener("click", hideAllModals);
    });

    document.getElementById("switch-to-register").addEventListener("click", () => {
        hideAllModals();
        showModal("register-modal");
    });

    document.getElementById("switch-to-login").addEventListener("click", () => {
        hideAllModals();
        showModal("login-modal");
    });

    document.getElementById("login-submit").addEventListener("click", () => {
        const email = document.getElementById("login-email").value;
        const password = document.getElementById("login-password").value;
        handleLogin(email, password);
    });

    document.getElementById("register-submit").addEventListener("click", () => {
        const email = document.getElementById("register-email").value;
        const username = document.getElementById("register-username").value;
        const password = document.getElementById("register-password").value;
        const confirm = document.getElementById("register-confirm").value;
        handleRegister(email, username, password, confirm);
    });

    document.getElementById("create-room-submit").addEventListener("click", () => {
        const roomName = document.getElementById("room-name-input").value;
        handleCreateRoom(roomName);
    });

    document.getElementById("join-room-submit").addEventListener("click", () => {
        const inviteCode = document.getElementById("invite-code-input").value;
        handleJoinRoom(inviteCode);
    });

    document.getElementById("add-friend-submit").addEventListener("click", () => {
        const friendUsername = document.getElementById("friend-username-input").value;
        handleAddFriend(friendUsername);
    });

    const chatForm = document.getElementById("chat-form");
    const messageInput = document.getElementById("message-input");

    chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        handleSendMessage();
    });

    messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    messageInput.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = this.scrollHeight + "px";
    });

    document.getElementById("copy-invite-btn").addEventListener("click", () => {
        const inviteCode = document.getElementById("room-invite-code").textContent;
        navigator.clipboard.writeText(inviteCode).then(() => {
            showNotification("Invite code copied!", "success", "Copied!");
        });
    });

    document.getElementById("copy-username-btn").addEventListener("click", () => {
        const username = document.getElementById("display-my-username").textContent;
        navigator.clipboard.writeText(username).then(() => {
            showNotification("Username copied!", "success", "Copied!");
        });
    });

    // 🔥 FIXED: Leave room button
    document.getElementById("leave-room-btn").addEventListener("click", handleLeaveRoom);

    document.getElementById("clear-messages-btn").addEventListener("click", () => {
        showConfirmationModal("Clear all messages in this room?", "Clear Messages", () => {
            document.getElementById("messages-container").innerHTML = "";
            showNotification("Messages cleared", "info", "Cleared");
        });
    });

    document.querySelectorAll(".input-action-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const emojis = ["😊", "😂", "❤️", "🔥", "👍", "🎮", "💼", "🎵", "🤔"];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            messageInput.value += randomEmoji;
            messageInput.focus();
        });
    });

    // ΠΡΟΣΘΗΚΗ: Initialize profile event listeners
    initializeProfileEventListeners();
}

// ===== PROFILE EVENT LISTENERS =====

function initializeProfileEventListeners() {
    // Back from profile button
    document.getElementById("back-from-profile-btn").addEventListener("click", () => {
        showPage("home-page");
    });
    
    // Change profile picture button
    document.getElementById("change-profile-pic-btn").addEventListener("click", () => {
        document.getElementById("profile-image-input").click();
    });
    
    // Profile image input
    document.getElementById("profile-image-input").addEventListener("change", function(e) {
        const file = e.target.files[0];
        if (file) {
            uploadProfilePicture(file);
        }
    });
    
    // Edit profile button
    document.getElementById("edit-profile-btn").addEventListener("click", () => {
        showModal("edit-profile-modal");
        document.getElementById("edit-username").value = currentUser.username;
        document.getElementById("edit-email").value = currentUser.email;
    });
    
    // Change password button
    document.getElementById("change-password-btn").addEventListener("click", () => {
        showModal("change-password-modal");
    });
    
    // Save profile changes
    document.getElementById("save-profile-btn").addEventListener("click", () => {
        const username = document.getElementById("edit-username").value;
        const email = document.getElementById("edit-email").value;
        saveProfileChanges(username, email);
    });
    
    // Save password
    document.getElementById("save-password-btn").addEventListener("click", () => {
        const currentPassword = document.getElementById("current-password").value;
        const newPassword = document.getElementById("new-password").value;
        const confirmPassword = document.getElementById("confirm-new-password").value;
        changePassword(currentPassword, newPassword, confirmPassword);
    });
    
    // Cancel buttons
    document.getElementById("cancel-edit-profile-btn").addEventListener("click", hideAllModals);
    document.getElementById("cancel-password-btn").addEventListener("click", hideAllModals);
    document.getElementById("close-edit-profile-modal").addEventListener("click", hideAllModals);
    document.getElementById("close-change-password-modal").addEventListener("click", hideAllModals);
    
    // User info modal actions
    document.getElementById("close-user-info-modal").addEventListener("click", hideAllModals);
    
    document.getElementById("send-private-message-btn").addEventListener("click", () => {
        if (currentViewedUser) {
            hideAllModals();
            startPrivateChatWithFriend(currentViewedUser);
        }
    });
    
    document.getElementById("add-as-friend-btn").addEventListener("click", () => {
        if (currentViewedUser) {
            handleAddFriend(currentViewedUser);
            hideAllModals();
        }
    });
    
    document.getElementById("view-mutual-rooms-btn").addEventListener("click", () => {
        showNotification("Feature coming soon!", "info", "Coming Soon");
    });
    
    // Avatar preview for registration
    document.getElementById("register-browse-btn").addEventListener("click", () => {
        document.getElementById("register-avatar-input").click();
    });
    
    document.getElementById("register-avatar-input").addEventListener("change", function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const preview = document.getElementById("register-avatar-preview");
                preview.src = event.target.result;
                preview.style.display = 'block';
                document.getElementById("register-avatar-placeholder").style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    });
}

// ===== MOBILE RESPONSIVE FUNCTIONALITY =====

function initMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile && sidebar) {
        // Create overlay
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
        }
        
        // Toggle sidebar on click
        sidebar.addEventListener('click', function(e) {
            if (!e.target.closest('.btn-icon') && !e.target.closest('.action-btn')) {
                this.classList.toggle('mobile-expanded');
                overlay.classList.toggle('active');
            }
        });
        
        // Close sidebar when clicking overlay
        overlay.addEventListener('click', function() {
            sidebar.classList.remove('mobile-expanded');
            this.classList.remove('active');
        });
        
        // Close sidebar when clicking in main chat area
        const mainChat = document.getElementById('main-chat');
        if (mainChat) {
            mainChat.addEventListener('click', function() {
                sidebar.classList.remove('mobile-expanded');
                overlay.classList.remove('active');
            });
        }
    } else {
        // Remove mobile expanded state on larger screens
        if (sidebar) {
            sidebar.classList.remove('mobile-expanded');
        }
        const overlay = document.querySelector('.sidebar-overlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }
}

// Enhanced mobile view detection
function isMobileDevice() {
    return window.innerWidth <= 768;
}

// Update UI elements based on mobile state
function updateMobileUI() {
    if (isMobileDevice()) {
        document.body.classList.add('mobile-view');
    } else {
        document.body.classList.remove('mobile-view');
    }
}

// ===== INITIALIZATION =====

document.addEventListener("DOMContentLoaded", async () => {
    console.log("🐀 RatScape client initialized");

    // Create notification container first
    createNotificationContainer();
    initializeEventListeners();

    // Initialize mobile responsive features
    initMobileSidebar();
    updateMobileUI();
    window.addEventListener('resize', function() {
        initMobileSidebar();
        updateMobileUI();
    });

    // Προσθήκη CSS animations για unread system
    const unreadStyle = document.createElement('style');
    unreadStyle.textContent = `
        @keyframes highlightPulse {
            0%, 100% { 
                box-shadow: 0 0 0 0 rgba(139, 0, 0, 0.7);
                transform: scale(1);
            }
            50% { 
                box-shadow: 0 0 0 15px rgba(139, 0, 0, 0);
                transform: scale(1.02);
            }
        }
        
        @keyframes badgePop {
            0% { transform: scale(0); opacity: 0; }
            70% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
        }
        
        .notification-count-badge {
            position: absolute;
            top: 10px;
            right: 35px;
            background: var(--primary);
            color: white;
            border-radius: 10px;
            min-width: 22px;
            height: 22px;
            font-size: 0.7rem;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 6px;
            font-weight: bold;
            animation: badgePop 0.3s ease-out;
        }
    `;
    document.head.appendChild(unreadStyle);

    const savedUser = getUserFromLocalStorage();
    if (savedUser && savedUser.authenticated) {
        try {
            const response = await fetch(`/verify-session/${savedUser.username}`, {
                headers: {
                    "X-Session-ID": savedUser.sessionId,
                },
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    currentUser = {
                        username: data.user.username,
                        email: data.user.email,
                        authenticated: true,
                        sessionId: savedUser.sessionId,
                    };
                    updateUIForAuthState();

                    const lastPage = getLastPage();
                    showPage(lastPage);

                    socket.emit("authenticate", {
                        username: currentUser.username,
                        sessionId: currentUser.sessionId,
                    });

                    // 🔥 Φόρτωση offline notifications
                    await loadOfflineNotifications();

                    if (lastPage === "rooms-page") {
                        loadUserRooms();
                    } else if (lastPage === "friends-page") {
                        loadUserFriends();
                    }

                    console.log("✅ User session restored");
                } else {
                    clearUserFromLocalStorage();
                    showPage("home-page");
                    console.log("❌ Session verification failed");
                }
            } else {
                clearUserFromLocalStorage();
                showPage("home-page");
                console.log("❌ Session verification failed - server error");
            }
        } catch (error) {
            console.error("Error verifying user session:", error);
            clearUserFromLocalStorage();
            showPage("home-page");
        }
    } else {
        showPage("home-page");
    }

    console.log("✅ Ready to chat!");
});

