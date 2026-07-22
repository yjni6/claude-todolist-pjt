/* =========================================================
   데이터 구조
   ========================================================= */

const CATEGORY_LABELS = {
  personal: "개인",
  study: "공부",
  work: "업무",
  hobby: "취미",
};

const CATEGORY_KEY_BY_LABEL = {
  개인: "personal",
  공부: "study",
  업무: "work",
  취미: "hobby",
};

const PRIORITY_DOTS = {
  높음: "●●●",
  중간: "●●",
  낮음: "●",
};

const PRIORITY_KEY_BY_LABEL = {
  높음: "high",
  중간: "medium",
  낮음: "low",
};

const MAX_TITLE_LENGTH = 100;
const REMOVE_ANIMATION_MS = 200;
const TOAST_DURATION_MS = 2000;
const THEME_STORAGE_KEY = "theme";

// Supabase 연결 설정 (anon/publishable 키는 RLS 정책으로 보호되는 공개 키라 클라이언트에 노출해도 안전함)
const SUPABASE_URL = "https://qmtlvcktrzgtnsylkafg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_8K8YK7HiUDs6ZenXmVqQHw_T2OilUwi";
const TODO_TABLE = "todo_tbl";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEBUG = false;
function log(...args) {
  if (DEBUG) console.log(...args);
}

// 전역 상태: 할 일 목록 (loadTodosFromSupabase()가 페이지 로드 시 Supabase에서 채움)
let todos = [];

// 현재 로그인한 사용자의 id (Supabase Auth uuid, 로그인/로그아웃 시 갱신됨)
let currentUserId = null;

let currentFilter = "전체";

let currentSearch = "";

/* =========================================================
   DOM 요소 참조
   ========================================================= */
const todoInput = document.getElementById("todoInput");
const categorySelect = document.getElementById("categorySelect");
const prioritySelect = document.getElementById("prioritySelect");
const addBtn = document.getElementById("addBtn");
const searchInput = document.getElementById("searchInput");
const filterNav = document.getElementById("filter");
const todoList = document.getElementById("todoList");
const emptyMessage = document.getElementById("emptyMessage");
const progressBarFill = document.getElementById("progressBarFill");
const todoCount = document.getElementById("todoCount");
const headerProgress = document.getElementById("headerProgress");
const categoryStats = document.getElementById("categoryStats");
const themeToggle = document.getElementById("themeToggle");
const toastContainer = document.getElementById("toastContainer");
const logoutBtn = document.getElementById("logoutBtn");

const authScreen = document.getElementById("authScreen");
const todoScreen = document.getElementById("todoScreen");
const authTabs = document.getElementById("authTabs");
const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");
const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");
const signupForm = document.getElementById("signupForm");
const signupEmail = document.getElementById("signupEmail");
const signupPassword = document.getElementById("signupPassword");
const signupPasswordConfirm = document.getElementById("signupPasswordConfirm");
const signupError = document.getElementById("signupError");

/* =========================================================
   핵심 함수: 추가 / 삭제 / 수정 / 토글
   ========================================================= */

async function addTodo(title, category, priority) {
  const trimmedTitle = title.trim().slice(0, MAX_TITLE_LENGTH);
  if (!trimmedTitle) {
    log("addTodo: 제목이 비어있어 추가하지 않음");
    return;
  }

  const { data, error } = await supabaseClient
    .from(TODO_TABLE)
    .insert({
      title: trimmedTitle,
      category: CATEGORY_LABELS[category],
      completed: false,
      priority: priority || "중간",
      user_id: currentUserId,
    })
    .select()
    .single();

  if (error) {
    log("addTodo: Supabase 저장 실패", error);
    showToast("할 일 추가에 실패했습니다");
    return;
  }

  const newTodo = mapRowToTodo(data);
  todos.push(newTodo);
  log("addTodo:", newTodo);

  renderTodos();
  updateProgressBar();
  showToast(`"${trimmedTitle}" 추가됨`);
}

async function deleteTodo(id) {
  const target = todos.find((todo) => todo.id === id);
  if (!target) {
    log("deleteTodo: 해당 id를 찾을 수 없음", id);
    return;
  }

  const confirmed = confirm(`"${target.title}" 항목을 삭제하시겠습니까?`);
  if (!confirmed) {
    log("deleteTodo: 취소됨", id);
    return;
  }

  const removeFromData = async () => {
    const { error } = await supabaseClient.from(TODO_TABLE).delete().eq("id", id);
    if (error) {
      log("deleteTodo: Supabase 삭제 실패", error);
      showToast("삭제에 실패했습니다");
      return;
    }

    const index = todos.findIndex((todo) => todo.id === id);
    if (index === -1) return;
    todos.splice(index, 1);
    log("deleteTodo:", id);

    renderTodos();
    updateProgressBar();
  };

  const li = todoList.querySelector(`[data-id="${id}"]`);
  if (li) {
    li.classList.add("todo-item--removing");
    setTimeout(removeFromData, REMOVE_ANIMATION_MS);
  } else {
    removeFromData();
  }
}

async function updateTodo(id, title, category) {
  const target = todos.find((todo) => todo.id === id);
  if (!target) {
    log("updateTodo: 해당 id를 찾을 수 없음", id);
    return;
  }

  const trimmedTitle = title.trim().slice(0, MAX_TITLE_LENGTH);
  if (!trimmedTitle) {
    log("updateTodo: 제목이 비어있어 수정하지 않음");
    return;
  }

  const updatedAt = new Date();
  const { error } = await supabaseClient
    .from(TODO_TABLE)
    .update({
      title: trimmedTitle,
      category: CATEGORY_LABELS[category],
      updated_at: updatedAt.toISOString(),
    })
    .eq("id", id);

  if (error) {
    log("updateTodo: Supabase 수정 실패", error);
    showToast("수정에 실패했습니다");
    renderTodos();
    return;
  }

  target.title = trimmedTitle;
  target.category = CATEGORY_LABELS[category];
  target.updatedAt = updatedAt;

  log("updateTodo:", target);

  renderTodos();
  updateProgressBar();
}

async function toggleTodo(id) {
  const target = todos.find((todo) => todo.id === id);
  if (!target) {
    log("toggleTodo: 해당 id를 찾을 수 없음", id);
    return;
  }

  const nextCompleted = !target.completed;
  const { error } = await supabaseClient
    .from(TODO_TABLE)
    .update({ completed: nextCompleted })
    .eq("id", id);

  if (error) {
    log("toggleTodo: Supabase 수정 실패", error);
    showToast("상태 변경에 실패했습니다");
    renderTodos();
    return;
  }

  target.completed = nextCompleted;
  log("toggleTodo:", id, "completed =", target.completed);

  renderTodos();
  updateProgressBar();
}

/* =========================================================
   렌더링
   ========================================================= */

function renderTodos() {
  const filtered = todos.filter((todo) => {
    const matchesFilter = currentFilter === "전체" || todo.category === currentFilter;
    const matchesSearch = !currentSearch || todo.title.toLowerCase().includes(currentSearch);
    return matchesFilter && matchesSearch;
  });

  const sorted = filtered.slice().sort((a, b) => Number(a.completed) - Number(b.completed));

  todoList.innerHTML = "";
  sorted.forEach((todo) => {
    todoList.appendChild(createTodoElement(todo));
  });

  emptyMessage.classList.toggle("hidden", sorted.length > 0);

  log("renderTodos: 렌더링 완료", sorted.length, "개 표시");
}

function createTodoElement(todo) {
  const categoryKey = CATEGORY_KEY_BY_LABEL[todo.category];
  const priority = todo.priority || "중간";
  const priorityKey = PRIORITY_KEY_BY_LABEL[priority];

  const li = document.createElement("li");
  li.className = "todo-item" + (todo.completed ? " todo-item--completed" : "");
  li.dataset.id = todo.id;
  li.dataset.category = categoryKey;

  const priorityEl = document.createElement("span");
  priorityEl.className = `todo-item__priority todo-item__priority--${priorityKey}`;
  priorityEl.title = `우선순위: ${priority}`;
  priorityEl.textContent = PRIORITY_DOTS[priority];

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "todo-item__checkbox";
  checkbox.checked = todo.completed;

  const title = document.createElement("span");
  title.className = "todo-item__title";
  title.textContent = todo.title;

  const badge = document.createElement("span");
  badge.className = `todo-item__badge todo-item__badge--${categoryKey}`;
  badge.textContent = todo.category;

  const actions = document.createElement("div");
  actions.className = "todo-item__actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "todo-item__edit-btn";
  editBtn.textContent = "수정";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "todo-item__delete-btn";
  deleteBtn.textContent = "삭제";

  actions.append(editBtn, deleteBtn);
  li.append(priorityEl, checkbox, title, badge, actions);

  return li;
}

/* =========================================================
   필터 / 검색
   ========================================================= */

function filterByCategory(category) {
  currentFilter = category;

  filterNav.querySelectorAll(".filter__button").forEach((btn) => {
    const label = btn.dataset.filter === "all" ? "전체" : CATEGORY_LABELS[btn.dataset.filter];
    btn.classList.toggle("filter__button--active", label === currentFilter);
  });

  log("filterByCategory:", currentFilter);
  renderTodos();
}

function searchTodos(term) {
  currentSearch = term.trim().toLowerCase();
  log("searchTodos:", currentSearch);
  renderTodos();
}

/* =========================================================
   진행률 계산
   ========================================================= */

function calculateProgress() {
  const total = todos.length;
  const completed = todos.filter((todo) => todo.completed).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, total, percentage };
}

function updateProgressBar() {
  const { completed, total, percentage } = calculateProgress();

  progressBarFill.style.width = `${percentage}%`;
  todoCount.textContent = `${completed}/${total} (${percentage}%)`;
  headerProgress.textContent = `완료율 ${percentage}%`;

  updateCategoryStats();
  log("updateProgressBar:", { completed, total, percentage });
}

function updateCategoryStats() {
  categoryStats.innerHTML = "";

  Object.values(CATEGORY_LABELS).forEach((label) => {
    const items = todos.filter((todo) => todo.category === label);
    if (items.length === 0) return;

    const completed = items.filter((todo) => todo.completed).length;
    const isDone = completed === items.length;

    const span = document.createElement("span");
    span.className = "stats__category-item";
    span.textContent = `${label}: ${completed}/${items.length}${isDone ? " ✓" : ""}`;
    categoryStats.appendChild(span);
  });
}

/* =========================================================
   Supabase 연동
   ========================================================= */

function mapRowToTodo(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    completed: row.completed,
    priority: row.priority,
    createdAt: new Date(row.created_at),
    updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
  };
}

// Supabase todo_tbl 테이블에서 현재 로그인한 사용자의 todos 배열을 불러옴 (로그인 시 1회 실행)
async function loadTodosFromSupabase() {
  const { data, error } = await supabaseClient
    .from(TODO_TABLE)
    .select("*")
    .eq("user_id", currentUserId)
    .order("created_at", { ascending: true });

  if (error) {
    log("loadTodosFromSupabase: 불러오기 실패", error);
    todos = [];
    showToast("할 일을 불러오지 못했습니다");
    return;
  }

  todos = data.map(mapRowToTodo);
  log("loadTodosFromSupabase:", todos.length, "개 불러옴");
}

/* =========================================================
   계정 (Supabase Auth 로그인 / 회원가입)
   ========================================================= */

function setAuthError(el, message) {
  el.textContent = message;
  el.classList.toggle("hidden", !message);
}

function translateAuthError(message) {
  if (!message) return "";
  if (message.includes("Invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다";
  }
  if (message.includes("already registered") || message.includes("already been registered")) {
    return "이미 가입된 이메일입니다";
  }
  if (message.includes("Password should be at least")) {
    return "비밀번호는 최소 6자 이상이어야 합니다";
  }
  if (message.includes("valid email")) {
    return "올바른 이메일 형식이 아닙니다";
  }
  return message;
}

// 회원가입: Supabase Auth signUp 호출 (계정이 만들어지면 트리거가 user_tbl에 프로필 행도 생성함)
async function handleSignup(email, password, passwordConfirm) {
  const trimmedEmail = email.trim();

  if (!trimmedEmail || !password) {
    setAuthError(signupError, "이메일과 비밀번호를 입력해주세요");
    return null;
  }

  if (password !== passwordConfirm) {
    setAuthError(signupError, "비밀번호가 일치하지 않습니다");
    return null;
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email: trimmedEmail,
    password,
  });

  if (error) {
    log("handleSignup: Supabase signUp 실패", error);
    setAuthError(signupError, translateAuthError(error.message));
    return null;
  }

  setAuthError(signupError, "");
  log("handleSignup:", trimmedEmail);
  return { needsEmailConfirmation: !data.session };
}

// 로그인: Supabase Auth signInWithPassword 호출
async function handleLogin(email, password) {
  const trimmedEmail = email.trim();

  if (!trimmedEmail || !password) {
    setAuthError(loginError, "이메일과 비밀번호를 입력해주세요");
    return false;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });

  if (error) {
    log("handleLogin: Supabase signIn 실패", error);
    setAuthError(loginError, translateAuthError(error.message));
    return false;
  }

  setAuthError(loginError, "");
  currentUserId = data.user.id;
  log("handleLogin:", trimmedEmail);
  return true;
}

function switchAuthTab(tab) {
  const isLogin = tab === "login";

  tabLogin.classList.toggle("auth-tabs__button--active", isLogin);
  tabSignup.classList.toggle("auth-tabs__button--active", !isLogin);
  loginForm.classList.toggle("hidden", !isLogin);
  signupForm.classList.toggle("hidden", isLogin);
  setAuthError(loginError, "");
  setAuthError(signupError, "");
}

let todoScreenInitialized = false;

async function showTodoScreen() {
  authScreen.classList.add("hidden");
  todoScreen.classList.remove("hidden");

  if (!todoScreenInitialized) {
    initializeEventListeners();
    todoScreenInitialized = true;
  }

  await loadTodosFromSupabase();
  renderTodos();
  updateProgressBar();
}

function showAuthScreen() {
  todoScreen.classList.add("hidden");
  authScreen.classList.remove("hidden");
  switchAuthTab("login");
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  currentUserId = null;
  showAuthScreen();
  log("handleLogout");
}

function initializeAuthEventListeners() {
  authTabs.addEventListener("click", (e) => {
    const button = e.target.closest(".auth-tabs__button");
    if (!button) return;
    switchAuthTab(button.dataset.tab);
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const success = await handleLogin(loginEmail.value, loginPassword.value);
    if (success) {
      loginForm.reset();
      await showTodoScreen();
    }
  });

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const result = await handleSignup(
      signupEmail.value,
      signupPassword.value,
      signupPasswordConfirm.value
    );
    if (result) {
      const signedUpEmail = signupEmail.value.trim();
      signupForm.reset();
      switchAuthTab("login");
      loginEmail.value = signedUpEmail;
      loginPassword.focus();
      showToast(
        result.needsEmailConfirmation
          ? "가입 확인 이메일을 보냈습니다. 이메일 인증 후 로그인해주세요"
          : "회원가입이 완료되었습니다. 로그인해주세요"
      );
    }
  });

  logoutBtn.addEventListener("click", handleLogout);

  log("initializeAuthEventListeners: 이벤트 리스너 등록 완료");
}

/* =========================================================
   다크 모드
   ========================================================= */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
}

function loadTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(saved === "dark" ? "dark" : "light");
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_STORAGE_KEY, next);
  log("toggleTheme:", next);
}

/* =========================================================
   사용자 피드백 (토스트)
   ========================================================= */

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => toast.remove(), TOAST_DURATION_MS);
}

/* =========================================================
   인라인 수정
   ========================================================= */

function enterEditMode(li, todo) {
  const titleEl = li.querySelector(".todo-item__title");

  const input = document.createElement("input");
  input.type = "text";
  input.className = "todo-item__title todo-item__title--editing";
  input.maxLength = MAX_TITLE_LENGTH;
  input.value = todo.title;

  li.replaceChild(input, titleEl);
  input.focus();
  input.select();

  const categoryKey = CATEGORY_KEY_BY_LABEL[todo.category];
  let isFinished = false;

  function finishEdit() {
    if (isFinished) return;
    isFinished = true;
    updateTodo(todo.id, input.value, categoryKey);
  }

  function cancelEdit() {
    if (isFinished) return;
    isFinished = true;
    renderTodos();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      finishEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  });

  input.addEventListener("blur", finishEdit);

  log("enterEditMode:", todo.id);
}

/* =========================================================
   이벤트 리스너 초기화
   ========================================================= */

async function handleAddTodo() {
  await addTodo(todoInput.value, categorySelect.value, prioritySelect.value);
  todoInput.value = "";
  todoInput.focus();
}

function initializeEventListeners() {
  addBtn.addEventListener("click", handleAddTodo);

  todoInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAddTodo();
  });

  searchInput.addEventListener("input", (e) => searchTodos(e.target.value));

  themeToggle.addEventListener("click", toggleTheme);

  todoList.addEventListener("click", (e) => {
    const li = e.target.closest(".todo-item");
    if (!li) return;

    const id = Number(li.dataset.id);
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    if (e.target.classList.contains("todo-item__delete-btn")) {
      deleteTodo(id);
    } else if (e.target.classList.contains("todo-item__edit-btn")) {
      enterEditMode(li, todo);
    }
  });

  todoList.addEventListener("change", (e) => {
    if (!e.target.classList.contains("todo-item__checkbox")) return;

    const li = e.target.closest(".todo-item");
    const id = Number(li.dataset.id);
    const willBeCompleted = e.target.checked;

    toggleTodo(id);

    if (willBeCompleted) {
      const newLi = todoList.querySelector(`[data-id="${id}"]`);
      if (newLi) {
        newLi.classList.add("todo-item--completed-flash");
        newLi.addEventListener(
          "animationend",
          () => newLi.classList.remove("todo-item--completed-flash"),
          { once: true }
        );
      }
    }
  });

  filterNav.addEventListener("click", (e) => {
    const button = e.target.closest(".filter__button");
    if (!button) return;

    const label =
      button.dataset.filter === "all" ? "전체" : CATEGORY_LABELS[button.dataset.filter];
    filterByCategory(label);
  });

  log("initializeEventListeners: 이벤트 리스너 등록 완료");
}

/* =========================================================
   초기 실행
   ========================================================= */
async function init() {
  loadTheme();
  initializeAuthEventListeners();

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (session) {
    currentUserId = session.user.id;
    await showTodoScreen();
  } else {
    showAuthScreen();
  }
}

init();
