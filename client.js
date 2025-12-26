// client.js - RatRoom Client with Enhanced Security, Notifications & UNREAD SYSTEM - UPDATED WITH FILE UPLOAD & EMOJI PICKER
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

// ===== ENHANCED FILE UPLOAD SYSTEM WITH VIDEO SUPPORT =====
let fileUploadInProgress = false;
let selectedFile = null;
let fileUploadListenersInitialized = false;

// 🔥 ΝΕΟ: Video upload settings
const VIDEO_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
let videoUploadId = null;
let videoChunks = [];
let videoUploadProgress = 0;

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

// 🔥 EMERGENCY FIX: Convert old format messages
function convertMessageFormat(message) {
    if (message.video_data && !message.file_data) {
        // Αν έχει video_data αλλά όχι file_data, δημιούργησε file_data
        message.file_data = message.video_data;
        message.isFile = true;
    }
    if (message.file_data && !message.video_data && message.file_data.fileName) {
        // Αν έχει file_data αλλά όχι video_data και είναι video, δημιούργησε video_data
        const ext = message.file_data.fileName.split('.').pop().toLowerCase();
        const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mpeg', 'mkv', 'wmv', 'flv'];
        if (videoExts.includes(ext)) {
            message.video_data = message.file_data;
        }
    }
    return message;
}

// 🔥 ΝΕΟ: Initialize video upload system
function initVideoUploadSystem() {
    console.log('🎬 Initializing video upload system');
    
    // Add video upload button
    const inputActions = document.querySelector('.input-actions');
    if (inputActions && !document.querySelector('.video-upload-btn')) {
        const videoBtn = document.createElement('button');
        videoBtn.className = 'video-upload-btn';
        videoBtn.title = 'Upload video';
        videoBtn.innerHTML = '<i class="fas fa-video"></i>';
        videoBtn.style.cssText = `
            background: rgba(51, 51, 51, 0.5);
            border: 1px solid var(--border-color);
            color: var(--text-light);
            width: 40px;
            height: 40px;
            border-radius: var(--radius);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
            flex-shrink: 0;
        `;
        
        videoBtn.addEventListener('mouseenter', function() {
            this.style.background = 'var(--primary)';
            this.style.color = 'white';
            this.style.borderColor = 'var(--primary)';
            this.style.transform = 'translateY(-1px)';
        });
        
        videoBtn.addEventListener('mouseleave', function() {
            this.style.background = 'rgba(51, 51, 51, 0.5)';
            this.style.color = 'var(--text-light)';
            this.style.borderColor = 'var(--border-color)';
            this.style.transform = 'none';
        });
        
        videoBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const videoInput = document.createElement('input');
            videoInput.type = 'file';
            videoInput.accept = 'video/*';
            videoInput.style.display = 'none';
            videoInput.addEventListener('change', function(e) {
                const file = e.target.files[0];
                if (file) {
                    handleVideoSelection(file);
                }
            });
            document.body.appendChild(videoInput);
            videoInput.click();
            setTimeout(() => {
                document.body.removeChild(videoInput);
            }, 1000);
        });
        
        inputActions.insertBefore(videoBtn, inputActions.firstChild);
    }
}

// 🔥 ΝΕΟ: Handle video selection
function handleVideoSelection(file) {
    // Check if it's a video
    if (!file.type.startsWith('video/')) {
        showNotification('Please select a video file!', 'error', 'Invalid File');
        return;
    }
    
    // ΑΛΛΑΓΗ: Μειώσαμε το μέγιστο μέγεθος από 30MB σε 20MB
    const MAX_SIZE = 20 * 1024 * 1024; // 20MB
    if (file.size > MAX_SIZE) {
        showNotification('Video too large! Maximum size: 20MB', 'error', 'File Too Large');
        return;
    }
    
    selectedFile = file;
    showVideoPreview(file);
}

// 🔥 ΝΕΟ: Show video preview
function showVideoPreview(file) {
    const filePreview = document.getElementById('file-preview');
    const previewImage = document.getElementById('preview-image');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');
    const uploadProgress = document.getElementById('upload-progress');
    
    if (!filePreview) return;
    
    // Hide image preview
    if (previewImage) {
        previewImage.style.display = 'none';
    }
    
    // Create video preview if it doesn't exist
    let videoPreview = document.getElementById('video-preview');
    if (!videoPreview) {
        videoPreview = document.createElement('video');
        videoPreview.id = 'video-preview';
        videoPreview.className = 'video-upload-preview';
        videoPreview.style.cssText = `
            width: 100px;
            height: 100px;
            border-radius: var(--radius);
            object-fit: cover;
            border: 2px solid var(--border-color);
            display: none;
        `;
        
        const filePreviewContent = document.querySelector('.file-preview-content');
        if (filePreviewContent) {
            filePreviewContent.insertBefore(videoPreview, filePreviewContent.firstChild);
        }
    }
    
    const videoUrl = URL.createObjectURL(file);
    videoPreview.src = videoUrl;
    videoPreview.style.display = 'block';
    
    filePreview.style.display = 'block';
    
    // File info
    if (fileName) {
        fileName.textContent = file.name.length > 25 ? file.name.substring(0, 25) + '...' : file.name;
    }
    
    if (fileSize) {
        const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
        fileSize.textContent = sizeInMB + ' MB (Video)';
    }
    
    // Reset progress bar
    if (uploadProgress) {
        uploadProgress.style.width = '0%';
        uploadProgress.setAttribute('data-progress', '0%');
    }
    
    // Change send button text for video
    const sendFileBtn = document.getElementById('send-file-btn');
    if (sendFileBtn) {
        sendFileBtn.innerHTML = '<i class="fas fa-video"></i> Upload Video';
    }
}

// 🔥 ΔΙΟΡΘΩΣΗ: Απλή μέθοδος για ΟΛΑ τα βίντεο (αφού ο server υποστηρίζει μόνο το /upload-video-message)
async function uploadVideo() {
    if (!selectedFile || fileUploadInProgress) {
        console.log('❌ No file selected or upload in progress');
        return;
    }
    
    console.log('🎬 Starting video upload:', selectedFile.name, 'Size:', selectedFile.size, 'Type:', selectedFile.type);
    
    fileUploadInProgress = true;
    
    const uploadProgress = document.getElementById('upload-progress');
    const uploadStatus = document.getElementById('upload-status');
    const sendFileBtn = document.getElementById('send-file-btn');
    const originalBtnText = sendFileBtn ? sendFileBtn.innerHTML : '';
    
    const formData = new FormData();
    formData.append('video', selectedFile);
    
    // Προσθήκη όλων των απαραίτητων πεδίων
    formData.append('sender', currentUser.username);
    formData.append('type', currentRoom.isPrivate ? 'private' : 'group');
    formData.append('fileName', selectedFile.name);
    formData.append('fileSize', selectedFile.size.toString());
    formData.append('fileType', selectedFile.type);
    
    if (currentRoom.isPrivate) {
        formData.append('receiver', currentRoom.name);
    } else if (currentRoom.id) {
        formData.append('roomId', currentRoom.id);
    }
    
    let timeoutId;
    let controller;
    
    try {
        if (uploadProgress) uploadProgress.style.width = '10%';
        if (uploadStatus) {
            uploadStatus.textContent = 'Preparing video...';
            uploadStatus.style.color = 'var(--text-light)';
        }
        
        if (sendFileBtn) {
            sendFileBtn.disabled = true;
            sendFileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';
        }
        
        // 🔥 ΚΡΙΤΙΚΗ ΔΙΟΡΘΩΣΗ: Χρήση XMLHttpRequest για καλύτερο timeout handling
        console.log('🎬 Starting XMLHttpRequest upload...');
        
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            // Εκκίνηση timeout
            timeoutId = setTimeout(() => {
                console.log('⏰ Upload timeout after 180 seconds');
                xhr.abort();
                reject(new Error('Upload timeout (180 seconds). Please try a smaller video file or check your connection.'));
            }, 180000); // 180s = 3 λεπτά
            
            // Προσθήκη progress tracking
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = (e.loaded / e.total) * 100;
                    console.log(`📊 Upload progress: ${percent.toFixed(1)}%`);
                    
                    if (uploadProgress) {
                        uploadProgress.style.width = `${percent}%`;
                        uploadProgress.setAttribute('data-progress', `${percent.toFixed(1)}%`);
                    }
                    
                    if (uploadStatus) {
                        uploadStatus.textContent = `Uploading... ${percent.toFixed(1)}%`;
                    }
                    
                    // Ενημέρωση του κουμπιού
                    if (sendFileBtn && percent < 100) {
                        sendFileBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${percent.toFixed(0)}%`;
                    }
                }
            });
            
            xhr.onload = function() {
                clearTimeout(timeoutId);
                console.log('✅ Upload complete, status:', xhr.status);
                
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        console.log('✅ Server response:', data);
                        
                        if (uploadProgress) uploadProgress.style.width = '100%';
                        if (uploadStatus) {
                            uploadStatus.textContent = 'Video uploaded successfully!';
                            uploadStatus.style.color = 'var(--success)';
                        }
                        
                        if (data.success) {
                            showNotification('Video uploaded successfully!', 'success', 'Video Uploaded');
                            
                            // Κλείσιμο του preview μετά από 1.5 δευτερόλεπτα
                            setTimeout(() => {
                                cancelFileUpload();
                            }, 1500);
                            
                            resolve(data);
                        } else {
                            const errorMsg = data.error || 'Upload failed on server';
                            console.error('❌ Server error:', errorMsg);
                            showNotification('Video upload failed: ' + errorMsg, 'error', 'Upload Error');
                            reject(new Error(errorMsg));
                        }
                    } catch (parseError) {
                        console.error('❌ JSON parse error:', parseError);
                        showNotification('Video upload failed: Invalid server response', 'error', 'Upload Error');
                        reject(new Error('Invalid server response'));
                    }
                } else {
                    console.error('❌ HTTP error:', xhr.status, xhr.statusText);
                    let errorMessage;
                    
                    if (xhr.status === 413) {
                        errorMessage = 'Video file is too large (max 20MB)';
                    } else if (xhr.status === 408) {
                        errorMessage = 'Upload timeout. Please try a smaller video file.';
                    } else if (xhr.status >= 500) {
                        errorMessage = 'Server error. Please try again later.';
                    } else {
                        errorMessage = `Upload failed (${xhr.status})`;
                    }
                    
                    showNotification('Video upload failed: ' + errorMessage, 'error', 'Upload Error');
                    reject(new Error(errorMessage));
                }
            };
            
            xhr.onerror = function() {
                clearTimeout(timeoutId);
                console.error('❌ Network error during upload');
                showNotification('Video upload failed: Network error. Please check your connection.', 'error', 'Network Error');
                reject(new Error('Network error during upload'));
            };
            
            xhr.onabort = function() {
                clearTimeout(timeoutId);
                console.log('⚠️ Upload aborted');
                // Μην εμφανίσεις error αν ο χρήστης το ακύρωσε μόνος του
                if (!fileUploadInProgress) return;
                showNotification('Upload cancelled or timeout', 'warning', 'Upload Cancelled');
                reject(new Error('Upload cancelled'));
            };
            
            // Άνοιγμα και αποστολή του request
            xhr.open('POST', '/upload-video-message');
            xhr.setRequestHeader('X-Session-ID', currentUser.sessionId);
            console.log('🎬 Sending request to server...');
            xhr.send(formData);
        });
        
    } catch (error) {
        console.error('❌ Error in uploadVideo:', error);
        
        // Μην εμφανίσεις error αν είναι απλά cancellation
        if (error.message !== 'Upload cancelled') {
            showNotification('Video upload failed: ' + error.message, 'error', 'Upload Error');
        }
        
        if (uploadStatus) {
            uploadStatus.textContent = 'Upload failed!';
            uploadStatus.style.color = 'var(--accent-red)';
        }
        
        if (uploadProgress) {
            uploadProgress.style.width = '0%';
            uploadProgress.setAttribute('data-progress', '0%');
        }
        
        throw error;
    } finally {
        // Επαναφορά κατάστασης
        if (timeoutId) clearTimeout(timeoutId);
        
        fileUploadInProgress = false;
        
        if (sendFileBtn) {
            sendFileBtn.disabled = false;
            sendFileBtn.innerHTML = originalBtnText;
        }
        
        console.log('✅ Video upload process completed');
    }
}

// 🔥 ΒΟΗΘΗΤΙΚΗ: Convert file to Base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // Το reader.result είναι "data:video/mp4;base64,AAAAA..."
            // Κρατάμε μόνο το Base64 μέρος
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// 🔥 TEST FUNCTION: Simple video upload test
async function testVideoUpload() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'video/*';
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        console.log('🎬 Test: Selected file:', file.name);
        
        const formData = new FormData();
        formData.append('video', file);
        
        try {
            console.log('🎬 Test: Sending to /test-video-upload');
            const response = await fetch('/test-video-upload', {
                method: 'POST',
                body: formData
            });
            
            console.log('🎬 Test: Response status:', response.status);
            
            if (!response.ok) {
                const text = await response.text();
                console.error('❌ Test: Server returned:', text.substring(0, 200));
                showNotification('Test failed: ' + response.status, 'error', 'Test Error');
                return;
            }
            
            const data = await response.json();
            console.log('✅ Test: Success!', data);
            showNotification('Test upload successful!', 'success', 'Test Complete');
            
        } catch (error) {
            console.error('❌ Test error:', error);
            showNotification('Test failed: ' + error.message, 'error', 'Test Error');
        }
    });
    
    document.body.appendChild(fileInput);
    fileInput.click();
    setTimeout(() => {
        document.body.removeChild(fileInput);
    }, 1000);
}

// 🔥 ΕΝΗΜΕΡΩΣΗ: Enhanced cancelFileUpload function για video
function cancelFileUpload() {
    const filePreview = document.getElementById('file-preview');
    const fileInput = document.getElementById('file-upload-input');
    const uploadProgress = document.getElementById('upload-progress');
    const uploadStatus = document.getElementById('upload-status');
    const videoPreview = document.getElementById('video-preview');
    
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
    
    if (videoPreview) {
        videoPreview.src = '';
        videoPreview.style.display = 'none';
    }
    
    selectedFile = null;
    fileUploadInProgress = false;
    
    // 🔥 ΚΑΙΝΟΥΡΓΙΟ: Reset send button text
    const sendFileBtn = document.getElementById('send-file-btn');
    if (sendFileBtn) {
        sendFileBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send File';
    }
}

// 🔥 ΕΝΗΜΕΡΩΣΗ: HandleFileSelection - Προσθήκη video type validation
function handleFileSelection(file) {
    // Check file type
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 
        'application/pdf', 'text/plain', 'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    // Allowed video types
    const allowedVideoTypes = [
        'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
        'video/x-msvideo', 'video/x-matroska', 'video/x-flv'
    ];
    
    if (!allowedTypes.includes(file.type) && !allowedVideoTypes.includes(file.type)) {
        showNotification('Only images, videos (MP4, WebM, OGG), PDF and Word files are allowed!', 'error', 'Invalid File');
        return;
    }
    
    // ΑΛΛΑΓΗ: Μειώσαμε το μέγιστο μέγεθος από 30MB σε 20MB
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
    if (file.size > MAX_FILE_SIZE) {
        showNotification('File too large! Maximum size: 20MB', 'error', 'File Too Large');
        return;
    }
    
    selectedFile = file;
    
    // Show appropriate preview
    if (file.type.startsWith('video/')) {
        showVideoPreview(file);
    } else {
        showFilePreview(file);
    }
}

// ===== INITIALIZE FILE UPLOAD & EMOJI PICKER =====

// 🔥 ΑΡΧΙΚΟΠΟΙΗΣΗ FILE UPLOAD SYSTEM - FIXED: ΜΟΝΟ ΜΙΑ ΦΟΡΑ
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

// 🔥 ΚΡΙΤΙΚΟ FIX: UPLOAD FILE TO SERVER - ΜΟΝΟ ΜΙΑ ΦΟΡΑ ΑΠΟΣΤΟΛΗ
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
    
    // If it's a video, use video upload
    if (selectedFile.type.startsWith('video/')) {
        return uploadVideo();
    }
    
    // Otherwise use normal file upload (XMLHttpRequest για καλύτερο tracking)
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
    
    let timeoutId;
    
    try {
        if (uploadProgress) {
            uploadProgress.style.width = '10%';
            uploadProgress.setAttribute('data-progress', '10%');
        }
        
        if (uploadStatus) {
            uploadStatus.textContent = 'Preparing upload...';
        }
        
        if (sendFileBtn) {
            sendFileBtn.disabled = true;
            sendFileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';
        }
        
        // Χρήση Promise με XMLHttpRequest για καλύτερο control
        const uploadPromise = new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            // Timeout για 3 λεπτά
            timeoutId = setTimeout(() => {
                console.log('⏰ Upload timeout after 180 seconds');
                xhr.abort();
                reject(new Error('Upload timeout (180 seconds). Please try a smaller file or check your connection.'));
            }, 180000);
            
            // Progress tracking
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = (e.loaded / e.total) * 100;
                    console.log(`📊 Upload progress: ${percent.toFixed(1)}%`);
                    
                    if (uploadProgress) {
                        uploadProgress.style.width = `${percent}%`;
                        uploadProgress.setAttribute('data-progress', `${percent.toFixed(1)}%`);
                    }
                    
                    if (uploadStatus) {
                        uploadStatus.textContent = `Uploading... ${percent.toFixed(1)}%`;
                    }
                    
                    if (sendFileBtn && percent < 100) {
                        sendFileBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${percent.toFixed(0)}%`;
                    }
                }
            });
            
            xhr.onload = function() {
                clearTimeout(timeoutId);
                
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        resolve(data);
                    } catch (error) {
                        reject(new Error('Invalid server response'));
                    }
                } else {
                    let errorMessage;
                    if (xhr.status === 413) {
                        errorMessage = 'File is too large (max 20MB)';
                    } else if (xhr.status === 408) {
                        errorMessage = 'Upload timeout';
                    } else {
                        errorMessage = `Upload failed (${xhr.status})`;
                    }
                    reject(new Error(errorMessage));
                }
            };
            
            xhr.onerror = function() {
                clearTimeout(timeoutId);
                reject(new Error('Network error during upload'));
            };
            
            xhr.onabort = function() {
                clearTimeout(timeoutId);
                // Μην απορρίψεις error αν ο χρήστης το ακύρωσε
                if (!fileUploadInProgress) return;
                reject(new Error('Upload cancelled'));
            };
            
            xhr.open('POST', '/upload-file');
            xhr.setRequestHeader('X-Session-ID', currentUser.sessionId);
            xhr.send(formData);
        });
        
        const data = await uploadPromise;
        
        if (uploadProgress) {
            uploadProgress.style.width = '100%';
            uploadProgress.setAttribute('data-progress', '100%');
        }
        
        if (uploadStatus) {
            uploadStatus.textContent = 'Upload successful!';
            uploadStatus.style.color = 'var(--success)';
        }
        
        if (sendFileBtn) {
            sendFileBtn.innerHTML = '<i class="fas fa-check"></i> Success!';
        }
        
        if (data.success) {
            showNotification('File uploaded successfully!', 'success', 'Upload Complete');
            
            setTimeout(() => {
                cancelFileUpload();
            }, 1000);
        } else {
            throw new Error(data.error || 'Upload failed on server');
        }
        
    } catch (error) {
        console.error('Error uploading file:', error);
        
        // Μην εμφανίσεις error αν είναι cancellation
        if (error.message !== 'Upload cancelled') {
            showNotification('Upload failed: ' + error.message, 'error', 'Upload Error');
        }
        
        if (uploadStatus) {
            uploadStatus.textContent = 'Upload failed!';
            uploadStatus.style.color = 'var(--accent-red)';
        }
        
        if (uploadProgress) {
            uploadProgress.style.width = '0%';
            uploadProgress.setAttribute('data-progress', '0%');
        }
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        
        isUploading = false;
        fileUploadInProgress = false;
        
        if (sendFileBtn) {
            sendFileBtn.disabled = false;
            sendFileBtn.innerHTML = originalBtnText;
        }
        
        console.log('✅ File upload process completed');
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

// 🔥 ΕΝΗΜΕΡΩΣΗ: Enhanced initializeUploadAndEmojiListeners function
function initializeUploadAndEmojiListeners() {
    console.log('🔄 Initializing upload and emoji listeners');
    
    if (!fileUploadListenersInitialized) {
        initFileUploadSystem();
    }
    
    initVideoUploadSystem(); // 🔥 ΝΕΟ: Initialize video upload
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
                uploadFile(); // This will handle both files and videos
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

// 🔥 ΕΝΗΜΕΡΩΣΗ: Enhanced addMessageToChat function for videos
function addMessageToChat(message) {
    // 🔥 ΠΡΟΣΘΗΚΗ: Μετατροπή μορφής μηνύματος
    message = convertMessageFormat(message);
    
    const messagesContainer = document.getElementById("messages-container");
    const messageDiv = document.createElement("div");
    const isOwn = message.sender === currentUser.username;

    messageDiv.className = `message ${isOwn ? "own" : "other"}`;
    
    // Check if it's a file (including video)
    // 🔥 ΑΛΛΑΓΗ: Έλεγχος για video_data ΚΑΙ file_data
    const hasFileData = message.file_data || message.video_data;
    const fileData = message.file_data || message.video_data || message;
    
    if (hasFileData) {
        const fileExtension = fileData.fileName ? fileData.fileName.split('.').pop().toLowerCase() : '';
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(fileExtension);
        const isVideo = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mpeg', 'mkv', 'wmv', 'flv'].includes(fileExtension);
        
        if (isImage && fileData.fileUrl) {
            // Image - show preview
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
        } else if (isVideo && fileData.fileUrl) {
            // 🔥 ΒΕΛΤΙΩΣΗ: Βελτιωμένο video player με καλύτερο styling
            messageDiv.innerHTML = `
                <div class="message-header">
                    <span class="message-sender">${message.sender}</span>
                    <span class="message-time">${message.time || getCurrentTime()}</span>
                </div>
                <div class="message-file">
                    <div class="video-message-preview">
                        <video controls playsinline preload="metadata" class="message-video" style="width: 100%; max-width: 300px; border-radius: 8px;">
                            <source src="${fileData.fileUrl}" type="${fileData.fileType || 'video/mp4'}">
                            Your browser does not support the video tag.
                        </video>
                        <div class="video-message-controls">
                            <span class="video-message-title">
                                <i class="fas fa-video"></i> ${fileData.fileName.length > 30 ? fileData.fileName.substring(0, 30) + '...' : fileData.fileName}
                            </span>
                            <a href="${fileData.fileUrl}" download="${fileData.fileName}" class="video-message-download" title="Download video">
                                <i class="fas fa-download"></i>
                            </a>
                        </div>
                    </div>
                    <div class="file-info" style="margin-top: 8px;">
                        <a href="${fileData.fileUrl}" download="${fileData.fileName}" class="file-download-btn">
                            <i class="fas fa-download"></i> Download Video (${fileData.fileSize})
                        </a>
                    </div>
                </div>
            `;
            
            // Προσθήκη click handler για fullscreen
            setTimeout(() => {
                const videoElement = messageDiv.querySelector('.message-video');
                if (videoElement) {
                    videoElement.addEventListener('click', function(e) {
                        if (!e.target.classList.contains('video-message-download')) {
                            openVideoPreview(fileData.fileUrl, fileData.fileType);
                        }
                    });
                }
            }, 100);
        } else {
            // Other file - show download link
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
                                <i class="fas fa-download"></i> Download
                            </a>
                        </div>
                    </div>
                </div>
            `;
        }
    } else {
        // Text message
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

// 🔥 ΝΕΟ: Open video in fullscreen modal
function openVideoPreview(videoUrl, videoType) {
    const modal = document.createElement('div');
    modal.className = 'video-preview-modal active';
    modal.innerHTML = `
        <div class="video-preview-content">
            <button class="close-video-preview" onclick="closeVideoPreview()">×</button>
            <video controls autoplay class="full-size-video">
                <source src="${videoUrl}" type="${videoType || 'video/mp4'}">
                Your browser does not support the video tag.
            </video>
            <div class="video-actions">
                <a href="${videoUrl}" download class="btn btn-primary">
                    <i class="fas fa-download"></i> Download Video
                </a>
                <button class="btn btn-secondary" onclick="closeVideoPreview()">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Auto-play
    setTimeout(() => {
        const video = modal.querySelector('.full-size-video');
        if (video) {
            video.play().catch(e => console.log("Auto-play prevented:", e));
        }
    }, 100);
}

function closeVideoPreview() {
    const modal = document.querySelector('.video-preview-modal');
    if (modal) {
        const video = modal.querySelector('video');
        if (video) {
            video.pause();
        }
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
            </div>
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
        showNotification("Could not load profile information", 'error', 'Profile Error');
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
            showNotification(
                `${data.sender} sent a file: ${data.fileName}`,
                "info",
                "New File"
            );
        }
    }
});

// 🔥 ΚΡΙΤΙΚΟ: WebSocket event για video upload
socket.on("video_upload", (data) => {
    console.log("🎬 Video upload received via WebSocket:", data);
    
    // Έλεγχος αν το video αφορά το τρέχον chat
    const shouldDisplay = (
        (currentRoom.isPrivate && 
         ((data.sender === currentRoom.name && data.receiver === currentUser.username) ||
          (data.receiver === currentRoom.name && data.sender === currentUser.username))) ||
        (!currentRoom.isPrivate && data.room_id === currentRoom.id)
    );
    
    if (shouldDisplay) {
        console.log("✅ Displaying video in current chat:", data.fileName);
        
        // Δημιουργία του μηνύματος για το video
        const videoMessage = {
            sender: data.sender,
            time: data.time || getCurrentTime(),
            isFile: true,
            video_data: {
                fileId: data.fileId,
                fileName: data.fileName,
                fileType: data.fileType,
                fileSize: data.fileSize,
                fileUrl: data.fileUrl
            }
        };
        
        addMessageToChat(videoMessage);
        
        // Scroll to bottom
        const messagesContainer = document.getElementById("messages-container");
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        
        // Show notification only if we're not the sender
        if (data.sender !== currentUser.username) {
            showNotification(
                `${data.sender} sent a video: ${data.fileName}`,
                "info",
                "New Video"
            );
        }
    } else {
        console.log("ℹ️ Video received but not for current chat");
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
    
    // Προσθήκη debugging logs για video upload system
    console.log('🔧 Video upload system initialized');
    console.log('🔧 Using SIMPLE upload method for all videos (server supports only /upload-video-message)');

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

    // 🔥 ΕΝΗΜΕΡΩΣΗ: Enhanced CSS styles
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
        
        /* CSS για disabled copy button */
        #copy-invite-btn:disabled {
            opacity: 0.5 !important;
            cursor: not-allowed !important;
        }
        #copy-invite-btn:disabled:hover {
            background: transparent !important;
            transform: none !important;
        }
        
        /* Avatar styling */
        .member-avatar, #sidebar-avatar, .friend-avatar {
            overflow: hidden;
        }
        
        .member-avatar img, #sidebar-avatar img, .friend-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 50%;
        }
        
        /* Message text better wrapping */
        .message-text {
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-wrap: break-word;
            word-break: break-word;
        }
        
        /* File upload preview styling */
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
        
        /* Image preview modal */
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
        
        /* Video upload preview */
        .video-upload-preview {
            width: 100px;
            height: 100px;
            border-radius: var(--radius);
            object-fit: cover;
            border: 2px solid var(--border-color);
            background: #000;
        }
        
        /* Video message styling */
        .video-message-preview {
            max-width: 300px;
            border-radius: var(--radius);
            background: #000;
            overflow: hidden;
            margin-top: 5px;
        }
        
        .message-video {
            width: 100%;
            height: auto;
            border-radius: var(--radius);
            cursor: pointer;
            display: block;
        }
        
        .video-message-controls {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: rgba(0, 0, 0, 0.7);
        }
        
        .video-message-title {
            color: white;
            font-size: 0.85rem;
            display: flex;
            align-items: center;
            gap: 5px;
            max-width: 80%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .video-message-download {
            color: white;
            text-decoration: none;
            font-size: 0.9rem;
            padding: 5px 8px;
            border-radius: 4px;
            transition: all 0.2s ease;
        }
        
        .video-message-download:hover {
            background: rgba(139, 0, 0, 0.5);
        }
        
        /* Video preview modal */
        .video-preview-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .video-preview-content {
            position: relative;
            max-width: 90%;
            max-height: 90%;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        
        .full-size-video {
            max-width: 100%;
            max-height: 80vh;
            border-radius: var(--radius);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        }
        
        .close-video-preview {
            position: absolute;
            top: -40px;
            right: 0;
            background: none;
            border: none;
            color: white;
            font-size: 2rem;
            cursor: pointer;
            padding: 5px;
            transition: color 0.2s ease;
        }
        
        .close-video-preview:hover {
            color: var(--accent-red);
        }
        
        .video-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
            justify-content: center;
        }
    `;
    document.head.appendChild(unreadStyle);

    const savedUser = getUserFromLocalStorage();
    
    // 🔥 ΕΙΔΙΚΗ ΕΠΕΞΕΡΓΑΣΙΑ: Έλεγχος αν πρέπει να επαναφέρουμε chat
    const chatState = loadChatState();
    const lastPageId = localStorage.getItem('ratscape_last_page') || 'home-page';
    
    if (chatState && lastPageId === 'chat-page') {
        console.log('🔄 Προσπάθεια επαναφοράς chat:', chatState);
        
        // Δείξε το chat page αμέσως (αλλά χωρίς περιεχόμενο ακόμα)
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

                    // 🔥 ΕΙΔΙΚΟ: Αν έχουμε αποθηκευμένο chat state, επαναφέρουμε το chat
                    if (chatState && lastPageId === 'chat-page') {
                        console.log('🚀 Επαναφορά chat από saved state...');
                        
                        // Ενημέρωση του currentRoom
                        currentRoom = {
                            id: chatState.roomId,
                            name: chatState.roomName,
                            inviteCode: chatState.inviteCode,
                            isPrivate: chatState.isPrivate
                        };
                        
                        // Ενημέρωση UI
                        document.getElementById("room-name-sidebar").textContent = chatState.roomName;
                        document.getElementById("room-name-header").textContent = chatState.roomName;
                        
                        if (chatState.isPrivate) {
                            // Private chat
                            document.getElementById("room-description").textContent = `Private conversation with ${chatState.roomName}`;
                            document.getElementById("room-status").textContent = "Private chat";
                            document.getElementById("room-status").classList.add("private-chat");
                            document.getElementById("room-invite-code").textContent = "";
                            document.getElementById("invite-code-container").classList.add("hide-for-private");
                            document.getElementById("copy-invite-btn").style.display = "none";
                            
                            // Φόρτωση του avatar του χρήστη
                            const sidebarAvatar = document.getElementById("sidebar-avatar");
                            if (sidebarAvatar) {
                                loadUserAvatar(currentUser.username, sidebarAvatar, true);
                            }
                            
                            // Φόρτωση private messages
                            loadPrivateMessages(chatState.roomName);
                            
                            // Εμφάνιση μελών
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
                            
                            // Φόρτωση avatars για τα μέλη
                            setTimeout(() => {
                                loadMemberAvatars();
                                makeMemberItemsClickable();
                            }, 100);
                            
                        } else {
                            // Group room
                            document.getElementById("room-invite-code").textContent = chatState.inviteCode || "------";
                            document.getElementById("invite-code-container").classList.remove("hide-for-private");
                            document.getElementById("copy-invite-btn").style.display = "flex";
                            document.getElementById("copy-invite-btn").disabled = false;
                            
                            // Join στο room μέσω WebSocket
                            socket.emit("join room", {
                                roomId: chatState.roomId,
                                username: currentUser.username,
                                sessionId: currentUser.sessionId,
                            });
                        }
                        
                        showPage('chat-page');
                        
                    } else {
                        // Κανονική ροή - χωρίς chat επαναφορά
                        const lastPage = getLastPage();
                        showPage(lastPage);
                    }

                    socket.emit("authenticate", {
                        username: currentUser.username,
                        sessionId: currentUser.sessionId,
                    });

                    // 🔥 Φόρτωση avatar του χρήστη
                    loadCurrentUserAvatar();
                    
                    // 🔥 Φόρτωση offline notifications
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
        // 🔥 Αν δεν υπάρχει συνδεδεμένος χρήστης, αλλά έχουμε chat state, το καθαρίζουμε
        if (chatState) {
            clearChatState();
        }
        console.log("ℹ️ No saved user, staying on current page");
    }

    console.log("✅ Ready to chat!");
});

// Αποθήκευση κατάστασης πριν το refresh
window.addEventListener('beforeunload', function() {
    if (currentRoom.id) {
        saveChatState();
    }
});
