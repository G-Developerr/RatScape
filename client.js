// client.js - RatRoom Client with Enhanced Security & Beautiful Notifications
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

// ===== BEAUTIFUL NOTIFICATION SYSTEM =====

function showNotification(message, type = "info", title = null) {
    const container = document.getElementById("notification-container");
    if (!container) {
        createNotificationContainer();
    }

    const notification = document.createElement("div");
    notification.className = `notification ${type}`;

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

    notification.innerHTML = `
        <div class="notification-icon">${icon}</div>
        <div class="notification-content">
            <div class="notification-title">${notificationTitle}</div>
            <div class="notification-message">${message}</div>
        </div>
        <button class="notification-close">×</button>
    `;

    document.getElementById("notification-container").appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.classList.add("active");
    }, 10);

    // Add close event
    notification.querySelector(".notification-close").addEventListener("click", () => {
        hideNotification(notification);
    });

    // Auto hide after 5 seconds for non-error messages
    if (type !== "error") {
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
        });

        roomsList.appendChild(roomCard);
    });
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

    // Emit join room with proper data types
    console.log("📡 Emitting join room event...");
    
    socket.emit("join room", {
        roomId: roomId,  // Ensure this is the correct ID (number)
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
      });
    });

    friendsSection.querySelectorAll(".remove-friend-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const friendUsername = e.target.dataset.friend;
        if (confirm(`Remove ${friendUsername} from friends?`)) {
          handleRemoveFriend(friendUsername);
        }
      });
    });
  }

  friendsList.appendChild(friendsSection);
}

// FIXED: Enhanced friend request handling with validation
async function handleAddFriend(friendUsername) {
  if (!friendUsername.trim()) {
    showNotification("Please enter a username!", "warning", "Missing Info");
    return;
  }

  // Check if trying to add yourself
  if (friendUsername.trim().toLowerCase() === currentUser.username.toLowerCase()) {
    showNotification("You cannot add yourself as a friend!", "warning", "Invalid Request");
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
        toUser: friendUsername.trim(),
      }),
    });

    const data = await response.json();

    if (data.success) {
      showNotification(data.message, "success", "Friend Request Sent");
      hideAllModals();
      document.getElementById("friend-username-input").value = "";
      loadUserFriends(); // Refresh friends list
    } else {
      showNotification(
        data.error || "Failed to send friend request",
        "error",
        "Friend Request Failed"
      );
    }
  } catch (error) {
    if (error.message === "Session expired") {
      handleSessionExpired();
    } else {
      showNotification(
        "Error sending friend request: " + error.message,
        "error",
        "Connection Error"
      );
    }
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
  currentRoom = {
    id: `private_${friendUsername}`,
    name: friendUsername,
    inviteCode: null,
    isPrivate: true,
  };

  document.getElementById("room-name-sidebar").textContent = friendUsername;
  document.getElementById("room-name-header").textContent = `Private Chat with ${friendUsername}`;
  document.getElementById("room-invite-code").textContent = "Private";
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
    const response = await fetch("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password }),
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
        inviteCode: inviteCode.trim(), // FIXED: Removed .toUpperCase()
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
      enterRoom(data.roomId, data.roomName, inviteCode.trim()); // FIXED: Removed .toUpperCase()
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
    addMessageToChat(messageData);
  } else {
    messageData.room_id = currentRoom.id;
    socket.emit("chat message", messageData);
  }

  input.value = "";
  input.style.height = "auto";
}

// ===== SOCKET EVENT HANDLERS =====

socket.on("load messages", (messages) => {
  console.log("💬 Received messages:", messages.length);
  const messagesContainer = document.getElementById("messages-container");
  messagesContainer.innerHTML = "";
  messages.forEach((msg) => addMessageToChat(msg));
});

socket.on("chat message", (message) => {
  if (message.room_id === currentRoom.id) {
    addMessageToChat(message);
  }
});

socket.on("private message", (message) => {
  const isFromCurrentFriend =
    message.sender === currentRoom.name || message.receiver === currentRoom.name;
  if (currentRoom.isPrivate && isFromCurrentFriend) {
    addMessageToChat(message);
  } else if (message.sender !== currentUser.username) {
    showNotification(`New private message from ${message.sender}`, "info", "New Message");
  }
});

socket.on("room members", (members) => {
    console.log("👥 Received room members:", members);
    if (!currentRoom.isPrivate) {
        updateRoomMembers(members);
        document.getElementById("room-status").textContent = `${members.length} members`;
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
  showNotification(`New friend request from ${data.from}`, "info", "Friend Request");
  if (document.getElementById("friends-page").classList.contains("active")) {
    loadUserFriends();
  }
});

socket.on("friend_request_accepted", (data) => {
  showNotification(
    `${data.by} accepted your friend request!`,
    "success",
    "Friend Request Accepted"
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

  document.getElementById("leave-room-btn").addEventListener("click", () => {
    if (confirm("Leave this room?")) {
      showPage("rooms-page");
      loadUserRooms();
    }
  });

  document.getElementById("clear-messages-btn").addEventListener("click", () => {
    if (confirm("Clear all messages in this room?")) {
      document.getElementById("messages-container").innerHTML = "";
    }
  });

  document.querySelectorAll(".input-action-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const emojis = ["😊", "😂", "❤️", "🔥", "👍", "🎮", "💼", "🎵", "🤔"];
      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
      messageInput.value += randomEmoji;
      messageInput.focus();
    });
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

socket.on("connect", () => {
  console.log("🔗 Connected to server");
  if (currentUser.authenticated) {
    socket.emit("authenticate", {
      username: currentUser.username,
      sessionId: currentUser.sessionId,
    });
  }
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
