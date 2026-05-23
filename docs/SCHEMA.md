# 잼클래스 Firestore 스키마 (정식 v1)

> 설계 원칙
> - **역할은 학급별**(전역 아님) — 한 사용자가 A반 교사, B반 학생일 수 있음 (구글 클래스룸 동일)
> - 멤버는 **배열이 아닌 서브컬렉션** — 학급 규모 확장 + 역할/프로필 저장 + 보안 규칙 분리
> - 공지·과제·자료는 **하나의 스트림(`posts`)** 에 `type` 으로 구분 (클래스룸 스트림 방식)
> - 목록 조회는 `members` **collectionGroup** 쿼리 사용

## 컬렉션 구조

```
users/{uid}
  displayName, email, photoURL, createdAt

classes/{classId}
  name, subject, description
  ownerId            # 개설 교사 uid
  code               # 6자리 참여 코드 (대문자/숫자, 혼동문자 제외)
  colorIndex         # 카드 그라데이션 인덱스 (0~4)
  archived: bool
  memberCount: number    # 비정규화 카운트
  createdAt, updatedAt

classes/{classId}/members/{uid}
  uid                # 쿼리용 (collectionGroup)
  classId            # 역참조
  role: "teacher" | "student"
  displayName, photoURL   # 목록 표시용 비정규화
  joinedAt

classes/{classId}/posts/{postId}
  type: "announcement" | "assignment" | "material"
  authorId, authorName
  title, body
  attachments: [{ name, url, type }]
  dueAt              # assignment 전용 (nullable)
  createdAt, updatedAt

classes/{classId}/posts/{postId}/submissions/{uid}   # assignment 제출
  studentId, studentName
  content, attachments
  status: "submitted" | "returned"
  grade, feedback
  submittedAt, updatedAt

classes/{classId}/attendance/{yyyy-mm-dd}            # 출석 (소규모: 맵)
  date
  records: { <uid>: "present" | "late" | "absent" }
  takenBy, updatedAt
```

## 주요 쿼리

| 목적 | 쿼리 |
|---|---|
| 내 학급 목록 | `collectionGroup('members').where('uid','==',me)` → classId 수집 → classes 일괄 조회 |
| 코드로 학급 찾기 | `collection('classes').where('code','==',CODE)` (limit 1) |
| 학급 멤버 목록 | `classes/{id}/members` 정렬 by role, joinedAt |
| 학급 스트림 | `classes/{id}/posts` orderBy createdAt desc |

## 필요한 인덱스

- `members` collectionGroup: `uid ASC` (단일 필드 — 자동, 단 collectionGroup 범위 설정 필요)
- `classes`: `code ASC` (단일 필드 자동)

## 보안 규칙 요지

- `users/{uid}`: 본인만 쓰기, 로그인 사용자 읽기
- `classes/{id}` 읽기: 해당 학급 멤버이거나, 코드 조회를 위한 제한적 허용
- `classes/{id}` 생성: 본인이 ownerId
- `classes/{id}` 수정/삭제: 해당 학급 **teacher**
- `members`: 본인이 자기 문서 생성(참여)/삭제(탈퇴), teacher는 전체 관리
- `posts`: 멤버 읽기, teacher 쓰기 (과제 제출은 student 본인 submissions만)

## v1 구현 범위

- ✅ users 문서 (최초 로그인 시 생성)
- ✅ classes + members 서브컬렉션 + 역할
- ✅ 학급 생성(개설자=teacher) / 코드 참여(student) / 목록 / 상세
- ✅ 보안 규칙 + collectionGroup 인덱스 배포
- ⬜ posts / submissions / attendance — 해당 기능 단계에서 구현
