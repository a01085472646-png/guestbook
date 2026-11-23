import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Firebase [guestbook] 프로젝트 설정
const firebaseConfig = {
  apiKey: "AIzaSyAANN5vcPFD6mxO-1rNR8KB-RbVkEXUI3I",
  authDomain: "guestbook-42ed3.firebaseapp.com",
  projectId: "guestbook-42ed3",
  storageBucket: "guestbook-42ed3.firebasestorage.app",
  messagingSenderId: "838746805500",
  appId: "1:838746805500:web:c884ae0050f117a6ef7379"
};

// Firebase 앱 및 Cloud Firestore 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { app, db };
