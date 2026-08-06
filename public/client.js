let myUsername = null;
let activeChatUser = null;
let socket = null;
let allMessages = [];
let isLoginMode = true;
let typingTimeout = null;

let replyingToMsgId = null;
let editingMsgId = null;
let activeContextMenu = null;

// Находим элементы на странице
const authScreen = document.getElementById('authScreen');
const appScreen = document.getElementById('appScreen');
const authTitle = document.getElementById('authTitle');
const authBtn = document.getElementById('authBtn');
const toggleAuth = document.getElementById('toggleAuth');
const userSearchInput = document.getElementById('userSearchInput');
const searchResults = document.getElementById('searchResults');
const chatsList = document.getElementById('chatsList');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const activeChatName = document.getElementById('activeChatName');
const activeChatStatus = document.getElementById('activeChatStatus');
const chatHeader = document.getElementById('chatHeader');

const attachBtn = document.getElementById('attachBtn');
const imageInput = document.getElementById('imageInput');
const profileModal = document.getElementById('profileModal');
const profileModalAvatar = document.getElementById('profileModalAvatar');
const profileModalUsername = document.getElementById('profileModalUsername');
const closeProfile = document.getElementById('closeProfile');

const actionPreviewArea = document.getElementById('actionPreviewArea');
const actionPreviewTitle = document.getElementById('actionPreviewTitle');
const actionPreviewText = document.getElementById('actionPreviewText');
const cancelActionBtn = document.getElementById('cancelActionBtn');

// Клик по тексту "Зарегистрироваться / Войти"
toggleAuth.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? 'Вход в Danumes' : 'Регистрация в Danumes';
    authBtn.innerText = isLoginMode ? 'Войти' : 'Создать аккаунт';
    toggleAuth.innerText = isLoginMode ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти';
});

// Отправка формы авторизации
authBtn.addEventListener('click', async () => {
    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value.trim();
    if (!username || !password) return alert('Заполните все поля!');

    const url = isLoginMode ? '/api/login' : '/api/register';
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.error) return alert(data.error);

        if (!isLoginMode) {
            alert('Регистрация успешна! Теперь авторизуйтесь.');
            toggleAuth.click();
        } else {
            myUsername = data.username;
            startApp();
        }
    } catch (err) {
        alert('Ошибка связи с сервером!');
    }
});
// Запуск WebSocket и обработка сетевых команд
function startApp() {
    authScreen.style.display = 'none';
    appScreen.style.display = 'flex';
    document.getElementById('myUsername').innerText = myUsername;
    document.getElementById('myAvatar').innerText = myUsername.charAt(0).toUpperCase();

    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    socket = new WebSocket(`${protocol}${window.location.host}`);

    socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'auth', username: myUsername }));
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'history') {
            allMessages = data.messages;
            rebuildChatsList();
            renderMessages();
        } else if (data.type === 'msg') {
            allMessages.push(data.message);
            rebuildChatsList();
            renderMessages();
        } else if (data.type === 'edit_update') {
            const msg = allMessages.find(m => m.id === data.id);
            if (msg) {
                msg.text = data.text;
                msg.isEdited = true;
                renderMessages();
            }
        } else if (data.type === 'delete_update') {
            allMessages = allMessages.filter(m => m.id !== data.id);
            rebuildChatsList();
            renderMessages();
        } else if (data.type === 'reaction_update') {
            const msg = allMessages.find(m => m.id === data.id);
            if (msg) {
                msg.reactions = data.reactions;
                renderMessages();
            }
        } else if (data.type === 'typing') {
            if (activeChatUser && data.from === activeChatUser) {
                if (data.isTyping) {
                    activeChatStatus.innerText = 'печатает...';
                    activeChatStatus.className = 'typing-status';
                } else {
                    activeChatStatus.innerText = 'в сети';
                    activeChatStatus.className = '';
                }
            }
        }
    };
}

// Живой поиск людей
userSearchInput.addEventListener('input', async () => {
    const val = userSearchInput.value.trim();
    if (!val) { searchResults.style.display = 'none'; return; }

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(val)}`);
        const users = await res.json();
        searchResults.innerHTML = '';
        const filtered = users.filter(u => u !== myUsername);

        if (filtered.length > 0) {
            searchResults.style.display = 'block';
            filtered.forEach(user => {
                const div = document.createElement('div');
                div.className = 'search-item';
                div.innerText = user;
                div.onclick = () => {
                    openChatWith(user);
                    searchResults.style.display = 'none';
                    userSearchInput.value = '';
                };
                searchResults.appendChild(div);
            });
        } else {
            searchResults.style.display = 'none';
        }
    } catch (e) {
        console.error(e);
    }
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
// Пересборка списка чатов в левой панели
function rebuildChatsList() {
    const dialogs = new Set();
    allMessages.forEach(m => {
        if (m.from === myUsername) dialogs.add(m.to);
        if (m.to === myUsername) dialogs.add(m.from);
    });
    if (activeChatUser) dialogs.add(activeChatUser);

    chatsList.innerHTML = '';
    dialogs.forEach(user => {
        const isActive = user === activeChatUser ? 'active' : '';
        const chatMsgs = allMessages.filter(m => 
            (m.from === myUsername && m.to === user) || (m.from === user && m.to === myUsername)
        );
        const lastMsg = chatMsgs.pop();
        
        let textPreview = 'Нет сообщений';
        if (lastMsg) {
            textPreview = lastMsg.image ? '📷 Изображение' : lastMsg.text;
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

// Отрисовка сообщений в текущем чате
function renderMessages() {
    if (!activeChatUser) return;
    messagesContainer.innerHTML = '';

    const currentChatMessages = allMessages.filter(m => 
        (m.from === myUsername && m.to === activeChatUser) || 
        (m.from === activeChatUser && m.to === myUsername)
    );

    if (currentChatMessages.length === 0) {
        messagesContainer.innerHTML = '<div class="placeholder-text">Здесь пока пусто. Напишите первое сообщение!</div>';
        return;
    }

    currentChatMessages.forEach(m => {
        const isOut = m.from === myUsername;
        const div = document.createElement('div');
        div.className = `message ${isOut ? 'outgoing' : 'incoming'}`;
        div.dataset.id = m.id;

        // Если это ответ, рисуем плашку цитаты над текстом
        if (m.replyTo) {
            const originalMsg = allMessages.find(orig => orig.id === m.replyTo);
            if (originalMsg) {
                const quoteDiv = document.createElement('div');
                quoteDiv.className = 'reply-quote-block';
                const senderName = originalMsg.from === myUsername ? 'Вы' : originalMsg.from;
                const previewText = originalMsg.image ? '📷 Изображение' : originalMsg.text;
                quoteDiv.innerHTML = `<b>${senderName}</b><span>${previewText}</span>`;
                div.appendChild(quoteDiv);
            }
        }

        // Блок для текста сообщения
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        if (m.text) textDiv.innerText = m.text;
        div.appendChild(textDiv);

        // Блок для картинки
        if (m.image) {
            const img = document.createElement('img');
            img.src = m.image;
            img.className = 'message-image';
            div.appendChild(img);
        }

        // Подвал сообщения: время + статус "изменено"
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

        // Кнопка действий (три точки при наведении)
        const trigger = document.createElement('div');
        trigger.className = 'message-actions-trigger';
        trigger.innerText = '•••';
        trigger.onclick = (e) => {
            e.stopPropagation();
            showContextMenu(e, m);
        };
        div.appendChild(trigger);

        // Блок отображения реакций под сообщением
        if (m.reactions && Object.keys(m.reactions).length > 0) {
            const reactionsContainer = document.createElement('div');
            reactionsContainer.className = 'message-reactions-container';

            Object.entries(m.reactions).forEach(([emoji, usersList]) => {
                if (usersList.length === 0) return;
                const badge = document.createElement('div');
                const hasMyReaction = usersList.includes(myUsername);
                badge.className = `reaction-badge ${hasMyReaction ? 'my-reacted' : ''}`;
                badge.innerHTML = `<span>${emoji}</span><small>${usersList.length}</small>`;
                badge.onclick = (e) => {
                    e.stopPropagation();
                    sendReaction(m.id, emoji);
                };
                reactionsContainer.appendChild(badge);
            });
            div.appendChild(reactionsContainer);
        }

        div.oncontextmenu = (e) => {
            e.preventDefault();
            showContextMenu(e, m);
        };

        messagesContainer.appendChild(div);
    });
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
// Открытие контекстного меню (как в Telegram)
function showContextMenu(e, msg) {
    removeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'msg-context-menu';
    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${e.clientX}px`;

    // Быстрый выбор реакций сверху меню
    const reactionsRow = document.createElement('div');
    reactionsRow.className = 'reactions-picker-row';
    const quickEmojis = ['👍', '❤️', '🔥', '😂', '😮', '😢'];
    quickEmojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'reaction-picker-btn';
        btn.innerText = emoji;
        btn.onclick = () => {
            sendReaction(msg.id, emoji);
            removeContextMenu();
        };
        reactionsRow.appendChild(btn);
    });
    menu.appendChild(reactionsRow);

    // Кнопка "Ответить"
    const replyBtn = document.createElement('button');
    replyBtn.className = 'msg-menu-item';
    replyBtn.innerText = 'Ответить';
    replyBtn.onclick = () => {
        setupReply(msg);
        removeContextMenu();
    };
    menu.appendChild(replyBtn);

    // Действия для собственных сообщений
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
            if (confirm('Удалить это сообщение для всех?')) {
                socket.send(JSON.stringify({ type: 'delete', id: msg.id }));
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

// Клик по экрану закрывает меню действий
document.addEventListener('click', removeContextMenu);

// Отправка реакции
function sendReaction(msgId, emoji) {
    socket.send(JSON.stringify({ type: 'reaction', id: msgId, emoji: emoji }));
}

// Режим ответа
function setupReply(msg) {
    closeActiveAction();
    replyingToMsgId = msg.id;
    actionPreviewTitle.innerText = `Ответ пользователю ${msg.from}`;
    actionPreviewText.innerText = msg.image ? '📷 Изображение' : msg.text;
    actionPreviewArea.style.display = 'flex';
    messageInput.focus();
}

// Режим редактирования
function setupEdit(msg) {
    closeActiveAction();
    editingMsgId = msg.id;
    actionPreviewTitle.innerText = 'Редактирование сообщения';
    actionPreviewText.innerText = msg.text;
    actionPreviewArea.style.display = 'flex';
    messageInput.value = msg.text;
    messageInput.focus();
}

// Закрытие панели Ответа или Редактирования
function closeActiveAction() {
    replyingToMsgId = null;
    if (editingMsgId) {
        messageInput.value = '';
        editingMsgId = null;
    }
    actionPreviewArea.style.display = 'none';
}

cancelActionBtn.onclick = closeActiveAction;

// Отправка сообщений
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !activeChatUser) return;

    if (editingMsgId) {
        socket.send(JSON.stringify({ type: 'edit', id: editingMsgId, text: text }));
    } else {
        socket.send(JSON.stringify({
            type: 'message',
            to: activeChatUser,
            text: text,
            replyTo: replyingToMsgId
        }));
    }
    
    closeActiveAction();
    messageInput.value = '';
    sendTypingStatus(false);
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => { 
    if (e.key === 'Enter') sendMessage(); 
});

// Отслеживание статуса "печатает..."
messageInput.addEventListener('input', () => {
    if (!activeChatUser) return;
    sendTypingStatus(true);
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        sendTypingStatus(false);
    }, 2000);
});

function sendTypingStatus(isTyping) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'typing', to: activeChatUser, isTyping: isTyping }));
    }
}

// Загрузка изображений
attachBtn.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file || !activeChatUser) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        socket.send(JSON.stringify({
            type: 'message',
            to: activeChatUser,
            image: e.target.result,
            replyTo: replyingToMsgId
        }));
        closeActiveAction();
    };
    reader.readAsDataURL(file);
    imageInput.value = '';
});

// Профиль собеседника
chatHeader.addEventListener('click', () => {
    if (!activeChatUser) return;
    profileModalUsername.innerText = activeChatUser;
    profileModalAvatar.innerText = activeChatUser.charAt(0).toUpperCase();
    profileModal.style.display = 'flex';
});

closeProfile.onclick = () => profileModal.style.display = 'none';

// Меню настроек тем
const modal = document.getElementById('settingsModal');
document.getElementById('openSettings').onclick = () => modal.style.display = 'flex';
document.getElementById('closeSettings').onclick = () => modal.style.display = 'none';

window.setTheme = function(themeName) {
    document.body.className = 'theme-' + themeName;
};
