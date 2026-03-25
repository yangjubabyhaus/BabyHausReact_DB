# 반드시 한국어로 대화할 것

# BABY HAÜS - 고객관리 앱

## 프로젝트 개요

출산/육아용품 매장(베이비하우스)의 고객 선물 발송 관리 앱.
고객의 정보와 아이의 정보를 받아서 출산기념선물, 1살, 2살, 3살까지 작은 선물을 보내주기 위한 시스템.

## 기술 스택

- **프론트엔드**: React (Vite)
- **백엔드/DB**: Supabase (PostgreSQL + Realtime)
- **배포**: Vercel
- **푸시 알림**: Web Push (VAPID) + Vercel Serverless Functions
- **PWA**: Service Worker

## 매장 구조

- **도봉점** (dobong)
- **양주점** (yangju)
- 두 매장을 하나의 앱에서 관리

## 주요 기능

### 고객 등록 페이지 (/ 경로)

- 임산부 / 일반고객 유형 선택
- 매장 선택 (도봉점/양주점)
- 보호자 정보 + 아이 정보 + 주소(다음 우편번호 API) 입력
- 임산부: 출산예정일 등록, 인증코드 8자리 발급
- 일반고객: 아이 생년월일 등록 (등록 후 수정 불가)
- 전화번호 중복 체크
- 선물 일정 자동 생성 (임산부: 출산축하+1~3세 / 일반: 1~3세)

### 출산일 수정 기능

- 인증코드 8자리로 본인 확인
- 출산예정일 → 실제 출산일로 1회만 변경 가능
- 변경 시 선물 일정도 재계산

### 관리자 페이지 (/admin 경로)

#### 권한 체계

- **마스터(master)**: 전체매장 열람, 고객 삭제, 직원 승인/권한부여, 선물발송 완료처리 등 모든 권한
- **매니저(manager)**: 전체매장 열람, 선물발송 완료처리
- **직원(staff)**: 자기 소속 매장 고객만 조회 가능, 수정/삭제 불가, 알림만 수신

#### 대시보드

- 담당 고객 수 표시
- D-10 이내 발송 예정 목록
- D-11~30 발송 예정 목록
- 기한 지난 미발송 목록

#### 고객 목록

- 이름/연락처/아이이름 검색
- 매장 필터, 유형 필터(임산부/일반), 일정 필터
- 데스크톱 테이블 / 모바일 카드 반응형
- CSV 엑셀 다운로드

#### 고객 상세

- 전체 정보 표시
- 선물 타임라인 (발송완료/D-day 표시)
- 발송 완료 처리 (마스터/매니저)
- 인증코드 복사/재발급 (마스터)
- 고객 삭제 - soft delete (마스터만)

#### 직원 관리 (마스터만)

- 승인 대기 목록 표시
- 승인 시 역할(매니저/직원) + 매장 지정
- 가입 거절 (DB에서 삭제)
- 권한 변경, 계정 비활성화

### 푸시 알림

- `api/send-push.js`: 개별 푸시 발송 Vercel Serverless Function
- `api/daily-push.js`: 매일 KST 10시 Vercel Cron으로 D-10 이내 선물 알림
- 직원 신규 가입 시 마스터에게 승인 요청 알림
- Service Worker: 푸시 수신 + 알림 클릭 시 /admin 이동

## DB 테이블 (Supabase)

### customers

- id, type(pregnant/normal), store(dobong/yangju), name, phone, address
- childName, dueDate, actualBirthDate, birthDate
- birthDateModified(boolean), verificationCode
- registeredAt, gifts(jsonb), deleted(boolean), deletedAt

### users

- id, username, pwd(해시), role(master/manager/staff)
- store(dobong/yangju/all), approved(boolean), active(boolean), createdAt

### push_subscriptions

- id, user_id, subscription(jsonb), createdAt

### Realtime 활성화

- customers, users 테이블에 Realtime(postgres_changes) 구독

## 알려진 문제점 / 주의사항

### Realtime 동기화 문제

- Supabase Realtime으로 DB 변경 감지 후 재조회할 때, DB 복제 지연(replication lag)으로 인해 삭제된 데이터가 다시 나타나거나 새 데이터가 안 보이는 문제가 반복됨
- 로컬 state 업데이트와 Realtime 재조회가 충돌하는 패턴에 주의

### React 컴포넌트 구조

- 렌더 함수 안에서 컴포넌트를 정의하면(const Comp = () => ...) 매 렌더링마다 re-mount되어 input 포커스가 날아감
- Step2Form처럼 반드시 외부에 정의해야 함

### 시간대

- 한국(KST, UTC+9) 기준으로 날짜 계산해야 함
- new Date('YYYY-MM-DD')는 UTC로 파싱되므로 주의

### 보안

- RLS 정책이 전부 public access로 되어있어 보안 취약
- 비밀번호가 단순 해시(hashPwd)로 저장됨
- anon key가 프론트엔드에 노출

## 파일 구조

```
├── api/
│   ├── daily-push.js      # Vercel Cron (매일 KST 10시)
│   └── send-push.js       # 푸시 발송 API
├── public/
│   ├── sw.js               # Service Worker
│   ├── manifest.json       # PWA manifest
│   └── icon.svg
├── src/
│   ├── App.jsx             # 라우팅 (/ → 고객등록, /admin → 관리자)
│   ├── main.jsx            # 진입점
│   ├── supabase.js         # Supabase 클라이언트
│   ├── utils.js            # 유틸 함수 모음
│   ├── styles.css          # 전역 스타일
│   ├── CustomerRegister.jsx # 고객 등록/출산일 수정 페이지
│   └── admin/
│       ├── AdminApp.jsx     # 관리자 인증/쉘/Realtime
│       ├── Dashboard.jsx    # 대시보드
│       ├── CustomerList.jsx # 고객 목록
│       ├── CustomerDetail.jsx # 고객 상세 모달
│       └── StaffManagement.jsx # 직원 관리
├── vercel.json             # Vercel 설정 + cron
├── package.json
└── vite.config.js
```

## 작업 시 유의사항

- 반드시 `npm run dev`로 실행해서 실제 동작을 확인하면서 작업할 것
- Supabase Realtime 관련 수정 시 실제 DB 변경 후 클라이언트 반영을 테스트할 것
- 날짜 관련 로직은 KST 기준으로 테스트할 것
- 컴포넌트는 렌더 함수 바깥에 정의할 것
