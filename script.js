// Firebase SDK imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    collection, 
    addDoc, 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    serverTimestamp, 
    updateDoc 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { 
    getDatabase, 
    ref, 
    set, 
    get,
    onValue,
    update
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBRTGz_G8DBvQbvF8YwGCN9rre-F8GGTD8",
    authDomain: "room-finder-v1.firebaseapp.com",
    databaseURL: "https://room-finder-v1-default-rtdb.firebaseio.com",
    projectId: "room-finder-v1",
    storageBucket: "room-finder-v1.appspot.com",
    messagingSenderId: "156456101448",
    appId: "1:156456101448:web:2639d6d24d58862043da7d",
    measurementId: "G-3QCM5F74WQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);

// DOM Elements
const appContainer = document.getElementById('app-container');
const loginContainer = document.getElementById('login-container');
const displayNameInput = document.getElementById('display-name');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const authBtn = document.getElementById('auth-btn');
const toggleLink = document.getElementById('toggle-link');
const toggleText = document.getElementById('toggle-text');
const errorMessage = document.getElementById('error-message');
const chatSearchInput = document.getElementById('chat-search');

const userNameEl = document.getElementById('user-name');
const userAvatarEl = document.getElementById('user-avatar');
const logoutBtn = document.getElementById('logout-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const chatsListEl = document.getElementById('chats-list');

const welcomeScreen = document.getElementById('welcome-screen');
const chatArea = document.getElementById('chat-area');
const chatContactName = document.getElementById('chat-contact-name');
const chatAvatar = document.getElementById('chat-avatar');
const chatStatus = document.getElementById('chat-status');
const messagesContainer = document.getElementById('messages-container');
const chatInputForm = document.getElementById('chat-input-form');
const messageInput = document.getElementById('message-input');

const newChatModal = document.getElementById('new-chat-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const usersListEl = document.getElementById('users-list');

// App State
let currentUser = null;
let activeChatId = null;
let activeChatContact = null;
let unsubscribeChats = null;
let unsubscribeMessages = null;
let isLogin = true;
let allUsers = [];

// Helper function to handle inconsistent name fields
function getUserDisplayName(userData) {
    if (userData.name) return userData.name;
    if (userData.fullName) return userData.fullName;
    if (userData.email) return userData.email.split('@')[0];
    return 'Unknown User';
}

// Authentication Logic
toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isLogin = !isLogin;
    displayNameInput.classList.toggle('hidden', isLogin);
    authBtn.textContent = isLogin ? 'Login' : 'Create Account';
    toggleText.textContent = isLogin ? "Don't have an account?" : "Already have an account?";
    toggleLink.textContent = isLogin ? "Sign up now" : "Log in";
});

authBtn.addEventListener('click', async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    const name = displayNameInput.value;

    // Clear previous errors
    errorMessage.style.display = 'none';

    if (!email || !password) {
        showError("Please enter both email and password");
        return;
    }

    if (!isLogin && !name) {
        showError("Please enter your name for signup");
        return;
    }

    try {
        if (isLogin) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            // Save user data to Realtime DB
            await set(ref(rtdb, 'users/' + userCredential.user.uid), {
                name: name,
                email: email,
                uid: userCredential.user.uid,
                lastSeen: Date.now()
            });
        }
    } catch (error) {
        showError(`Authentication failed: ${error.message}`);
        console.error("Authentication error:", error);
    }
});

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
    if (unsubscribeChats) unsubscribeChats();
    if (unsubscribeMessages) unsubscribeMessages();
    
    if (user) {
        // Fetch user data from Realtime DB
        const userRef = ref(rtdb, 'users/' + user.uid);
        const snapshot = await get(userRef);
        
        if (snapshot.exists()) {
            const userData = snapshot.val();
            currentUser = { 
                uid: user.uid, 
                ...userData,
                displayName: getUserDisplayName(userData)
            };
            loginContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');
            setupUIForUser();
        } else {
            showError("User data not found. Please contact support.");
            signOut(auth);
        }
    } else {
        currentUser = null;
        appContainer.classList.add('hidden');
        loginContainer.classList.remove('hidden');
    }
});

// UI Setup & Rendering
function setupUIForUser() {
    // Set user profile info
    userNameEl.textContent = currentUser.displayName;
    userAvatarEl.textContent = currentUser.displayName.charAt(0).toUpperCase();
    
    // Update user status to online
    update(ref(rtdb, 'users/' + currentUser.uid), {
        online: true,
        lastSeen: Date.now()
    });
    
    // Render chats list
    renderChatsList();
    
    // Set up event listeners
    newChatBtn.addEventListener('click', openNewChatModal);
    closeModalBtn.addEventListener('click', () => newChatModal.classList.add('hidden'));
    chatSearchInput.addEventListener('input', filterChats);
}

async function renderChatsList() {
    if (unsubscribeChats) unsubscribeChats();
    chatsListEl.innerHTML = '<div class="spinner"></div>';
    
    // Query for chats that include the current user
    const q = query(collection(db, "chats"), where("members", "array-contains", currentUser.uid));
    
    unsubscribeChats = onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) {
            chatsListEl.innerHTML = '<div class="no-chats">No chats yet. Start a new conversation!</div>';
            return;
        }
        
        const chats = [];
        for (const doc of snapshot.docs) {
            const chatData = { id: doc.id, ...doc.data() };
            const otherUserId = chatData.members.find(uid => uid !== currentUser.uid);
            
            if (otherUserId) {
                const userRef = ref(rtdb, 'users/' + otherUserId);
                const userSnapshot = await get(userRef);
                if (userSnapshot.exists()) {
                    const userData = userSnapshot.val();
                    chatData.otherUser = { 
                        uid: otherUserId, 
                        ...userData,
                        displayName: getUserDisplayName(userData)
                    };
                    chats.push(chatData);
                }
            }
        }
        
        // Sort chats by last updated time
        chats.sort((a, b) => (b.lastUpdated?.toMillis() || 0) - (a.lastUpdated?.toMillis() || 0));
        
        // Render chats list
        chatsListEl.innerHTML = '';
        chats.forEach(chat => {
            const otherUser = chat.otherUser;
            if (!otherUser) return;
            
            const lastTime = chat.lastUpdated?.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) || '';
            
            const chatItem = document.createElement('div');
            chatItem.className = 'chat-item';
            if (chat.id === activeChatId) chatItem.classList.add('active');
            
            chatItem.innerHTML = `
                <div class="avatar">
                    ${otherUser.displayName.charAt(0).toUpperCase()}
                </div>
                <div class="chat-details">
                    <div class="name">
                        ${otherUser.displayName}
                        ${otherUser.online ? '<span class="online-dot"></span>' : ''}
                    </div>
                    <div class="last-message">${chat.lastMessage?.text || 'Start a conversation'}</div>
                    <div class="last-time">${lastTime}</div>
                </div>
            `;
            
            chatItem.addEventListener('click', () => selectChat(chat.id, otherUser));
            chatsListEl.appendChild(chatItem);
        });
    });
}

function filterChats() {
    const searchTerm = chatSearchInput.value.toLowerCase();
    const chatItems = document.querySelectorAll('.chat-item');
    
    chatItems.forEach(item => {
        const name = item.querySelector('.name').textContent.toLowerCase();
        if (name.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function selectChat(chatId, otherUser) {
    activeChatId = chatId;
    activeChatContact = otherUser;
    
    // Update UI
    welcomeScreen.classList.add('hidden');
    chatArea.classList.remove('hidden');
    chatContactName.textContent = otherUser.displayName;
    chatAvatar.textContent = otherUser.displayName.charAt(0).toUpperCase();
    
    // Update status
    updateUserStatus(otherUser.uid);
    
    // Render messages for this chat
    renderMessages(chatId);
    
    // Update active chat in sidebar
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelectorAll('.chat-item').forEach(item => {
        if (item.querySelector('.name').textContent.includes(otherUser.displayName)) {
            item.classList.add('active');
        }
    });
}

function updateUserStatus(userId) {
    const userRef = ref(rtdb, 'users/' + userId);
    onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
            const userData = snapshot.val();
            const isOnline = userData.online;
            const statusText = isOnline ? '<span class="online-dot"></span> Online' : 
                `Last seen ${new Date(userData.lastSeen).toLocaleTimeString()}`;
            chatStatus.innerHTML = statusText;
        }
    });
}

function renderMessages(chatId) {
    if (unsubscribeMessages) unsubscribeMessages();
    messagesContainer.innerHTML = '';
    
    const messagesQuery = query(
        collection(db, "chats", chatId, "messages"), 
        orderBy("timestamp")
    );
    
    unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === "added") {
                const msg = change.doc.data();
                const messageDiv = document.createElement('div');
                messageDiv.classList.add('message', msg.senderId === currentUser.uid ? 'sent' : 'received');
                
                const time = msg.timestamp?.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) || 'just now';
                messageDiv.innerHTML = `
                    <span>${msg.text}</span>
                    <span class="timestamp">${time}</span>
                `;
                
                messagesContainer.appendChild(messageDiv);
            }
        });
        
        // Scroll to bottom
        scrollToBottom();
    });
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Chat Logic
chatInputForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (text === '' || !activeChatId) return;
    
    try {
        // Add new message
        await addDoc(collection(db, "chats", activeChatId, "messages"), {
            text: text,
            senderId: currentUser.uid,
            timestamp: serverTimestamp()
        });
        
        // Update chat last message
        await updateDoc(doc(db, "chats", activeChatId), {
            lastMessage: { text: text },
            lastUpdated: serverTimestamp()
        });
        
        messageInput.value = '';
        scrollToBottom();
    } catch (error) {
        console.error("Error sending message:", error);
        showError("Failed to send message. Please try again.");
    }
});

// New Chat Modal
async function openNewChatModal() {
    newChatModal.classList.remove('hidden');
    usersListEl.innerHTML = '<div class="spinner"></div>';
    
    try {
        // Fetch all users from Realtime DB
        const usersRef = ref(rtdb, 'users');
        const snapshot = await get(usersRef);
        usersListEl.innerHTML = '';
        
        if (!snapshot.exists()) {
            usersListEl.innerHTML = '<div class="no-users">No other users found</div>';
            return;
        }
        
        const users = [];
        snapshot.forEach(childSnapshot => {
            const user = { uid: childSnapshot.key, ...childSnapshot.val() };
            if (user.uid !== currentUser.uid) {
                user.displayName = getUserDisplayName(user);
                users.push(user);
            }
        });
        
        allUsers = users;
        
        if (users.length === 0) {
            usersListEl.innerHTML = '<div class="no-users">No other users to chat with</div>';
            return;
        }
        
        renderUsersList(users);
        
    } catch (error) {
        console.error("Error loading users:", error);
        usersListEl.innerHTML = '<div class="error">Failed to load users</div>';
    }
}

function renderUsersList(users) {
    usersListEl.innerHTML = '';
    
    users.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        
        userItem.innerHTML = `
            <div class="avatar">${user.displayName.charAt(0).toUpperCase()}</div>
            <div class="user-info">
                <div class="name">${user.displayName}</div>
                <div class="email">${user.email}</div>
            </div>
        `;
        
        userItem.addEventListener('click', () => startNewChat(user));
        usersListEl.appendChild(userItem);
    });
}

async function startNewChat(otherUser) {
    // Create unique chat ID by combining sorted user IDs
    const chatId = [currentUser.uid, otherUser.uid].sort().join('_');
    const chatDocRef = doc(db, "chats", chatId);
    
    try {
        const chatDoc = await getDoc(chatDocRef);
        
        // Create chat if it doesn't exist
        if (!chatDoc.exists()) {
            await setDoc(chatDocRef, {
                members: [currentUser.uid, otherUser.uid],
                lastUpdated: serverTimestamp(),
                created: serverTimestamp()
            });
        }
        
        newChatModal.classList.add('hidden');
        selectChat(chatId, otherUser);
        
    } catch (error) {
        console.error("Error creating chat:", error);
        showError("Failed to start chat. Please try again.");
    }
}

// Cleanup when window is closed
window.addEventListener('beforeunload', () => {
    if (currentUser) {
        update(ref(rtdb, 'users/' + currentUser.uid), {
            online: false,
            lastSeen: Date.now()
        });
    }
});