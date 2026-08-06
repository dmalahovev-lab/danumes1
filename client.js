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
window.setTheme = function(themeName) { 
    document.body.className = 'theme-' + themeName; 
};
