// Конфигурация Firebase (ЗАМЕНИТЕ НА СВОИ ДАННЫЕ ИЗ ШАГА 1)
const firebaseConfig = {
  apiKey: "AIzaSyAMLHgbgScQa9jsLrWpEZ79BdspDG1K8xI",
  authDomain: "danumesss.firebaseapp.com",
  projectId: "danumesss",
  storageBucket: "danumesss.firebasestorage.app",
  messagingSenderId: "698592417925",
  appId: "1:698592417925:web:2422abf4bba42a57b571ec",
  measurementId: "G-J6Z6ZSV9S0"
};

// Инициализация сервисов Google
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

let myUsername = null; 
let myCleanId = null; // Чистый ID без точек для базы данных
let activeChatUser = null;
let typingTimeout = null;
let replyingToMsgId = null;
let editingMsgId = null;
let activeContextMenu = null;
let isLoginMode = true;

// Элементы UI
const authScreen = document.getElementById('authScreen');
const appScreen = document.getElementById('appScreen');
const authTitle = document.getElementById('authTitle');
const authBtn = document.getElementById('authBtn');
const toggleAuth = document.getElementById('toggleAuth');
const userSearchInput = document.getElementById('userSearchInput');
const startChatBtn = document.getElementById('startChatBtn');
const chatsList = document.getElementById('chatsList');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const activeChatName = document.getElementById('activeChatName');
const activeChatStatus = document.getElementById('activeChatStatus');
const attachBtn = document.getElementById('attachBtn');
const imageInput = document.getElementById('imageInput');

// Переключатель Вход / Регистрация
toggleAuth.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? 'Вход в Danumes' : 'Регистрация в Danumes';
    authBtn.innerText = isLoginMode ? 'Войти' : 'Создать аккаунт';
    toggleAuth.innerText = isLoginMode ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти';
});

// Логика работы кнопки Входа / Регистрации
authBtn.addEventListener('click', () => {
    const email = document.getElementById('authUsername').value.trim().toLowerCase();
    const password = document.getElementById('authPassword').value.trim();

    if (!email || !password) return alert('Заполните все поля!');
    if (password.length < 6) return alert('Пароль должен быть не менее 6 символов!');

    if (isLoginMode) {
        // ВХОД В АККАУНТ
        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                myUsername = email;
                myCleanId = email.replace(/\./g, ','); // Firebase не любит точки в путях
                startApp();
            })
            .catch((error) => {
                alert('Ошибка входа: ' + error.message);
            });
    } else {
        // РЕГИСТРАЦИЯ НОВОГО ПОЛЬЗОВАТЕЛЯ
        auth.createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                alert('Регистрация успешна! Теперь нажмите "Войти".');
                toggleAuth.click();
            })
            .catch((error) => {
                alert('Ошибка регистрации: ' + error.message);
            });
    }
});

function startApp() {
    authScreen.style.display = 'none';
    appScreen.style.display = 'flex';
    document.getElementById('myUsername').innerText = myUsername;
    document.getElementById('myAvatar').innerText = myUsername.charAt(0).toUpperCase();

    listenToMessages();
    listenToTyping();
}

startChatBtn.addEventListener('click', () => {
    const targetUser = userSearchInput.value.trim().toLowerCase();
    if (!targetUser) return alert('Введите Email друга!');
    if (targetUser === myUsername) return alert('Нельзя писать самому себе!');
    
    openChatWith(targetUser);
    userSearchInput.value = '';
});

function openChatWith(username) {
    activeChatUser = username;
    activeChatName.innerText = username;
    activeChatStatus.innerText = 'в сети';
    activeChatStatus.className = '';
    
    messageInput.disabled = false;
    sendBtn.disabled = false;
    attachBtn.disabled = false;
    messageInput.focus();
    
    closeActiveAction();
    rebuildChatsList();
    renderMessages();
}
let globalMessagesList = [];

// Очищаем Email от точек для создания путей в Firebase
function cleanEmail(email) {
    return email.replace(/\./g, ',');
}

// Генерируем уникальный ID комнаты для двоих пользователей
function getChatRoomId(user1, user2) {
    return [cleanEmail(user1), cleanEmail(user2)].sort().join('_');
}

// Отправка сообщений
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !activeChatUser) return;

    const roomId = getChatRoomId(myUsername, activeChatUser);
    const mRef = database.ref('chats/' + roomId);

    if (editingMsgId) {
        mRef.child(editingMsgId).update({
            text: text,
            isEdited: true
        });
    } else {
        const newMsgRef = mRef.push();
        newMsgRef.set({
            id: newMsgRef.key,
            from: myUsername,
            to: activeChatUser,
            text: text,
            replyTo: replyingToMsgId || null,
            time: new Date().toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
            })
        });
    }
    
    closeActiveAction();
    messageInput.value = '';
    sendTypingStatus(false);
}

// Отправка картинок
attachBtn.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file || !activeChatUser) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const rId = getChatRoomId(myUsername, activeChatUser);
        const newMsgRef = database.ref('chats/' + rId).push();
        newMsgRef.set({
            id: newMsgRef.key,
            from: myUsername,
            to: activeChatUser,
            image: e.target.result,
            replyTo: replyingToMsgId || null,
            time: new Date().toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
            })
        });
        closeActiveAction();
    };
    reader.readAsDataURL(file);
    imageInput.value = '';
});

// Прослушивание базы данных Firebase
function listenToMessages() {
    database.ref('chats').on('value', (snapshot) => {
        globalMessagesList = [];
        const chats = snapshot.val();
        if (chats) {
            const myClean = cleanEmail(myUsername);
            Object.keys(chats).forEach(roomId => {
                if (roomId.includes(myClean)) {
                    Object.values(chats[roomId]).forEach(msg => {
                        globalMessagesList.push(msg);
                    });
                }
            });
        }
        rebuildChatsList();
        renderMessages();
    });
}

// Обновление списка чатов слева
function rebuildChatsList() {
    const dialogs = new Set();
    globalMessagesList.forEach(m => {
        if (m.from === myUsername) dialogs.add(m.to);
        if (m.to === myUsername) dialogs.add(m.from);
    });
    if (activeChatUser) dialogs.add(activeChatUser);

    chatsList.innerHTML = '';
    dialogs.forEach(user => {
        const isActive = user === activeChatUser ? 'active' : '';
        const chatMsgs = globalMessagesList.filter(m => 
            (m.from === myUsername && m.to === user) || 
            (m.from === user && m.to === myUsername)
        );
        const lastMsg = chatMsgs[chatMsgs.length - 1];
        let textPreview = 'Нет сообщений';
        if (lastMsg) {
            textPreview = lastMsg.image ? '📷 Фото' : lastMsg.text;
        }

        const div = document.createElement('div');
        div.className = `chat-item ${isActive}`;
        div.innerHTML = `
            <div class="chat-avatar">${user.charAt(0).toUpperCase()}</div>
            <div class="chat-details">
                <h4>${user}</h4>
                <p>${textPreview}</p>
            </div>
        `;
        div.onclick = () => openChatWith(user);
        chatsList.appendChild(div);
    });
}
// Отрисовка сообщений
function renderMessages() {
    if (!activeChatUser) return;
    messagesContainer.innerHTML = '';

    const currentChatMessages = globalMessagesList.filter(m => 
        (m.from === myUsername && m.to === activeChatUser) || 
        (m.from === activeChatUser && m.to === myUsername)
    );

    if (currentChatMessages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="placeholder-text">
                Здесь пока пусто. Напишите первое сообщение!
            </div>`;
        return;
    }

    currentChatMessages.forEach(m => {
        const isOut = m.from === myUsername;
        const div = document.createElement('div');
        div.className = `message ${isOut ? 'outgoing' : 'incoming'}`;
        div.dataset.id = m.id;

        // Плашка ответа (цитирование)
        if (m.replyTo) {
            const orig = globalMessagesList.find(o => o.id === m.replyTo);
            if (orig) {
                const quoteDiv = document.createElement('div');
                quoteDiv.className = 'reply-quote-block';
                const name = orig.from === myUsername ? 'Вы' : orig.from;
                const txt = orig.image ? '📷 Фото' : orig.text;
                quoteDiv.innerHTML = `<b>${name}</b><span>${txt}</span>`;
                div.appendChild(quoteDiv);
            }
        }

        // Текст сообщения
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        if (m.text) textDiv.innerText = m.text;
        div.appendChild(textDiv);

        // Картинка
        if (m.image) {
            const img = document.createElement('img');
            img.src = m.image;
            img.className = 'message-image';
            div.appendChild(img);
        }

        // Подвал: время и статус изменения
        const footerDiv = document.createElement('div');
        footerDiv.style.display = 'flex';
        footerDiv.style.justifyContent = 'flex-end';
        footerDiv.style.alignItems = 'center';
        footerDiv.style.marginTop = '4px';

        if (m.isEdited) {
            const edSpan = document.createElement('span'); 
            edSpan.className = 'edited-marker'; 
            edSpan.innerText = 'изм.'; 
            footerDiv.appendChild(edSpan);
        }

        const timeSpan = document.createElement('span'); 
        timeSpan.className = 'message-time'; 
        timeSpan.innerText = m.time;
        footerDiv.appendChild(timeSpan);
        div.appendChild(footerDiv);

        // Кнопка три точки
        const trigger = document.createElement('div');
        trigger.className = 'message-actions-trigger'; 
        trigger.innerText = '•••';
        trigger.onclick = (e) => { 
            e.stopPropagation(); 
            showContextMenu(e, m); 
        };
        div.appendChild(trigger);

        // Реакции под сообщением
        if (m.reactions) {
            const rContainer = document.createElement('div');
            rContainer.className = 'message-reactions-container';
            Object.entries(m.reactions).forEach(([emoji, uList]) => {
                const badge = document.createElement('div');
                const hasMy = uList.includes(myCleanId);
                badge.className = `reaction-badge ${hasMy ? 'my-reacted' : ''}`;
                badge.innerHTML = `<span>${emoji}</span><small>${uList.length}</small>`;
                badge.onclick = (e) => { 
                    e.stopPropagation(); 
                    sendReaction(m.id, emoji); 
                };
                rContainer.appendChild(badge);
            });
            div.appendChild(rContainer);
        }

        div.oncontextmenu = (e) => { 
            e.preventDefault(); 
            showContextMenu(e, m); 
        };
        messagesContainer.appendChild(div);
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Контекстное меню действий (как в Telegram)
function showContextMenu(e, msg) {
    removeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'msg-context-menu'; 
    menu.style.top = `${e.clientY}px`; 
    menu.style.left = `${e.clientX}px`;

    const rRow = document.createElement('div'); 
    rRow.className = 'reactions-picker-row';
    ['👍', '❤️', '🔥', '😂', '😮', '😢'].forEach(emoji => {
        const btn = document.createElement('button'); 
        btn.className = 'reaction-picker-btn'; 
        btn.innerText = emoji;
        btn.onclick = () => { 
            sendReaction(msg.id, emoji); 
            removeContextMenu(); 
        };
        rRow.appendChild(btn);
    });
    menu.appendChild(rRow);

    const replyBtn = document.createElement('button'); 
    replyBtn.className = 'msg-menu-item'; 
    replyBtn.innerText = 'Ответить';
    replyBtn.onclick = () => { 
        setupReply(msg); 
        removeContextMenu(); 
    };
    menu.appendChild(replyBtn);

    if (msg.from === myUsername) {
        if (!msg.image) {
            const editBtn = document.createElement('button'); 
            editBtn.className = 'msg-menu-item'; 
            editBtn.innerText = 'Изменить';
            editBtn.onclick = () => { 
                setupEdit(msg); 
                removeContextMenu(); 
            };
            menu.appendChild(editBtn);
        }
        const deleteBtn = document.createElement('button'); 
        deleteBtn.className = 'msg-menu-item delete-item'; 
        deleteBtn.innerText = 'Удалить';
        deleteBtn.onclick = () => {
            if (confirm('Удалить сообщение для всех?')) {
                const rId = getChatRoomId(myUsername, activeChatUser);
                database.ref('chats/' + rId + '/' + msg.id).remove();
            }
            removeContextMenu();
        };
        menu.appendChild(deleteBtn);
    }
    document.body.appendChild(menu);
    activeContextMenu = menu;
}

function removeContextMenu() { 
    if (activeContextMenu) { 
        activeContextMenu.remove(); 
        activeContextMenu = null; 
    } 
}
document.addEventListener('click', removeContextMenu);

// Переключение реакций
function sendReaction(msgId, emoji) {
    const rId = getChatRoomId(myUsername, activeChatUser);
    const rRef = database.ref(
        'chats/' + rId + '/' + msgId + '/reactions/' + emoji
    );
    rRef.once('value', snapshot => {
        let currentUsers = snapshot.val() || [];
        const index = currentUsers.indexOf(myCleanId);
        if (index !== -1) {
            currentUsers.splice(index, 1);
        } else {
            currentUsers.push(myCleanId);
        }
        rRef.set(currentUsers);
    });
}

function setupReply(msg) { 
    closeActiveAction(); 
    replyingToMsgId = msg.id; 
    actionPreviewTitle.innerText = `Ответ пользователю ${msg.from}`; 
    actionPreviewText.innerText = msg.image ? '📷 Фото' : msg.text; 
    actionPreviewArea.style.display = 'flex'; 
    messageInput.focus(); 
}

function setupEdit(msg) { 
    closeActiveAction(); 
    editingMsgId = msg.id; 
    actionPreviewTitle.innerText = 'Редактирование'; 
    actionPreviewText.innerText = msg.text; 
    actionPreviewArea.style.display = 'flex'; 
    messageInput.value = msg.text; 
    messageInput.focus(); 
}

function closeActiveAction() { 
    replyingToMsgId = null; 
    if (editingMsgId) { messageInput.value = ''; editingMsgId = null; } 
    actionPreviewArea.style.display = 'none'; 
}
const actionPreviewArea = document.getElementById('actionPreviewArea');
const actionPreviewTitle = document.getElementById('actionPreviewTitle');
const actionPreviewText = document.getElementById('actionPreviewText');
document.getElementById('cancelActionBtn').onclick = closeActiveAction;

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => { 
    if (e.key === 'Enter') sendMessage(); 
});

// Живой статус "печатает..." через Firebase
messageInput.addEventListener('input', () => { 
    if (!activeChatUser) return; 
    sendTypingStatus(true); 
    clearTimeout(typingTimeout); 
    typingTimeout = setTimeout(() => sendTypingStatus(false), 2000); 
});

function sendTypingStatus(isTyping) { 
    if (activeChatUser) { 
        const targetClean = cleanEmail(activeChatUser);
        database.ref('typing/' + targetClean + '/' + myCleanId).set(isTyping); 
    } 
}

function listenToTyping() {
    database.ref('typing/' + myCleanId).on('value', snapshot => {
        const statuses = snapshot.val();
        if (activeChatUser) {
            const targetClean = cleanEmail(activeChatUser);
            if (statuses && statuses[targetClean]) {
                activeChatStatus.innerText = 'печатает...'; 
                activeChatStatus.className = 'typing-status';
            } else {
                activeChatStatus.innerText = 'в сети'; 
                activeChatStatus.className = '';
            }
        }
    });
}

// Настройки тем
const modal = document.getElementById('settingsModal');
document.getElementById('openSettings').onclick = () => { 
    modal.style.display = 'flex'; 
};
document.getElementById('closeSettings').onclick = () => { 
    modal.style.display = 'none'; 
};
window.setTheme = function(themeName) { 
    document.body.className = 'theme-' + themeName; 
};

window.setTheme = function(themeName) { 
    document.body.className = 'theme-' + themeName; 
};
