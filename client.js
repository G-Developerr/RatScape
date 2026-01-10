// client.js - RatRoom Client with Enhanced Security, Notifications & UNREAD SYSTEM - UPDATED WITH FILE UPLOAD & EMOJI PICKER & EVENTS & ADMIN SYSTEM & HOME EVENTS & EVENT PHOTOS & EVENT ROOMS
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
    isPrivate: false,
};

// ===== EVENT PHOTO SYSTEM =====
let eventPhotoFile = null;
let eventPhotoBase64 = null;

// ===== SESSION MANAGEMENT ENHANCEMENTS =====

// ΛΥΣΗ 1: Βελτιωμένη session επικύρωσης - Προσθήκη στο client.js
async function restoreSessionOnRefresh() {
    console.log("🔄 Restoring session after refresh...");
    
    const savedUser = getUserFromLocalStorage();
    if (!savedUser) {
        console.log("❌ No saved user found");
        return false;
    }
    
    try {
        // Πρώτα ελέγχουμε το session με το server
        const response = await fetch(`/verify-session/${savedUser.username}`, {
            headers: {
                "X-Session-ID": savedUser.sessionId,
            },
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                console.log("✅ Session restored from localStorage");
                currentUser = {
                    username: savedUser.username,
                    email: savedUser.email,
                    authenticated: true,
                    sessionId: savedUser.sessionId,
                };
                
                // Ενημέρωση UI
                updateUIForAuthState();
                
                // Επανασύνδεση WebSocket
                socket.emit("authenticate", {
                    username: currentUser.username,
                    sessionId: currentUser.sessionId,
                });
                
                return true;
            }
        }
    } catch (error) {
        console.error("Error restoring session:", error);
    }
    
    // Αν φτάσουμε εδώ, το session δεν είναι έγκυρο
    clearUserFromLocalStorage();
    return false;
}

// ΛΥΣΗ 3: Βελτιωμένη localStorage management
// Ανανεωμένη saveUserToLocalStorage
function saveUserToLocalStorage(user) {
    localStorage.setItem(
        "ratroom_user",
        JSON.stringify({
            username: user.username,
            email: user.email,
            authenticated: user.authenticated,
            sessionId: user.sessionId,
            timestamp: Date.now(),
            version: "2.0" // Προσθήκη έκδοσης για συμβατότητα
        })
    );
    
    // Αποθήκευση και σε backup key
    localStorage.setItem(
        "ratscape_backup_user",
        JSON.stringify({
            username: user.username,
            sessionId: user.sessionId,
            timestamp: Date.now()
        })
    );
}

// Βελτιωμένη getUserFromLocalStorage με fallback
function getUserFromLocalStorage() {
    let userData = localStorage.getItem("ratroom_user");
    
    // Fallback σε backup αν το κύριο λείπει
    if (!userData) {
        userData = localStorage.getItem("ratscape_backup_user");
    }
    
    if (!userData) return null;

    try {
        const user = JSON.parse(userData);
        
        // 🔥 ΑΛΛΑΓΗ: Αύξηση του expiry time
        const twoWeeks = 14 * 24 * 60 * 60 * 1000; // 2 εβδομάδες αντί για 1
        if (Date.now() - user.timestamp > twoWeeks) {
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
    localStorage.removeItem("ratscape_backup_user");
    localStorage.removeItem("ratroom_last_page");
}

// Client-side session refresh πριν το refresh
async function refreshUserSession() {
    if (currentUser.authenticated && currentUser.sessionId) {
        try {
            const response = await fetch('/refresh-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-ID': currentUser.sessionId
                },
                body: JSON.stringify({
                    username: currentUser.username
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    console.log("✅ Session refreshed");
                    return true;
                }
            }
        } catch (error) {
            console.error("Error refreshing session:", error);
        }
    }
    return false;
}

// ===== FUNCTIONS FOR HOME PAGE EVENTS =====

// 🔥 ΑΛΛΑΓΗ: Προσθήκη debounce για να αποφευχθούν πολλαπλές ανανεώσεις
let homeEventsLoading = false;
let homeEventsTimeout = null;

// 🔥 ΒΗΜΑ 4: Ενημέρωση της loadHomeEvents() για να καλείτε τους listeners
async function loadHomeEvents() {
  // Debounce: Μόνο μία φορά κάθε 2 δευτερόλεπτα
  if (homeEventsLoading) {
    console.log('⏳ Home events already loading, skipping...');
    return;
  }
  
  homeEventsLoading = true;
  
  const homeEventsSection = document.getElementById('home-events-section');
  const homeEventsList = document.getElementById('home-events-list');
  
  if (!homeEventsSection || !homeEventsList) {
    homeEventsLoading = false;
    return;
  }
  
  try {
    console.log('📅 Loading home events...');
    
    // Μόνο εάν ο χρήστης είναι συνδεδεμένος
    if (currentUser.authenticated) {
      const response = await fetch(`/events?username=${currentUser.username}`, {
        headers: {
          "X-Session-ID": currentUser.sessionId,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.success && data.events.length > 0) {
          // Εμφάνιση της ενότητας events
          homeEventsSection.style.display = 'block';
          displayHomeEvents(data.events.slice(0, 3)); // Πρώτα 3 events
          
          // 🔥 ΚΑΙΝΟΥΡΓΙΑ: Αμέσως προσθήκη listeners
          setTimeout(() => {
            attachHomeEventListeners();
          }, 100);
        } else {
          showNoEventsOnHome();
        }
      }
    } else {
      // Για μη συνδεδεμένους χρήστες, δείξε μόνο public events
      const response = await fetch('/events');
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.success && data.events.length > 0) {
          // Φίλτραρε μόνο τα public events
          const publicEvents = data.events.filter(event => event.is_public);
          
          if (publicEvents.length > 0) {
            homeEventsSection.style.display = 'block';
            displayHomeEvents(publicEvents.slice(0, 3));
            
            // 🔥 ΚΑΙΝΟΥΡΓΙΑ: Αμέσως προσθήκη listeners
            setTimeout(() => {
              attachHomeEventListeners();
            }, 100);
          } else {
            showNoEventsOnHome();
          }
        } else {
          showNoEventsOnHome();
        }
      }
    }
  } catch (error) {
    console.error("Error loading home events:", error);
    showNoEventsOnHome();
  } finally {
    // 🔥 ΚΡΙΤΙΚΟ: Απελευθέρωση του flag μετά από λίγο
    setTimeout(() => {
      homeEventsLoading = false;
    }, 2000);
  }
}

// 🔥 ΒΗΜΑ 1: Βελτιωμένη attachHomeEventListeners()
function attachHomeEventListeners() {
    const homeEventsList = document.getElementById('home-events-list');
    if (!homeEventsList) return;
    
    // Χρήση event delegation για ΟΛΑ τα buttons
    homeEventsList.addEventListener('click', function(e) {
        const button = e.target.closest('button');
        if (!button) return;
        
        const eventCard = button.closest('.home-event-card');
        if (!eventCard) return;
        
        const eventId = eventCard.dataset.eventId;
        
        // Details button
        if (button.classList.contains('details')) {
            e.stopPropagation();
            console.log("👁 Home event details clicked:", eventId);
            showEventDetails(eventId);
            return;
        }
        
        // Join button
        if (button.classList.contains('join')) {
            e.stopPropagation();
            
            if (button.classList.contains('login-required')) {
                // Αν χρειάζεται login
                showNotification("Please login to join events", "info", "Login Required");
                showModal("login-modal");
            } else {
                // Join event
                joinEvent(eventId);
            }
            return;
        }
        
        // Leave button
        if (button.classList.contains('leave')) {
            e.stopPropagation();
            leaveEvent(eventId);
            return;
        }
        
        // Delete button για home events
        if (button.classList.contains('home-event-delete-btn')) {
            e.stopPropagation();
            e.preventDefault();
            
            console.log("🗑️ Delete home event button clicked for:", eventId);
            
            showConfirmationModal(
                "Are you sure you want to delete this event? This action cannot be undone!",
                "Delete Event",
                () => {
                    deleteEvent(eventId);
                }
            );
            return;
        }
        
        // Group Chat button για home events
        if (button.classList.contains('group-chat')) {
            e.stopPropagation();
            e.preventDefault();
            
            const isParticipant = button.dataset.isParticipant === 'true';
            if (!isParticipant) {
                showNotification("You must join the event first to access the group chat", "info", "Join Required");
                return;
            }
            
            joinEventRoom(eventId);
            return;
        }
    });
}

// 🔥 ΒΗΜΑ 2: Ενημέρωση της showEventDetails()
async function showEventDetails(eventId) {
    console.log("🔍 Showing event details for:", eventId);
    
    try {
        const response = await fetch(`/events/${eventId}`, {
            headers: {
                "X-Session-ID": currentUser.sessionId,
            },
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to load event details");
        }
        
        const data = await response.json();
        
        if (data.success) {
            const event = data.event;
            const modal = document.getElementById("event-details-modal");
            const content = document.getElementById("event-details-content");
            const buttons = document.getElementById("event-action-buttons");
            
            if (!modal || !content) {
                console.error("❌ Event details modal elements not found!");
                showNotification("Could not open event details", "error", "Error");
                return;
            }
            
            const eventDate = new Date(event.date);
            const now = new Date();
            const isPast = eventDate < now;
            const isFull = event.max_participants > 0 && event.participants.length >= event.max_participants;
            const isParticipant = event.participants.includes(currentUser.username);
            const isCreator = event.created_by === currentUser.username;
            const isAdmin = currentUser.username === "Vf-Rat";
            
            // Format date
            const formattedDate = eventDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            // Δημιουργία HTML content
            let html = `
                <div class="event-detail-item">
                    <h4>Description</h4>
                    <p>${event.description}</p>
                </div>
                
                <div class="event-detail-item">
                    <h4>Date & Time</h4>
                    <p>${formattedDate}</p>
                </div>
                
                <div class="event-detail-item">
                    <h4>Location</h4>
                    <p>${event.location}</p>
                </div>
                
                <div class="event-detail-item">
                    <h4>Participants (${event.participants.length}${event.max_participants > 0 ? ` / ${event.max_participants}` : ''})</h4>
                    <div class="event-participants-list">
            `;
            
            // Λίστα συμμετεχόντων
            if (event.participants.length > 0) {
                for (const participant of event.participants) {
                    const isCreatorClass = participant === event.created_by ? 'creator' : '';
                    html += `
                        <div class="participant-item ${isCreatorClass}">
                            <div class="participant-avatar">${participant.substring(0, 2).toUpperCase()}</div>
                            <div class="participant-name">${participant} ${participant === event.created_by ? '(Creator)' : ''}</div>
                        </div>
                    `;
                }
            } else {
                html += `<p style="color: var(--text-light); font-style: italic;">No participants yet</p>`;
            }
            
            html += `
                    </div>
                </div>
                
                <div class="event-detail-item">
                    <h4>Event Information</h4>
                    <p>Created by: <strong>${event.created_by}</strong></p>
                    <p>Status: <strong>${isPast ? 'Past Event' : isFull ? 'Full' : 'Open'}</strong></p>
                    <p>Visibility: <strong>${event.is_public ? 'Public' : 'Private'}</strong></p>
                </div>
            `;
            
            content.innerHTML = html;
            
            // Δημιουργία κουμπιών
            let buttonsHtml = '';
            
            if (!isPast) {
                if (isParticipant) {
                    buttonsHtml += `<button class="btn btn-primary" id="leave-event-btn" data-event-id="${eventId}">
                        <i class="fas fa-sign-out-alt"></i> Leave Event
                    </button>`;
                } else if (!isFull) {
                    buttonsHtml += `<button class="btn btn-primary" id="join-event-btn" data-event-id="${eventId}">
                        <i class="fas fa-plus"></i> Join Event
                    </button>`;
                }
                
                // Group chat button για συμμετέχοντες ή δημιουργούς
                if (isParticipant || isCreator) {
                    buttonsHtml += `<button class="btn btn-secondary" id="group-chat-btn" data-event-id="${eventId}">
                        <i class="fas fa-comments"></i> Group Chat
                    </button>`;
                }
            }
            
            // Edit button μόνο για τον δημιουργό
            if (isCreator && !isPast) {
                buttonsHtml += `<button class="btn btn-secondary" id="edit-event-btn" data-event-id="${eventId}">
                    <i class="fas fa-edit"></i> Edit
                </button>`;
            }
            
            // Delete button για δημιουργό ή admin
            if (isCreator || isAdmin) {
                buttonsHtml += `<button class="btn btn-danger" id="delete-event-btn" data-event-id="${eventId}">
                    <i class="fas fa-trash"></i> Delete
                </button>`;
            }
            
            buttons.innerHTML = buttonsHtml;
            
            // Ενεργοποίηση listeners για τα κουμπιά
            addEventActionListeners(event);
            
            // Εμφάνιση modal
            modal.classList.add('active');
            
        } else {
            showNotification(data.error || "Failed to load event details", "error", "Error");
        }
    } catch (error) {
        console.error("❌ Error showing event details:", error);
        showNotification(error.message || "Failed to load event details", "error", "Error");
    }
}

// 🔥 ΒΗΜΑ 3: Ενημέρωση της addEventActionListeners()
function addEventActionListeners(event) {
    const joinBtn = document.getElementById('join-event-btn');
    const leaveBtn = document.getElementById('leave-event-btn');
    const deleteBtn = document.getElementById('delete-event-btn');
    const editBtn = document.getElementById('edit-event-btn');
    const groupChatBtn = document.getElementById('group-chat-btn');
    
    if (joinBtn) {
        joinBtn.addEventListener('click', function() {
            joinEvent(event.id);
            hideModal("event-details-modal");
        });
    }
    
    if (leaveBtn) {
        leaveBtn.addEventListener('click', function() {
            leaveEvent(event.id);
            hideModal("event-details-modal");
        });
    }
    
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() {
            hideModal("event-details-modal");
            showConfirmationModal(
                "Are you sure you want to delete this event? This action cannot be undone!",
                "Delete Event",
                () => {
                    deleteEvent(event.id);
                }
            );
        });
    }
    
    if (editBtn) {
        editBtn.addEventListener('click', function() {
            hideModal("event-details-modal");
            showEditEventModal(event);
        });
    }
    
    if (groupChatBtn) {
        groupChatBtn.addEventListener('click', async function() {
            try {
                await joinEventRoom(event.id);
                hideModal("event-details-modal");
            } catch (error) {
                console.error("Error joining event room:", error);
            }
        });
    }
}

// 🔥 ΒΗΜΑ 5: Ενημέρωση της joinEventRoom() να δουλεύει για events
async function joinEventRoom(eventId) {
    try {
        const response = await fetch(`/events/${eventId}/join-room`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                username: currentUser.username
            }),
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to join event room");
        }
        
        const data = await response.json();
        
        if (data.success) {
            if (data.isAlreadyMember) {
                showNotification("You're already in the group chat", "info", "Already Member");
                // Μπες στο room
                enterRoom(data.room.id, data.room.name, data.room.invite_code);
            } else {
                showNotification("Joined event group chat successfully!", "success", "Group Chat");
                // Μπες στο room
                enterRoom(data.room.id, data.room.name, data.room.invite_code);
            }
        }
    } catch (error) {
        console.error("Error joining event room:", error);
        showNotification(error.message || "Failed to join event room", "error", "Error");
    }
}

// 🔥 Βελτιωμένη displayHomeEvents() με deduplication και event rooms
let lastDisplayedEvents = [];

// Εμφάνιση events στην αρχική σελίδα
function displayHomeEvents(events) {
  const homeEventsList = document.getElementById('home-events-list');
  if (!homeEventsList) return;
  
  const now = new Date();
  
  if (events.length === 0) {
    showNoEventsOnHome();
    return;
  }
  
  // 🔥 Έλεγχος αν είναι ίδια events με την τελευταία φορά
  const eventsIds = events.map(e => e.id).sort().join(',');
  const lastEventsIds = lastDisplayedEvents.map(e => e.id).sort().join(',');
  
  if (eventsIds === lastEventsIds) {
    console.log('📅 Same events, skipping re-render');
    return;
  }
  
  lastDisplayedEvents = [...events];
  
  homeEventsList.innerHTML = '';
  
  events.forEach(event => {
    const eventDate = new Date(event.date);
    const isPast = eventDate < now;
    const isFull = event.max_participants > 0 && event.participant_count >= event.max_participants;
    const isParticipant = currentUser.authenticated && event.participants.includes(currentUser.username);
    const isCreator = currentUser.authenticated && event.created_by === currentUser.username;
    
    let statusClass = "upcoming";
    let statusText = "Upcoming";
    
    if (isPast) {
      statusClass = "past";
      statusText = "Past";
    } else if (isFull) {
      statusClass = "full";
      statusText = "Full";
    }
    
    // Format date
    const formattedDate = eventDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const eventCard = document.createElement('div');
    eventCard.className = `home-event-card ${statusClass} ${event.photo ? 'has-photo' : ''}`;
    eventCard.dataset.eventId = event.id;
    
    // 🔥 Αποφυγή inline styles για background
    if (event.photo) {
      eventCard.style.backgroundImage = `url('${event.photo}')`;
      eventCard.style.backgroundSize = 'cover';
      eventCard.style.backgroundPosition = 'center';
    }
    
    eventCard.innerHTML = `
      <div class="home-event-card-header">
        <h3>${event.title}</h3>
        <span class="home-event-badge ${statusClass}">${statusText}</span>
      </div>
      
      <div class="home-event-details">
        <div class="home-event-detail">
          <i class="fas fa-calendar-alt"></i>
          <span>${formattedDate}</span>
        </div>
        <div class="home-event-detail">
          <i class="fas fa-map-marker-alt"></i>
          <span>${event.location}</span>
        </div>
        <div class="home-event-detail">
          <i class="fas fa-users"></i>
          <span>${event.participant_count} participants${event.max_participants > 0 ? ` / ${event.max_participants}` : ''}</span>
        </div>
      </div>
      
      <div class="home-event-actions">
        <button class="home-event-btn details" data-event-id="${event.id}">
          <i class="fas fa-info-circle"></i> Details
        </button>
        ${!isPast ? (
          currentUser.authenticated ? (
            isParticipant ? 
              `<button class="home-event-btn leave" data-event-id="${event.id}">
                <i class="fas fa-sign-out-alt"></i> Leave
              </button>` :
              (!isFull ? 
                `<button class="home-event-btn join" data-event-id="${event.id}">
                  <i class="fas fa-plus"></i> Join
                </button>` : '')
          ) : (
            `<button class="home-event-btn join login-required" data-event-id="${event.id}">
              <i class="fas fa-sign-in-alt"></i> Login to Join
            </button>`
          )
        ) : ''}
        <!-- 🔥 ΚΡΙΤΙΚΗ ΠΡΟΣΘΗΚΗ: Group Chat Button -->
        ${isParticipant || isCreator ? `
            <button class="home-event-btn group-chat" data-event-id="${event.id}" data-is-participant="${isParticipant || isCreator}">
                <i class="fas fa-comments"></i> Group Chat
            </button>
        ` : ''}
      </div>
      
      <div class="home-event-creator">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span style="display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-user"></i>
            <span>${event.created_by}</span>
          </span>
          ${(isCreator || currentUser.username === "Vf-Rat") ? 
            `<button class="home-event-delete-btn" data-event-id="${event.id}" 
                    title="Delete event" style="background: transparent; border: none; color: var(--accent-red); cursor: pointer; padding: 4px 8px; border-radius: 3px;">
              <i class="fas fa-trash"></i>
            </button>` 
            : ''
          }
        </div>
      </div>
    `;
    
    homeEventsList.appendChild(eventCard);
    
    // 🔥 ΠΡΟΣΘΗΚΗ: Έλεγχος για event room μετά τη δημιουργία του event card
    setTimeout(() => {
      if (currentUser.authenticated && (isParticipant || isCreator)) {
        updateEventGroupChatButton(event.id, eventCard);
      }
    }, 500);
  });
  
  // Προσθήκη event listeners για τα buttons
  attachHomeEventListeners();
}

// Εμφάνιση μηνύματος όταν δεν υπάρχουν events
function showNoEventsOnHome() {
    const homeEventsSection = document.getElementById('home-events-section');
    const homeEventsList = document.getElementById('home-events-list');
    
    if (!homeEventsSection || !homeEventsList) return;
    
    homeEventsSection.style.display = 'block';
    
    if (currentUser.authenticated) {
        homeEventsList.innerHTML = `
            <div class="no-events-home">
                <i class="fas fa-calendar-times"></i>
                <h3>No upcoming events</h3>
                <p>Be the first to create an event!</p>
                <button id="create-first-event-btn" class="btn btn-primary">
                    <i class="fas fa-plus-circle"></i> Create Your First Event
                </button>
            </div>
        `;
    } else {
        homeEventsList.innerHTML = `
            <div class="no-events-home">
                <i class="fas fa-calendar-times"></i>
                <h3>No events available</h3>
                <p>Login to view and create events!</p>
                <button id="login-to-view-events-btn" class="btn btn-primary">
                    <i class="fas fa-sign-in-alt"></i> Login to View Events
                </button>
            </div>
        `;
    }
    
    // Προσθήκη listeners για τα κουμπιά
    const createFirstEventBtn = document.getElementById('create-first-event-btn');
    if (createFirstEventBtn) {
        createFirstEventBtn.addEventListener('click', () => {
            showModal("create-event-modal");
        });
    }
    
    const loginToViewEventsBtn = document.getElementById('login-to-view-events-btn');
    if (loginToViewEventsBtn) {
        loginToViewEventsBtn.addEventListener('click', () => {
            showModal("login-modal");
        });
    }
}

// ===== FILE UPLOAD SYSTEM =====
let fileUploadInProgress = false;
let selectedFile = null;
let fileUploadListenersInitialized = false; // 🔥 ΝΕΟ: Flag για αρχικοποίηση listeners

// ===== EMOJI PICKER SYSTEM =====
const emojiCategories = {
    smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳'],
    hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
    hands: ['👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '🤏', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪', '🦾'],
    vehicles: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🚚', '🚛', '🚜', '🛴', '🚲', '🛵', '🏍️', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🛰️', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢'],
    symbols: ['🔥', '💯', '✨', '🌟', '⭐', '🌠', '🎇', '🎆', '🌈', '☀️', '🌤️', '⛅', '🌥️', '☁️', '⛈️', '🌩️', '🌧️', '❄️', '☃️', '⛄', '💧', '💦', '☔', '💥', '⚡', '🎯', '🎮', '🎲', '🧩', '🎨', '🎵', '🎶', '🎸', '🎹', '🥁', '🎺', '🎻', '🎬', '🏆', '🎪', '🎭', '🩰', '🎤', '🎧', '🎼', '🎷'],
    objects: ['🔑', '💼', '📁', '📎', '✂️', '📏', '📐', '📌', '📍', '📌', '🖍️', '🖌️', '🖊️', '✒️', '📝', '📒', '📔', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🏷️', '💰', '💳', '💎', '⚙️', '🔧', '🔨', '⛏️', '⚒️', '🛠️', '🔗', '⛓️', '🧱', '🔩', '⚖️', '🧰', '🧲', '🔬', '🔭', '📡', '💉', '🩹', '💊'],
    flags: ['🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏴‍☠️', '🇬🇷', '🇺🇸', '🇬🇧', '🇩🇪', '🇫🇷', '🇮🇹', '🇪🇸', '🇯🇵', '🇨🇳', '🇰🇷', '🇷🇺', '🇮🇳']
};

// ===== UNREAD MESSAGES SYSTEM =====
let unreadMessages = {
    private: {},    // {friendUsername: count}
    groups: {},     // {roomId: count}
    total: 0
};

// ===== USER INFO SYSTEM =====
let currentViewedUser = null;

// ===== AVATAR SYSTEM =====
let userAvatars = {}; // Cache για τα avatars των χρηστών

// ===== CHAT STATE PERSISTENCE =====

function saveChatState() {
    if (currentRoom.id) {
        const chatState = {
            roomId: currentRoom.id,
            roomName: currentRoom.name,
            inviteCode: currentRoom.inviteCode,
            isPrivate: currentRoom.isPrivate,
            timestamp: Date.now()
        };
        localStorage.setItem('ratscape_chat_state', JSON.stringify(chatState));
        console.log('💾 Chat state saved:', chatState);
    }
}

function loadChatState() {
    const savedState = localStorage.getItem('ratscape_chat_state');
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            const oneHour = 60 * 60 * 1000; // 1 ώρα expiry
            if (Date.now() - state.timestamp < oneHour) {
                return state;
            }
        } catch (error) {
            console.error('Error loading chat state:', error);
        }
    }
    return null;
}

function clearChatState() {
    localStorage.removeItem('ratscape_chat_state');
}

// ===== INITIALIZE FILE UPLOAD & EMOJI PICKER =====

// 🔥 ΑΡΧΙΚΟΠΟΙΗΣΗ FILE UPLOAD SYSTEM - FIXED: ΜΟΝΟ ΜΙΑ ΦΟΡΕ
function initFileUploadSystem() {
    if (fileUploadListenersInitialized) {
        console.log('📁 File upload system already initialized');
        return;
    }
    
    const fileInput = document.getElementById('file-upload-input');
    const fileUploadBtn = document.querySelector('.file-upload-btn');
    
    if (fileInput && fileUploadBtn) {
        console.log('📁 Initializing file upload system');
        
        // Αφαίρεση όλων των προηγούμενων listeners
        const cleanFileInput = fileInput.cloneNode(true);
        fileInput.parentNode.replaceChild(cleanFileInput, fileInput);
        
        const cleanFileUploadBtn = fileUploadBtn.cloneNode(true);
        fileUploadBtn.parentNode.replaceChild(cleanFileUploadBtn, fileUploadBtn);
        
        // ΜΟΝΟ ΕΝΑ listener για το file upload button
        cleanFileUploadBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('📁 File upload button clicked');
            cleanFileInput.click();
        });
        
        // ΜΟΝΟ ΕΝΑ listener για το file input change
        cleanFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            console.log('📁 File selected:', file ? file.name : 'none');
            if (file) {
                handleFileSelection(file);
            }
        });
        
        fileUploadListenersInitialized = true;
        console.log('✅ File upload listeners initialized successfully');
    }
}

// 🔥 ΑΡΧΙΚΟΠΟΙΗΣΗ EMOJI PICKER
function initEmojiPickerSystem() {
    const emojiBtn = document.querySelector('.emoji-picker-btn');
    
    if (emojiBtn) {
        // Αφαίρεση προηγούμενων listeners
        const newEmojiBtn = emojiBtn.cloneNode(true);
        emojiBtn.parentNode.replaceChild(newEmojiBtn, emojiBtn);
        
        newEmojiBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showEmojiPicker();
        });
    }
}

// 🔥 HANDLE FILE SELECTION
function handleFileSelection(file) {
    // Έλεγχος τύπου αρχείου
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    
    if (!allowedTypes.includes(file.type)) {
        showNotification('Μόνο εικόνες, PDF και Word αρχεία επιτρέπονται!', 'error', 'Λάθος Αρχείο');
        return;
    }
    
    // Έλεγχος μεγέθους (10MB)
    if (file.size > 10 * 1024 * 1024) {
        showNotification('Το αρχείο είναι πολύ μεγάλο! Μέγιστο μέγεθος: 10MB', 'error', 'Μεγάλο Αρχείο');
        return;
    }
    
    selectedFile = file;
    showFilePreview(file);
}

// 🔥 SHOW FILE PREVIEW
function showFilePreview(file) {
    const filePreview = document.getElementById('file-preview');
    const previewImage = document.getElementById('preview-image');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');
    const uploadProgress = document.getElementById('upload-progress');
    
    if (!filePreview || !previewImage) return;
    
    // Εμφάνιση preview
    const reader = new FileReader();
    reader.onload = function(e) {
        // Αν είναι εικόνα, δείξε preview
        if (file.type.startsWith('image/')) {
            previewImage.src = e.target.result;
            previewImage.style.display = 'block';
        } else {
            // Αν δεν είναι εικόνα, δείξε μόνο εικονίδιο
            previewImage.style.display = 'none';
        }
        
        filePreview.style.display = 'block';
        
        // Πληροφορίες αρχείου
        if (fileName) {
            fileName.textContent = file.name.length > 25 ? file.name.substring(0, 25) + '...' : file.name;
        }
        
        if (fileSize) {
            const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
            fileSize.textContent = sizeInMB + ' MB';
        }
        
        // Reset progress bar
        if (uploadProgress) {
            uploadProgress.style.width = '0%';
            uploadProgress.textContent = '0%';
        }
    };
    reader.readAsDataURL(file);
}

// 🔥 CANCEL FILE UPLOAD
function cancelFileUpload() {
    const filePreview = document.getElementById('file-preview');
    const fileInput = document.getElementById('file-upload-input');
    const uploadProgress = document.getElementById('upload-progress');
    const uploadStatus = document.getElementById('upload-status');
    
    if (filePreview) {
        filePreview.style.display = 'none';
    }
    
    if (fileInput) {
        fileInput.value = '';
    }
    
    if (uploadProgress) {
        uploadProgress.style.width = '0%';
        uploadProgress.textContent = '';
    }
    
    if (uploadStatus) {
        uploadStatus.textContent = '';
    }
    
    selectedFile = null;
    fileUploadInProgress = false;
}

// 🔥 ΚΡΙΤΙΚΟ FIX: UPLOAD FILE TO SERVER - ΜΟΝΟ ΜΙΑ ΦΟΡΕ ΑΠΟΣΤΟΛΗ
let isUploading = false;

async function uploadFile() {
    if (isUploading) {
        console.log('⚠️ Upload already in progress, skipping...');
        return;
    }
    
    if (!selectedFile || fileUploadInProgress) {
        console.log('❌ No file selected or upload in progress');
        return;
    }
    
    isUploading = true;
    fileUploadInProgress = true;
    
    console.log('📤 Starting file upload:', selectedFile.name);
    
    const uploadProgress = document.getElementById('upload-progress');
    const uploadStatus = document.getElementById('upload-status');
    const sendFileBtn = document.getElementById('send-file-btn');
    const originalBtnText = sendFileBtn ? sendFileBtn.innerHTML : '';
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    
    if (currentRoom.id) {
        formData.append('roomId', currentRoom.id);
    }
    
    formData.append('sender', currentUser.username);
    formData.append('type', currentRoom.isPrivate ? 'private' : 'group');
    
    if (currentRoom.isPrivate) {
        formData.append('receiver', currentRoom.name);
    }
    
    try {
        if (uploadProgress) {
            uploadProgress.style.width = '30%';
            uploadProgress.setAttribute('data-progress', '30%');
        }
        
        if (uploadStatus) {
            uploadStatus.textContent = 'Αποστολή αρχείου...';
        }
        
        if (sendFileBtn) {
            sendFileBtn.disabled = true;
            sendFileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Αποστολή...';
        }
        
        const response = await fetch('/upload-file', {
            method: 'POST',
            headers: {
                'X-Session-ID': currentUser.sessionId
            },
            body: formData
        });
        
        if (uploadProgress) {
            uploadProgress.style.width = '70%';
            uploadProgress.setAttribute('data-progress', '70%');
        }
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Αποτυχία αποστολής αρχείου');
        }
        
        if (uploadProgress) {
            uploadProgress.style.width = '100%';
            uploadProgress.setAttribute('data-progress', '100%');
        }
        
        if (uploadStatus) {
            uploadStatus.textContent = 'Αποστολή επιτυχής!';
            uploadStatus.style.color = 'var(--success)';
        }
        
        if (data.success) {
            // 🔥 ΚΡΙΤΙΚΟ FIX: ΔΕΝ ΣΤΕΛΝΟΥΜΕ ΤΟ ΜΗΝΥΜΑ ΑΠΟ ΕΔΩ!
            // Το server θα στείλει το μήνυμα μέσω WebSocket
            // Απλά δείχνουμε notification
            
            showNotification('Το αρχείο στάλθηκε επιτυχώς!', 'success', 'Αποστολή Αρχείου');
            
            setTimeout(() => {
                cancelFileUpload();
            }, 1000);
        }
        
    } catch (error) {
        console.error('Error uploading file:', error);
        showNotification('Σφάλμα κατά την αποστολή αρχείου: ' + error.message, 'error', 'Σφάλμα');
        
        if (uploadStatus) {
            uploadStatus.textContent = 'Σφάλμα!';
            uploadStatus.style.color = 'var(--accent-red)';
        }
        
        if (uploadProgress) {
            uploadProgress.style.width = '0%';
            uploadProgress.setAttribute('data-progress', '0%');
        }
    } finally {
        isUploading = false;
        fileUploadInProgress = false;
        
        if (sendFileBtn) {
            sendFileBtn.disabled = false;
            sendFileBtn.innerHTML = originalBtnText;
        }
        
        console.log('✅ File upload completed');
    }
}

// 🔥 SHOW EMOJI PICKER
function showEmojiPicker() {
    const emojiPicker = document.getElementById('emoji-picker-modal');
    if (emojiPicker) {
        emojiPicker.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

// 🔥 HIDE EMOJI PICKER
function hideEmojiPicker() {
    const emojiPicker = document.getElementById('emoji-picker-modal');
    if (emojiPicker) {
        emojiPicker.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// 🔥 INITIALIZE EMOJI PICKER CONTENT
function initEmojiPickerContent() {
    const emojiCategoriesContainer = document.getElementById('emoji-categories');
    const emojiGrid = document.getElementById('emoji-grid');
    
    if (!emojiCategoriesContainer || !emojiGrid) return;
    
    // Δημιουργία κατηγοριών
    Object.keys(emojiCategories).forEach((category, index) => {
        const button = document.createElement('button');
        button.className = `emoji-category-btn ${index === 0 ? 'active' : ''}`;
        button.dataset.category = category;
        button.innerHTML = emojiCategories[category][0];
        button.title = getCategoryName(category);
        
        button.addEventListener('click', function() {
            // Αφαίρεση active class από όλα
            document.querySelectorAll('.emoji-category-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            // Προσθήκη active class στο επιλεγμένο
            this.classList.add('active');
            // Φόρτωση emoji της κατηγορίας
            loadEmojiCategory(category);
        });
        
        emojiCategoriesContainer.appendChild(button);
    });
    
    // Φόρτωση πρώτης κατηγορίας
    loadEmojiCategory(Object.keys(emojiCategories)[0]);
    
    // Close button
    const closeBtn = document.getElementById('close-emoji-picker');
    if (closeBtn) {
        closeBtn.addEventListener('click', hideEmojiPicker);
    }
    
    // Κλείσιμο με click έξω
    const emojiPickerModal = document.getElementById('emoji-picker-modal');
    if (emojiPickerModal) {
        emojiPickerModal.addEventListener('click', function(e) {
            if (e.target === this) {
                hideEmojiPicker();
            }
        });
    }
}

// 🔥 LOAD EMOJI CATEGORY
function loadEmojiCategory(category) {
    const emojiGrid = document.getElementById('emoji-grid');
    if (!emojiGrid) return;
    
    emojiGrid.innerHTML = '';
    const emojis = emojiCategories[category];
    
    emojis.forEach(emoji => {
        const emojiBtn = document.createElement('button');
        emojiBtn.className = 'emoji-item';
        emojiBtn.textContent = emoji;
        emojiBtn.title = `Εισαγωγή ${emoji}`;
        
        emojiBtn.addEventListener('click', function() {
            insertEmoji(emoji);
        });
        
        emojiGrid.appendChild(emojiBtn);
    });
}

// 🔥 INSERT EMOJI INTO MESSAGE INPUT
function insertEmoji(emoji) {
    const messageInput = document.getElementById('message-input');
    if (!messageInput) return;
    
    const start = messageInput.selectionStart;
    const end = messageInput.selectionEnd;
    const text = messageInput.value;
    const newText = text.substring(0, start) + emoji + text.substring(end);
    
    messageInput.value = newText;
    messageInput.focus();
    messageInput.selectionStart = messageInput.selectionEnd = start + emoji.length;
    
    // Trigger input event για αυτόματη αλλαγή ύψους
    messageInput.dispatchEvent(new Event('input'));
    
    // Κλείσιμο emoji picker μόνο σε mobile
    if (window.innerWidth <= 768) {
        setTimeout(() => {
            hideEmojiPicker();
        }, 300);
    }
}

// 🔥 GET CATEGORY NAME
function getCategoryName(category) {
    const names = {
        smileys: 'Smileys & People',
        hearts: 'Hearts & Emotions',
        hands: 'Hands & Gestures',
        vehicles: 'Vehicles & Travel',
        symbols: 'Symbols & Objects',
        objects: 'Objects & Tools',
        flags: 'Flags & Countries'
    };
    return names[category] || category;
}

// 🔥 FORMAT FILE SIZE
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 🔥 FIX: INITIALIZE EVENT LISTENERS - ΜΟΝΟ ΜΙΑ ΦΟΡΕ
function initializeUploadAndEmojiListeners() {
    console.log('🔄 Initializing upload and emoji listeners');
    
    // 🔥 ΑΡΧΙΚΟΠΟΙΗΣΗ ΜΟΝΟ ΑΝ ΔΕΝ ΕΧΕΙ ΓΙΝΕΙ ΗΔΗ
    if (!fileUploadListenersInitialized) {
        initFileUploadSystem();
    }
    
    initEmojiPickerSystem();
    initEmojiPickerContent();
    
    // 🔥 Send file button - ΜΟΝΟ ΜΙΑ ΦΟΡΕ
    const sendFileBtn = document.getElementById('send-file-btn');
    if (sendFileBtn) {
        // Αφαίρεση όλων των προηγούμενων listeners
        const newSendFileBtn = sendFileBtn.cloneNode(true);
        sendFileBtn.parentNode.replaceChild(newSendFileBtn, sendFileBtn);
        
        // Προσθήκη ΜΟΝΟ ΕΝΟΣ listener
        newSendFileBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('📤 Send file button clicked');
            
            // Έλεγχος αν τρέχει ήδη upload
            if (!isUploading && !fileUploadInProgress) {
                uploadFile();
            } else {
                console.log('⚠️ Upload already in progress');
            }
        });
    }
    
    // Cancel upload button
    const cancelUploadBtn = document.getElementById('cancel-upload-btn');
    if (cancelUploadBtn) {
        const newCancelBtn = cancelUploadBtn.cloneNode(true);
        cancelUploadBtn.parentNode.replaceChild(newCancelBtn, cancelUploadBtn);
        
        newCancelBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            cancelFileUpload();
        });
    }
}

// ===== EVENT PHOTO FUNCTIONS =====

function initEventPhotoSystem() {
    const browseBtn = document.getElementById('browse-event-photo-btn');
    const removeBtn = document.getElementById('remove-event-photo-btn');
    const photoInput = document.getElementById('event-photo-input');
    const preview = document.getElementById('event-photo-preview');
    const placeholder = document.getElementById('event-photo-placeholder');
    
    if (browseBtn && photoInput) {
        browseBtn.addEventListener('click', () => {
            photoInput.click();
        });
    }
    
    if (photoInput) {
        photoInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                handleEventPhotoSelection(file);
            }
        });
    }
    
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            removeEventPhoto();
        });
    }
}

function handleEventPhotoSelection(file) {
    // Check file type
    if (!file.type.startsWith('image/')) {
        showNotification('Only image files are allowed!', 'error', 'Invalid File');
        return;
    }
    
    // Check file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
        showNotification('Image is too large! Maximum size: 5MB', 'error', 'File Too Large');
        return;
    }
    
    eventPhotoFile = file;
    
    // Show preview
    const reader = new FileReader();
    reader.onload = function(e) {
        eventPhotoBase64 = e.target.result;
        const preview = document.getElementById('event-photo-preview');
        const placeholder = document.getElementById('event-photo-placeholder');
        const removeBtn = document.getElementById('remove-event-photo-btn');
        
        if (preview) {
            preview.src = eventPhotoBase64;
            preview.style.display = 'block';
        }
        if (placeholder) {
            placeholder.style.display = 'none';
        }
        if (removeBtn) {
            removeBtn.style.display = 'block';
        }
        
        // Store in hidden input
        const base64Input = document.getElementById('event-photo-base64');
        if (base64Input) {
            base64Input.value = eventPhotoBase64;
        }
    };
    reader.readAsDataURL(file);
}

function removeEventPhoto() {
    eventPhotoFile = null;
    eventPhotoBase64 = null;
    
    const preview = document.getElementById('event-photo-preview');
    const placeholder = document.getElementById('event-photo-placeholder');
    const removeBtn = document.getElementById('remove-event-photo-btn');
    const photoInput = document.getElementById('event-photo-input');
    const base64Input = document.getElementById('event-photo-base64');
    
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
    }
    if (placeholder) {
        placeholder.style.display = 'flex';
    }
    if (removeBtn) {
        removeBtn.style.display = 'none';
    }
    if (photoInput) {
        photoInput.value = '';
    }
    if (base64Input) {
        base64Input.value = '';
    }
}

// Function to upload event photo separately (for existing events)
async function uploadEventPhoto(eventId, username) {
    if (!eventPhotoFile) {
        return null;
    }
    
    try {
        const formData = new FormData();
        formData.append('photo', eventPhotoFile);
        formData.append('eventId', eventId);
        formData.append('username', username);
        
        const response = await fetch('/upload-event-photo', {
            method: 'POST',
            headers: {
                'X-Session-ID': currentUser.sessionId
            },
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.photoUrl;
        }
        return null;
    } catch (error) {
        console.error('Error uploading event photo:', error);
        return null;
    }
}

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
        case "avatar_upload_success":
            icon = "✓";
            notificationTitle = title || "Profile Picture Updated";
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

// ===== AVATAR SYSTEM FUNCTIONS =====

// 🔥 ΜΙΚΡΗ ΒΕΛΤΙΩΣΗ: Φόρτωση avatar για έναν χρήστη
async function loadUserAvatar(username, element, isCurrentUser = false) {
    if (!username) return;
    
    // Έλεγχος cache
    if (userAvatars[username]) {
        updateAvatarElement(element, userAvatars[username], username, isCurrentUser);
        return;
    }
    
    try {
        const response = await fetch(`/get-profile-picture/${username}`);
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.profile_picture) {
                // 🔥 ΕΔΩ ΑΛΛΑΓΗ: Αποθήκευση Base64 string απευθείας στο cache
                userAvatars[username] = data.profile_picture;
                updateAvatarElement(element, data.profile_picture, username, isCurrentUser);
            } else {
                // Χρήση initials αν δεν υπάρχει avatar
                updateAvatarElement(element, null, username, isCurrentUser);
            }
        }
    } catch (error) {
        console.error("Error loading avatar:", error);
        updateAvatarElement(element, null, username, isCurrentUser);
    }
}

// Ενημέρωση ενός avatar element
function updateAvatarElement(element, avatarUrl, username, isCurrentUser = false) {
    if (!element) return;
    
    if (avatarUrl) {
        // 🔥 ΕΔΩ ΑΛΛΑΓΗ: Χειρισμός Base64 string απευθείας
        // Έλεγχος αν το element είναι div ή img
        if (element.tagName === 'DIV') {
            element.innerHTML = `<img src="${avatarUrl}" alt="${username}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
            element.style.background = 'none';
        } else if (element.tagName === 'IMG') {
            element.src = avatarUrl;
            element.alt = username;
            element.style.display = 'block';
        }
    } else {
        // Χρήση initials
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

// Φόρτωση του avatar του τρέχοντος χρήστη παντού
async function loadCurrentUserAvatar() {
    if (!currentUser.authenticated) return;
    
    // Sidebar avatar
    const sidebarAvatar = document.getElementById("sidebar-avatar");
    if (sidebarAvatar) {
        await loadUserAvatar(currentUser.username, sidebarAvatar, true);
    }
    
    // Profile page avatar
    const profileImage = document.getElementById("profile-image");
    if (profileImage) {
        await loadUserAvatar(currentUser.username, profileImage, true);
    }
    
    // User info modal avatar
    const userInfoImage = document.getElementById("user-info-image");
    if (userInfoImage) {
        await loadUserAvatar(currentUser.username, userInfoImage, true);
    }
}

// Φόρτωση avatars για όλα τα μέλη σε room
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
        unreadMessages.private[sender] += 1;
    } else if (type === 'group') {
        if (!unreadMessages.groups[roomId]) {
            unreadMessages.groups[roomId] = 0;
        }
        unreadMessages.groups[roomId] += 1;
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
    
    // 🔥 ΠΡΟΣΘΗΚΗ: Αποθήκευση της σελίδας για refresh
    if (typeof setCurrentPageId === 'function') {
        setCurrentPageId(pageId);
    }
    
    // 🔥 Επίσης αποθήκευση στο localStorage
    localStorage.setItem('ratscape_last_page', pageId);
    
    // 🔥 ΕΙΔΙΚΟ: Αν φεύγουμε από chat page, αποθηκεύουμε την κατάσταση
    if (pageId === 'chat-page') {
        saveChatState();
    } else if (pageId !== 'chat-page' && currentRoom.id) {
        // Αν φεύγουμε από chat page προς άλλη σελίδα, κρατάμε την κατάσταση
        saveChatState();
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

function saveCurrentPage(pageId) {
    localStorage.setItem("ratroom_last_page", pageId);
}

function getLastPage() {
    return localStorage.getItem("ratroom_last_page") || "home-page";
}

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
        
        // Φόρτωση avatar του χρήστη
        loadCurrentUserAvatar();
        
        // 🔥 ΠΡΟΣΘΗΚΗ: Φόρτωση events στην αρχική όταν συνδέεται ο χρήστης
        setTimeout(() => {
            loadHomeEvents();
        }, 1500);
        
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
        
        // 🔥 ΠΡΟΣΘΗΚΗ: Φόρτωση public events για μη συνδεδεμένους
        setTimeout(() => {
            loadHomeEvents();
        }, 1500);
    }
}

function addMessageToChat(message) {
    const messagesContainer = document.getElementById("messages-container");
    const messageDiv = document.createElement("div");
    const isOwn = message.sender === currentUser.username;

    messageDiv.className = `message ${isOwn ? "own" : "other"}`;
    
    // Ειδική επεξεργασία για αρχεία
    if (message.isFile || message.file_data) {
        const fileData = message.file_data || message;
        const fileExtension = fileData.fileName ? fileData.fileName.split('.').pop().toLowerCase() : '';
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(fileExtension);
        
        if (isImage && fileData.fileUrl) {
            // Εικόνα - εμφάνιση preview
            messageDiv.innerHTML = `
                <div class="message-header">
                    <span class="message-sender">${message.sender}</span>
                    <span class="message-time">${message.time || getCurrentTime()}</span>
                </div>
                <div class="message-file">
                    <div class="file-preview">
                        <img src="${fileData.fileUrl}" alt="${fileData.fileName}" class="file-image-preview" onclick="openImagePreview('${fileData.fileUrl}')">
                        <div class="file-info">
                            <span class="file-name">${fileData.fileName}</span>
                            <a href="${fileData.fileUrl}" download="${fileData.fileName}" class="file-download-btn">
                                <i class="fas fa-download"></i> Download
                            </a>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Άλλο αρχείο - μόνο download link
            messageDiv.innerHTML = `
                <div class="message-header">
                    <span class="message-sender">${message.sender}</span>
                    <span class="message-time">${message.time || getCurrentTime()}</span>
                </div>
                <div class="message-file">
                    <div class="file-item">
                        <i class="fas fa-file"></i>
                        <div class="file-details">
                            <span class="file-name">${fileData.fileName}</span>
                            <a href="${fileData.fileUrl}" download="${fileData.fileName}" class="file-download-link">
                                <i class="fas fa-download"></i> Κατέβασμα
                            </a>
                        </div>
                    </div>
                </div>
            `;
        }
    } else {
        // Κανονικό μήνυμα κειμένου
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-sender">${message.sender}</span>
                <span class="message-time">${message.time || getCurrentTime()}</span>
            </div>
            <div class="message-text">${message.text}</div>
        `;
    }

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Συνάρτηση για προβολή εικόνας σε πλήρη οθόνη
function openImagePreview(imageUrl) {
    const modal = document.createElement('div');
    modal.className = 'image-preview-modal active';
    modal.innerHTML = `
        <div class="image-preview-content">
            <button class="close-image-preview" onclick="closeImagePreview()">×</button>
            <img src="${imageUrl}" alt="Preview" class="full-size-image">
            <div class="image-actions">
                <a href="${imageUrl}" download class="btn btn-primary">
                    <i class="fas fa-download"></i> Κατέβασμα
                </a>
                <button class="btn btn-secondary" onclick="closeImagePreview()">
                    <i class="fas fa-times"></i> Κλείσιμο
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
}

function closeImagePreview() {
    const modal = document.querySelector('.image-preview-modal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
}

function updateRoomMembers(members) {
    const membersList = document.getElementById("room-members-list");
    membersList.innerHTML = "";

    members.forEach(async (member) => {
        const memberDiv = document.createElement("div");
        memberDiv.className = "member-item";
        memberDiv.dataset.username = member.username;
        
        // Αρχικά βάζουμε initials
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
        
        // 🔥 Φόρτωση του πραγματικού avatar αν υπάρχει
        const avatarElement = memberDiv.querySelector('.member-avatar');
        if (avatarElement) {
            await loadUserAvatar(member.username, avatarElement, member.username === currentUser.username);
        }
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
                // 🔥 Φόρτωση events
                loadEvents();
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
    
    currentRoom = { 
        id: roomId, 
        name: roomName, 
        inviteCode: inviteCode,
        isPrivate: false 
    };

    // Update UI
    document.getElementById("room-name-sidebar").textContent = roomName;
    document.getElementById("room-name-header").textContent = roomName;
    
    // 🔥 ΓΙΑ ΚΑΝΟΝΙΚΑ ROOMS - ΕΜΦΑΝΙΖΟΥΜΕ ΝΟΡΜΑΛ ΤΟ INVITE CODE
    document.getElementById("room-invite-code").textContent = inviteCode;
    
    // Εμφάνιση του invite code section
    document.getElementById("invite-code-container").classList.remove("hide-for-private");
    
    // Ενεργοποιούμε το copy button για κανονικά rooms
    document.getElementById("copy-invite-btn").style.display = "flex";
    document.getElementById("copy-invite-btn").disabled = false;
    document.getElementById("copy-invite-btn").title = "Copy invite code";
    document.getElementById("copy-invite-btn").style.opacity = "1";
    document.getElementById("copy-invite-btn").style.cursor = "pointer";
    document.getElementById("copy-invite-btn").style.pointerEvents = "auto";

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
    
    // 🔥 ΣΗΜΑΝΤΙΚΟ: Αποθήκευση της κατάστασης
    saveChatState();
    
    // 🔥 ΣΗΜΑΝΤΙΚΟ: Request room data αμέσως
    // Κάνουμε τα requests μαζί για να αποφύγουμε race conditions
    socket.emit("get room info", { roomId: roomId });
    socket.emit("get room members", { roomId: roomId });
    
    // 🔥 ΕΠΙΠΛΕΟΝ: Κάνουμε ένα δεύτερο request μετά από 500ms για να είμαστε σίγουροι
    setTimeout(() => {
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
        `;

        // 🔥 Φόρτωση avatars για τους φίλους
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
    // Δημιουργία μοναδικού κωδικού για το private chat ΧΩΡΙΣ invite code
    const privateChatId = `private_${currentUser.username}_${friendUsername}`;
    
    currentRoom = {
        id: privateChatId,
        name: friendUsername,
        inviteCode: null,
        isPrivate: true,
    };

    document.getElementById("room-name-sidebar").textContent = friendUsername;
    document.getElementById("room-name-header").textContent = `Private Chat with ${friendUsername}`;
    
    // 🔥 ΑΥΤΟ ΕΙΝΑΙ ΤΟ ΚΥΡΙΟ ΦΙΞ - ΚΡΥΒΟΥΜΕ ΟΛΟΚΛΗΡΟ ΤΟ INVITE CODE SECTION
    document.getElementById("room-invite-code").textContent = "";
    document.getElementById("invite-code-container").classList.add("hide-for-private");
    
    // Απενεργοποιούμε εντελώς το copy button για private chats
    document.getElementById("copy-invite-btn").style.display = "none";
    
    document.getElementById("sidebar-username").textContent = currentUser.username;
    
    // Φόρτωση του avatar του χρήστη
    const sidebarAvatar = document.getElementById("sidebar-avatar");
    if (sidebarAvatar) {
        loadUserAvatar(currentUser.username, sidebarAvatar, true);
    }

    document.getElementById("room-description").textContent =
        `Private conversation with ${friendUsername}`;
    document.getElementById("room-status").textContent = "Private chat";
    document.getElementById("room-status").classList.add("private-chat");

    // Make the private chat members clickable too
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
    
    // 🔥 Αποθήκευση της κατάστασης
    saveChatState();
    
    // Φόρτωση avatars για τα μέλη
    setTimeout(() => {
        loadMemberAvatars();
        makeMemberItemsClickable();
    }, 100);
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
    const userInfoImage = document.getElementById("user-info-image");
    if (user.profile_picture) {
        // 🔥 ΕΔΩ ΑΛΛΑΓΗ: Χρήση Base64 string απευθείας
        userInfoImage.src = user.profile_picture;
        userInfoImage.style.display = 'block';
    } else {
        // Default avatar αν δεν έχει εικόνα
        const initials = user.username.substring(0, 2).toUpperCase();
        const color = getAvatarColor(user.username);
        userInfoImage.style.display = 'none';
        
        // Δημιουργία div για initials
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
        // Αρχικά κρύψε το κουμπί μέχρι να ελεγχθεί η φιλία
        addFriendBtn.style.display = 'none';
        sendMessageBtn.disabled = false;
        sendMessageBtn.innerHTML = '<i class="fas fa-comment"></i> Send Message';
        sendMessageBtn.classList.remove("btn-secondary");
        sendMessageBtn.classList.add("btn-primary");
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
    currentRoom = { id: null, name: null, inviteCode: null, isPrivate: false };
    
    // Clear local unread data
    unreadMessages = { private: {}, groups: {}, total: 0 };
    updateUnreadBadges();
    
    // Clear avatar cache
    userAvatars = {};
    
    clearUserFromLocalStorage();
    clearChatState(); // 🔥 ΚΑΙΝΟΥΡΓΙΟ: Καθαρισμός chat state
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

        // ΠΑΡΑΣΗΜΑΝΤΙΚΟ: Δεν κάνουμε throw error για 404 πια!
        // Απλά παίρνουμε το JSON response
        const data = await response.json();

        if (data.success) {
            showNotification("Joined room successfully!", "success", "Room Joined");
            hideAllModals();
            document.getElementById("invite-code-input").value = "";
            enterRoom(data.roomId, data.roomName, inviteCode.trim());
        } else {
            // Απλά δείχνουμε το μήνυμα λάθους
            showNotification(data.error || "Failed to join room", "error", "Join Room Failed");
        }
    } catch (error) {
        // Αυτό το catch τώρα θα πιάσει μόνο πραγματικά network errors
        console.error("Error joining room:", error);
        showNotification("Connection error. Please try again.", "error", "Connection Error");
    }
}

// 🔥 FIXED: LEAVE ROOM FUNCTION - WITH FRIEND REMOVAL FOR PRIVATE CHATS
async function handleLeaveRoom() {
    // Έλεγχος αν είμαστε σε private chat ή κανονικό room
    if (!currentRoom.id) {
        showNotification("You are not in a room", "info", "No Room");
        return;
    }
    
    if (currentRoom.isPrivate) {
        // Για private chats - ΑΦΑΙΡΕΣΗ ΦΙΛΟΥ
        const friendUsername = currentRoom.name;
        
        showConfirmationModal(
            `Are you sure you want to leave the private chat with ${friendUsername} and remove them as friend?`,
            "Leave Private Chat",
            async () => {
                try {
                    // 1. Αφαίρεση φίλου
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
                        throw new Error("Failed to remove friend");
                    }

                    const data = await response.json();

                    if (data.success) {
                        // 2. Επιστροφή στη σελίδα φίλων
                        showNotification(
                            `Left private chat with ${friendUsername} and removed as friend`,
                            "info",
                            "Chat Closed"
                        );
                        
                        showPage("friends-page");
                        loadUserFriends();
                        
                        // 3. Reset current room
                        currentRoom = { id: null, name: null, inviteCode: null, isPrivate: false };
                        
                        // 4. Clear chat state
                        clearChatState();
                        
                        // 5. Επαναφορά UI
                        document.getElementById("room-name-sidebar").textContent = "RatScape";
                        document.getElementById("room-name-header").textContent = "Room Name";
                        document.getElementById("room-invite-code").textContent = "------";
                        document.getElementById("room-description").textContent = "Group chat";
                        document.getElementById("room-status").textContent = "Not in a room";
                        document.getElementById("room-status").classList.remove("private-chat");
                        
                        // 6. Επαναφορά του invite code section
                        document.getElementById("invite-code-container").classList.remove("hide-for-private");
                        document.getElementById("copy-invite-btn").style.display = "flex";
                        document.getElementById("copy-invite-btn").disabled = false;
                        
                        // 7. Clear messages
                        document.getElementById("messages-container").innerHTML = "";
                        
                        // 8. Ενημέρωση unread messages
                        clearUnread('private', friendUsername);
                    } else {
                        showNotification(data.error || "Failed to remove friend", "error", "Action Failed");
                    }
                } catch (error) {
                    console.error("Error leaving private chat:", error);
                    showNotification("Error: " + error.message, "error", "Connection Error");
                    
                    // Ακόμα κι αν υπάρχει error, επέστρεψε στη σελίδα friends
                    showPage("friends-page");
                    loadUserFriends();
                    
                    // Reset current room
                    currentRoom = { id: null, name: null, inviteCode: null, isPrivate: false };
                    clearChatState();
                }
            },
            () => {
                // User cancelled
                console.log("User cancelled leaving private chat");
            }
        );
        return;
    }
    
    // Για κανονικά rooms, ζήτηση επιβεβαίωσης
    showConfirmationModal(
        "Are you sure you want to leave this room? You can rejoin anytime with the invite code.",
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
                    throw new Error("Failed to leave room");
                }

                const data = await response.json();

                if (data.success) {
                    showNotification("Left room successfully!", "success", "Room Left");
                    
                    // Κλείσιμο WebSocket connection για αυτό το room
                    if (currentRoom.id) {
                        socket.emit("leave_room", {
                            roomId: currentRoom.id,
                            username: currentUser.username
                        });
                    }
                    
                    // Επιστροφή στη σελίδα rooms
                    showPage("rooms-page");
                    loadUserRooms();
                    
                    // Reset current room
                    currentRoom = { id: null, name: null, inviteCode: null, isPrivate: false };
                    
                    // Clear chat state
                    clearChatState();
                    
                    // Επαναφορά UI στο default state
                    document.getElementById("room-name-sidebar").textContent = "RatScape";
                    document.getElementById("room-name-header").textContent = "Room Name";
                    document.getElementById("room-invite-code").textContent = "------";
                    document.getElementById("room-description").textContent = "Group chat";
                    document.getElementById("room-status").textContent = "Not in a room";
                    document.getElementById("room-status").classList.remove("private-chat");
                    
                    // Clear messages
                    document.getElementById("messages-container").innerHTML = "";
                    
                    // Επαναφορά του invite code section
                    document.getElementById("invite-code-container").classList.remove("hide-for-private");
                    document.getElementById("copy-invite-btn").style.display = "flex";
                    document.getElementById("copy-invite-btn").disabled = false;
                    
                    // Ενημέρωση unread messages
                    clearUnread('group', null, currentRoom.id);
                    
                } else {
                    showNotification(data.error || "Failed to leave room", "error", "Action Failed");
                }
            } catch (error) {
                console.error("Error leaving room:", error);
                showNotification("Error leaving room: " + error.message, "error", "Connection Error");
                
                // Ακόμα κι αν υπάρχει error, επέστρεψε στη σελίδα rooms
                showPage("rooms-page");
                loadUserRooms();
                
                // Reset current room
                currentRoom = { id: null, name: null, inviteCode: null, isPrivate: false };
                clearChatState();
            }
        }
    );
}

// 🔥 FIX: HANDLE SEND MESSAGE - ΔΕΝ ΣΤΕΛΝΕΙ ΑΡΧΕΙΑ ΑΠΟ ΕΔΩ
function handleSendMessage() {
    const input = document.getElementById("message-input");
    const text = input.value.trim();

    // 🔥 ΚΡΙΤΙΚΟ: Αν υπάρχει επιλεγμένο αρχείο, ΜΗΝ κάνεις τίποτα εδώ
    // Το uploadFile() θα το χειριστεί
    if (selectedFile && !fileUploadInProgress) {
        // ΔΕΝ καλούμε uploadFile() εδώ - το κουμπί "Send File" το κάνει
        return;
    }

    // Αν δεν υπάρχει κείμενο ή δεν είμαστε σε room
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
    const profileImage = document.getElementById("profile-image");
    if (profile.profile_picture) {
        // 🔥 ΕΔΩ ΑΛΛΑΓΗ: Χρήση Base64 string απευθείας
        profileImage.src = profile.profile_picture;
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

// Προσθήκη αυτών των γραμμών στο uploadProfilePicture() συνάρτηση:
async function uploadProfilePicture(file) {
    if (!file) return;
    
    // 🔥 ΒΕΛΤΙΩΣΗ: Προσθήκη loading state
    const uploadBtn = document.getElementById("change-profile-pic-btn");
    const originalHTML = uploadBtn.innerHTML;
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    uploadBtn.disabled = true;
    
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
                showNotification("Profile picture updated successfully!", "avatar_upload_success", "Avatar Updated");
                
                // 🔥 ΑΛΛΑΓΗ: Clear cache και ανανέωση Base64 string
                delete userAvatars[currentUser.username];
                
                // Update all avatar elements
                await loadCurrentUserAvatar();
                
                // Ενημέρωση cache με το νέο Base64
                userAvatars[currentUser.username] = data.profile_picture;
            }
        } else {
            showNotification("Failed to upload profile picture", "error", "Upload Error");
        }
    } catch (error) {
        console.error("Error uploading profile picture:", error);
        showNotification("Failed to upload profile picture", "error", "Upload Error");
    } finally {
        // Επαναφορά του κουμπιού
        uploadBtn.innerHTML = originalHTML;
        uploadBtn.disabled = false;
    }
}

// 🔧 ΚΑΙΝΟΥΡΓΙΑ ΣΥΝΑΡΤΗΣΗΣ - ΑΝΤΙΚΑΤΑΣΤΑΣΗ ΤΗΣ ΥΠΑΡΧΟΥΣΑΣ
async function saveProfileChanges(newUsername, newEmail, profilePicture) {
    try {
        const oldUsername = currentUser.username;
        
        // Validate inputs
        if (newUsername && newUsername === oldUsername && newEmail === currentUser.email && !profilePicture) {
            showNotification("No changes to save", "info", "No Changes");
            return;
        }
        
        console.log("📝 Sending profile update:", { 
            oldUsername: oldUsername, 
            newUsername: newUsername,
            newEmail: newEmail 
        });
        
        // 🔧 ΚΡΙΤΙΚΟ: Αποστολή του ΠΑΛΙΟΥ username στο server
        const response = await fetch("/update-profile", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                username: oldUsername, // Παλιό username
                updates: {
                    username: newUsername,
                    email: newEmail
                }
            }),
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log("✅ Profile update response:", data);
            
            if (data.success) {
                // 🔧 ΚΡΙΤΙΚΟ: Ανάπτυξη νέας συνάρτησης για ασφαλή ανανέωση session
                await handleProfileUpdateSuccess(oldUsername, data);
                
                showNotification("Profile updated successfully!", "success", "Profile Updated");
                hideAllModals();
                
                // Επανάληψη φόρτωσης με μικρή καθυστέρηση
                setTimeout(() => {
                    loadUserProfile();
                    updateUIForAuthState();
                }, 500);
                
            } else {
                showNotification(data.error || "Failed to update profile", "error", "Update Error");
            }
        } else {
            // 🔧 ΚΑΛΥΤΕΡΟΣ ΧΕΙΡΙΣΜΟΣ ERRORS
            try {
                const errorData = await response.json();
                console.error("❌ Server error response:", errorData);
                
                if (response.status === 400) {
                    if (errorData.error.includes("already taken") || errorData.error.includes("already registered")) {
                        showNotification(errorData.error, "error", "Already Exists");
                    } else if (errorData.error.includes("Session") || errorData.error.includes("expired")) {
                        handleSessionExpired();
                    } else {
                        showNotification(errorData.error, "error", "Update Error");
                    }
                } else if (response.status === 401) {
                    handleSessionExpired();
                } else {
                    showNotification(errorData.error || `Server error ${response.status}`, "error", "Update Error");
                }
            } catch (parseError) {
                showNotification(`Server error ${response.status}`, "error", "Update Error");
            }
        }
    } catch (error) {
        console.error("❌ Error updating profile:", error);
        showNotification("Connection error: " + error.message, "error", "Connection Error");
    }
}

// 🔧 ΚΑΙΝΟΥΡΓΙΑ: Συνάρτηση για ασφαλή ανανέωση μετά από επιτυχημένη ενημέρωση προφίλ
async function handleProfileUpdateSuccess(oldUsername, data) {
    try {
        console.log("🔄 Handling profile update success:", { oldUsername, newUserData: data.user });
        
        // 1. Ενημέρωση του currentUser αντικειμένου
        if (data.user) {
            currentUser.username = data.user.username || currentUser.username;
            currentUser.email = data.user.email || currentUser.email;
            // Η sessionId παραμένει η ίδια - το server θα το ενημερώσει
        }
        
        // 2. Αποθήκευση των νέων στοιχείων στο localStorage
        saveUserToLocalStorage(currentUser);
        
        // 3. Επαναπροσθήκη WebSocket listeners με τα νέα στοιχεία
        setTimeout(() => {
            socket.emit("authenticate", {
                username: currentUser.username,
                sessionId: currentUser.sessionId,
            });
            
            console.log("✅ Re-authenticated WebSocket with new username:", currentUser.username);
        }, 300);
        
    } catch (error) {
        console.error("❌ Error in profile update success handler:", error);
        // Fallback: Reload the page
        setTimeout(() => {
            location.reload();
        }, 1000);
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

// ===== CLEAR MESSAGES FUNCTIONS =====

// 🔥 FIXED: Clear messages - Διαγράφει ΚΑΙ από τη βάση δεδομένων
async function handleClearMessages() {
    if (!currentRoom.id) {
        showNotification("You are not in a room", "info", "No Room");
        return;
    }
    
    showConfirmationModal(
        "Are you sure you want to clear all messages? This action cannot be undone!",
        "Clear Messages",
        async () => {
            try {
                // 1. Διαγραφή από τη βάση δεδομένων
                const requestData = {
                    username: currentUser.username,
                    isPrivate: currentRoom.isPrivate
                };
                
                if (currentRoom.isPrivate) {
                    requestData.friendUsername = currentRoom.name;
                } else {
                    requestData.roomId = currentRoom.id;
                }
                
                const response = await fetch("/clear-room-messages", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Session-ID": currentUser.sessionId,
                    },
                    body: JSON.stringify(requestData),
                });
                
                if (!response.ok) {
                    throw new Error("Failed to clear messages");
                }
                
                const data = await response.json();
                
                if (data.success) {
                    // 2. Καθαρισμός του UI
                    document.getElementById("messages-container").innerHTML = "";
                    
                    showNotification(
                        `${data.deletedCount} messages cleared successfully`, 
                        "success", 
                        "Messages Cleared"
                    );
                } else {
                    showNotification(
                        data.error || "Failed to clear messages", 
                        "error", 
                        "Clear Failed"
                    );
                }
                
            } catch (error) {
                console.error("Error clearing messages:", error);
                showNotification(
                    "Error clearing messages: " + error.message, 
                    "error", 
                    "Clear Failed"
                );
            }
        }
    );
}

// 🔥 ΝΕΟ: WebSocket event για όταν κάποιος άλλος κάνει clear
socket.on("messages_cleared", (data) => {
    console.log("🗑️ Messages cleared event:", data);
    
    // Έλεγχος αν το event αφορά το τρέχον chat
    const shouldClear = (
        (data.type === 'private' && currentRoom.isPrivate && 
         (data.user1 === currentUser.username || data.user2 === currentUser.username) &&
         (data.user1 === currentRoom.name || data.user2 === currentRoom.name)) ||
        (data.type === 'group' && !currentRoom.isPrivate && data.roomId === currentRoom.id)
    );
    
    if (shouldClear) {
        // Καθαρισμός του UI
        document.getElementById("messages-container").innerHTML = "";
        
        showNotification(
            "Messages have been cleared", 
            "info", 
            "Messages Cleared"
        );
    }
});

// ===== ADMIN SYSTEM FUNCTIONS =====

// 🔥 ΚΡΙΤΙΚΗ ΔΙΟΡΘΩΣΗ: Delete Event Function - ΕΝΗΜΕΡΩΜΕΝΗ ΒΕΡΣΙΟΝ
async function deleteEvent(eventId) {
    console.log("🗑️ deleteEvent called:", eventId);
    
    // 🔥 ΚΡΙΤΙΚΟ: Έλεγχος αν το event υπάρχει ακόμα στο UI
    const eventCard = document.querySelector(`.event-card[data-event-id="${eventId}"]`);
    const homeEventCard = document.querySelector(`.home-event-card[data-event-id="${eventId}"]`);
    
    if (!eventCard && !homeEventCard) {
        console.warn("⚠️ Event card not found in UI, already deleted");
        showNotification("Refresh please to delete this event", "info", "Refresh The Page please");
        hideAllModals();
        
        // 🔥 ΝΕΟ: Επαναφόρτωση events ΚΑΙ listeners μετά το modal close
        setTimeout(() => {
            loadEvents();
            loadHomeEvents(); // 🔥 ΠΡΟΣΘΗΚΗ: Ανανέωση και home events
        }, 100);
        return;
    }
    
    try {
        const response = await fetch(`/events/${eventId}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                username: currentUser.username
            }),
        });
        
        // 🔥 ΠΡΟΣΘΗΚΗ: Καλύτερος χειρισμός errors
        if (!response.ok) {
            const data = await response.json();
            
            // Αν το event δεν βρέθηκε, σημαίνει ότι ήδη διαγράφηκε
            if (data.error === "Event not found") {
                console.warn("⚠️ Event not found on server, already deleted");
                showNotification("Event already deleted", "info", "Already Deleted");
                
                // 🔥 ΚΡΙΤΙΚΟ: Κλείσιμο modal ΠΡΙΝ το reload
                hideAllModals();
                
                // 🔥 Επαναφόρτωση με μικρή καθυστέρηση
                setTimeout(() => {
                    loadEvents();
                    loadHomeEvents(); // 🔥 ΠΡΟΣΘΗΚΗ: Ανανέωση και home events
                }, 100);
                return;
            }
            
            throw new Error(data.error || "Failed to delete event");
        }
        
        const data = await response.json();
        
        if (data.success) {
            console.log("✅ Event deleted successfully");
            
            // 🔥 ΚΡΙΤΙΚΟ: Πρώτα κλείνουμε το modal
            hideAllModals();
            
            // 🔥 Μετά κάνουμε fadeOut animation για όλα τα event cards
            if (eventCard) {
                eventCard.style.animation = 'fadeOut 0.3s ease';
                setTimeout(() => {
                    eventCard.remove();
                }, 300);
            }
            
            if (homeEventCard) {
                homeEventCard.style.animation = 'fadeOut 0.3s ease';
                setTimeout(() => {
                    homeEventCard.remove();
                }, 300);
            }
            
            showNotification("Event deleted successfully", "success", "Event Deleted");
            
            // 🔥 ΚΡΙΤΙΚΗ ΑΛΛΑΓΗ: Reload με μικρή καθυστέρηση ΚΑΙ επαναφόρτωση listeners
            setTimeout(() => {
                loadEvents();
                loadHomeEvents(); // 🔥 ΠΡΟΣΘΗΚΗ: Ανανέωση και home events
            }, 400);
        }
    } catch (error) {
        console.error("❌ Error deleting event:", error);
        
        // 🔥 Ειδικός χειρισμός για "Event not found"
        if (error.message.includes("Event not found")) {
            hideAllModals();
            
            // 🔥 ΚΡΙΤΙΚΟ: Επαναφόρτωση για sync
            setTimeout(() => {
                loadEvents();
                loadHomeEvents(); // 🔥 ΠΡΟΣΘΗΚΗ: Ανανέωση και home events
            }, 100);
            
            showNotification("Event was already deleted", "info", "Already Deleted");
        } else {
            showNotification(error.message || "Failed to delete event", "error", "Error");
        }
    }
}

// 🔥 ΒΗΜΑ 2: Βελτιωμένη loadEvents() function - ΕΝΗΜΕΡΩΜΕΝΗ ΜΕ ΦΙΛΤΡΟ ΚΑΙ EVENT ROOMS
async function loadEvents() {
    if (!currentUser.authenticated) return;
    
    console.log("📅 Loading events...");
    
    try {
        const response = await fetch(`/events?username=${currentUser.username}`, {
            headers: {
                "X-Session-ID": currentUser.sessionId,
            },
        });
        
        if (!response.ok) {
            throw new Error("Failed to load events");
        }
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ Loaded ${data.events.length} events`);
            
            // 🔥 ΚΡΙΤΙΚΗ ΑΛΛΑΓΗ: Φίλτρο για να αποφύγουμε διαγραμμένα events
            // Εδώ θα πρέπει να ελέγξουμε αν το server στέλνει μόνο ενεργά events
            // Αν όχι, μπορούμε να κάνουμε client-side φίλτρο:
            
            // ΠΡΟΣΟΧΗ: Εδώ βασίζεσαι ότι το server δεν στέλνει διαγραμμένα events
            
            displayEvents(data.events);
            
            // 🔥 ΚΡΙΤΙΚΟ: Επανάθεση listeners ΜΕΤΑ το display
            setTimeout(() => {
                attachEventCardListeners();
                attachAdminControlListeners();
            }, 100);
        }
    } catch (error) {
        console.error("Error loading events:", error);
        showNotification("Could not load events", "error", "Events Error");
    }
}

// 🔥 ΒΗΜΑ 3: Βελτιωμένη attachEventCardListeners() με event delegation
function attachEventCardListeners() {
    const eventsList = document.getElementById("events-list");
    if (!eventsList) return;
    
    // 🔥 ΚΡΙΤΙΚΟ: Αφαίρεση ΟΛΩΝ των παλιών listeners με event delegation
    const newEventsList = eventsList.cloneNode(false);
    newEventsList.innerHTML = eventsList.innerHTML;
    eventsList.parentNode.replaceChild(newEventsList, eventsList);
    
    // 🔥 EVENT DELEGATION - ΕΝΑ listener για ΟΛΕΣ τις αλληλεπιδράσεις
    newEventsList.addEventListener('click', function(e) {
        const button = e.target.closest('button');
        if (!button) return;
        
        const eventCard = button.closest('.event-card');
        if (!eventCard) return;
        
        const eventId = eventCard.dataset.eventId;
        
        // Details button
        if (button.classList.contains('details')) {
            e.stopPropagation();
            console.log("👁 Details button clicked for:", eventId);
            showEventDetails(eventId);
            return;
        }
        
        // Join button
        if (button.classList.contains('join')) {
            e.stopPropagation();
            console.log("➕ Join button clicked for:", eventId);
            joinEvent(eventId);
            return;
        }
        
        // Leave button
        if (button.classList.contains('leave')) {
            e.stopPropagation();
            console.log("➖ Leave button clicked for:", eventId);
            leaveEvent(eventId);
            return;
        }
    });
    
    console.log("✅ Event cards listening via delegation");
}

// 🔥 ΒΗΜΑ 4: Βελτιωμένη addEventActionListeners() 
function addEventActionListeners(event) {
    console.log("🔘 Setting up action listeners for event:", event.id);
    
    const modalButtons = document.getElementById("event-action-buttons");
    if (!modalButtons) {
        console.error("❌ Modal buttons container not found!");
        return;
    }
    
    // 🔥 Χρήση event delegation ΣΤΟ MODAL
    const newModalButtons = modalButtons.cloneNode(false);
    newModalButtons.innerHTML = modalButtons.innerHTML;
    modalButtons.parentNode.replaceChild(newModalButtons, modalButtons);
    
    // Event delegation για ΟΛΑ τα buttons στο modal
    newModalButtons.addEventListener('click', function(e) {
        const button = e.target.closest('button');
        if (!button) return;
        
        const eventId = button.dataset.eventId || event.id;
        
        // Join button
        if (button.id === 'join-event-btn') {
            e.stopPropagation();
            joinEvent(eventId);
            hideModal("event-details-modal");
            return;
        }
        
        // Leave button
        if (button.id === 'leave-event-btn') {
            e.stopPropagation();
            leaveEvent(eventId);
            hideModal("event-details-modal");
            return;
        }
        
        // Delete button (creator)
        if (button.id === 'delete-event-btn') {
            e.stopPropagation();
            showConfirmationModal(
                "Are you sure you want to delete this event? This action cannot be undone!",
                "Delete Event",
                () => {
                    deleteEvent(eventId);
                }
            );
            return;
        }
        
        // Admin delete button
        if (button.id === 'admin-delete-event-btn') {
            e.stopPropagation();
            showConfirmationModal(
                "Are you sure you want to delete this event as ADMIN?",
                "Delete Event (Admin)",
                () => {
                    deleteEvent(eventId);
                }
            );
            return;
        }
        
        // Edit button
        if (button.id === 'edit-event-btn') {
            e.stopPropagation();
            showEditEventModal(event);
            return;
        }
    });
    
    console.log("✅ Modal listeners attached via delegation");
}

// 🔥 ΒΗΜΑ 5: Επαναφόρτωση admin control listeners
function attachAdminControlListeners() {
    // Clear sample events button
    const clearSamplesBtn = document.getElementById("clear-sample-events-btn");
    if (clearSamplesBtn) {
        const newBtn = clearSamplesBtn.cloneNode(true);
        clearSamplesBtn.parentNode.replaceChild(newBtn, clearSamplesBtn);
        
        newBtn.addEventListener('click', clearSampleEvents);
    }
    
    // Delete all events button
    const deleteAllBtn = document.getElementById("delete-all-events-btn");
    if (deleteAllBtn) {
        const newBtn = deleteAllBtn.cloneNode(true);
        deleteAllBtn.parentNode.replaceChild(newBtn, deleteAllBtn);
        
        newBtn.addEventListener('click', deleteAllEvents);
    }
    
    // Reload events button
    const reloadBtn = document.getElementById("reload-events-btn");
    if (reloadBtn) {
        const newBtn = reloadBtn.cloneNode(true);
        reloadBtn.parentNode.replaceChild(newBtn, reloadBtn);
        
        newBtn.addEventListener('click', loadEvents);
    }
}

// 🔥 ΒΗΜΑ 6: Ενημέρωση των admin functions - ΒΕΛΤΙΩΜΕΝΗ
async function clearSampleEvents() {
    if (currentUser.username !== "Vf-Rat") {
        showNotification("Only admin can clear sample events", "error", "Admin Only");
        return;
    }
    
    showConfirmationModal(
        "This will clear ALL sample and old events. This action cannot be undone!",
        "Clear ALL Sample Events",
        async () => {
            try {
                const response = await fetch("/events/admin/clear-samples", {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Session-ID": currentUser.sessionId,
                    },
                    body: JSON.stringify({
                        username: currentUser.username
                    }),
                });
                
                if (!response.ok) {
                    throw new Error("Failed to clear sample events");
                }
                
                const data = await response.json();
                
                if (data.success) {
                    showNotification(
                        `Cleared ${data.deletedCount} events (${data.samples} samples + ${data.old} old)`, 
                        "success", 
                        "Events Cleared"
                    );
                    
                    // 🔥 ΚΡΙΤΙΚΟ: Ανανέωση χωρίς refresh - ΜΟΝΟ reload
                    setTimeout(() => {
                        loadEvents();
                        loadHomeEvents();
                        location.reload(); // 🔥 ΣΗΜΑΝΤΙΚΟ: Reload για καθαρό state
                    }, 1000);
                }
            } catch (error) {
                console.error("Error clearing sample events:", error);
                showNotification(error.message || "Failed to clear sample events", "error", "Error");
            }
        }
    );
}

async function deleteAllEvents() {
    if (currentUser.username !== "Vf-Rat") {
        showNotification("Only admin can delete all events", "error", "Admin Only");
        return;
    }
    
    showConfirmationModal(
        "⚠️ **CRITICAL: DELETE ALL EVENTS** ⚠️\n\nAre you ABSOLUTELY sure? This will delete EVERY event in the system! This action cannot be undone!",
        "DELETE ALL EVENTS",
        async () => {
            try {
                const response = await fetch("/events/admin/delete-all", {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Session-ID": currentUser.sessionId,
                    },
                    body: JSON.stringify({
                        username: currentUser.username
                    }),
                });
                
                if (!response.ok) {
                    throw new Error("Failed to delete all events");
                }
                
                const data = await response.json();
                
                if (data.success) {
                    showNotification(
                        `Deleted ALL events (${data.deletedCount} total)`, 
                        "success", 
                        "Events Deleted"
                    );
                    
                    // 🔥 ΚΡΙΤΙΚΟ: Ανανέωση χωρίς refresh
                    setTimeout(() => {
                        loadEvents();
                        loadHomeEvents();
                    }, 300);
                }
            } catch (error) {
                console.error("Error deleting all events:", error);
                showNotification(error.message || "Failed to delete events", "error", "Error");
            }
        }
    );
}

// ===== EVENT ROOMS SYSTEM FUNCTIONS =====

// 🔥 ΝΕΑ ΣΥΝΑΡΤΗΣΗ: Αυτόματο join στο event room όταν joinάρεις στο event
async function autoJoinEventRoom(eventId) {
    try {
        console.log(`🤝 Auto-joining event room for event: ${eventId}`);
        
        const response = await fetch(`/events/${eventId}/join-room`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                username: currentUser.username
            }),
        });
        
        if (!response.ok) {
            const data = await response.json();
            console.log("ℹ️ Could not auto-join event room:", data.error || "Unknown error");
            return false;
        }
        
        const data = await response.json();
        
        if (data.success) {
            console.log("✅ Auto-joined event room successfully");
            return true;
        }
        
        return false;
    } catch (error) {
        console.error("❌ Error auto-joining event room:", error);
        return false;
    }
}

// 🔥 ΠΡΟΣΘΗΚΗ: Βελτιωμένη joinEventRoom συνάρτηση
async function joinEventRoom(eventId) {
    try {
        const response = await fetch(`/events/${eventId}/join-room`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                username: currentUser.username
            }),
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to join event room");
        }
        
        const data = await response.json();
        
        if (data.success) {
            if (data.isAlreadyMember) {
                showNotification("You're already in the group chat", "info", "Already Member");
                // Μπες στο room
                enterRoom(data.room.id, data.room.name, data.room.invite_code);
            } else {
                showNotification("Joined event group chat successfully!", "success", "Group Chat");
                // Μπες στο room
                enterRoom(data.room.id, data.room.name, data.room.invite_code);
            }
        }
    } catch (error) {
        console.error("Error joining event room:", error);
        showNotification(error.message || "Failed to join event room", "error", "Error");
    }
}

// 🔥 ΠΡΟΣΘΗΚΗ: Έλεγχος και εμφάνιση "Join Group Chat" button
async function updateEventGroupChatButton(eventId, eventCard) {
    try {
        const response = await fetch(`/events/${eventId}/room-info?username=${currentUser.username}`, {
            headers: {
                "X-Session-ID": currentUser.sessionId,
            },
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success && data.hasRoom) {
                // Βρείτε το group chat button
                const groupChatBtn = eventCard.querySelector('.btn-event.group-chat, .home-event-btn.group-chat');
                
                if (groupChatBtn) {
                    if (data.room.isMember) {
                        // Είναι ήδη στο room - Open Chat
                        groupChatBtn.innerHTML = '<i class="fas fa-comments"></i> Open Chat';
                        groupChatBtn.classList.remove('join-room');
                        groupChatBtn.classList.add('enter-room');
                        groupChatBtn.dataset.roomId = data.room.id;
                        groupChatBtn.dataset.roomName = data.room.name;
                        groupChatBtn.dataset.inviteCode = data.room.invite_code;
                    } else if (data.room.canJoin) {
                        // Μπορεί να joinάρει στο room - Join Group Chat
                        groupChatBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Join Group Chat';
                        groupChatBtn.classList.remove('enter-room');
                        groupChatBtn.classList.add('join-room');
                        groupChatBtn.dataset.eventId = eventId;
                    } else {
                        // Δεν μπορεί να joinάρει - Join Event First
                        groupChatBtn.innerHTML = '<i class="fas fa-calendar-plus"></i> Join Event First';
                        groupChatBtn.classList.add('join-event-first');
                        groupChatBtn.dataset.eventId = eventId;
                        groupChatBtn.disabled = false;
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error updating group chat button:", error);
    }
}

// 🔥 ΕΝΗΜΕΡΩΜΕΝΗ ΣΥΝΑΡΤΗΣΗ: Join event με αυτόματο join στο room
async function joinEvent(eventId) {
    try {
        const response = await fetch(`/events/${eventId}/join`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                username: currentUser.username
            }),
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to join event");
        }
        
        const data = await response.json();
        
        if (data.success) {
            showNotification("Joined event successfully!", "success", "Event Joined");
            
            // 🔥 ΚΡΙΤΙΚΟ: Αυτόματο join στο event room
            setTimeout(async () => {
                try {
                    await autoJoinEventRoom(eventId);
                } catch (roomError) {
                    console.log("ℹ️ Could not auto-join event room:", roomError.message);
                }
            }, 1500);
            
            // Επαναφόρτωση events
            loadEvents();
            loadHomeEvents();
        }
    } catch (error) {
        console.error("❌ Error joining event:", error);
        showNotification(error.message || "Failed to join event", "error", "Error");
    }
}

// 🔥 ΕΝΗΜΕΡΩΜΕΝΗ ΣΥΝΑΡΤΗΣΗ: Leave event (αλλά παραμένει στο room)
async function leaveEvent(eventId) {
    try {
        const response = await fetch(`/events/${eventId}/leave`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                username: currentUser.username
            }),
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to leave event");
        }
        
        const data = await response.json();
        
        if (data.success) {
            showNotification("Left event successfully", "info", "Event Left");
            
            // 🔥 ΕΠΑΝΑΦΟΡΤΩΣΗ ΚΑΙ ΕΠΑΝΑΟΡΙΣΜΟΣ LISTENERS
            loadEvents();
            loadHomeEvents(); // 🔥 ΠΡΟΣΘΗΚΗ: Επαναφόρτωση και home events
        }
    } catch (error) {
        console.error("❌ Error leaving event:", error);
        showNotification(error.message || "Failed to leave event", "error", "Error");
    }
}

// 🔥 ΕΝΗΜΕΡΩΣΗ: Βελτιωμένη displayEvents() για να περιλαμβάνει έλεγχο για room
function displayEvents(events) {
    const eventsList = document.getElementById("events-list");
    if (!eventsList) return;
    
    eventsList.innerHTML = "";
    
    if (!events || events.length === 0) {
        eventsList.innerHTML = `
            <div class="no-events">
                <i class="fas fa-calendar-times"></i>
                <h3>No upcoming events</h3>
                <p>Be the first to create an event!</p>
            </div>
        `;
        return;
    }
    
    const now = new Date();
    
    events.forEach(event => {
        const eventDate = new Date(event.date);
        const isPast = eventDate < now;
        const isFull = event.max_participants > 0 && event.participant_count >= event.max_participants;
        const isParticipant = event.participants.includes(currentUser.username);
        const isCreator = event.created_by === currentUser.username;
        
        let statusClass = "upcoming";
        let statusText = "Upcoming";
        
        if (isPast) {
            statusClass = "past";
            statusText = "Past";
        } else if (isFull) {
            statusClass = "full";
            statusText = "Full";
        }
        
        const eventCard = document.createElement("div");
        eventCard.className = `event-card ${statusClass} ${event.photo ? 'has-photo' : ''}`;
        eventCard.dataset.eventId = event.id;
        
        // 🔥 ΚΡΙΤΙΚΗ ΑΛΛΑΓΗ: Προσθήκη inline style για background image
        if (event.photo) {
            eventCard.style.backgroundImage = `url('${event.photo}')`;
            eventCard.style.backgroundSize = 'cover';
            eventCard.style.backgroundPosition = 'center';
        }
        
        // Format date
        const formattedDate = eventDate.toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        eventCard.innerHTML = `
            <div class="event-card-header">
                <h3>${event.title}</h3>
                <span class="event-status ${statusClass}">${statusText}</span>
            </div>
            
            <div class="event-details">
                <div class="event-detail">
                    <i class="fas fa-calendar-alt"></i>
                    <span>${formattedDate}</span>
                </div>
                <div class="event-detail">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${event.location}</span>
                </div>
                ${event.description ? `
                    <div class="event-detail">
                        <i class="fas fa-align-left"></i>
                        <span>${event.description.substring(0, 50)}${event.description.length > 50 ? '...' : ''}</span>
                    </div>
                ` : ''}
            </div>
            
            <div class="event-participants">
                <div class="participant-count">
                    <i class="fas fa-users"></i>
                    <span>${event.participant_count} ${event.max_participants > 0 ? `/ ${event.max_participants}` : ''} participants</span>
                </div>
                <!-- 🔥 ΠΡΟΣΘΗΚΗ: Group Chat Status -->
                <div class="group-chat-status" id="group-chat-status-${event.id}" style="font-size: 0.75rem; color: var(--text-light); margin-top: 5px;">
                    <i class="fas fa-comments"></i>
                    <span>Group chat available</span>
                </div>
            </div>
            
            <div class="event-card-footer">
                <div class="event-creator">
                    <i class="fas fa-user"></i>
                    <span>${event.created_by}</span>
                </div>
                <div class="event-actions">
                    <button class="btn-event details" data-event-id="${event.id}">Details</button>
                    ${!isPast && !isCreator ? (
                        isParticipant 
                            ? `<button class="btn-event leave" data-event-id="${event.id}">Leave</button>`
                            : (!isFull ? `<button class="btn-event join" data-event-id="${event.id}">Join</button>` : '')
                    ) : ''}
                    <!-- 🔥 ΚΡΙΤΙΚΗ ΠΡΟΣΘΗΚΗ: Group Chat Button -->
                    ${isParticipant || isCreator ? `
                        <button class="btn-event group-chat" data-event-id="${event.id}" data-is-participant="${isParticipant || isCreator}">
                            <i class="fas fa-comments"></i> Group Chat
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
        
        eventsList.appendChild(eventCard);
        
        // 🔥 ΠΡΟΣΘΗΚΗ: Έλεγχος για event room μετά τη δημιουργία του event card
        setTimeout(() => {
            if (currentUser.authenticated && (isParticipant || isCreator)) {
                updateEventGroupChatButton(event.id, eventCard);
            }
        }, 500);
    });
    
    // 🔥 ΠΡΟΣΘΗΚΗ: Event listeners για group chat buttons
    attachGroupChatListeners();
}

// 🔥 ΝΕΑ ΣΥΝΑΡΤΗΣΗ: Προσθήκη listeners για group chat buttons
function attachGroupChatListeners() {
    const groupChatButtons = document.querySelectorAll('.btn-event.group-chat');
    
    groupChatButtons.forEach(button => {
        button.addEventListener('click', async function(e) {
            e.stopPropagation();
            const eventId = this.dataset.eventId;
            const isParticipant = this.dataset.isParticipant === 'true';
            
            if (!isParticipant) {
                showNotification("You must join the event first to access the group chat", "info", "Join Required");
                return;
            }
            
            try {
                // Έλεγχος αν υπάρχει room για το event
                const response = await fetch(`/events/${eventId}/room-info?username=${currentUser.username}`, {
                    headers: {
                        "X-Session-ID": currentUser.sessionId,
                    },
                });
                
                if (response.ok) {
                    const data = await response.json();
                    
                    if (data.success && data.hasRoom) {
                        if (data.room.isMember) {
                            // Είναι ήδη μέλος - μπες στο room
                            enterRoom(data.room.id, data.room.name, data.room.invite_code);
                        } else {
                            // Κάνε join στο room
                            await joinEventRoom(eventId);
                        }
                    } else {
                        showNotification("No group chat available for this event yet", "info", "No Chat");
                    }
                }
            } catch (error) {
                console.error("Error accessing event room:", error);
                showNotification("Could not access group chat", "error", "Error");
            }
        });
    });
}

// 🔥 ΕΝΗΜΕΡΩΜΕΝΗ ΣΥΝΑΡΤΗΣΗ: createEvent για αποστολή welcome message
async function createEvent(eventData) {
    try {
        // First create the event
        const response = await fetch("/create-event", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                ...eventData,
                username: currentUser.username
            }),
        });
        
        if (!response.ok) {
            throw new Error("Failed to create event");
        }
        
        const data = await response.json();
        
        if (data.success) {
            // If there's a photo, upload it separately
            if (eventPhotoBase64) {
                try {
                    const photoUrl = await uploadEventPhoto(data.event.id, currentUser.username);
                    if (photoUrl) {
                        data.event.photo = photoUrl;
                    }
                } catch (photoError) {
                    console.error("Error uploading event photo:", photoError);
                    // Continue even if photo upload fails
                }
            }
            
            showNotification("Event created successfully! Group chat is ready.", "success", "Event Created");
            hideAllModals();
            
            // Reset photo
            removeEventPhoto();
            
            // 🔥 ΚΡΙΤΙΚΟ: Αυτόματη είσοδος στο event room
            setTimeout(async () => {
                try {
                    await joinEventRoom(data.event.id);
                } catch (roomError) {
                    console.log("ℹ️ Could not join event room immediately, try later from event card");
                }
            }, 2000);
            
            // 🔥 ΕΠΑΝΑΦΟΡΤΩΣΗ ΚΑΙ ΕΠΑΝΑΟΡΙΣΜΟΣ LISTENERS
            loadEvents();
            loadHomeEvents();
            return data.event;
        } else {
            showNotification(data.error || "Failed to create event", "error", "Event Error");
        }
    } catch (error) {
        console.error("Error creating event:", error);
        showNotification("Failed to create event", "error", "Error");
    }
}

// ===== SOCKET EVENT HANDLERS =====

// ΛΥΣΗ 2: Καλύτερη διαχείριση WebSocket επανασύνδεσης
socket.on("connect", async () => {
    console.log("🔗 Connected to server");
    
    // 🔥 ΚΡΙΤΙΚΗ ΠΡΟΣΘΗΚΗ: ΜΟΝΟ ΕΝΑ event listener
    if (currentUser.authenticated && currentUser.sessionId) {
        console.log("🔄 Re-authenticating WebSocket...");
        
        // Προσθήκη timeout για να αποφύγουμε race conditions
        setTimeout(() => {
            socket.emit("authenticate", {
                username: currentUser.username,
                sessionId: currentUser.sessionId,
            });
        }, 1000);
    }
});

// Χειρισμός session expiry - Βελτιωμένη έκδοση
socket.on("session_expired", () => {
    console.log("⚠️ WebSocket session expired");
    
    // Προσπάθεια ανανέωσης session
    setTimeout(async () => {
        const refreshed = await refreshUserSession();
        if (refreshed) {
            socket.emit("authenticate", {
                username: currentUser.username,
                sessionId: currentUser.sessionId,
            });
        } else {
            handleSessionExpired();
        }
    }, 500);
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

// 🔥 FIX: WebSocket event - ΔΕΝ ΠΡΟΣΘΕΤΟΥΜΕ ΤΟ ΜΗΝΥΜΑ 2 ΦΟΡΕΣ
socket.on("file_upload", (data) => {
    console.log("📁 File upload received:", data);
    
    // 🔥 ΕΛΕΓΧΟΣ: Προσθέτουμε το μήνυμα ΜΟΝΟ αν είμαστε στο σωστό room/chat
    const shouldDisplay = (
        (currentRoom.isPrivate && (data.sender === currentRoom.name || data.receiver === currentRoom.name)) ||
        (!currentRoom.isPrivate && data.room_id === currentRoom.id)
    );
    
    if (shouldDisplay) {
        // 🔥 ΕΛΕΓΧΟΣ: ΔΕΝ προσθέτουμε το μήνυμα αν ΗΔΗ υπάρχει με το ίδιο fileId
        const existingMessage = Array.from(document.querySelectorAll('.message')).find(msg => {
            return msg.textContent.includes(data.fileName);
        });
        
        if (!existingMessage) {
            addMessageToChat({
                text: `📁 ${data.fileName}`,
                sender: data.sender,
                time: data.time || getCurrentTime(),
                isFile: true,
                file_data: {
                    fileId: data.fileId,
                    fileName: data.fileName,
                    fileType: data.fileType,
                    fileSize: data.fileSize,
                    fileUrl: data.fileUrl
                }
            });
        } else {
            console.log('⚠️ Message already exists, skipping duplicate');
        }
        
        // Εμφάνιση notification ΜΟΝΟ αν δεν είμαστε ο αποστολέας
        if (data.sender !== currentUser.username) {
            showNotification(`${data.sender} sent a file: ${data.fileName}`, "info", "New File");
        }
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
        case 'avatar_upload_success':
            notificationType = "success";
            title = "Profile Picture Updated";
            break;
        case 'file_upload':
            notificationType = "info";
            title = "New File";
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
        
        // Ενημέρωση κατάστασης για κάθε μέλος
        members.forEach(member => {
            // Υποθέτουμε ότι είναι online όταν εμφανίζεται στη λίστα
            // Μπορείς να βελτιώσεις αυτό με WebSocket status updates
            updateUserStatusInUI(member.username, true);
        });
        
        // Make member items clickable για το user info modal
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

// 🔥 ΕΝΗΜΕΡΩΣΗ: WebSocket event όταν ένας χρήστης φεύγει από το room ΜΑΝΟΥΑΛΙΑ
socket.on("user_left", (data) => {
    console.log(`👋 User ${data.username} left room ${data.roomId}`);
    
    // Αν είμαστε στο ίδιο room, ανανέωσε τη λίστα μελών
    if (currentRoom.id === data.roomId) {
        // Επαναφόρτωση της λίστας μελών
        socket.emit("get room members", { roomId: currentRoom.id });
    }
    
    // Εμφάνιση notification μόνο αν δεν είμαστε εμείς που φύγαμε
    if (data.username !== currentUser.username) {
        showNotification(`${data.username} left the room`, "info", "User Left");
    }
});

// 🔥 ΠΡΟΣΘΗΚΗ: WebSocket event όταν ένας χρήστης αποσυνδέεται (αλλά παραμένει στο room)
socket.on("user_disconnected", (data) => {
    console.log(`📡 User ${data.username} disconnected from room ${data.roomId} (still a member)`);
    
    // Αν είμαστε στο ίδιο room, ενημέρωσε ότι ο χρήστης είναι offline
    if (currentRoom.id === data.roomId) {
        // Μπορούμε να ενημερώσουμε το UI ότι ο χρήστης είναι offline
        // αλλά ΔΕΝ τον αφαιρούμε από τη λίστα
        const memberItem = document.querySelector(`.member-item[data-username="${data.username}"]`);
        if (memberItem) {
            const statusDot = memberItem.querySelector('.status-dot');
            if (statusDot) {
                statusDot.style.background = 'var(--warning)';
                statusDot.title = 'Offline';
            }
        }
    }
});

// 🔥 ΠΡΟΣΘΗΚΗ: Εντολή για leave room στο WebSocket
socket.on("leave_room_success", (data) => {
    console.log("✅ Successfully left room:", data.roomId);
    showNotification("Left room successfully", "info", "Room Left");
});

// ===== EVENT EDIT FUNCTIONS =====

// 🔥 ΝΕΟ: Show edit event modal
function showEditEventModal(event) {
    // Populate form with event data
    document.getElementById("edit-event-title-input").value = event.title;
    document.getElementById("edit-event-description-input").value = event.description;
    
    // Format date for datetime-local input
    const eventDate = new Date(event.date);
    const localDateTime = new Date(eventDate.getTime() - eventDate.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    document.getElementById("edit-event-date-input").value = localDateTime;
    document.getElementById("edit-event-date-input").min = new Date().toISOString().slice(0, 16);
    
    document.getElementById("edit-event-location-input").value = event.location;
    document.getElementById("edit-event-max-participants-input").value = event.max_participants || 0;
    document.getElementById("edit-event-is-public-input").checked = event.is_public !== false;
    
    // Store event ID for the save function
    document.getElementById("edit-event-modal").dataset.eventId = event.id;
    
    showModal("edit-event-modal");
}

// 🔥 ΝΕΟ: Save edited event
async function saveEditedEvent() {
    const eventId = document.getElementById("edit-event-modal").dataset.eventId;
    const title = document.getElementById("edit-event-title-input").value.trim();
    const description = document.getElementById("edit-event-description-input").value.trim();
    const date = document.getElementById("edit-event-date-input").value;
    const location = document.getElementById("edit-event-location-input").value.trim();
    const maxParticipants = parseInt(document.getElementById("edit-event-max-participants-input").value) || 0;
    const isPublic = document.getElementById("edit-event-is-public-input").checked;
    
    if (!title || !description || !date || !location) {
        showNotification("Please fill in all required fields", "error", "Missing Information");
        return;
    }
    
    try {
        const response = await fetch(`/events/${eventId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-Session-ID": currentUser.sessionId,
            },
            body: JSON.stringify({
                username: currentUser.username,
                updates: {
                    title,
                    description,
                    date: new Date(date),
                    location,
                    max_participants: maxParticipants,
                    is_public: isPublic
                }
            }),
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to update event");
        }
        
        const data = await response.json();
        
        if (data.success) {
            showNotification("Event updated successfully!", "success", "Event Updated");
            hideAllModals();
            
            // 🔥 ΕΠΑΝΑΦΟΡΤΩΣΗ ΚΑΙ ΕΠΑΝΑΟΡΙΣΜΟΣ LISTENERS
            loadEvents();
            loadHomeEvents(); // 🔥 ΠΡΟΣΘΗΚΗ: Επαναφόρτωση και home events
        }
    } catch (error) {
        console.error("Error updating event:", error);
        showNotification(error.message || "Failed to update event", "error", "Error");
    }
}

// ===== EVENT LISTENERS =====

function initializeEventListeners() {
    console.log("🎯 Initializing event listeners");
    
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

    // Events listeners
    document.getElementById("create-event-btn").addEventListener("click", () => {
        showModal("create-event-modal");
        // Set minimum date to today
        const now = new Date();
        const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        document.getElementById("event-date-input").min = localDateTime;
        document.getElementById("event-date-input").value = localDateTime;
    });
    
    document.getElementById("create-event-submit").addEventListener("click", () => {
        const title = document.getElementById("event-title-input").value.trim();
        const description = document.getElementById("event-description-input").value.trim();
        const date = document.getElementById("event-date-input").value;
        const location = document.getElementById("event-location-input").value.trim();
        const maxParticipants = parseInt(document.getElementById("event-max-participants-input").value) || 0;
        const isPublic = document.getElementById("event-is-public-input").checked;
        
        if (!title || !description || !date || !location) {
            showNotification("Please fill in all required fields", "error", "Missing Information");
            return;
        }
        
        createEvent({
            title,
            description,
            date,
            location,
            max_participants: maxParticipants,
            is_public: isPublic
        });
    });
    
    document.getElementById("create-event-cancel").addEventListener("click", hideAllModals);
    document.getElementById("close-create-event-modal").addEventListener("click", hideAllModals);
    document.getElementById("close-event-details-modal").addEventListener("click", hideAllModals);
    
    // Edit event listeners
    document.getElementById("close-edit-event-modal").addEventListener("click", hideAllModals);
    document.getElementById("cancel-edit-event-btn").addEventListener("click", hideAllModals);
    document.getElementById("save-edit-event-btn").addEventListener("click", saveEditedEvent);

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

    // ΑΝΤΙΚΑΤΑΣΤΑΣΗ ΤΟΥ copy-invite-btn EVENT LISTENER
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

    // 🔥 FIXED: Leave room button
    document.getElementById("leave-room-btn").addEventListener("click", handleLeaveRoom);

    // 🔥 ΑΛΛΑΓΗ: Ενημέρωση του event listener για το clear button
    document.getElementById("clear-messages-btn").addEventListener("click", handleClearMessages);

    // Initialize file upload system
    initializeUploadAndEmojiListeners();

    // ΠΡΟΣΘΗΚΗ: Initialize profile event listeners
    initializeProfileEventListeners();
    
    // 🔥 ΠΡΟΣΘΗΚΗ: Home events listeners
    document.getElementById("view-all-events-btn")?.addEventListener("click", () => {
        if (currentUser.authenticated) {
            loadUserRooms();
            showPage("rooms-page");
        } else {
            showNotification("Please login to view all events", "info", "Login Required");
            showModal("login-modal");
        }
    });
    
    document.getElementById("create-event-from-home-btn")?.addEventListener("click", () => {
        if (currentUser.authenticated) {
            showModal("create-event-modal");
            const now = new Date();
            const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 16);
            document.getElementById("event-date-input").min = localDateTime;
            document.getElementById("event-date-input").value = localDateTime;
        } else {
            showNotification("Please login to create events", "info", "Login Required");
            showModal("login-modal");
        }
    });
    
    // 🔥 ΠΡΟΣΘΗΚΗ: Initialize event photo system
    initEventPhotoSystem();
    
    // 🔥 ΠΡΟΣΘΗΚΗ: Event delegation για group chat buttons
    document.addEventListener('click', function(e) {
        const groupChatBtn = e.target.closest('.btn-event.group-chat');
        if (groupChatBtn) {
            e.preventDefault();
            e.stopPropagation();
            
            const eventCard = groupChatBtn.closest('.event-card, .home-event-card');
            const eventId = groupChatBtn.dataset.eventId;
            const isParticipant = groupChatBtn.dataset.isParticipant === 'true';
            
            if (!isParticipant) {
                showNotification("You must join the event first to access the group chat", "info", "Join Required");
                return;
            }
            
            // Χρήση της υπάρχουσας joinEventRoom συνάρτησης
            joinEventRoom(eventId);
        }
    });
    
    // 🔥 ΚΑΙΝΟΥΡΓΙΟ: Event delegation για group chat buttons με διαφορετικές κλάσεις
    document.addEventListener('click', function(e) {
        const groupChatBtn = e.target.closest('.group-chat-btn');
        if (groupChatBtn) {
            e.preventDefault();
            e.stopPropagation();
            
            if (groupChatBtn.classList.contains('enter-room')) {
                // Είσοδος στο room
                const roomId = groupChatBtn.dataset.roomId;
                const roomName = groupChatBtn.dataset.roomName;
                const inviteCode = groupChatBtn.dataset.inviteCode;
                
                if (roomId && roomName && inviteCode) {
                    enterRoom(roomId, roomName, inviteCode);
                }
            } else if (groupChatBtn.classList.contains('join-room')) {
                // Join στο event room
                const eventId = groupChatBtn.dataset.eventId;
                if (eventId) {
                    joinEventRoom(eventId);
                }
            } else if (groupChatBtn.classList.contains('join-event-first')) {
                // Join στο event πρώτα
                const eventId = groupChatBtn.dataset.eventId;
                if (eventId) {
                    showNotification("Join the event first to access the group chat", "info", "Join Event Required");
                    joinEvent(eventId);
                }
            }
        }
    });
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

// ===== ΒΟΗΘΗΤΙΚΗ ΣΥΝΑΡΤΗΣΗ ΓΙΑ ΕΝΗΜΕΡΩΣΗ ΚΑΤΑΣΤΑΣΗΣ ΧΡΗΣΤΗ =====

function updateUserStatusInUI(username, isOnline) {
    const memberItem = document.querySelector(`.member-item[data-username="${username}"]`);
    if (memberItem) {
        // Προσθήκη status dot αν δεν υπάρχει
        let statusDot = memberItem.querySelector('.status-dot');
        if (!statusDot) {
            const avatarContainer = memberItem.querySelector('.member-avatar');
            if (avatarContainer) {
                statusDot = document.createElement('div');
                statusDot.className = 'status-dot';
                statusDot.style.cssText = `
                    position: absolute;
                    bottom: 0;
                    right: 0;
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    border: 2px solid var(--background);
                `;
                avatarContainer.style.position = 'relative';
                avatarContainer.appendChild(statusDot);
            }
        }
        
        if (statusDot) {
            statusDot.style.background = isOnline ? 'var(--success)' : 'var(--warning)';
            statusDot.title = isOnline ? 'Online' : 'Offline';
        }
    }
}

// ===== WEBSOCKET EVENTS ΓΙΑ REAL-TIME UPDATES =====

// 🔥 Βελτιωμένο socket.on("event_update") με debounce
let eventUpdateTimeout = null;

socket.on("event_update", (data) => {
  console.log("📅 Event update received:", data);
  
  // 🔥 Debounce: Μια φορά κάθε 1 δευτερόλεπτο
  if (eventUpdateTimeout) {
    clearTimeout(eventUpdateTimeout);
  }
  
  eventUpdateTimeout = setTimeout(() => {
    switch (data.type) {
      case "participant_joined":
      case "participant_left":
        console.log(`👤 ${data.username} ${data.type === "participant_joined" ? "joined" : "left"} event ${data.eventId}`);
        // 🔥 Μόνο αν είμαστε στη σελίδα events
        if (document.getElementById("rooms-page").classList.contains("active")) {
          loadEvents();
        }
        // 🔥 Επαναφόρτωση home events αν είμαστε στην αρχική
        if (document.getElementById("home-page").classList.contains("active")) {
          loadHomeEvents();
        }
        break;
        
      case "event_updated":
        console.log(`✏️ Event ${data.eventId} was updated`);
        if (document.getElementById("rooms-page").classList.contains("active")) {
          loadEvents();
        }
        // 🔥 Επαναφόρτωση home events αν είμαστε στην αρχική
        if (document.getElementById("home-page").classList.contains("active")) {
          loadHomeEvents();
        }
        break;
        
      case "event_deleted":
        console.log(`🗑️ Event ${data.eventId} was deleted`);
        
        // 🔥 ΑΜΕΣΗ αφαίρεση από το UI
        const eventCard = document.querySelector(`.event-card[data-event-id="${data.eventId}"]`);
        if (eventCard) {
          eventCard.style.animation = 'fadeOut 0.3s ease';
          setTimeout(() => {
            eventCard.remove();
          }, 300);
        }
        
        // 🔥 Αφαίρεση από home events αν υπάρχει
        const homeEventCard = document.querySelector(`.home-event-card[data-event-id="${data.eventId}"]`);
        if (homeEventCard) {
          homeEventCard.style.animation = 'fadeOut 0.3s ease';
          setTimeout(() => {
            homeEventCard.remove();
          }, 300);
        }
        
        // Κλείσιμο modal αν είναι ανοιχτό για αυτό το event
        const modal = document.getElementById("event-details-modal");
        if (modal && modal.classList.contains("active")) {
          hideAllModals();
        }
        
        showNotification("An event has been deleted", "info", "Event Deleted");
        
        // 🔥 No reload - just remove the specific card
        break;
    }
  }, 1000); // 1 δευτερόλεπτο debounce
});

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

// 🔥 ΚΡΙΤΙΚΗ ΑΛΛΑΓΗ: Προσθήκη event listener για φόρτωση events όταν γίνεται refresh
function initEventAutoRefresh() {
    // Φόρτωση events όταν ο χρήστης επιστρέφει στην καρτέλα
    document.addEventListener("visibilitychange", function() {
        if (!document.hidden) {
            // Ο χρήστης επέστρεψε στην καρτέλα
            if (document.getElementById("rooms-page").classList.contains("active")) {
                console.log("🔄 User returned to rooms page, refreshing events");
                setTimeout(() => {
                    loadEvents();
                }, 500);
            }
            if (document.getElementById("home-page").classList.contains("active")) {
                console.log("🔄 User returned to home page, refreshing home events");
                setTimeout(() => {
                    loadHomeEvents();
                }, 500);
            }
        }
    });
    
    // Επαναφόρτωση όταν γίνεται focus στο παράθυρο
    window.addEventListener("focus", function() {
        console.log("🔄 Window focused, refreshing events");
        if (document.getElementById("rooms-page").classList.contains("active")) {
            setTimeout(() => {
                loadEvents();
            }, 300);
        }
        if (document.getElementById("home-page").classList.contains("active")) {
            setTimeout(() => {
                loadHomeEvents();
            }, 300);
        }
    });
}

// ===== INITIALIZATION =====

document.addEventListener("DOMContentLoaded", async () => {
  console.log("🐀 RatScape client initialized");

  // ΛΥΣΗ 1: Αυτόματη επαναφορά session
  const sessionRestored = await restoreSessionOnRefresh();
  if (sessionRestored) {
    console.log("✅ Session restored successfully");
    // Φόρτωση δεδομένων μετά την επαναφορά
    setTimeout(() => {
      loadUserRooms();
      loadUserFriends();
    }, 500);
  }

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

  // 🔥 ΚΑΙΝΟΥΡΓΙΟ: Μια φορά φόρτωση home events με καθυστέρηση
  // Αφαιρέστε όλα τα άλλα setTimeout που καλούν loadHomeEvents()
  setTimeout(() => {
    if (document.getElementById("home-page").classList.contains("active")) {
      console.log("🏠 Loading home events on page load");
      loadHomeEvents();
    }
  }, 3000); // Μόνο 3 δευτερόλεπτα μετά το load

  console.log("✅ Ready to chat!");
});

// ΛΥΣΗ 3: Αποθήκευση κατάστασης πριν το refresh
window.addEventListener('beforeunload', async function() {
    if (currentUser.authenticated && currentUser.sessionId) {
        // Αποστολή keep-alive πριν το refresh
        try {
            await fetch('/keep-alive', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-ID': currentUser.sessionId
                },
                body: JSON.stringify({
                    username: currentUser.username
                })
            });
        } catch (error) {
            console.log("Keep-alive failed (normal during page refresh)");
        }
    }
    
    // Αποθήκευση κατάστασης chat
    if (currentRoom.id) {
        saveChatState();
    }
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

// 🔥 ΤΕΛΙΚΟ ΒΗΜΑ: Προσθήκη αυτής της γραμμής στο τέλος του client.js για να ενεργοποιήσετε τους listeners κατά την αρχικοποίηση:
document.addEventListener("DOMContentLoaded", async () => {
  // ... υπάρχων κώδικας ...
  
  // 🔥 ΠΡΟΣΘΗΚΗ: Αμέσως αρχικοποίηση των home event listeners
  setTimeout(() => {
    attachHomeEventListeners();
  }, 2000);
});
