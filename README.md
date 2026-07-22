# 📝 My Todo List

바닐라 HTML/CSS/JavaScript로 만든 할 일 관리 웹 앱입니다. 별도의 프레임워크나 빌드 도구 없이 브라우저에서 바로 실행할 수 있습니다.

## 주요 기능

- **할 일 추가/수정/삭제**: 제목, 카테고리, 우선순위를 지정해 할 일을 관리
- **카테고리 분류**: 개인 / 공부 / 업무 / 취미 4가지 카테고리와 필터
- **우선순위 표시**: 높음 / 중간 / 낮음 우선순위를 점 아이콘으로 표시
- **검색**: 제목 기준 실시간 검색
- **진행률 통계**: 전체 진행률 바, 완료 개수, 카테고리별 완료 현황
- **완료 처리**: 체크박스 토글 시 완료 항목은 목록 하단으로 정렬되고 취소선 표시
- **인라인 수정**: 항목을 목록에서 바로 수정 (Enter 저장, Esc 취소)
- **다크 모드**: 라이트/다크 테마 전환 및 localStorage에 선택 저장
- **로그인 / 회원가입**: Supabase Auth(이메일+비밀번호) 기반 계정 시스템. 로그인해야 할 일 목록에 접근 가능
- **사용자별 할 일 관리**: 할 일 데이터는 Supabase(`todo_tbl`)에 저장되며, 로그인한 사용자 본인의 항목만 보이고 수정/삭제 가능
- **토스트 알림**: 할 일 추가 시 하단에 짧은 알림 표시
- **반응형 레이아웃**: 모바일 화면에서도 사용 가능

## 기술 스택

- HTML5
- CSS3 (CSS 변수 기반 다크모드, 반응형 미디어 쿼리)
- Vanilla JavaScript (ES6+)
- [Supabase](https://supabase.com) (`@supabase/supabase-js` CDN, Supabase Auth, Postgres 테이블 `user_tbl`/`todo_tbl`)

## 인증 (Supabase Auth)

- 회원가입: `supabase.auth.signUp({ email, password })`
- 로그인: `supabase.auth.signInWithPassword({ email, password })`
- 로그인 상태는 Supabase가 관리하는 세션(브라우저 localStorage)으로 유지되며, 새로고침해도 로그인이 풀리지 않습니다.
- 프로젝트의 "Confirm email" 설정이 켜져 있으면 회원가입 후 이메일 인증 링크를 클릭해야 로그인할 수 있습니다.

## 데이터베이스 (Supabase)

`user_tbl`과 `todo_tbl`은 1:N 관계이며, `todo_tbl.user_id`가 `user_tbl.id`를 참조합니다. `auth.users`에 계정이 생성되면 트리거(`handle_new_user`)가 자동으로 `user_tbl`에 프로필 행을 만듭니다.

**user_tbl** (auth.users와 1:1)

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | uuid (PK, auth.users(id) 참조) | 사용자 ID |
| email | text | 이메일 |
| created_at | timestamptz | 생성 시각 |

**todo_tbl** (user_tbl과 1:N)

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | bigint (identity, PK) | 자동 증가 ID |
| user_id | uuid (FK → user_tbl.id) | 할 일의 소유자 |
| title | text | 할 일 제목 |
| category | text | 개인 / 공부 / 업무 / 취미 |
| priority | text | 높음 / 중간 / 낮음 |
| completed | boolean | 완료 여부 |
| created_at | timestamptz | 생성 시각 |
| updated_at | timestamptz | 수정 시각 |

두 테이블 모두 RLS(Row Level Security)가 켜져 있으며, `auth.uid() = user_id`(또는 `= id`) 조건으로 본인 데이터만 조회/수정/삭제할 수 있습니다. `script.js`에 있는 `SUPABASE_URL`, `SUPABASE_ANON_KEY`는 공개해도 안전한 anon/publishable 키입니다.

## 실행 방법

별도의 설치나 빌드 과정 없이 `index.html` 파일을 브라우저로 열면 바로 사용할 수 있습니다. (Supabase에 연결되므로 인터넷 연결이 필요합니다.)

```bash
# 예: 간단한 로컬 서버로 실행하고 싶다면
npx serve .
```

## 파일 구조

```
├── index.html   # 마크업 구조
├── styles.css   # 스타일 및 다크모드 테마
├── script.js    # 할 일 관리 로직 (추가/수정/삭제/필터/검색/저장 등)
└── README.md
```
