const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const users = {}; 
const onlineUsers = {}; 
let messages = []; // Массив сообщений теперь изменяемый
let msgCounter = 0; // Счетчик для создания ID сообщений

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Заполните все поля' });
    if (users[username]) return res.status(400).json({ error: 'Пользователь уже существует' });
    users[username] = await bcrypt.hash(password, 10);
    res.json({ success: true });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = users[username];
    if (!hashedPassword || !(await bcrypt.compare(password, hashedPassword))) {
        return res.status(400).json({ error: 'Неверный логин или пароль' });
    }
    res.json({ success: true, username });
});

app.get('/api/search', (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase() : '';
    const result = Object.keys(users).filter(u => u.toLowerCase().includes(query));
    res.json(result);
});

// Функция рассылки события двум участникам диалога
function broadcastToChat(from, to, payload) {
    const dataStr = JSON.stringify(payload);
    if (onlineUsers[from]) onlineUsers[from].send(dataStr);
    if (onlineUsers[to] && to !== from) onlineUsers[to].send(dataStr);
}

wss.on('connection', (ws) => {
    let currentUser = null;

    ws.on('message', (messageStr) => {
        const data = JSON.parse(messageStr);

        if (data.type === 'auth') {
            currentUser = data.username;
            onlineUsers[currentUser] = ws;
            const userHistory = messages.filter(m => m.from === currentUser || m.to === currentUser);
            ws.send(JSON.stringify({ type: 'history', messages: userHistory }));
            return;
        }

        // 1. ОТПРАВКА СООБЩЕНИЯ (с поддержкой ответов и ID)
        if (data.type === 'message') {
            msgCounter++;
            const msgObj = {
                id: msgCounter,
                from: currentUser,
                to: data.to,
                text: data.text || null,
                image: data.image || null,
                replyTo: data.replyTo || null, // ID сообщения, на которое отвечают
                reactions: {}, // { emoji: [users] }
                isEdited: false,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            messages.push(msgObj);
            broadcastToChat(currentUser, data.to, { type: 'msg', message: msgObj });
            return;
        }

        // 2. РЕДАКТИРОВАНИЕ СООБЩЕНИЯ
        if (data.type === 'edit') {
            const msg = messages.find(m => m.id === data.id && m.from === currentUser);
            if (msg) {
                msg.text = data.text;
                msg.isEdited = true;
                broadcastToChat(currentUser, msg.to, { type: 'edit_update', id: msg.id, text: msg.text });
            }
            return;
        }

        // 3. УДАЛЕНИЕ СООБЩЕНИЯ
        if (data.type === 'delete') {
            const msgIndex = messages.findIndex(m => m.id === data.id && m.from === currentUser);
            if (msgIndex !== -1) {
                const targetTo = messages[msgIndex].to;
                messages.splice(msgIndex, 1);
                broadcastToChat(currentUser, targetTo, { type: 'delete_update', id: data.id });
            }
            return;
        }

        // 4. РЕАКЦИИ
        if (data.type === 'reaction') {
            const msg = messages.find(m => m.id === data.id);
            if (msg) {
                if (!msg.reactions[data.emoji]) msg.reactions[data.emoji] = [];
                
                const userIndex = msg.reactions[data.emoji].indexOf(currentUser);
                if (userIndex !== -1) {
                    // Если реакция уже стоит — убираем её (как в ТГ)
                    msg.reactions[data.emoji].splice(userIndex, 1);
                    if (msg.reactions[data.emoji].length === 0) delete msg.reactions[data.emoji];
                } else {
                    // Иначе добавляем реакцию
                    msg.reactions[data.emoji].push(currentUser);
                }
                broadcastToChat(msg.from, msg.to, { type: 'reaction_update', id: msg.id, reactions: msg.reactions });
            }
            return;
        }

        if (data.type === 'typing') {
            if (onlineUsers[data.to]) {
                onlineUsers[data.to].send(JSON.stringify({ type: 'typing', from: currentUser, isTyping: data.isTyping }));
            }
        }
    });

    ws.on('close', () => {
        if (currentUser) delete onlineUsers[currentUser];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));

