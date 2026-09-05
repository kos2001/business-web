# 영업 파이프라인 — 수집에서 이행 확인까지

목표 흐름:

```
문서 수집 → DB 적재 → 심층 분석 → 대응 방향 → Action Item 도출 → 이행 확인
```

## 먼저: 무엇이 이미 있는가

이 흐름의 대부분은 **이미 구현돼 있고 동작합니다.** 다시 만들 이유가 없으므로,
계획의 절반은 "무엇을 만들지"가 아니라 "무엇을 만들지 않을지"입니다.

| 단계 | 현재 상태 | 어디에 |
|---|---|---|
| 문서 수집 | ✅ Confluence · SEC EDGAR · DART · 한경 · 뉴스 · 수동 업로드 | mi-report `collection.py` |
| 문서 파싱 | ✅ docparser — `.docx/.pdf/.pptx/.html` → Markdown, 표는 JSON | business-web `docparse.ts` |
| DB 적재 | ✅ SQLite + FTS5 + 임베딩 벡터 | mi-report `collection.py` |
| **BM25** | ✅ SQLite FTS5, 동의어 확장 포함 | mi-report `collection.py` |
| **임베딩** | ✅ fastembed(로컬 384-dim) 또는 OpenRouter `bge-m3`(1024-dim) | mi-report `embeddings.py` |
| **RRF 결합** | ✅ `hybrid_search()` — BM25 순위 ⨁ dense 순위 | mi-report `collection.py:744` |
| **Reranker** | ✅ OpenRouter rerank API, 미설정 시 자동 우회 | mi-report `reranker.py` |
| **LLM Wiki** | ✅ 주차별 Markdown, Obsidian vault 연동 | mi-report `mi_wiki.py` |
| 심층 분석 | ✅ 10개 에이전트(marketing-agent) · 주간 리포트(mi-report) | 양쪽 |
| 대응 방향 | ✅ 전략 3축, 고객별 대응 전략 | marketing-agent |
| Action Item 도출 | ✅ 즉시 확인 / 조치 필요, Impact·Effort 매트릭스 | marketing-agent `schemas.py:75` |
| **이행 확인** | ❌ **없음** | — |
| **대시보드** | ❌ **없음** (mi-report·marketing-agent에 각자 UI가 있으나 통합 뷰 없음) | — |

## 그래서 실제로 없는 것은 둘

### 1. Action Item 이행 확인

marketing-agent가 Action Item을 **생성**은 하지만 `id/title/owner/due/priority/
impact/effort`뿐이고 **상태 필드가 없습니다.** 생성 즉시 리포트 JSON에 묻히고,
누가 했는지 안 했는지 다음 진단 때 아무도 모릅니다.

영업에서 이건 치명적입니다 — "다음 미팅 전에 예산 확인"이 실행됐는지 모르면
Action Item 목록은 매번 새로 쓰는 위시리스트가 됩니다.

**필요한 것:** 리포트와 독립된 수명을 갖는 저장소. 리포트는 시점의 스냅샷이고,
Action Item은 그 시점 이후로 계속 살아 움직입니다.

### 2. 통합 대시보드

지금은 워크스페이스 25개가 각자 대화창일 뿐, "지금 무엇이 밀려 있는가"를 한
화면에서 볼 수 없습니다.

## 설계

### Action Item 저장 — business-web에 둔다

세 백엔드 중 어디에 둘지가 첫 결정입니다.

- marketing-agent에 두면 → 진단에서 나온 것만 담기고, 계약 협상에서 나온
  "법무 검토 요청"은 못 담습니다.
- mi-report에 두면 → 그쪽은 MI 코퍼스가 주인이고 Action Item은 이물질입니다.

**business-web에 둡니다.** 워크스페이스 25개 전부가 Action Item을 낳고, 그 셋을
가로지르는 유일한 계층이 여기입니다. SQLite 한 파일이면 충분합니다 — 수천 건
규모이고, 이미 서버가 파일시스템을 씁니다(스테이징·코퍼스).

### 스키마

```sql
CREATE TABLE action_items (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  owner       TEXT,           -- 미정이면 NULL. 지어내지 않는다.
  due         TEXT,           -- ISO date. 미정이면 NULL.
  priority    TEXT,           -- high | mid | low
  impact      TEXT,
  effort      TEXT,
  status      TEXT NOT NULL,  -- open | in_progress | done | dropped
  workspace   TEXT NOT NULL,  -- 어느 워크스페이스가 낳았나
  source_text TEXT,           -- 근거가 된 답변 조각
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  note        TEXT            -- dropped 사유 등
);
```

`owner`와 `due`가 NULL 가능한 것이 중요합니다. 에이전트가 근거 없이 담당자를
지어내지 않는 것이 플레이북의 핵심 규율이고, 저장소가 NOT NULL을 요구하면 그
규율을 깨도록 강요하게 됩니다.

### 도출은 자동, 확정은 수동

에이전트 답변에서 Action Item을 **후보로 추출**하되 자동 저장하지 않습니다.
사용자가 확인하고 담을 것만 담습니다 — 선례 코퍼스와 같은 이유입니다. 모든 답변의
모든 제안이 자동으로 할 일 목록에 쌓이면 그 목록은 곧 무시됩니다.

### 대시보드

`/dashboard` 한 화면:

- **지금 밀린 것** — 기한 지난 open 항목. 이게 맨 위여야 합니다.
- **이번 주** — 기한이 이번 주인 것
- **워크스페이스별 분포** — 어디서 일이 나오고 있나
- **선례 코퍼스 · 백엔드 상태** — 이미 있는 정보를 한곳에

## 구현 순서

1. `lib/actions.ts` — SQLite 저장소 (better-sqlite3)
2. `/api/actions` — CRUD + 상태 전이
3. 답변에서 Action Item 후보 추출 → 확인 UI
4. `/dashboard` 화면
5. LLM Wiki 연동 — 주차별 이행 현황을 mi-report wiki에 기록

## 만들지 않는 것

- **BM25 · 임베딩 · reranker** — mi-report에 있고 잘 동작합니다. 계약 선례
  코퍼스는 docparser의 BM25+graph를 이미 씁니다. 세 번째 검색 스택을 만들 이유가
  없습니다.
- **LLM Wiki 본체** — mi-report `mi_wiki.py`가 Obsidian vault에 씁니다. 우리는
  거기에 항목을 추가할 뿐입니다.
- **문서 수집기** — mi-report의 커넥터가 이미 다섯 종입니다.
