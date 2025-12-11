// client.js - RatScape Client with AUTO-SERVER DETECTION - FIXED FOR RENDER
// 🔥 ΕΝΑ ΕΞΥΠΝΟ FIX: Αυτόματη ανίχνευση server URL
function getServerUrl() {
  // Αν είμαστε στο localhost, χρησιμοποιούμε localhost
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  // Αλλιώς, χρησιμοποιούμε το Render URL
  return 'https://ratscape.onrender.com';
}

// 🔥 Δημιουργία socket με δυνατότητα fallback
let socket;

function initializeSocket() {
  const serverUrl = getServerUrl();
  console.log(`🔗 Connecting to server: ${serverUrl}`);
  
  socket = io(serverUrl, {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });
  
  // Προσθήκη event listeners για το socket
  setupSocketListeners();
  
  return socket;
}

// Initialize socket immediately
socket = initializeSocket();

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
    isPrivate: false,
};

// ===== UNREAD MESSAGES SYSTEM =====
let unreadMessages = {
    private: {},
    groups: {},
    total: 0
};

// ===== USER INFO SYSTEM =====
let currentViewedUser = null;

// ===== AVATAR SYSTEM =====
let userAvatars = {};

// ===== NOTIFICATION SYSTEM =====

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
        case "avatar_upload_success":
            icon = "✓";
            notificationTitle = title || "Profile Picture Updated";
            break;
        default:
            icon = "ℹ";
            notificationTitle = title || "Info";
    }

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

    if (unreadCount > 1) {
        const countBadge = document.createElement('div');
        countBadge.className = 'notification-count-badge';
        countBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        notification.appendChild(countBadge);
    }

    document.getElementById("notification-container").appendChild(notification);

    if (action) {
        notification.style.cursor = 'pointer';
        notification.classList.add('clickable');
        
        notification.addEventListener('click', function(e) {
            if (!e.target.classList.contains('notification-close')) {
                handleNotificationAction(action);
                hideNotification(notification);
                
                if (action.type === 'private_message') {
                    clearUnread('private', action.sender);
                } else if (action.type === 'room_message') {
                    clearUnread('group', action.sender, action.roomId);
                }
            }
        });
    }

    setTimeout(() => {
        notification.classList.add("active");
    }, 10);

    notification.querySelector(".notification-close").addEventListener("click", (e) => {
        e.stopPropagation();
        hideNotification(notification);
    });

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

// ===== CONFIRMATION MODAL =====

function showConfirmationModal(message, title = "Confirm", onConfirm = null, onCancel = null) {
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
        
        document.getElementById("close-confirmation-modal").addEventListener("click", hideConfirmationModal);
        document.getElementById("confirm-no-btn").addEventListener("click", hideConfirmationModal);
        
        document.getElementById("confirm-yes-btn").addEventListener("click", function() {
            if (onConfirm) onConfirm();
            hideConfirmationModal();
        });
    }
    
    document.getElementById("confirmation-title").textContent = title;
    document.getElementById("confirmation-message").textContent = message;
    
    modal.classList.add("active");
}

function hideConfirmationModal() {
    const modal = document.getElementById("confirmation-modal");
    if (modal) {
        modal.classList.remove("active");
    }
}

// ===== AVATAR FUNCTIONS =====

async function loadUserAvatar(username, element, isCurrentUser = false) {
    if (!username) return;
    
    if (userAvatars[username]) {
        updateAvatarElement(element, userAvatars[username], username, isCurrentUser);
        return;
    }
    
    try {
        const serverUrl = getServerUrl();
        const response = await fetch(`${serverUrl}/get-profile-picture/${username}`);
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.profile_picture) {
                userAvatars[username] = data.profile_picture;
                updateAvatarElement(element, data.profile_picture, username, isCurrentUser);
            } else {
                updateAvatarElement(element, null, username, isCurrentUser);
            }
        }
    } catch (error) {
        console.error("Error loading avatar:", error);
        updateAvatarElement(element, null, username, isCurrentUser);
    }
}

function updateAvatarElement(element, avatarUrl, username, isCurrentUser = false) {
    if (!element) return;
    
    if (avatarUrl) {
        const serverUrl = getServerUrl();
        const fullUrl = avatarUrl.startsWith('http') ? avatarUrl : serverUrl + avatarUrl;
        
        if (element.tagName === 'DIV') {
            element.innerHTML = `<img src="${fullUrl}" alt="${username}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else if (element.tagName === 'IMG') {
            element.src = fullUrl;
            element.alt = username;
            element.style.display = 'block';
        }
    } else {
        if (element.tagName === 'DIV') {
            const initials = username ? username.substring(0, 2).toUpperCase() : '??';
            const color = getAvatarColor(username);
            element.innerHTML = initials;
            element.style.background = color;
            element.style.color = 'white';
            element.style.display = 'flex';
            element.style.alignItems = 'center';
            element.style.justifyContent = 'center';
            element.style.fontWeight = '600';
            element.style.fontSize = '0.75rem';
        }
    }
}

async function loadCurrentUserAvatar() {
    if (!currentUser.authenticated) return;
    
    const sidebarAvatar = document.getElementById("sidebar-avatar");
    if (sidebarAvatar) {
        await loadUserAvatar(currentUser.username, sidebarAvatar, true);
    }
    
    const profileImage = document.getElementById("profile-image");
    if (profileImage) {
        await loadUserAvatar(currentUser.username, profileImage, true);
    }
    
    const userInfoImage = document.getElementById("user-info-image");
    if (userInfoImage) {
        await loadUserAvatar(currentUser.username, userInfoImage, true);
    }
}

async function loadMemberAvatars() {
    const memberItems = document.querySelectorAll('.member-item');
    
    for (const item of memberItems) {
        const username = item.dataset.username;
        if (username) {
            const avatarElement = item.querySelector('.member-avatar');
            if (avatarElement) {
                await loadUserAvatar(username, avatarElement, username === currentUser.username);
            }
        }
    }
}

// ===== UNREAD SYSTEM FUNCTIONS =====

let lastClearTime = 0;
const CLEAR_DEBOUNCE_TIME = 1000;

function clearUnread(type, sender, roomId = null) {
    const now = Date.now();
    
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
    
    if (type || sender || roomId) {
        socket.emit('mark_as_read', { type, sender, roomId });
    }
}

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
    
    updateFriendsListBadges();
    updateRoomsListBadges();
}

function updateUnreadBadges() {
    const privateTotal = Object.values(unreadMessages.private).reduce((a, b) => a + b, 0);
    const groupsTotal = Object.values(unreadMessages.groups).reduce((a, b) => a + b, 0);
    unreadMessages.total = privateTotal + groupsTotal;
    
    updateTitleBadge();
    updateNavBadges();
}

function updateTitleBadge() {
    if (unreadMessages.total > 0) {
        document.title = `(${unreadMessages.total}) RatScape`;
    } else {
        document.title = 'RatScape';
    }
}

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

function updateButtonBadge(button, count, type) {
    const existingBadge = button.querySelector('.nav-badge');
    if (existingBadge) {
        existingBadge.remove();
    }
    
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

function updateFriendsListBadges() {
    const friendCards = document.querySelectorAll('.friend-card:not(.pending)');
    friendCards.forEach(card => {
        const nameElement = card.querySelector('.friend-name');
        if (nameElement) {
            const friendName = nameElement.textContent;
            const unreadCount = unreadMessages.private[friendName] || 0;
            
            const existingBadge = card.querySelector('.friend-badge');
            if (existingBadge) {
                existingBadge.remove();
            }
            
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

function updateRoomsListBadges() {
    const roomCards = document.querySelectorAll('.room-card');
    roomCards.forEach(card => {
        const enterBtn = card.querySelector('.enter-room-btn');
        if (enterBtn) {
            const roomId = enterBtn.dataset.roomId;
            const unreadCount = unreadMessages.groups[roomId] || 0;
            
            const existingBadge = card.querySelector('.room-badge');
            if (existingBadge) {
                existingBadge.remove();
            }
            
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

async function loadOfflineNotifications() {
    if (!currentUser.authenticated) return;
    
    try {
        const serverUrl = getServerUrl();
        const response = await fetch(`${serverUrl}/offline-notifications/${currentUser.username}`, {
            headers: {
                "X-Session-ID": currentUser.sessionId,
            },
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                console.log(`📬 Loaded ${data.total} offline notifications`);
                
                if (data.summary) {
                    unreadMessages.private = data.summary.private || {};
                    unreadMessages.groups = data.summary.groups || {};
                    unreadMessages.total = data.summary.total || 0;
                    updateUnreadBadges();
                }
                
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
                clearUnread('private', friendUsername);
                
                loadUserFriends();
                showPage("friends-page");
                
                setTimeout(() => {
                    highlightAndOpenFriendChat(friendUsername);
                }, 800);
            }
            break;
            
        case 'room_message':
            if (action.roomId) {
                clearUnread('group', action.sender, action.roomId);
                
                loadUserRooms();
                showPage("rooms-page");
                
                setTimeout(() => {
                    highlightAndEnterRoom(action.roomId);
                }, 800);
            }
            break;
            
        case 'friend_request':
            loadUserFriends();
            showPage("friends-page");
            
            setTimeout(() => {
                highlightPendingRequests();
            }, 800);
            break;
            
        case 'friend_request_accepted':
            loadUserFriends();
            showPage("friends-page");
            break;
    }
}

function highlightAndOpenFriendChat(friendUsername) {
    const friendCards = document.querySelectorAll('.friend-card:not(.pending)');
    friendCards.forEach(card => {
        const nameElement = card.querySelector('.friend-name');
        if (nameElement && nameElement.textContent === friendUsername) {
            card.style.animation = 'highlightPulse 2s ease-in-out';
            card.style.border = '2px solid var(--accent-red)';
            
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
        document.getElementById("sidebar-username").textContent = currentUser.username;
        
        loadCurrentUserAvatar();
        
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

    members.forEach(async (member) => {
        const memberDiv = document.createElement("div");
        memberDiv.className = "member-item";
        memberDiv.dataset.username = member.username;
        
        memberDiv.innerHTML = `
            <div class="member-avatar">${member.username.substring(0, 2).toUpperCase()}</div>
            <div class="member-info">
                <span class="member-name">${member.username}</span>
                <span class="member-joined">${new Date(member.joined_at).toLocaleDateString()}</span>
            </div>
        `;
        
        memberDiv.addEventListener("click", (e) => {
            e.stopPropagation();
            showUserInfo(member.username);
        });
        
        membersList.appendChild(memberDiv);
        
        const avatarElement = memberDiv.querySelector('.member-avatar');
        if (avatarElement) {
            await loadUserAvatar(member.username, avatarElement, member.username === currentUser.username);
        }
    });
}

function loadUserRooms() {
    if (!currentUser.authenticated) return;

    const serverUrl = getServerUrl();
    fetch(`${serverUrl}/user-rooms/${currentUser.username}`, {
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
            clearUnread('group', null, room.id);
        });

        roomsList.appendChild(roomCard);
    });
    
    updateRoomsListBadges();
}

function enterRoom(roomId, roomName, inviteCode) {
    console.log("🚀 Entering room:", { roomId, roomName, inviteCode });
    
    currentRoom = { 
        id: roomId, 
        name: roomName, 
        inviteCode: inviteCode,
        isPrivate: false 
    };

    document.getElementById("room-name-sidebar").textContent = roomName;
    document.getElementById("room-name-header").textContent = roomName;
    document.getElementById("room-invite-code").textContent = inviteCode;
    document.getElementById("invite-code-container").classList.remove("hide-for-private");
    document.getElementById("copy-invite-btn").style.display = "flex";
    document.getElementById("copy-invite-btn").disabled = false;
    document.getElementById("copy-invite-btn").title = "Copy invite code";
    document.getElementById("copy-invite-btn").style.opacity = "1";
    document.getElementById("copy-invite-btn").style.cursor = "pointer";

    document.getElementById("messages-container").innerHTML = "";

    console.log("📡 Emitting join room event...");
    
    socket.emit("join room", {
        roomId: roomId,
        username: currentUser.username,
        sessionId: currentUser.sessionId,
    });

    showPage("chat-page");
    
    setTimeout(() => {
        socket.emit("get room info", { roomId: roomId });
        socket.emit("get room members", { roomId: roomId });
    }, 500);
}

// ===== FRIENDS SYSTEM FUNCTIONS =====

async function loadUserFriends() {
    if (!currentUser.authenticated) return;

    try {
        const serverUrl = getServerUrl();
        const [friendsResponse, pendingResponse] = await Promise.all([
            fetch(`${serverUrl}/friends/${currentUser.username}`, {
                headers: {
                    "X-Session-ID": currentUser.sessionId,
                },
            }),
            fetch(`${serverUrl}/pending-requests/${currentUser.username}`, {
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

        friendsSection.querySelectorAll(".friend-avatar").forEach(async (avatarElement, index) => {
            const friend = friends[index];
            if (friend) {
                await loadUserAvatar(friend.friend_username, avatarElement, false);
            }
        });

        friendsSection.querySelectorAll(".chat-friend-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const friendUsername = e.target.dataset.friend;
                startPrivateChatWithFriend(friendUsername);
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
    updateFriendsListBadges();
}

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
        const serverUrl = getServerUrl();
        const response = await fetch(`${serverUrl}/send-friend-request`, {
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
        const serverUrl = getServerUrl();
        const response = await fetch(`${serverUrl}/respond-friend-request`, {
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
        const serverUrl = getServerUrl();
        const response = await fetch(`${serverUrl}/remove-friend`, {
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
    const privateChatId = `private_${currentUser.username}_${friendUsername}`;
    
    currentRoom = {
        id: privateChatId,
        name: friendUsername,
        inviteCode: null,
        isPrivate: true,
    };

    document.getElementById("room-name-sidebar").textContent = friendUsername;
    document.getElementById("room-name-header").textContent = `Private Chat with ${friendUsername}`;
    
    document.getElementById("room-invite-code").textContent = "";
    document.getElementById("invite-code-container").classList.add("hide-for-private");
    document.getElementById("copy-invite-btn").style.display = "none";
    
    document.getElementById("sidebar-username").textContent = currentUser.username;
    
    const sidebarAvatar = document.getElementById("sidebar-avatar");
    if (sidebarAvatar) {
        loadUserAvatar(currentUser.username, sidebarAvatar, true);
    }

    document.getElementById("room-description").textContent =
        `Private conversation with ${friendUsername}`;
    document.getElementById("room-status").textContent = "Private chat";
    document.getElementById("room-status").classList.add("private-chat");

    document.getElementById("room-members-list").innerHTML = `
        <div class="member-item" data-username="${currentUser.username}">
            <div class="member-avatar"></div>
            <div class="member-info">
                <span class="member-name">${currentUser.username}</span>
                <span class="member-joined">You</span>
            </div>
        </div>
        <div class="member-item" data-username="${friendUsername}">
            <div class="member-avatar"></div>
            <div class="member-info">
                <span class="member-name">${friendUsername}</span>
                <span class="member-joined">Friend</span>
            </div>
        </div>
    `;

    document.getElementById("messages-container").innerHTML = "";
    loadPrivateMessages(friendUsername);
    showPage("chat-page");
    
    setTimeout(() => {
        loadMemberAvatars();
        makeMemberItemsClickable();
    }, 100);
}

async function loadPrivateMessages(friendUsername) {
    try {
        const serverUrl = getServerUrl();
        const response = await fetch(`${serverUrl}/private-messages/${currentUser.username}/${friendUsername}`, {
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

async function showUserInfo(username) {
    if (!username || username === currentUser.username) return;
    
    currentViewedUser = username;
    
    try {
        const serverUrl = getServerUrl();
        const response = await fetch(`${serverUrl}/user-info/${username}`, {
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
        const serverUrl = getServerUrl();
        const response = await fetch(`${serverUrl}/check-friendship/${currentUser.username}/${friendUsername}`, {
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
    
    const userInfoImage = document.getElementById("user-info-image");
    if (user.profile_picture) {
        const serverUrl = getServerUrl();
        const fullUrl = user.profile_picture.startsWith('http') ? user.profile_picture : serverUrl + user.profile_picture;
        userInfoImage.src = fullUrl + "?t=" + Date.now();
        userInfoImage.style.display = 'block';
    } else {
        const initials = user.username.substring(0, 2).toUpperCase();
        const color = getAvatarColor(user.username);
        userInfoImage.style.display = 'none';
        
        const avatarContainer = userInfoImage.parentElement;
        let initialsDiv = avatarContainer.querySelector('.initials-avatar');
        if (!initialsDiv) {
            initialsDiv = document.createElement('div');
            initialsDiv.className = 'initials-avatar';
            initialsDiv.style.cssText = `
                width: 100%;
                height: 100%;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 2rem;
                color: white;
            `;
            avatarContainer.appendChild(initialsDiv);
        }
        initialsDiv.textContent = initials;
        initialsDiv.style.background = color;
    }
    
    const addFriendBtn = document.getElementById("add-as-friend-btn");
    const sendMessageBtn = document.getElementById("send-private-message-btn");
    
    if (user.username === currentUser.username) {
        addFriendBtn.style.display = 'none';
        sendMessageBtn.disabled = true;
        sendMessageBtn.innerHTML = '<i class="fas fa-user"></i> This is you';
        sendMessageBtn.classList.remove("btn-primary");
        sendMessageBtn.classList.add("btn-secondary");
    } else {
        addFriendBtn.style.display = 'none';
        sendMessageBtn.disabled = false;
        sendMessageBtn.innerHTML = '<i class="fas fa-comment"></i> Send Message';
        sendMessageBtn.classList.remove("btn-secondary");
        sendMessageBtn.classList.add("btn-primary");
    }
}

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
            const username = this.dataset.username || this.querySelector(".member-name")?.textContent;
            if (username) {
                showUserInfo(username);
            }
        });
    });
}

// ===== AUTHENTICATION FUNCTIONS =====

async function handleLogin(email, password) {
    try {
        const serverUrl = getServerUrl();
        const response = await fetch(`${serverUrl}/login`, {
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
        const serverUrl = getServerUrl();
        const formData = new FormData();
        formData.append("email", email);
        formData.append("username", username);
        formData.append("password", password);
        
        const avatarInput = document.getElementById("register-avatar-input");
        if (avatarInput.files[0]) {
            formData.append("avatar", avatarInput.files[0]);
        }
        
        const response = await fetch(`${serverUrl}/register`, {
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
        const serverUrl = getServerUrl();
        fetch(`${serverUrl}/logout`, {
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
    currentRoom = { id: null, name: null, inviteCode: null, isPrivate: false };
    
    unreadMessages = { private: {}, groups: {}, total: 0 };
    updateUnreadBadges();
    
    userAvatars = {};
    
    clearUserFromLocalStorage();
    updateUIForAuthState();
    showPage("home-page");
    showNotification("Logged out successfully!", "info", "Goodbye!");

    socket.disconnect();
    socket = initializeSocket();
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
        const serverUrl = getServerUrl();
        const response = await fetch(`${serverUrl}/create-room`, {
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
        const serverUrl = getServerUrl();
        const response = await fetch(`${serverUrl}/join-room`, {
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

async function handleLeaveRoom() {
    console.log("🚪 Leave room button clicked");
    console.log("Current room:", currentRoom);
    
    if (!currentRoom.id) {
        showNotification("You're not in a room", "warning", "No Room");
        return;
    }
    
    if (currentRoom.isPrivate) {
        showNotification("Exited private chat", "info", "Chat Ended");
        
        currentRoom = { 
            id: null, 
            name: null, 
            inviteCode: null, 
            isPrivate: false 
        };
        
        showPage("rooms-page");
        return;
    }
    
    showConfirmationModal(
        "Are you sure you want to leave this room? You'll need a new invite code to rejoin.",
        "Leave Room",
        async () => {
            try {
                console.log("🚪 Leaving room:", currentRoom.id, "User:", currentUser.username);
                
                const serverUrl = getServerUrl();
                const response = await fetch(`${serverUrl}/leave-room`, {
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
                    socket.emit("leave room", { 
                        roomId: currentRoom.id,
                        username: currentUser.username 
                    });
                    
                    const leftRoomId = currentRoom.id;
                    currentRoom = { 
                        id: null, 
                        name: null, 
                        inviteCode: null, 
                        isPrivate: false 
                    };
                    
                    document.getElementById("invite-code-container")?.classList.remove("hide-for-private");
                    document.getElementById("copy-invite-btn")?.style.display = "flex";
                    
                    showPage("rooms-page");
                    
                    setTimeout(() => {
                        loadUserRooms();
                        showNotification("Successfully left the room", "info", "Room Left");
                    }, 300);
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
        const serverUrl = getServerUrl();
        const response = await fetch(`${serverUrl}/user-profile/${currentUser.username}`, {
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
    document.getElementById("profile-username").textContent = profile.username || currentUser.username;
    document.getElementById("profile-email").textContent = profile.email || currentUser.email;
    document.getElementById("info-username").textContent = profile.username || currentUser.username;
    document.getElementById("info-email").textContent = profile.email || currentUser.email;
    document.getElementById("info-status").textContent = profile.status || "Online";
    document.getElementById("info-status").className = `info-value status-${profile.status?.toLowerCase() || 'online'}`;
    
    if (profile.created_at) {
        const joinedDate = new Date(profile.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        document.getElementById("info-joined").textContent = joinedDate;
    }
    
    const profileImage = document.getElementById("profile-image");
    if (profile.profile_picture) {
        const serverUrl = getServerUrl();
        const fullUrl = profile.profile_picture.startsWith('http') ? profile.profile_picture : serverUrl + profile.profile_picture;
        profileImage.src = fullUrl + "?t=" + Date.now();
        profileImage.style.display = 'block';
    } else {
        profileImage.style.display = 'none';
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

async function uploadProfilePicture(file) {
    if (!file) return;
    
    const uploadBtn = document.getElementById("change-profile-pic-btn");
    const originalHTML = uploadBtn.innerHTML;
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    uploadBtn.disabled = true;
    
    const serverUrl = getServerUrl();
    const formData = new FormData();
    formData.append("profile_picture", file);
    formData.append("username", currentUser.username);
    
    try {
        const response = await fetch(`${serverUrl}/upload-profile-picture`, {
            method: "POST",
            headers: {
                "X-Session-ID": currentUser.sessionId,
            },
            body: formData,
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showNotification("Profile picture updated successfully!", "avatar_upload_success", "Avatar Updated");
                
                delete userAvatars[currentUser.username];
                await loadCurrentUserAvatar();
                userAvatars[currentUser.username] = data.profile_picture;
            }
        } else {
            showNotification("Failed to upload profile picture", "error", "Upload Error");
        }
    } catch (error) {
        console.error("Error uploading profile picture:", error);
        showNotification("Failed to upload profile picture", "error", "Upload Error");
    } finally {
        uploadBtn.innerHTML = originalHTML;
        uploadBtn.disabled = false;
    }
}

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
        
        const serverUrl = getServerUrl();
        const response = await fetch(`${serverUrl}/update-profile`, {
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

async function changePassword(currentPassword, newPassword, confirmPassword) {
    if (newPassword !== confirmPassword) {
        showNotification("Passwords do not match!", "error", "Password Error");
        return;
    }
    
    try {
        const serverUrl = getServerUrl();
        const response = await fetch(`${serverUrl}/change-password`, {
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

function setupSocketListeners() {
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

    socket.on("unread_summary", (summary) => {
        console.log("📊 Received unread summary:", summary);
        
        unreadMessages.private = summary.private || {};
        unreadMessages.groups = summary.groups || {};
        unreadMessages.total = summary.total || 0;
        
        updateUnreadBadges();
        updateFriendsListBadges();
        updateRoomsListBadges();
    });

    socket.on("unread_update", (data) => {
        console.log("📬 Unread update:", data);
        
        if (data.type === 'private') {
            addUnreadMessage('private', data.sender);
        } else if (data.type === 'group') {
            addUnreadMessage('group', data.sender, data.roomId);
        }
    });

    socket.on("unread_cleared", (data) => {
        if (data && (data.type || data.sender || data.roomId)) {
            console.log("✅ Unread cleared:", data);
            clearUnread(data.type, data.sender, data.roomId);
        }
    });

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
            case 'avatar_upload_success':
                notificationType = "success";
                title = "Profile Picture Updated";
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
            
            setTimeout(() => {
                makeMemberItemsClickable();
                loadMemberAvatars();
            }, 100);
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

    socket.on("room_member_left", (data) => {
        console.log("👋 Room member left:", data);
        
        if (currentRoom.id === data.roomId) {
            showNotification(`${data.username} left the room`, "info", "Member Left");
            
            setTimeout(() => {
                socket.emit("get room members", { roomId: currentRoom.id });
            }, 500);
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
}

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
        if (currentRoom.isPrivate) {
            showNotification("Invite codes are not available for private chats", "info", "Private Chat");
            return;
        }
        
        const inviteCode = document.getElementById("room-invite-code").textContent;
        if (inviteCode && inviteCode !== "------" && inviteCode !== "Private Chat") {
            navigator.clipboard.writeText(inviteCode).then(() => {
                showNotification("Invite code copied!", "success", "Copied!");
            });
        }
    });

    document.getElementById("copy-username-btn").addEventListener("click", () => {
        const username = document.getElementById("display-my-username").textContent;
        navigator.clipboard.writeText(username).then(() => {
            showNotification("Username copied!", "success", "Copied!");
        });
    });

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

    initializeProfileEventListeners();
}

// ===== PROFILE EVENT LISTENERS =====

function initializeProfileEventListeners() {
    document.getElementById("back-from-profile-btn").addEventListener("click", () => {
        showPage("home-page");
    });
    
    document.getElementById("change-profile-pic-btn").addEventListener("click", () => {
        document.getElementById("profile-image-input").click();
    });
    
    document.getElementById("profile-image-input").addEventListener("change", function(e) {
        const file = e.target.files[0];
        if (file) {
            uploadProfilePicture(file);
        }
    });
    
    document.getElementById("edit-profile-btn").addEventListener("click", () => {
        showModal("edit-profile-modal");
        document.getElementById("edit-username").value = currentUser.username;
        document.getElementById("edit-email").value = currentUser.email;
    });
    
    document.getElementById("change-password-btn").addEventListener("click", () => {
        showModal("change-password-modal");
    });
    
    document.getElementById("save-profile-btn").addEventListener("click", () => {
        const username = document.getElementById("edit-username").value;
        const email = document.getElementById("edit-email").value;
        saveProfileChanges(username, email);
    });
    
    document.getElementById("save-password-btn").addEventListener("click", () => {
        const currentPassword = document.getElementById("current-password").value;
        const newPassword = document.getElementById("new-password").value;
        const confirmPassword = document.getElementById("confirm-new-password").value;
        changePassword(currentPassword, newPassword, confirmPassword);
    });
    
    document.getElementById("cancel-edit-profile-btn").addEventListener("click", hideAllModals);
    document.getElementById("cancel-password-btn").addEventListener("click", hideAllModals);
    document.getElementById("close-edit-profile-modal").addEventListener("click", hideAllModals);
    document.getElementById("close-change-password-modal").addEventListener("click", hideAllModals);
    
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

// ===== MOBILE RESPONSIVE =====

function initMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile && sidebar) {
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
        }
        
        sidebar.addEventListener('click', function(e) {
            if (!e.target.closest('.btn-icon') && !e.target.closest('.action-btn')) {
                this.classList.toggle('mobile-expanded');
                overlay.classList.toggle('active');
            }
        });
        
        overlay.addEventListener('click', function() {
            sidebar.classList.remove('mobile-expanded');
            this.classList.remove('active');
        });
        
        const mainChat = document.getElementById('main-chat');
        if (mainChat) {
            mainChat.addEventListener('click', function() {
                sidebar.classList.remove('mobile-expanded');
                overlay.classList.remove('active');
            });
        }
    } else {
        if (sidebar) {
            sidebar.classList.remove('mobile-expanded');
        }
        const overlay = document.querySelector('.sidebar-overlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }
}

function isMobileDevice() {
    return window.innerWidth <= 768;
}

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

    createNotificationContainer();
    initializeEventListeners();

    initMobileSidebar();
    updateMobileUI();
    window.addEventListener('resize', function() {
        initMobileSidebar();
        updateMobileUI();
    });

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
        
        #copy-invite-btn:disabled {
            opacity: 0.5 !important;
            cursor: not-allowed !important;
        }
        #copy-invite-btn:disabled:hover {
            background: transparent !important;
            transform: none !important;
        }
        
        .member-avatar, #sidebar-avatar, .friend-avatar {
            overflow: hidden;
        }
        
        .member-avatar img, #sidebar-avatar img, .friend-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 50%;
        }
        
        .message-text {
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-wrap: break-word;
            word-break: break-word;
        }
    `;
    document.head.appendChild(unreadStyle);

    const savedUser = getUserFromLocalStorage();
    if (savedUser && savedUser.authenticated) {
        try {
            const serverUrl = getServerUrl();
            const response = await fetch(`${serverUrl}/verify-session/${savedUser.username}`, {
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

                    loadCurrentUserAvatar();
                    
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
