// client.js - RatScape Car Meet Platform with Enhanced Features
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

// ===== EVENT DASHBOARD SYSTEM =====
let currentEvent = null;
let roomEvents = {};

// ===== FILE UPLOAD SYSTEM =====
let fileUploadInProgress = false;
let selectedFile = null;
let fileUploadListenersInitialized = false;
let isUploading = false;

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
let userAvatars = {};

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
            const oneHour = 60 * 60 * 1000;
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

// ===== EVENT DASHBOARD SYSTEM FUNCTIONS =====

function initEventDashboard() {
    console.log('🎪 Initializing event dashboard system');
    
    // Create event modal button
    const createEventBtn = document.getElementById('create-event-btn');
    if (createEventBtn) {
        createEventBtn.addEventListener('click', showCreateEventModal);
    }
    
    // Create events section in sidebar if it doesn't exist
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !document.getElementById('events-section')) {
        const eventsSection = document.createElement('div');
        eventsSection.className = 'room-events-section';
        eventsSection.id = 'events-section';
        eventsSection.innerHTML = `
            <h3><i class="fas fa-calendar-alt"></i> MEET EVENTS</h3>
            <div class="events-list" id="room-events-list">
                <div class="no-events">
                    <p>No events yet</p>
                    <p>Create the first one!</p>
                </div>
            </div>
            <button class="btn btn-primary btn-sm btn-block" id="create-event-btn">
                <i class="fas fa-plus"></i> Create Event
            </button>
        `;
        
        const roomDetails = document.querySelector('.room-details');
        if (roomDetails) {
            roomDetails.after(eventsSection);
        }
        
        document.getElementById('create-event-btn').addEventListener('click', showCreateEventModal);
    }
    
    if (currentRoom.id && !currentRoom.isPrivate) {
        loadRoomEvents(currentRoom.id);
    }
}

function showCreateEventModal() {
    if (!currentRoom.id) {
        showNotification('You must be in a meet to create events', 'warning', 'No Meet');
        return;
    }
    
    if (currentRoom.isPrivate) {
        showNotification('Events are not available for private chats', 'warning', 'Private Chat');
        return;
    }
    
    let modal = document.getElementById('create-event-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'create-event-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Create New Event</h3>
                    <button class="close-modal-btn" id="close-create-event-modal">×</button>
                </div>
                <div class="form-container active">
                    <div class="form-group">
                        <label for="event-title">Event Title</label>
                        <input type="text" id="event-title" placeholder="e.g., Friday Night Meet">
                    </div>
                    <div class="form-group">
                        <label for="event-date">Date & Time</label>
                        <input type="datetime-local" id="event-date">
                    </div>
                    <div class="form-group">
                        <label for="event-location">Location</label>
                        <input type="text" id="event-location" placeholder="e.g., Syntagma Square, Athens">
                    </div>
                    <div class="form-group">
                        <label for="event-description">Description</label>
                        <textarea id="event-description" placeholder="Describe your event..." rows="4"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="event-image">Event Image (Optional)</label>
                        <input type="file" id="event-image" accept="image/*">
                        <div class="image-preview" id="event-image-preview"></div>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="event-private"> Private Event (Meet Members Only)
                        </label>
                    </div>
                    <div class="modal-buttons">
                        <button class="btn btn-primary" id="create-event-submit">
                            <i class="fas fa-calendar-plus"></i> Create Event
                        </button>
                        <button class="btn btn-secondary" id="cancel-create-event">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('close-create-event-modal').addEventListener('click', hideAllModals);
        document.getElementById('cancel-create-event').addEventListener('click', hideAllModals);
        document.getElementById('create-event-submit').addEventListener('click', handleCreateEvent);
        
        document.getElementById('event-image').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    const preview = document.getElementById('event-image-preview');
                    preview.innerHTML = `
                        <img src="${event.target.result}" alt="Preview" style="max-width: 200px; border-radius: 10px;">
                    `;
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const formattedDate = tomorrow.toISOString().slice(0, 16);
    document.getElementById('event-date').value = formattedDate;
    
    document.getElementById('event-title').value = '';
    document.getElementById('event-location').value = '';
    document.getElementById('event-description').value = '';
    document.getElementById('event-image').value = '';
    document.getElementById('event-private').checked = false;
    document.getElementById('event-image-preview').innerHTML = '';
    
    modal.classList.add('active');
}

async function handleCreateEvent() {
    const title = document.getElementById('event-title').value.trim();
    const date = document.getElementById('event-date').value;
    const location = document.getElementById('event-location').value.trim();
    const description = document.getElementById('event-description').value.trim();
    const isPrivate = document.getElementById('event-private').checked;
    
    if (!title || !date || !location) {
        showNotification('Please fill in all required fields', 'warning', 'Missing Info');
        return;
    }
    
    try {
        const formData = new FormData();
        formData.append('title', title);
        formData.append('date', date);
        formData.append('location', location);
        formData.append('description', description);
        formData.append('isPrivate', isPrivate);
        formData.append('roomId', currentRoom.id);
        formData.append('creator', currentUser.username);
        
        const imageFile = document.getElementById('event-image').files[0];
        if (imageFile) {
            formData.append('image', imageFile);
        }
        
        const response = await fetch('/create-event', {
            method: 'POST',
            headers: {
                'X-Session-ID': currentUser.sessionId,
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Event created successfully!', 'success', 'Event Created');
            hideAllModals();
            
            socket.emit('new_event', {
                roomId: currentRoom.id,
                event: data.event
            });
            
            if (!roomEvents[currentRoom.id]) {
                roomEvents[currentRoom.id] = [];
            }
            roomEvents[currentRoom.id].push(data.event);
            
            updateEventsList(currentRoom.id);
        } else {
            showNotification(data.error || 'Failed to create event', 'error', 'Creation Failed');
        }
    } catch (error) {
        console.error('Error creating event:', error);
        showNotification('Failed to create event: ' + error.message, 'error', 'Error');
    }
}

async function loadRoomEvents(roomId) {
    try {
        const response = await fetch(`/room-events/${roomId}`, {
            headers: {
                'X-Session-ID': currentUser.sessionId,
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                roomEvents[roomId] = data.events;
                updateEventsList(roomId);
            }
        }
    } catch (error) {
        console.error('Error loading room events:', error);
    }
}

function updateEventsList(roomId) {
    const eventsList = document.getElementById('room-events-list');
    if (!eventsList) return;
    
    const events = roomEvents[roomId] || [];
    
    if (events.length === 0) {
        eventsList.innerHTML = `
            <div class="no-events">
                <p>No events yet</p>
                <p>Create the first one!</p>
            </div>
        `;
        return;
    }
    
    events.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    eventsList.innerHTML = events.map(event => `
        <div class="event-item" data-event-id="${event.id}">
            <div class="event-date">
                <span class="event-day">${new Date(event.date).getDate()}</span>
                <span class="event-month">${new Date(event.date).toLocaleString('en-US', { month: 'short' })}</span>
            </div>
            <div class="event-info">
                <h4 class="event-title">${event.title}</h4>
                <p class="event-location"><i class="fas fa-map-marker-alt"></i> ${event.location}</p>
                <div class="event-stats">
                    <span><i class="fas fa-users"></i> ${event.attendees || 0} attending</span>
                </div>
            </div>
            <button class="btn-icon view-event-btn" data-event-id="${event.id}">
                <i class="fas fa-arrow-right"></i>
            </button>
        </div>
    `).join('');
    
    document.querySelectorAll('.view-event-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const eventId = this.dataset.eventId;
            showEventDetails(eventId);
        });
    });
}

function showEventDetails(eventId) {
    const event = findEventById(eventId);
    if (!event) {
        showNotification('Event not found', 'error', 'Error');
        return;
    }
    
    currentEvent = event;
    
    let eventPage = document.getElementById('event-page');
    if (!eventPage) {
        eventPage = document.createElement('div');
        eventPage.id = 'event-page';
        eventPage.className = 'page';
        document.querySelector('.page-container').appendChild(eventPage);
    }
    
    const eventDate = new Date(event.date);
    const formattedDate = eventDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    eventPage.innerHTML = `
        <div class="rooms-container">
            <div class="rooms-header">
                <button class="btn btn-secondary" id="back-from-event-btn">
                    <i class="fas fa-arrow-left"></i> Back to Meet
                </button>
                <h2>Event Details</h2>
                <div class="event-actions">
                    <button class="btn btn-primary" id="join-event-btn">
                        <i class="fas fa-check-circle"></i> I'm Attending
                    </button>
                    <button class="btn btn-secondary" id="share-event-btn">
                        <i class="fas fa-share-alt"></i> Share
                    </button>
                </div>
            </div>
            
            <div class="event-details-container">
                <div class="event-header">
                    <div class="event-image" id="event-detail-image" 
                         style="background-image: url('${event.image || '/images/default-event.jpg'}')">
                        <div class="event-header-overlay">
                            <h1 class="event-title-large">${event.title}</h1>
                            <div class="event-basic-info">
                                <span class="event-date-large">
                                    <i class="fas fa-calendar"></i> ${formattedDate}
                                </span>
                                <span class="event-location-large">
                                    <i class="fas fa-map-marker-alt"></i> ${event.location}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="event-content">
                    <div class="event-main">
                        <div class="event-section">
                            <h3><i class="fas fa-info-circle"></i> About this Event</h3>
                            <div class="event-description">${event.description || 'No description provided.'}</div>
                        </div>
                        
                        <div class="event-section">
                            <h3><i class="fas fa-users"></i> Who's Attending (${event.attendees || 0})</h3>
                            <div class="attendees-list" id="event-attendees-list">
                            </div>
                        </div>
                        
                        <div class="event-section">
                            <h3><i class="fas fa-comments"></i> Event Chat</h3>
                            <div class="event-chat-container">
                                <div class="event-messages" id="event-messages-container">
                                </div>
                                <div class="event-chat-input">
                                    <input type="text" id="event-message-input" placeholder="Chat about this event...">
                                    <button class="btn btn-primary" id="send-event-message-btn">
                                        <i class="fas fa-paper-plane"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="event-sidebar">
                        <div class="event-card">
                            <h4><i class="fas fa-chart-bar"></i> Event Stats</h4>
                            <div class="event-stats-grid">
                                <div class="event-stat">
                                    <div class="stat-number">${event.attendees || 0}</div>
                                    <div class="stat-label">Attending</div>
                                </div>
                                <div class="event-stat">
                                    <div class="stat-number">${event.maybe || 0}</div>
                                    <div class="stat-label">Maybe</div>
                                </div>
                                <div class="event-stat">
                                    <div class="stat-number">${event.interested || 0}</div>
                                    <div class="stat-label">Interested</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="event-card">
                            <h4><i class="fas fa-user-tie"></i> Organized by</h4>
                            <div class="organizer-info">
                                <div class="organizer-avatar">
                                    ${event.creator.charAt(0).toUpperCase()}
                                </div>
                                <div class="organizer-details">
                                    <div class="organizer-name">${event.creator}</div>
                                    <div class="organizer-role">Event Host</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="event-card">
                            <h4><i class="fas fa-bolt"></i> Quick Actions</h4>
                            <div class="quick-actions">
                                <button class="btn btn-primary btn-block" id="add-to-calendar-btn">
                                    <i class="fas fa-calendar-plus"></i> Add to Calendar
                                </button>
                                <button class="btn btn-secondary btn-block" id="get-directions-btn">
                                    <i class="fas fa-directions"></i> Get Directions
                                </button>
                                <button class="btn btn-secondary btn-block" id="invite-friends-btn">
                                    <i class="fas fa-user-plus"></i> Invite Friends
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('back-from-event-btn').addEventListener('click', () => {
        showPage('chat-page');
        currentEvent = null;
    });
    
    document.getElementById('join-event-btn').addEventListener('click', joinEvent);
    document.getElementById('share-event-btn').addEventListener('click', shareEvent);
    document.getElementById('send-event-message-btn').addEventListener('click', sendEventMessage);
    document.getElementById('add-to-calendar-btn').addEventListener('click', addToCalendar);
    document.getElementById('get-directions-btn').addEventListener('click', getDirections);
    document.getElementById('invite-friends-btn').addEventListener('click', inviteFriendsToEvent);
    
    loadEventAttendees(eventId);
    
    showPage('event-page');
}

function findEventById(eventId) {
    if (!currentRoom.id) return null;
    const events = roomEvents[currentRoom.id] || [];
    return events.find(e => e.id === eventId);
}

async function joinEvent() {
    if (!currentEvent) return;
    
    try {
        const response = await fetch('/join-event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-ID': currentUser.sessionId,
            },
            body: JSON.stringify({
                eventId: currentEvent.id,
                userId: currentUser.username,
                roomId: currentRoom.id
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('You are now attending this event!', 'success', 'Joined Event');
            currentEvent.attendees = (currentEvent.attendees || 0) + 1;
            showEventDetails(currentEvent.id);
        }
    } catch (error) {
        console.error('Error joining event:', error);
        showNotification('Failed to join event', 'error', 'Error');
    }
}

function shareEvent() {
    if (!currentEvent) return;
    
    const eventUrl = `${window.location.origin}/event/${currentEvent.id}`;
    const shareText = `Check out this event: ${currentEvent.title} on RatScape!`;
    
    if (navigator.share) {
        navigator.share({
            title: currentEvent.title,
            text: shareText,
            url: eventUrl
        });
    } else {
        navigator.clipboard.writeText(eventUrl).then(() => {
            showNotification('Event link copied to clipboard!', 'success', 'Link Copied');
        });
    }
}

function sendEventMessage() {
    const input = document.getElementById('event-message-input');
    const text = input.value.trim();
    
    if (!text || !currentEvent) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'event-message';
    messageDiv.innerHTML = `
        <div class="event-message-sender">${currentUser.username}</div>
        <div class="event-message-text">${text}</div>
        <div class="event-message-time">${new Date().toLocaleTimeString()}</div>
    `;
    
    document.getElementById('event-messages-container').appendChild(messageDiv);
    input.value = '';
    
    const container = document.getElementById('event-messages-container');
    container.scrollTop = container.scrollHeight;
}

function addToCalendar() {
    if (!currentEvent) return;
    
    const eventDate = new Date(currentEvent.date);
    const endDate = new Date(eventDate.getTime() + 2 * 60 * 60 * 1000);
    
    const icsContent = `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//RatScape//Car Meet Platform//EN
BEGIN:VEVENT
UID:${currentEvent.id}@ratscape.com
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTSTART:${eventDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTEND:${endDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z
SUMMARY:${currentEvent.title}
DESCRIPTION:${currentEvent.description}\\n\\nLocation: ${currentEvent.location}
LOCATION:${currentEvent.location}
END:VEVENT
END:VCALENDAR
    `.trim();
    
    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentEvent.title.replace(/\s+/g, '_')}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Calendar event downloaded', 'success', 'Added to Calendar');
}

function getDirections() {
    if (!currentEvent) return;
    
    const location = encodeURIComponent(currentEvent.location);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${location}`;
    window.open(mapsUrl, '_blank');
}

function inviteFriendsToEvent() {
    if (!currentEvent) return;
    
    showNotification('Invite friends feature coming soon!', 'info', 'Coming Soon');
}

async function loadEventAttendees(eventId) {
    try {
        const response = await fetch(`/event-attendees/${eventId}`, {
            headers: {
                'X-Session-ID': currentUser.sessionId,
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                const attendeesList = document.getElementById('event-attendees-list');
                if (attendeesList) {
                    attendeesList.innerHTML = data.attendees.map(user => `
                        <div class="attendee-item" data-username="${user.username}">
                            <div class="attendee-avatar">
                                ${user.username.charAt(0).toUpperCase()}
                            </div>
                            <div class="attendee-name">${user.username}</div>
                            <div class="attendee-status">${user.status || 'Member'}</div>
                        </div>
                    `).join('');
                }
            }
        }
    } catch (error) {
        console.error('Error loading attendees:', error);
        const attendeesList = document.getElementById('event-attendees-list');
        if (attendeesList) {
            attendeesList.innerHTML = '<p class="no-attendees">Unable to load attendees</p>';
        }
    }
}

function initEventsForRoom(roomId) {
    console.log(`🎪 Initializing events for room ${roomId}`);
    loadRoomEvents(roomId);
    setTimeout(() => {
        initEventDashboard();
    }, 500);
}

// ===== FILE UPLOAD SYSTEM FUNCTIONS =====

function initFileUploadSystem() {
    if (fileUploadListenersInitialized) {
        console.log('📁 File upload system already initialized');
        return;
    }
    
    const fileInput = document.getElementById('file-upload-input');
    const fileUploadBtn = document.querySelector('.file-upload-btn');
    
    if (fileInput && fileUploadBtn) {
        console.log('📁 Initializing file upload system');
        
        const cleanFileInput = fileInput.cloneNode(true);
        fileInput.parentNode.replaceChild(cleanFileInput, fileInput);
        
        const cleanFileUploadBtn = fileUploadBtn.cloneNode(true);
        fileUploadBtn.parentNode.replaceChild(cleanFileUploadBtn, fileUploadBtn);
        
        cleanFileUploadBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('📁 File upload button clicked');
            cleanFileInput.click();
        });
        
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

function handleFileSelection(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    
    if (!allowedTypes.includes(file.type)) {
        showNotification('Μόνο εικόνες, PDF και Word αρχεία επιτρέπονται!', 'error', 'Λάθος Αρχείο');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        showNotification('Το αρχείο είναι πολύ μεγάλο! Μέγιστο μέγεθος: 10MB', 'error', 'Μεγάλο Αρχείο');
        return;
    }
    
    selectedFile = file;
    showFilePreview(file);
}

function showFilePreview(file) {
    const filePreview = document.getElementById('file-preview');
    const previewImage = document.getElementById('preview-image');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');
    const uploadProgress = document.getElementById('upload-progress');
    
    if (!filePreview || !previewImage) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        if (file.type.startsWith('image/')) {
            previewImage.src = e.target.result;
            previewImage.style.display = 'block';
        } else {
            previewImage.style.display = 'none';
        }
        
        filePreview.style.display = 'block';
        
        if (fileName) {
            fileName.textContent = file.name.length > 25 ? file.name.substring(0, 25) + '...' : file.name;
        }
        
        if (fileSize) {
            const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
            fileSize.textContent = sizeInMB + ' MB';
        }
        
        if (uploadProgress) {
            uploadProgress.style.width = '0%';
            uploadProgress.textContent = '0%';
        }
    };
    reader.readAsDataURL(file);
}

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

// ===== EMOJI PICKER FUNCTIONS =====

function initEmojiPickerSystem() {
    const emojiBtn = document.querySelector('.emoji-picker-btn');
    
    if (emojiBtn) {
        const newEmojiBtn = emojiBtn.cloneNode(true);
        emojiBtn.parentNode.replaceChild(newEmojiBtn, emojiBtn);
        
        newEmojiBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showEmojiPicker();
        });
    }
}

function showEmojiPicker() {
    const emojiPicker = document.getElementById('emoji-picker-modal');
    if (emojiPicker) {
        emojiPicker.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function hideEmojiPicker() {
    const emojiPicker = document.getElementById('emoji-picker-modal');
    if (emojiPicker) {
        emojiPicker.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function initEmojiPickerContent() {
    const emojiCategoriesContainer = document.getElementById('emoji-categories');
    const emojiGrid = document.getElementById('emoji-grid');
    
    if (!emojiCategoriesContainer || !emojiGrid) return;
    
    Object.keys(emojiCategories).forEach((category, index) => {
        const button = document.createElement('button');
        button.className = `emoji-category-btn ${index === 0 ? 'active' : ''}`;
        button.dataset.category = category;
        button.innerHTML = emojiCategories[category][0];
        button.title = getCategoryName(category);
        
        button.addEventListener('click', function() {
            document.querySelectorAll('.emoji-category-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            this.classList.add('active');
            loadEmojiCategory(category);
        });
        
        emojiCategoriesContainer.appendChild(button);
    });
    
    loadEmojiCategory(Object.keys(emojiCategories)[0]);
    
    const closeBtn = document.getElementById('close-emoji-picker');
    if (closeBtn) {
        closeBtn.addEventListener('click', hideEmojiPicker);
    }
    
    const emojiPickerModal = document.getElementById('emoji-picker-modal');
    if (emojiPickerModal) {
        emojiPickerModal.addEventListener('click', function(e) {
            if (e.target === this) {
                hideEmojiPicker();
            }
        });
    }
}

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
    
    messageInput.dispatchEvent(new Event('input'));
    
    if (window.innerWidth <= 768) {
        setTimeout(() => {
            hideEmojiPicker();
        }, 300);
    }
}

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

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function initializeUploadAndEmojiListeners() {
    console.log('🔄 Initializing upload and emoji listeners');
    
    if (!fileUploadListenersInitialized) {
        initFileUploadSystem();
    }
    
    initEmojiPickerSystem();
    initEmojiPickerContent();
    
    const sendFileBtn = document.getElementById('send-file-btn');
    if (sendFileBtn) {
        const newSendFileBtn = sendFileBtn.cloneNode(true);
        sendFileBtn.parentNode.replaceChild(newSendFileBtn, sendFileBtn);
        
        newSendFileBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('📤 Send file button clicked');
            
            if (!isUploading && !fileUploadInProgress) {
                uploadFile();
            } else {
                console.log('⚠️ Upload already in progress');
            }
        });
    }
    
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
        
        notification.addEventListener('mouseenter', function() {
            this.style.transform = 'translateX(-5px)';
            this.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.8)';
        });
        
        notification.addEventListener('mouseleave', function() {
            this.style.transform = '';
            this.style.boxShadow = '';
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

// ===== UTILITY FUNCTIONS =====

function showPage(pageId) {
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    document.getElementById(pageId).classList.add("active");

    if (currentUser.authenticated) {
        saveCurrentPage(pageId);
    }
    
    if (typeof setCurrentPageId === 'function') {
        setCurrentPageId(pageId);
    }
    
    localStorage.setItem('ratscape_last_page', pageId);
    
    if (pageId === 'chat-page') {
        saveChatState();
    } else if (pageId !== 'chat-page' && currentRoom.id) {
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
    
    if (message.isFile || message.file_data) {
        const fileData = message.file_data || message;
        const fileExtension = fileData.fileName ? fileData.fileName.split('.').pop().toLowerCase() : '';
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(fileExtension);
        
        if (isImage && fileData.fileUrl) {
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

async function loadUserAvatar(username, element, isCurrentUser = false) {
    if (!username) return;
    
    if (userAvatars[username]) {
        updateAvatarElement(element, userAvatars[username], username, isCurrentUser);
        return;
    }
    
    try {
        const response = await fetch(`/get-profile-picture/${username}`);
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
        if (element.tagName === 'DIV') {
            element.innerHTML = `<img src="${avatarUrl}" alt="${username}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
            element.style.background = 'none';
        } else if (element.tagName === 'IMG') {
            element.src = avatarUrl;
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
                <p>You haven't joined any meets yet.</p>
                <p>Create a new meet or join with an invite code!</p>
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
                <button class="btn btn-primary btn-sm enter-room-btn" data-room-id="${room.id}">Enter Meet</button>
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
    document.getElementById("copy-invite-btn").title = "Copy meet code";
    document.getElementById("copy-invite-btn").style.opacity = "1";
    document.getElementById("copy-invite-btn").style.cursor = "pointer";
    document.getElementById("copy-invite-btn").style.pointerEvents = "auto";

    document.getElementById("messages-container").innerHTML = "";

    console.log("📡 Emitting join room event...");
    
    socket.emit("join room", {
        roomId: roomId,
        username: currentUser.username,
        sessionId: currentUser.sessionId,
    });

    showPage("chat-page");
    
    saveChatState();
    
    socket.emit("get room info", { roomId: roomId });
    socket.emit("get room members", { roomId: roomId });
    
    setTimeout(() => {
        socket.emit("get room members", { roomId: roomId });
    }, 500);
    
    initEventsForRoom(roomId);
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
    
    saveChatState();
    
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
        userInfoImage.src = user.profile_picture;
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
    
    unreadMessages = { private: {}, groups: {}, total: 0 };
    updateUnreadBadges();
    
    userAvatars = {};
    
    clearUserFromLocalStorage();
    clearChatState();
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
        showNotification("Please enter a meet name!", "warning", "Missing Info");
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
            showNotification(`Meet created! Invite code: ${data.inviteCode}`, "success", "Meet Created");
            hideAllModals();
            document.getElementById("room-name-input").value = "";
            enterRoom(data.roomId, roomName, data.inviteCode);
        } else {
            showNotification(data.error || "Failed to create meet", "error", "Meet Creation Failed");
        }
    } catch (error) {
        if (error.message === "Session expired") {
            handleSessionExpired();
        } else {
            showNotification("Error creating meet: " + error.message, "error", "Connection Error");
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

        const data = await response.json();

        if (data.success) {
            showNotification("Joined meet successfully!", "success", "Meet Joined");
            hideAllModals();
            document.getElementById("invite-code-input").value = "";
            enterRoom(data.roomId, data.roomName, inviteCode.trim());
        } else {
            showNotification(data.error || "Failed to join meet", "error", "Join Meet Failed");
        }
    } catch (error) {
        console.error("Error joining meet:", error);
        showNotification("Connection error. Please try again.", "error", "Connection Error");
    }
}

async function handleLeaveRoom() {
    if (!currentRoom.id) {
        showNotification("You are not in a meet", "info", "No Meet");
        return;
    }
    
    if (currentRoom.isPrivate) {
        const friendUsername = currentRoom.name;
        
        showConfirmationModal(
            `Are you sure you want to leave the private chat with ${friendUsername} and remove them as friend?`,
            "Leave Private Chat",
            async () => {
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
                        throw new Error("Failed to remove friend");
                    }

                    const data = await response.json();

                    if (data.success) {
                        showNotification(
                            `Left private chat with ${friendUsername} and removed as friend`,
                            "info",
                            "Chat Closed"
                        );
                        
                        showPage("friends-page");
                        loadUserFriends();
                        
                        currentRoom = { id: null, name: null, inviteCode: null, isPrivate: false };
                        clearChatState();
                        
                        document.getElementById("room-name-sidebar").textContent = "RatScape";
                        document.getElementById("room-name-header").textContent = "Meet Name";
                        document.getElementById("room-invite-code").textContent = "------";
                        document.getElementById("room-description").textContent = "Car meet chat";
                        document.getElementById("room-status").textContent = "Not in a meet";
                        document.getElementById("room-status").classList.remove("private-chat");
                        
                        document.getElementById("invite-code-container").classList.remove("hide-for-private");
                        document.getElementById("copy-invite-btn").style.display = "flex";
                        document.getElementById("copy-invite-btn").disabled = false;
                        
                        document.getElementById("messages-container").innerHTML = "";
                        
                        clearUnread('private', friendUsername);
                    } else {
                        showNotification(data.error || "Failed to remove friend", "error", "Action Failed");
                    }
                } catch (error) {
                    console.error("Error leaving private chat:", error);
                    showNotification("Error: " + error.message, "error", "Connection Error");
                    
                    showPage("friends-page");
                    loadUserFriends();
                    
                    currentRoom = { id: null, name: null, inviteCode: null, isPrivate: false };
                    clearChatState();
                }
            },
            () => {
                console.log("User cancelled leaving private chat");
            }
        );
        return;
    }
    
    showConfirmationModal(
        "Are you sure you want to leave this meet? You can rejoin anytime with the invite code.",
        "Leave Meet",
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
                    throw new Error("Failed to leave meet");
                }

                const data = await response.json();

                if (data.success) {
                    showNotification("Left meet successfully!", "success", "Meet Left");
                    
                    if (currentRoom.id) {
                        socket.emit("leave_room", {
                            roomId: currentRoom.id,
                            username: currentUser.username
                        });
                    }
                    
                    showPage("rooms-page");
                    loadUserRooms();
                    
                    currentRoom = { id: null, name: null, inviteCode: null, isPrivate: false };
                    clearChatState();
                    
                    document.getElementById("room-name-sidebar").textContent = "RatScape";
                    document.getElementById("room-name-header").textContent = "Meet Name";
                    document.getElementById("room-invite-code").textContent = "------";
                    document.getElementById("room-description").textContent = "Car meet chat";
                    document.getElementById("room-status").textContent = "Not in a meet";
                    document.getElementById("room-status").classList.remove("private-chat");
                    
                    document.getElementById("messages-container").innerHTML = "";
                    
                    document.getElementById("invite-code-container").classList.remove("hide-for-private");
                    document.getElementById("copy-invite-btn").style.display = "flex";
                    document.getElementById("copy-invite-btn").disabled = false;
                    
                    clearUnread('group', null, currentRoom.id);
                    
                } else {
                    showNotification(data.error || "Failed to leave meet", "error", "Action Failed");
                }
            } catch (error) {
                console.error("Error leaving meet:", error);
                showNotification("Error leaving meet: " + error.message, "error", "Connection Error");
                
                showPage("rooms-page");
                loadUserRooms();
                
                currentRoom = { id: null, name: null, inviteCode: null, isPrivate: false };
                clearChatState();
            }
        }
    );
}

function handleSendMessage() {
    const input = document.getElementById("message-input");
    const text = input.value.trim();

    if (selectedFile && !fileUploadInProgress) {
        return;
    }

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
    document.getElementById("stat-events").textContent = stats.events || 0;
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

async function handleClearMessages() {
    if (!currentRoom.id) {
        showNotification("You are not in a meet", "info", "No Meet");
        return;
    }
    
    showConfirmationModal(
        "Are you sure you want to clear all messages? This action cannot be undone!",
        "Clear Messages",
        async () => {
            try {
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
        addUnreadMessage('group', message.sender, message.room_id);
        
        showNotification(
            `New message from ${message.sender} in a meet`, 
            "info", 
            "New Meet Message",
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

socket.on("file_upload", (data) => {
    console.log("📁 File upload received:", data);
    
    const shouldDisplay = (
        (currentRoom.isPrivate && (data.sender === currentRoom.name || data.receiver === currentRoom.name)) ||
        (!currentRoom.isPrivate && data.room_id === currentRoom.id)
    );
    
    if (shouldDisplay) {
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
        
        if (data.sender !== currentUser.username) {
            showNotification(
                `${data.sender} sent a file: ${data.fileName}`,
                "info",
                "New File"
            );
        }
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
        
        members.forEach(member => {
            updateUserStatusInUI(member.username, true);
        });
        
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

socket.on("user_left", (data) => {
    console.log(`👋 User ${data.username} left room ${data.roomId}`);
    
    if (currentRoom.id === data.roomId) {
        socket.emit("get room members", { roomId: currentRoom.id });
    }
    
    if (data.username !== currentUser.username) {
        showNotification(`${data.username} left the meet`, "info", "User Left");
    }
});

socket.on("user_disconnected", (data) => {
    console.log(`📡 User ${data.username} disconnected from room ${data.roomId} (still a member)`);
    
    if (currentRoom.id === data.roomId) {
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

socket.on("leave_room_success", (data) => {
    console.log("✅ Successfully left room:", data.roomId);
    showNotification("Left meet successfully", "info", "Meet Left");
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

// ===== EVENT SOCKET HANDLERS =====

socket.on('new_event', (data) => {
    console.log('🎪 New event received:', data);
    
    if (data.roomId === currentRoom.id) {
        if (!roomEvents[data.roomId]) {
            roomEvents[data.roomId] = [];
        }
        roomEvents[data.roomId].push(data.event);
        updateEventsList(data.roomId);
        
        showNotification(`New event: ${data.event.title}`, 'info', 'New Event');
    }
});

socket.on('event_updated', (data) => {
    console.log('🔄 Event updated:', data);
    
    if (roomEvents[data.roomId]) {
        const index = roomEvents[data.roomId].findIndex(e => e.id === data.event.id);
        if (index !== -1) {
            roomEvents[data.roomId][index] = data.event;
            updateEventsList(data.roomId);
            
            if (currentEvent && currentEvent.id === data.event.id) {
                currentEvent = data.event;
                if (document.getElementById('event-page')?.classList.contains('active')) {
                    showEventDetails(data.event.id);
                }
            }
        }
    }
});

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
                showNotification("Meet code copied!", "success", "Copied!");
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

    document.getElementById("clear-messages-btn").addEventListener("click", handleClearMessages);

    initializeUploadAndEmojiListeners();

    initializeProfileEventListeners();
    
    const browseEventsBtn = document.getElementById('browse-events-btn');
    if (browseEventsBtn) {
        browseEventsBtn.addEventListener('click', () => {
            showNotification('Events browsing feature coming soon!', 'info', 'Coming Soon');
        });
    }
    
    const myEventsBtn = document.getElementById('my-events-btn');
    if (myEventsBtn) {
        myEventsBtn.addEventListener('click', () => {
            showNotification('My events feature coming soon!', 'info', 'Coming Soon');
        });
    }
}

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

function updateUserStatusInUI(username, isOnline) {
    const memberItem = document.querySelector(`.member-item[data-username="${username}"]`);
    if (memberItem) {
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

// ===== MOBILE RESPONSIVE FUNCTIONALITY =====

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
        
        .file-preview-container {
            margin: 10px 0;
            padding: 10px;
            background: rgba(26, 26, 26, 0.7);
            border-radius: var(--radius);
            border: 1px solid var(--border-color);
        }
        
        .file-preview {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .file-image-preview {
            width: 60px;
            height: 60px;
            object-fit: cover;
            border-radius: var(--radius);
            cursor: pointer;
        }
        
        .file-info {
            flex: 1;
        }
        
        .file-name {
            display: block;
            font-weight: 600;
            color: var(--text);
            margin-bottom: 5px;
        }
        
        .file-size {
            font-size: 0.8rem;
            color: var(--text-light);
        }
        
        .file-upload-actions {
            display: flex;
            gap: 10px;
            margin-top: 10px;
        }
        
        .file-download-btn {
            background: var(--primary);
            color: white;
            padding: 8px 16px;
            border-radius: var(--radius);
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 0.9rem;
        }
        
        .file-download-btn:hover {
            background: var(--accent-red);
        }
        
        .image-preview-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .image-preview-content {
            position: relative;
            max-width: 90%;
            max-height: 90%;
        }
        
        .full-size-image {
            max-width: 100%;
            max-height: 80vh;
            border-radius: var(--radius);
        }
        
        .close-image-preview {
            position: absolute;
            top: -40px;
            right: 0;
            background: none;
            border: none;
            color: white;
            font-size: 2rem;
            cursor: pointer;
        }
        
        .image-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
            justify-content: center;
        }
        
        .emoji-picker-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 10000;
            display: none;
            align-items: center;
            justify-content: center;
        }
        
        .emoji-picker-modal.active {
            display: flex;
        }
        
        .emoji-picker-content {
            background: var(--card-bg);
            border-radius: var(--radius);
            width: 90%;
            max-width: 400px;
            max-height: 80vh;
            overflow: hidden;
            border: 1px solid var(--border-color);
        }
        
        .emoji-categories {
            display: flex;
            gap: 5px;
            padding: 10px;
            background: rgba(38, 38, 38, 0.9);
            border-bottom: 1px solid var(--border-color);
        }
        
        .emoji-category-btn {
            background: transparent;
            border: none;
            padding: 8px 12px;
            border-radius: var(--radius);
            cursor: pointer;
            font-size: 1.2rem;
            transition: all 0.2s ease;
        }
        
        .emoji-category-btn.active {
            background: var(--primary);
            color: white;
        }
        
        .emoji-category-btn:hover:not(.active) {
            background: rgba(139, 0, 0, 0.2);
        }
        
        .emoji-grid {
            display: grid;
            grid-template-columns: repeat(8, 1fr);
            gap: 5px;
            padding: 15px;
            max-height: 300px;
            overflow-y: auto;
        }
        
        .emoji-item {
            background: transparent;
            border: none;
            padding: 8px;
            border-radius: var(--radius);
            cursor: pointer;
            font-size: 1.5rem;
            transition: all 0.2s ease;
        }
        
        .emoji-item:hover {
            background: rgba(139, 0, 0, 0.2);
            transform: scale(1.1);
        }
        
        /* Events System Styles */
        .room-events-section {
            margin: 15px 0;
            padding: 15px;
            background: rgba(38, 38, 38, 0.7);
            border-radius: var(--radius);
            border: 1px solid var(--border-color);
        }
        
        .room-events-section h3 {
            color: var(--text);
            font-size: 0.9rem;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .events-list {
            max-height: 200px;
            overflow-y: auto;
            margin-bottom: 10px;
        }
        
        .event-item {
            display: flex;
            align-items: center;
            padding: 10px;
            background: rgba(26, 26, 26, 0.5);
            border-radius: var(--radius);
            margin-bottom: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .event-item:hover {
            background: rgba(139, 0, 0, 0.2);
            transform: translateX(5px);
        }
        
        .event-date {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: var(--primary);
            color: white;
            border-radius: 8px;
            padding: 8px;
            min-width: 50px;
            margin-right: 10px;
        }
        
        .event-day {
            font-size: 1.2rem;
            font-weight: bold;
            line-height: 1;
        }
        
        .event-month {
            font-size: 0.7rem;
            text-transform: uppercase;
        }
        
        .event-info {
            flex: 1;
        }
        
        .event-title {
            font-size: 0.9rem;
            font-weight: 600;
            color: var(--text);
            margin: 0 0 5px 0;
        }
        
        .event-location {
            font-size: 0.75rem;
            color: var(--text-light);
            margin: 0 0 3px 0;
            display: flex;
            align-items: center;
            gap: 5px;
        }
        
        .event-stats {
            font-size: 0.7rem;
            color: var(--text-light);
        }
        
        .view-event-btn {
            background: transparent;
            border: none;
            color: var(--text-light);
            cursor: pointer;
            padding: 5px;
            border-radius: 50%;
        }
        
        .view-event-btn:hover {
            background: rgba(139, 0, 0, 0.2);
            color: var(--accent-red);
        }
        
        .no-events {
            text-align: center;
            padding: 20px;
            color: var(--text-light);
            font-size: 0.9rem;
        }
        
        /* Event Details Page */
        .event-details-container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .event-header {
            position: relative;
            border-radius: var(--radius);
            overflow: hidden;
            margin-bottom: 20px;
        }
        
        .event-image {
            height: 300px;
            background-size: cover;
            background-position: center;
            position: relative;
        }
        
        .event-header-overlay {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: linear-gradient(transparent, rgba(0, 0, 0, 0.9));
            padding: 30px;
            color: white;
        }
        
        .event-title-large {
            font-size: 2.5rem;
            margin: 0 0 10px 0;
            color: white;
        }
        
        .event-basic-info {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        
        .event-date-large, .event-location-large {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 1.1rem;
        }
        
        .event-content {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 30px;
            margin-top: 30px;
        }
        
        .event-section {
            background: var(--card-bg);
            border-radius: var(--radius);
            padding: 20px;
            margin-bottom: 20px;
            border: 1px solid var(--border-color);
        }
        
        .event-section h3 {
            color: var(--text);
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .event-description {
            line-height: 1.6;
            color: var(--text);
            white-space: pre-line;
        }
        
        .attendees-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 15px;
        }
        
        .attendee-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 15px;
            background: rgba(38, 38, 38, 0.7);
            border-radius: var(--radius);
            text-align: center;
        }
        
        .attendee-avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: var(--primary);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 1.2rem;
            margin-bottom: 10px;
        }
        
        .attendee-name {
            font-weight: 600;
            color: var(--text);
            margin-bottom: 5px;
        }
        
        .attendee-status {
            font-size: 0.8rem;
            color: var(--text-light);
        }
        
        .event-chat-container {
            background: var(--card-bg);
            border-radius: var(--radius);
            overflow: hidden;
            border: 1px solid var(--border-color);
        }
        
        .event-messages {
            height: 200px;
            overflow-y: auto;
            padding: 15px;
        }
        
        .event-message {
            margin-bottom: 10px;
            padding: 10px;
            background: rgba(38, 38, 38, 0.7);
            border-radius: var(--radius);
        }
        
        .event-message-sender {
            font-weight: 600;
            color: var(--text);
            margin-bottom: 5px;
        }
        
        .event-message-text {
            color: var(--text);
            margin-bottom: 5px;
        }
        
        .event-message-time {
            font-size: 0.7rem;
            color: var(--text-light);
            text-align: right;
        }
        
        .event-chat-input {
            display: flex;
            padding: 15px;
            border-top: 1px solid var(--border-color);
            background: rgba(26, 26, 26, 0.5);
        }
        
        .event-chat-input input {
            flex: 1;
            padding: 10px 15px;
            background: var(--input-bg);
            border: 1px solid var(--border-color);
            border-radius: var(--radius);
            color: var(--text);
            font-size: 0.9rem;
        }
        
        .event-chat-input button {
            margin-left: 10px;
        }
        
        .event-sidebar {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        
        .event-card {
            background: var(--card-bg);
            border-radius: var(--radius);
            padding: 20px;
            border: 1px solid var(--border-color);
        }
        
        .event-card h4 {
            color: var(--text);
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .event-stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            text-align: center;
        }
        
        .event-stat {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        
        .event-stat .stat-number {
            font-size: 1.5rem;
            font-weight: bold;
            color: var(--accent-red);
        }
        
        .event-stat .stat-label {
            font-size: 0.8rem;
            color: var(--text-light);
            margin-top: 5px;
        }
        
        .organizer-info {
            display: flex;
            align-items: center;
            gap: 15px;
        }
        
        .organizer-avatar {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: var(--primary);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 1.5rem;
        }
        
        .organizer-details {
            flex: 1;
        }
        
        .organizer-name {
            font-weight: 600;
            color: var(--text);
            margin-bottom: 5px;
        }
        
        .organizer-role {
            font-size: 0.8rem;
            color: var(--text-light);
        }
        
        .quick-actions {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        
        .quick-actions button {
            width: 100%;
        }
        
        .no-attendees {
            text-align: center;
            padding: 20px;
            color: var(--text-light);
            font-size: 0.9rem;
        }
        
        /* Featured meets on home page */
        .featured-section {
            padding: 60px 20px;
            background: var(--background);
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .section-title {
            text-align: center;
            color: var(--text);
            font-size: 2rem;
            margin-bottom: 10px;
        }
        
        .section-subtitle {
            text-align: center;
            color: var(--text-light);
            margin-bottom: 40px;
            font-size: 1.1rem;
        }
        
        .featured-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 30px;
            margin-top: 40px;
        }
        
        .featured-card {
            background: var(--card-bg);
            border-radius: var(--radius);
            overflow: hidden;
            border: 1px solid var(--border-color);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        
        .featured-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }
        
        .featured-image {
            height: 200px;
            background-size: cover;
            background-position: center;
            position: relative;
        }
        
        .featured-badge {
            position: absolute;
            top: 15px;
            right: 15px;
            background: var(--accent-red);
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: bold;
        }
        
        .featured-badge.upcoming {
            background: var(--primary);
        }
        
        .featured-content {
            padding: 20px;
        }
        
        .featured-content h3 {
            color: var(--text);
            margin-bottom: 10px;
            font-size: 1.3rem;
        }
        
        .featured-location, .featured-date {
            color: var(--text-light);
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.9rem;
        }
        
        .featured-stats {
            display: flex;
            justify-content: space-between;
            margin: 15px 0;
            color: var(--text-light);
            font-size: 0.9rem;
        }
        
        .btn-block {
            display: block;
            width: 100%;
        }
        
        /* Categories section */
        .categories-section {
            padding: 60px 20px;
            background: rgba(26, 26, 26, 0.5);
        }
        
        .categories-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 25px;
            margin-top: 40px;
        }
        
        .category-card {
            background: var(--card-bg);
            border-radius: var(--radius);
            padding: 25px;
            text-align: center;
            border: 1px solid var(--border-color);
            transition: all 0.3s ease;
            cursor: pointer;
        }
        
        .category-card:hover {
            transform: translateY(-5px);
            border-color: var(--accent-red);
            background: rgba(139, 0, 0, 0.1);
        }
        
        .category-icon {
            width: 60px;
            height: 60px;
            background: var(--primary);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
            color: white;
            font-size: 1.5rem;
        }
        
        .category-card h3 {
            color: var(--text);
            margin-bottom: 10px;
            font-size: 1.2rem;
        }
        
        .category-card p {
            color: var(--text-light);
            font-size: 0.9rem;
            margin-bottom: 10px;
        }
        
        .category-count {
            color: var(--accent-red);
            font-size: 0.8rem;
            font-weight: bold;
        }
        
        /* Gallery section */
        .gallery-section {
            padding: 60px 20px;
            background: var(--background);
        }
        
        .gallery-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-top: 40px;
        }
        
        .gallery-item {
            position: relative;
            border-radius: var(--radius);
            overflow: hidden;
            height: 250px;
        }
        
        .gallery-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.3s ease;
        }
        
        .gallery-item:hover .gallery-image {
            transform: scale(1.1);
        }
        
        .gallery-overlay {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
            padding: 15px;
            color: white;
            font-weight: 600;
        }
        
        /* Stats section */
        .stats-section {
            padding: 60px 20px;
            background: rgba(26, 26, 26, 0.5);
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 30px;
            max-width: 1000px;
            margin: 0 auto;
        }
        
        .stat-item {
            text-align: center;
        }
        
        .stat-number {
            font-size: 3rem;
            font-weight: bold;
            color: var(--accent-red);
            margin-bottom: 10px;
        }
        
        .stat-label {
            color: var(--text-light);
            font-size: 1.1rem;
        }
        
        /* Social media section */
        .social-media-section {
            padding: 60px 20px;
            background: var(--background);
        }
        
        .social-icons-grid {
            display: flex;
            justify-content: center;
            gap: 20px;
            flex-wrap: wrap;
            margin: 40px 0;
        }
        
        .social-icon-circle {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
            text-decoration: none;
            transition: all 0.3s ease;
        }
        
        .social-icon-circle:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3);
        }
        
        .social-icon-circle i {
            font-size: 1.5rem;
            margin-bottom: 5px;
        }
        
        .social-icon-label {
            font-size: 0.7rem;
            opacity: 0.9;
        }
        
        .social-icon-circle.instagram {
            background: linear-gradient(45deg, #405DE6, #5851DB, #833AB4, #C13584, #E1306C, #FD1D1D);
        }
        
        .social-icon-circle.facebook {
            background: #1877F2;
        }
        
        .social-icon-circle.twitter {
            background: #1DA1F2;
        }
        
        .social-icon-circle.youtube {
            background: #FF0000;
        }
        
        .social-icon-circle.discord {
            background: #5865F2;
        }
        
        .follow-us {
            text-align: center;
            color: var(--text-light);
            margin-top: 20px;
            font-size: 0.9rem;
        }
        
        /* Hero section */
        .hero-section {
            height: 80vh;
            background: linear-gradient(rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.7)), 
                        url('/images/car-meet-hero.jpg');
            background-size: cover;
            background-position: center;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            color: white;
            padding: 20px;
        }
        
        .hero-overlay {
            background: rgba(0, 0, 0, 0.5);
            padding: 40px;
            border-radius: var(--radius);
            max-width: 800px;
        }
        
        .hero-title {
            font-size: 3.5rem;
            margin-bottom: 20px;
            color: white;
        }
        
        .hero-subtitle {
            font-size: 1.5rem;
            margin-bottom: 20px;
            color: #FFD700;
        }
        
        .hero-description {
            font-size: 1.1rem;
            margin-bottom: 30px;
            line-height: 1.6;
        }
        
        .hero-btn {
            margin: 0 10px;
            padding: 12px 30px;
            font-size: 1rem;
        }
        
        @media (max-width: 768px) {
            .hero-title {
                font-size: 2.5rem;
            }
            
            .hero-subtitle {
                font-size: 1.2rem;
            }
            
            .hero-btn {
                display: block;
                margin: 10px auto;
                width: 80%;
            }
            
            .featured-grid,
            .categories-grid,
            .gallery-grid {
                grid-template-columns: 1fr;
            }
            
            .event-content {
                grid-template-columns: 1fr;
            }
            
            .attendees-list {
                grid-template-columns: repeat(2, 1fr);
            }
        }
        
        .room-actions {
            margin-top: 10px;
        }
    `;
    document.head.appendChild(unreadStyle);

    const savedUser = getUserFromLocalStorage();
    
    const chatState = loadChatState();
    const lastPageId = localStorage.getItem('ratscape_last_page') || 'home-page';
    
    if (chatState && lastPageId === 'chat-page') {
        console.log('🔄 Προσπάθεια επαναφοράς chat:', chatState);
        
        showPage('chat-page');
    }

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

                    if (chatState && lastPageId === 'chat-page') {
                        console.log('🚀 Επαναφορά chat από saved state...');
                        
                        currentRoom = {
                            id: chatState.roomId,
                            name: chatState.roomName,
                            inviteCode: chatState.inviteCode,
                            isPrivate: chatState.isPrivate
                        };
                        
                        document.getElementById("room-name-sidebar").textContent = chatState.roomName;
                        document.getElementById("room-name-header").textContent = chatState.roomName;
                        
                        if (chatState.isPrivate) {
                            document.getElementById("room-description").textContent = `Private conversation with ${chatState.roomName}`;
                            document.getElementById("room-status").textContent = "Private chat";
                            document.getElementById("room-status").classList.add("private-chat");
                            document.getElementById("room-invite-code").textContent = "";
                            document.getElementById("invite-code-container").classList.add("hide-for-private");
                            document.getElementById("copy-invite-btn").style.display = "none";
                            
                            const sidebarAvatar = document.getElementById("sidebar-avatar");
                            if (sidebarAvatar) {
                                loadUserAvatar(currentUser.username, sidebarAvatar, true);
                            }
                            
                            loadPrivateMessages(chatState.roomName);
                            
                            document.getElementById("room-members-list").innerHTML = `
                                <div class="member-item" data-username="${currentUser.username}">
                                    <div class="member-avatar"></div>
                                    <div class="member-info">
                                        <span class="member-name">${currentUser.username}</span>
                                        <span class="member-joined">You</span>
                                    </div>
                                </div>
                                <div class="member-item" data-username="${chatState.roomName}">
                                    <div class="member-avatar"></div>
                                    <div class="member-info">
                                        <span class="member-name">${chatState.roomName}</span>
                                        <span class="member-joined">Friend</span>
                                    </div>
                                </div>
                            `;
                            
                            setTimeout(() => {
                                loadMemberAvatars();
                                makeMemberItemsClickable();
                            }, 100);
                            
                        } else {
                            document.getElementById("room-invite-code").textContent = chatState.inviteCode || "------";
                            document.getElementById("invite-code-container").classList.remove("hide-for-private");
                            document.getElementById("copy-invite-btn").style.display = "flex";
                            document.getElementById("copy-invite-btn").disabled = false;
                            
                            socket.emit("join room", {
                                roomId: chatState.roomId,
                                username: currentUser.username,
                                sessionId: currentUser.sessionId,
                            });
                            
                            initEventsForRoom(chatState.roomId);
                        }
                        
                        showPage('chat-page');
                        
                    } else {
                        const lastPage = getLastPage();
                        showPage(lastPage);
                    }

                    socket.emit("authenticate", {
                        username: currentUser.username,
                        sessionId: currentUser.sessionId,
                    });

                    loadCurrentUserAvatar();
                    
                    await loadOfflineNotifications();

                    if (lastPageId === "rooms-page") {
                        setTimeout(() => {
                            loadUserRooms();
                        }, 500);
                    } else if (lastPageId === "friends-page") {
                        setTimeout(() => {
                            loadUserFriends();
                        }, 500);
                    }

                    console.log("✅ User session restored");
                } else {
                    clearUserFromLocalStorage();
                    clearChatState();
                    showPage("home-page");
                    console.log("❌ Session verification failed");
                }
            } else {
                clearUserFromLocalStorage();
                clearChatState();
                showPage("home-page");
                console.log("❌ Session verification failed - server error");
            }
        } catch (error) {
            console.error("Error verifying user session:", error);
            clearUserFromLocalStorage();
            clearChatState();
            showPage("home-page");
        }
    } else {
        if (chatState) {
            clearChatState();
        }
        console.log("ℹ️ No saved user, staying on current page");
    }

    console.log("✅ Ready to chat!");
});

window.addEventListener('beforeunload', function() {
    if (currentRoom.id) {
        saveChatState();
    }
});
