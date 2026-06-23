// ===== FIREBASE КОНФИГУРАЦИЯ (modular SDK) =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDol7MWTJJjbkJP3dB1TvudS7Pp17KJByc",
    authDomain: "dom-uchet.firebaseapp.com",
    projectId: "dom-uchet",
    storageBucket: "dom-uchet.firebasestorage.app",
    messagingSenderId: "877676885975",
    appId: "1:877676885975:web:124c7913011a7e8d4b3d92"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Экспортируем для использования в других модулях
export { app, db };