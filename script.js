// Инициализация Telegram Mini App
const tg = window.Telegram.WebApp;

// Говорим Telegram, что наше приложение готово и можно его показывать
tg.ready();

// Разворачиваем приложение на всю высоту (если оно открылось не на весь экран)
tg.expand(); 

// Получаем элементы интерфейса
const userCard = document.getElementById('user-card');
const greeting = document.getElementById('greeting');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');
const mainAvatar = document.getElementById('main-avatar');
const mainBtn = document.getElementById('main-btn');

// Проверяем, открыто ли приложение внутри Telegram
if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
    const user = tg.initDataUnsafe.user;
    
    // Показываем карточку
    userCard.style.display = 'flex';
    
    // Формируем приветствие
    greeting.textContent = `Hello, ${user.first_name}!`;
    
    // Очищаем информацию под именем
    userInfo.innerHTML = '';

    // Устанавливаем инициал в аватарку
    const initial = user.first_name.charAt(0).toUpperCase();
    userAvatar.textContent = initial;
    if (mainAvatar) mainAvatar.textContent = initial;
    
    // Если Telegram передал фото (это бывает не всегда, зависит от настроек), 
    // можно установить его фоном. 
    if (user.photo_url) {
        userAvatar.style.backgroundImage = `url('${user.photo_url}')`;
        userAvatar.style.backgroundSize = 'cover';
        userAvatar.textContent = ''; // Убираем букву
        
        if (mainAvatar) {
            mainAvatar.style.backgroundImage = `url('${user.photo_url}')`;
            mainAvatar.textContent = '';
        }
    }

} else {
    // Если открыли просто в браузере (не в Telegram)
    userCard.style.display = 'flex';
    greeting.textContent = "Hello, Guest!";
    userInfo.textContent = "Please open this link inside Telegram as a Mini App.";
} 

// Обработчик кнопки
mainBtn.addEventListener('click', () => {
    // Скрываем начальный экран
    userCard.style.display = 'none';
    
    // Показываем главную страницу
    document.getElementById('main-page').style.display = 'block';
    
    // Прячем свечение начального экрана
    document.querySelector('.glow-container').style.display = 'none';
});

// Обработчик кнопки плюс
document.getElementById('add-btn').addEventListener('click', () => {
    // Пока что ничего не происходит
    console.log("Add button clicked");
});

// Настройка цветов приложения под тему Telegram пользователя (если у него темная/светлая)
// Вы можете использовать tg.themeParams для изменения цветов, но пока оставим ваш темный дизайн.