// Автоматически собираем ваши ключи и ссылку
const SUPABASE_URL = "https://supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtbWpkbHBlbXR1bG96dXNmcXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMTA2NTUsImV4cCI6MjEwMTU4NjY1NX0.G_v1JYAxKYYU02V0QPnVKeqG4nGDii29WyN5kCi7aAc";

// Инициализируем клиент (Используем window.supabase, чтобы избежать конфликта!)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let myUsername = null; 
let activeChatUser = null;
let typingTimeout = null;
let replyingToMsgId = null;
let editingMsgId = null;
let activeContextMenu = null;
let isLoginMode = true;

// Элементы интерфейса
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

const actionPreviewArea = document.getElementById('actionPreviewArea');
const actionPreviewTitle = document.getElementById('actionPreviewTitle');
const actionPreviewText = document.getElementById('actionPreviewText');

// Переключатель Вход / Регистрация
toggleAuth.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? 'Вход в Danumes' : 'Регистрация в Danumes';
    authBtn.innerText = isLoginMode ? 'Войти' : 'Создать аккаунт';
    toggleAuth.innerText = isLoginMode ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти';
});

// Кнопка Входа и Регистрации через Supabase Auth
authBtn.addEventListener('click', async () => {
    const email = document.getElementById('authUsername').value.trim().toLowerCase();
    const password = document.getElementById('authPassword').value.trim();

    if (!email || !password) return alert('Заполните все поля!');
    if (password.length < 6) return alert('Пароль должен быть от 6 символов!');

    if (isLoginMode) {
        // Вход
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return alert('Ошибка входа: ' + error.message);
        
        myUsername = email;
        startApp();
    } else {
        // Регистрация
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return alert('Ошибка регистрации: ' + error.message);
        
        alert('Регистрация успешна! Теперь войдите в аккаунт.');
        toggleAuth.click();
    }
});

function startApp() {
    authScreen.style.display = 'none';
    appScreen.style.display = 'flex';
    document.getElementById('myUsername').innerText = myUsername;
    document.getElementById('myAvatar').innerText = myUsername.charAt(0).toUpperCase();

    // Запускаем живое обновление
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

// Генерируем уникальный ID комнаты для диалога двоих
function getChatRoomId(user1, user2) {
    return [user1.trim().toLowerCase(), user2.trim().toLowerCase()].sort().join('_');
}

// Отправка сообщений в Supabase
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !activeChatUser) return;

    const roomId = getChatRoomId(myUsername, activeChatUser);

    if (editingMsgId) {
        // Редактирование существующего сообщения
        const { error } = await supabase
            .from('messages')
            .update({ text: text, is_edited: true })
            .eq('id', editingMsgId);

        if (error) console.error('Ошибка редактирования:', error);
    } else {
        // Новое сообщение или ответ
        const { error } = await supabase
            .from('messages')
            .insert([{
                from_user: myUsername,
                to_user: activeChatUser,
                room_id: roomId,
                text: text,
                reply_to: replyingToMsgId || null,
                reactions: {}
            }]);

        if (error) console.error('Ошибка отправки сообщения:', error);
    }
    
    closeActiveAction();
    messageInput.value = '';
    sendTypingStatus(false);
}

// Отправка изображений в Supabase
attachBtn.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file || !activeChatUser) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const roomId = getChatRoomId(myUsername, activeChatUser);
        
        const { error } = await supabase
            .from('messages')
            .insert([{
                from_user: myUsername,
                to_user: activeChatUser,
                room_id: roomId,
                image: e.target.result,
                reply_to: replyingToMsgId || null,
                reactions: {}
            }]);

        if (error) console.error('Ошибка отправки картинки:', error);
        closeActiveAction();
    };
    reader.readAsDataURL(file);
    imageInput.value = '';
});
// Подписка на живые обновления сообщений в Supabase
async function listenToMessages() {
    // 1. Сначала скачиваем уже существующую историю переписок
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`from_user.eq.${myUsername},to_user.eq.${myUsername}`);

    if (error) {
        console.error('Ошибка загрузки истории:', error);
    } else if (data) {
        globalMessagesList = data;
        rebuildChatsList();
        renderMessages();
    }

    // 2. Включаем Realtime-слушатель на любые изменения в таблице messages
    supabase
        .channel('public:messages')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, payload => {
            const newRow = payload.new;
            const oldRow = payload.old;

            if (payload.eventType === 'INSERT') {
                // Если это новое сообщение для нас
                if (newRow.from_user === myUsername || newRow.to_user === myUsername) {
                    globalMessagesList.push(newRow);
                }
            } else if (payload.eventType === 'UPDATE') {
                // Если сообщение обновили (изменили текст или поставили реакцию)
                const index = globalMessagesList.findIndex(m => m.id === newRow.id);
                if (index !== -1) globalMessagesList[index] = newRow;
            } else if (payload.eventType === 'DELETE') {
                // If сообщение удалили
                globalMessagesList = globalMessagesList.filter(m => m.id !== oldRow.id);
            }

            rebuildChatsList();
            renderMessages();
        })
        .subscribe();
}

// Пересборка списка чатов на левой панели
function rebuildChatsList() {
    const dialogs = new Set();
    globalMessagesList.forEach(m => {
        if (m.from_user === myUsername) dialogs.add(m.to_user);
        if (m.to_user === myUsername) dialogs.add(m.from_user);
    });
    if (activeChatUser) dialogs.add(activeChatUser);

    chatsList.innerHTML = '';
    dialogs.forEach(user => {
        const isActive = user === activeChatUser ? 'active' : '';
        const chatMsgs = globalMessagesList.filter(m => 
            (m.from_user === myUsername && m.to_user === user) || 
            (m.from_user === user && m.to_user === myUsername)
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
        (m.from_user === myUsername && m.to_user === activeChatUser) || 
        (m.from_user === activeChatUser && m.to_user === myUsername)
    );

    if (currentChatMessages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="placeholder-text">
                Здесь пока пусто. Напишите первое сообщение!
            </div>`;
        return;
    }

    currentChatMessages.forEach(m => {
        const isOut = m.from_user === myUsername;
        const div = document.createElement('div');
        div.className = `message ${isOut ? 'outgoing' : 'incoming'}`;
        div.dataset.id = m.id;

        // Плашка ответа (цитирование)
        if (m.reply_to) {
            const orig = globalMessagesList.find(o => o.id === m.reply_to);
            if (orig) {
                const quoteDiv = document.createElement('div');
                quoteDiv.className = 'reply-quote-block';
                const name = orig.from_user === myUsername ? 'Вы' : orig.from_user;
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

        if (m.is_edited) {
            const edSpan = document.createElement('span'); 
            edSpan.className = 'edited-marker'; 
            edSpan.innerText = 'изм.'; 
            footerDiv.appendChild(edSpan);
        }

        const msgTime = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const timeSpan = document.createElement('span'); 
        timeSpan.className = 'message-time'; 
        timeSpan.innerText = msgTime;
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
        if (m.reactions && Object.keys(m.reactions).length > 0) {
            const rContainer = document.createElement('div');
            rContainer.className = 'message-reactions-container';
            Object.entries(m.reactions).forEach(([emoji, uList]) => {
                if (!uList || uList.length === 0) return;
                const badge = document.createElement('div');
                const hasMy = uList.includes(myUsername);
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

    if (msg.from_user === myUsername) {
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
        deleteBtn.onclick = async () => {
            if (confirm('Удалить сообщение для всех?')) {
                await supabase.from('messages').delete().eq('id', msg.id);
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
async function sendReaction(msgId, emoji) {
    const msg = globalMessagesList.find(m => m.id === msgId);
    if (!msg) return;

    let currentReactions = msg.reactions || {};
    let uList = currentReactions[emoji] || [];

    const index = uList.indexOf(myUsername);
    if (index !== -1) {
        uList.splice(index, 1);
    } else {
        uList.push(myUsername);
    }

    currentReactions[emoji] = uList;
    if (uList.length === 0) delete currentReactions[emoji];

    await supabase.from('messages').update({ reactions: currentReactions }).eq('id', msgId);
}

function setupReply(msg) { 
    closeActiveAction(); 
    replyingToMsgId = msg.id; 
    actionPreviewTitle.innerText = `Ответ пользователю ${msg.from_user}`; 
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
document.getElementById('cancelActionBtn').onclick = closeActiveAction;

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => { 
    if (e.key === 'Enter') sendMessage(); 
});

// Живой статус "печатает..." через Supabase
messageInput.addEventListener('input', () => { 
    if (!activeChatUser) return; 
    sendTypingStatus(true); 
    clearTimeout(typingTimeout); 
    typingTimeout = setTimeout(() => sendTypingStatus(false), 2000); 
});

async function sendTypingStatus(isTyping) { 
    if (!activeChatUser) return;
    const roomId = getChatRoomId(myUsername, activeChatUser);

    const { data } = await supabase
        .from('typing_statuses')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_email', myUsername);

    if (data && data.length > 0) {
        await supabase.from('typing_statuses').update({ is_typing: isTyping, updated_at: new Date() }).eq('id', data[0].id);
    } else {
        await supabase.from('typing_statuses').insert([{ room_id: roomId, user_email: myUsername, is_typing: isTyping }]);
    }
}

function listenToTyping() {
    supabase
        .channel('public:typing_statuses')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'typing_statuses' }, payload => {
            const row = payload.new;
            if (!activeChatUser) return;
            const roomId = getChatRoomId(myUsername, activeChatUser);

            if (row && row.room_id === roomId && row.user_email === activeChatUser) {
                if (row.is_typing) {
                    activeChatStatus.innerText = 'печатает...'; 
                    activeChatStatus.className = 'typing-status';
                } else {
                    activeChatStatus.innerText = 'в сети'; 
                    activeChatStatus.className = '';
                }
            }
        })
        .subscribe();
}

// Настройки тем
const modal = document.getElementById('settingsModal');
document.getElementById('openSettings').onclick = () => { modal.style.display = 'flex'; };
document.getElementById('closeSettings').onclick = () => { modal.style.display = 'none'; };
window.setTheme = function(themeName) { document.body.className = 'theme-' + themeName; };
