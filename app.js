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

// Cloudinary 업로드 설정
const CLOUDINARY_CLOUD_NAME = "pm5pujs0";
const CLOUDINARY_UPLOAD_PRESET = "guestbook";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

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

const imageDropzone = document.getElementById("imageDropzone");
const imageInput = document.getElementById("imageInput");
const imagePreviewWrap = document.getElementById("imagePreviewWrap");
const imagePreview = document.getElementById("imagePreview");
const imageFileName = document.getElementById("imageFileName");
const imageFileSize = document.getElementById("imageFileSize");
const removeImageBtn = document.getElementById("removeImageBtn");
const imageError = document.getElementById("imageError");

const postCount = document.getElementById("postCount");
const listError = document.getElementById("listError");
const loadingState = document.getElementById("loadingState");
const emptyState = document.getElementById("emptyState");
const guestbookList = document.getElementById("guestbookList");

const imageModal = document.getElementById("imageModal");
const imageModalImg = document.getElementById("imageModalImg");
const imageModalClose = document.getElementById("imageModalClose");

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
let selectedImageFile = null;
let previewObjectUrl = null;

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

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isSafeImageUrl(url) {
  if (typeof url !== "string" || !url.trim()) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
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

function setSubmitting(isSubmitting, statusText = "등록 중...") {
  submitBtn.disabled = isSubmitting;
  imageInput.disabled = isSubmitting;
  removeImageBtn.disabled = isSubmitting;
  btnText.textContent = isSubmitting ? statusText : "방명록 등록";
  btnSpinner.hidden = !isSubmitting;
}

function clearSelectedImage() {
  selectedImageFile = null;
  imageInput.value = "";

  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  imagePreview.src = "";
  imageFileName.textContent = "";
  imageFileSize.textContent = "";
  imagePreviewWrap.hidden = true;
  imageDropzone.hidden = false;
  clearFieldError(imageDropzone, imageError);
}

function handleSelectedImage(file) {
  hideFormAlert();

  if (!file) {
    clearSelectedImage();
    return;
  }

  if (!file.type || !file.type.startsWith("image/")) {
    clearSelectedImage();
    showFieldError(imageDropzone, imageError, "이미지 파일(JPG, PNG, GIF, WEBP 등)만 첨부할 수 있습니다.");
    return;
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    clearSelectedImage();
    showFieldError(imageDropzone, imageError, "이미지 용량은 최대 10MB까지 첨부할 수 있습니다.");
    return;
  }

  clearFieldError(imageDropzone, imageError);

  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
  }

  selectedImageFile = file;
  previewObjectUrl = URL.createObjectURL(file);

  imagePreview.src = previewObjectUrl;
  imageFileName.textContent = file.name;
  imageFileSize.textContent = formatFileSize(file.size);
  imageDropzone.hidden = true;
  imagePreviewWrap.hidden = false;
}

async function uploadImageToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  let response;
  try {
    response = await fetch(CLOUDINARY_UPLOAD_URL, {
      method: "POST",
      body: formData
    });
  } catch (networkError) {
    const err = new Error("이미지 업로드 서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.");
    err.isCloudinaryError = true;
    err.cause = networkError;
    throw err;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.secure_url) {
    const detail = data?.error?.message || `HTTP ${response.status}`;
    const err = new Error(`이미지 업로드에 실패했습니다. (${detail})`);
    err.isCloudinaryError = true;
    throw err;
  }

  return data.secure_url;
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
    return "Firestore 접근 권한이 없습니다. Firebase Console > Firestore Database > 규칙(Rules)에서 imageUrl 필드 허용 여부를 확인해 주세요.";
  }
  if (code === "unavailable") {
    return "Firebase 서버에 연결할 수 없습니다. 인터넷 연결과 Firestore 데이터베이스 생성 여부를 확인해 주세요.";
  }
  return `데이터 처리 중 오류가 발생했습니다. (${code || "알 수 없는 오류"})`;
}

function openImageModal(imageUrl, authorName) {
  imageModalImg.src = imageUrl;
  imageModalImg.alt = `${authorName}님이 첨부한 이미지`;
  imageModal.hidden = false;
  document.body.style.overflow = "hidden";
  imageModalClose.focus();
}

function closeImageModal() {
  if (imageModal.hidden) {
    return;
  }
  imageModal.hidden = true;
  imageModalImg.src = "";
  document.body.style.overflow = "";
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

  if (isSafeImageUrl(data.imageUrl)) {
    const imgBtn = document.createElement("button");
    imgBtn.type = "button";
    imgBtn.className = "entry-image-btn";
    imgBtn.setAttribute("aria-label", `${name}님이 첨부한 이미지 크게 보기`);

    const img = document.createElement("img");
    img.className = "entry-image";
    img.src = data.imageUrl;
    img.alt = `${name}님이 첨부한 이미지`;
    img.loading = "lazy";

    imgBtn.addEventListener("click", () => {
      openImageModal(data.imageUrl, name);
    });

    imgBtn.appendChild(img);
    li.appendChild(imgBtn);
  }

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

// 이미지 파일 선택 및 드래그 앤 드롭 이벤트
imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0] || null;
  handleSelectedImage(file);
});

removeImageBtn.addEventListener("click", () => {
  clearSelectedImage();
  hideFormAlert();
});

["dragenter", "dragover"].forEach((eventName) => {
  imageDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!imageInput.disabled) {
      imageDropzone.classList.add("is-dragover");
    }
  });
});

["dragleave", "drop"].forEach((eventName) => {
  imageDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    imageDropzone.classList.remove("is-dragover");
  });
});

imageDropzone.addEventListener("drop", (event) => {
  if (imageInput.disabled) {
    return;
  }
  const file = event.dataTransfer?.files?.[0] || null;
  if (file) {
    handleSelectedImage(file);
  }
});

// 이미지 확대 모달 닫기 이벤트
imageModalClose.addEventListener("click", closeImageModal);
imageModal.addEventListener("click", (event) => {
  if (event.target === imageModal) {
    closeImageModal();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !imageModal.hidden) {
    closeImageModal();
  }
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
  const fileToUpload = selectedImageFile;

  setSubmitting(true, fileToUpload ? "이미지 업로드 중..." : "등록 중...");

  try {
    let imageUrl = null;
    if (fileToUpload) {
      imageUrl = await uploadImageToCloudinary(fileToUpload);
      setSubmitting(true, "등록 중...");
    }

    const entryData = {
      name,
      message,
      createdAt: serverTimestamp()
    };

    if (imageUrl) {
      entryData.imageUrl = imageUrl;
    }

    await addDoc(guestbookRef, entryData);

    form.reset();
    clearSelectedImage();
    charCount.textContent = "0 / 500";
    showFormAlert("방명록이 성공적으로 등록되었습니다.", "success");
    nameInput.focus();
  } catch (error) {
    console.error("방명록 저장 오류:", error);
    const errorMessage = error?.isCloudinaryError
      ? error.message
      : getFriendlyFirestoreError(error);
    showFormAlert(errorMessage, "error");
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
