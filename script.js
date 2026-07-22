/* =========================================================
   데이터 구조
   ========================================================= */

// 카테고리 내부 키(personal/study/work/hobby) <-> 한글 라벨 매핑
// HTML의 select/data-filter/뱃지 클래스는 영문 키를 쓰고, todos 데이터는 한글 라벨을 쓰기 때문에 필요
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

// 우선순위 라벨 -> 점 아이콘 / CSS 클래스 키 매핑
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

// 디버그 로그 스위치: 개발 중에만 true로 바꿔서 콘솔 확인
const DEBUG = false;
function log(...args) {
  if (DEBUG) console.log(...args);
}

// 전역 상태: 할 일 목록 (loadTodosFromSupabase()가 페이지 로드 시 Supabase에서 채움)
let todos = [];

// 현재 선택된 카테고리 필터 ("전체" | "개인" | "공부" | "업무" | "취미")
let currentFilter = "전체";

// 현재 검색어 (소문자로 저장, 빈 문자열이면 검색 없음)
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

/* =========================================================
   핵심 함수: 추가 / 삭제 / 수정 / 토글
   ========================================================= */

// 새로운 할 일 추가 (제목이 비어있거나 공백뿐이면 무시)
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

// 특정 ID의 할 일 삭제 (확인 후 페이드아웃 애니메이션 뒤 실제 삭제)
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

// 할 일의 제목과 카테고리 수정 + updatedAt 갱신
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

// 할 일의 완료/미완료 상태 토글
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

// todos 배열을 현재 필터/검색어에 맞게 화면에 렌더링
// 완료된 항목은 목록 하단으로 정렬되어 미완료 항목과 시각적으로 구분됨
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

// 할 일 하나에 대한 <li> 엘리먼트 생성 (이벤트는 여기서 붙이지 않고 상위에서 위임 처리)
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

// 카테고리로 필터링 ("전체" | "개인" | "공부" | "업무" | "취미")
function filterByCategory(category) {
  currentFilter = category;

  filterNav.querySelectorAll(".filter__button").forEach((btn) => {
    const label = btn.dataset.filter === "all" ? "전체" : CATEGORY_LABELS[btn.dataset.filter];
    btn.classList.toggle("filter__button--active", label === currentFilter);
  });

  log("filterByCategory:", currentFilter);
  renderTodos();
}

// 제목으로 실시간 검색 (대소문자 무시)
function searchTodos(term) {
  currentSearch = term.trim().toLowerCase();
  log("searchTodos:", currentSearch);
  renderTodos();
}

/* =========================================================
   진행률 계산
   ========================================================= */

// 전체/완료 개수와 진행률(%) 계산 → { completed, total, percentage }
function calculateProgress() {
  const total = todos.length;
  const completed = todos.filter((todo) => todo.completed).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, total, percentage };
}

// 진행 바 너비 / 완료 텍스트 / 헤더 진행률 / 카테고리별 진행률 갱신
// todos가 변경될 때마다(추가/삭제/수정/토글 이후) 호출됨
function updateProgressBar() {
  const { completed, total, percentage } = calculateProgress();

  progressBarFill.style.width = `${percentage}%`;
  todoCount.textContent = `${completed}/${total} (${percentage}%)`;
  headerProgress.textContent = `완료율 ${percentage}%`;

  updateCategoryStats();
  log("updateProgressBar:", { completed, total, percentage });
}

// 카테고리별 완료/전체 개수 표시 (예: "업무: 1/2 ✓")
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

// Supabase 행(row)을 화면에서 쓰는 todo 객체 형태로 변환
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

// Supabase todo_tbl 테이블에서 todos 배열을 불러옴 (페이지 로드 시 1회 실행)
async function loadTodosFromSupabase() {
  const { data, error } = await supabaseClient
    .from(TODO_TABLE)
    .select("*")
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
   다크 모드
   ========================================================= */

// 테마를 <html data-theme="..">에 적용하고 토글 버튼 아이콘을 갱신
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
}

// localStorage에 저장된 테마를 읽어와 적용 (페이지 로드 시 실행)
function loadTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(saved === "dark" ? "dark" : "light");
}

// 라이트 <-> 다크 모드 전환 후 선택값을 localStorage에 저장
function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_STORAGE_KEY, next);
  log("toggleTheme:", next);
}

/* =========================================================
   사용자 피드백 (토스트)
   ========================================================= */

// 화면 하단에 짧게 사라지는 토스트 메시지 표시
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

// 할 일 항목을 인라인 수정 모드로 전환
// Enter 또는 외부 클릭(blur) 시 저장, Escape 시 취소
// isFinished 가드로 Enter 저장 후 뒤따르는 blur가 updateTodo를 중복 호출하지 않도록 방지
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

// "추가" 버튼 클릭과 입력창 Enter 키가 공유하는 추가 로직
async function handleAddTodo() {
  await addTodo(todoInput.value, categorySelect.value, prioritySelect.value);
  todoInput.value = "";
  todoInput.focus();
}

// 모든 이벤트는 페이지 로드 시 한 번만 등록한다.
// 할 일 항목(체크박스/수정/삭제 버튼)은 renderTodos()가 DOM을 다시 그릴 때마다
// 새로 생성되므로, 항목 개별로 리스너를 붙이면 중복 등록이 발생한다.
// 대신 부모 요소(todoList)에 이벤트 위임(delegation)으로 한 번만 등록해 이를 방지한다.
function initializeEventListeners() {
  addBtn.addEventListener("click", handleAddTodo);

  todoInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAddTodo();
  });

  searchInput.addEventListener("input", (e) => searchTodos(e.target.value));

  themeToggle.addEventListener("click", toggleTheme);

  // 할 일 목록: 수정 / 삭제 버튼 클릭 (이벤트 위임)
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

  // 할 일 목록: 체크박스 토글 (이벤트 위임) + 완료 시 짧은 플래시 애니메이션
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

  // 필터 버튼 클릭 (이벤트 위임)
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
  await loadTodosFromSupabase();
  renderTodos();
  updateProgressBar();
  initializeEventListeners();
}

init();
