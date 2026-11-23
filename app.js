import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase-config.js";

// Firestore 컬렉션 참조
const guestbookRef = collection(db, "guestbook");

// DOM 요소
const form = document.getElementById("guestbookForm");
const nameInput = document.getElementById("nameInput");
const messageInput = document.getElementById("messageInput");
const nameError = document.getElementById("nameError");
const messageError = document.getElementById("messageError");
const charCount = document.getElementById("charCount");
const formAlert = document.getElementById("formAlert");
const submitBtn = document.getElementById("submitBtn");
const btnText = submitBtn.querySelector(".btn-text");
const btnSpinner = submitBtn.querySelector(".btn-spinner");

const postCount = document.getElementById("postCount");
const listError = document.getElementById("listError");
const loadingState = document.getElementById("loadingState");
const emptyState = document.getElementById("emptyState");
const guestbookList = document.getElementById("guestbookList");

// 아바타 색상 팔레트 (작성자 이름 기준으로 일관된 색상 배정)
const AVATAR_COLORS = [
  { bg: "#edf2ff", text: "#3b5bdb" },
  { bg: "#e6fcf5", text: "#0ca678" },
  { bg: "#fff4e6", text: "#e8590c" },
  { bg: "#f3f0ff", text: "#7048e8" },
  { bg: "#fff0f6", text: "#d6336c" },
  { bg: "#e7f5ff", text: "#1c7ed6" }
];

let alertTimer = null;

function getAvatarStyle(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatDateTime(timestamp) {
  if (!timestamp || typeof timestamp.toDate !== "function") {
    return "방금 전";
  }

  const date = timestamp.toDate();
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diffSec < 60 && diffSec >= -5) {
    return "방금 전";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function showFieldError(inputEl, errorEl, message) {
  inputEl.classList.add("is-invalid");
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearFieldError(inputEl, errorEl) {
  inputEl.classList.remove("is-invalid");
  errorEl.textContent = "";
  errorEl.hidden = true;
}

function showFormAlert(message, type) {
  if (alertTimer) {
    clearTimeout(alertTimer);
    alertTimer = null;
  }

  formAlert.textContent = message;
  formAlert.className = `alert alert-${type}`;
  formAlert.hidden = false;

  if (type === "success") {
    alertTimer = setTimeout(() => {
      formAlert.hidden = true;
    }, 3000);
  }
}

function hideFormAlert() {
  if (alertTimer) {
    clearTimeout(alertTimer);
    alertTimer = null;
  }
  formAlert.hidden = true;
}

function setSubmitting(isSubmitting) {
  submitBtn.disabled = isSubmitting;
  btnText.textContent = isSubmitting ? "등록 중..." : "방명록 등록";
  btnSpinner.hidden = !isSubmitting;
}

function validateInputs() {
  const trimmedName = nameInput.value.trim();
  const trimmedMessage = messageInput.value.trim();

  let isValid = true;
  let firstInvalidField = null;

  if (!trimmedName) {
    showFieldError(nameInput, nameError, "이름을 입력해 주세요.");
    isValid = false;
    firstInvalidField = nameInput;
  } else {
    clearFieldError(nameInput, nameError);
  }

  if (!trimmedMessage) {
    showFieldError(messageInput, messageError, "메시지를 입력해 주세요.");
    isValid = false;
    if (!firstInvalidField) {
      firstInvalidField = messageInput;
    }
  } else {
    clearFieldError(messageInput, messageError);
  }

  if (firstInvalidField) {
    firstInvalidField.focus();
  }

  return isValid;
}

function getFriendlyFirestoreError(error) {
  const code = error?.code || "";

  if (code === "permission-denied") {
    return "Firestore 접근 권한이 없습니다. Firebase Console > Firestore Database > 규칙(Rules) 설정을 확인해 주세요.";
  }
  if (code === "unavailable") {
    return "Firebase 서버에 연결할 수 없습니다. 인터넷 연결과 Firestore 데이터베이스 생성 여부를 확인해 주세요.";
  }
  return `데이터 처리 중 오류가 발생했습니다. (${code || "알 수 없는 오류"})`;
}

function createEntryElement(data) {
  const name = (data.name || "익명").trim();
  const message = data.message || "";
  const formattedTime = formatDateTime(data.createdAt);
  const avatarStyle = getAvatarStyle(name);

  const li = document.createElement("li");
  li.className = "entry-card";

  const header = document.createElement("div");
  header.className = "entry-header";

  const author = document.createElement("div");
  author.className = "entry-author";

  const avatar = document.createElement("span");
  avatar.className = "entry-avatar";
  avatar.style.backgroundColor = avatarStyle.bg;
  avatar.style.color = avatarStyle.text;
  avatar.textContent = Array.from(name)[0] || "?";
  avatar.setAttribute("aria-hidden", "true");

  const nameSpan = document.createElement("span");
  nameSpan.className = "entry-name";
  nameSpan.textContent = name;

  const timeEl = document.createElement("time");
  timeEl.className = "entry-time";
  timeEl.textContent = formattedTime;

  const messageP = document.createElement("p");
  messageP.className = "entry-message";
  messageP.textContent = message;

  author.append(avatar, nameSpan);
  header.append(author, timeEl);
  li.append(header, messageP);

  return li;
}

function renderEntries(docs) {
  loadingState.hidden = true;
  listError.hidden = true;
  postCount.textContent = String(docs.length);

  guestbookList.innerHTML = "";

  if (docs.length === 0) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  const fragment = document.createDocumentFragment();
  docs.forEach((doc) => {
    fragment.appendChild(createEntryElement(doc.data()));
  });
  guestbookList.appendChild(fragment);
}

// 입력 시 실시간 에러 해제 및 글자 수 표시
nameInput.addEventListener("input", () => {
  if (nameInput.value.trim()) {
    clearFieldError(nameInput, nameError);
  }
  hideFormAlert();
});

messageInput.addEventListener("input", () => {
  charCount.textContent = `${messageInput.value.length} / 500`;
  if (messageInput.value.trim()) {
    clearFieldError(messageInput, messageError);
  }
  hideFormAlert();
});

// 방명록 등록 이벤트
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideFormAlert();

  if (!validateInputs()) {
    return;
  }

  const name = nameInput.value.trim();
  const message = messageInput.value.trim();

  setSubmitting(true);

  try {
    await addDoc(guestbookRef, {
      name,
      message,
      createdAt: serverTimestamp()
    });

    form.reset();
    charCount.textContent = "0 / 500";
    showFormAlert("방명록이 성공적으로 등록되었습니다.", "success");
    nameInput.focus();
  } catch (error) {
    console.error("방명록 저장 오류:", error);
    showFormAlert(getFriendlyFirestoreError(error), "error");
  } finally {
    setSubmitting(false);
  }
});

// Firestore 실시간 데이터 구독 (최신 작성글이 위로 오도록 내림차순 정렬)
function subscribeGuestbook() {
  const guestbookQuery = query(guestbookRef, orderBy("createdAt", "desc"));

  onSnapshot(
    guestbookQuery,
    (snapshot) => {
      renderEntries(snapshot.docs);
    },
    (error) => {
      console.error("방명록 불러오기 오류:", error);
      loadingState.hidden = true;
      emptyState.hidden = true;
      listError.textContent = getFriendlyFirestoreError(error);
      listError.hidden = false;
    }
  );
}

subscribeGuestbook();
