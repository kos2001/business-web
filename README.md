# business-web

영업팀용 agent 웹 서비스. 워크스페이스 23개를 **영업팀의 업무 영역 7개**로 묶습니다.

| 업무 영역 | 워크스페이스 | 담당 플레이북 |
|---|---|---|
| **시장·고객 조사** | MI 리포트 | `mi-report` FastAPI (`:8000`) — 코퍼스 Q&A + 주간 리포트 |
| | 시황·시장규모 | `market-trend-brief`, `market-sizing` |
| | 고객사 브리핑 | `account-brief` |
| **판매전략** | 목표·판매계획 | `sales-target-setting`, `sales-plan` |
| | 판매 실행관리 | `sales-execution-tracking` |
| | 가격·마크업 | `pricing-strategy`, `markup-policy` |
| | 판매회의·업무보고 | `sales-meeting-report` |
| **신규수요 창출** | 신규수요 발굴 | `demand-generation`, `territory-prospecting` |
| | Design-win·샘플 | `design-win-management`, `competitive-conversion`, `sample-management` |
| | 판촉·딜등록 | `promotion-program`, `sales-code-registration` |
| **딜 진행** | 미팅 정리 | `discovery-notes`, `followup-email`, `deal-qualification` |
| | 제안서 | `proposal-outline` |
| | 경쟁·반론 대응 | `competitive-battlecard`, `objection-handling` |
| | 딜·파이프라인 | `deal-risk-review`, `pipeline-hygiene` |
| **계약** | 계약서 분석 | hermes `contract-review` (`:8659`) — 전용 SOUL.md |
| | 계약 운영 | `contract-operations` |
| **물량·품질 운영** | 물량·재고 운용 | `supply-allocation`, `inventory-management`, `strategic-volume-ops` |
| | 출하·물류 | `logistics-support` |
| | 클레임·EOL·PCN | `rma-handling`, `eol-management`, `pcn-management` |
| **고객 관리** | 고객 프로파일·내방 | `customer-profile`, `customer-visit-hosting`, `business-courtesy` |
| | 분기 리뷰 (QBR) | `qbr-review` |
| | MNC·해외법인 | `global-account-management`, `overseas-operations` |
| | 영업 현황진단 | `marketing-agent` (`:8012`) — 10개 에이전트 · 축자 인용 그라운딩 |

표시가 없는 워크스페이스는 전부 hermes `sales-agent` 프로필(`:8660`) 위에서 돕니다.
`customer-data-handling` 스킬은 그 프로필의 모든 작업에 항상 적용되므로 어느
워크스페이스에도 배정하지 않습니다.

### 왜 이 구성인가

이 팀은 신규 수주만 하는 팀이 아니라 **부품 유통·제조 영업팀**입니다. 딜을 따는 일
옆에 판매계획과 목표 배분, 물량 배분과 재고, 마크업과 특가, Design-win 추적,
단종(EOL)·제품변경(PCN)·클레임(RMA) 대응, 주간 판매회의 보고가 같은 비중으로 있습니다.

이전 구성은 워크스페이스 7개를 일반 B2B 퍼널(조사 → 영업 실행 → 계약 → 관리)로
묶었고, `sales-agent` 프로필에 시드된 플레이북 40개 중 **8개에만** 도달했습니다.
나머지 32개는 설치돼 있는데 웹에서 부를 길이 없었습니다 — 딜 단계로 만든 네비게이션에는
재고 운용이나 PCN 대응을 놓을 자리가 애초에 없기 때문입니다. 그래서 지금은 딜 단계가
아니라 **업무 영역**으로 묶습니다.

이 매핑이 조용히 깨지는 것을 막는 장치가 `src/lib/playbooks.ts`입니다. 없는 플레이북
이름을 불러도 런타임 오류가 나지 않고 에이전트가 페르소나로 답해버려서 — 버그가 아니라
그냥 답이 나빠진 것처럼 보입니다. 그래서 이름을 한 곳에 모아 두고 `agents.test.ts`가
양방향으로 검증합니다: 워크스페이스가 부르는 이름이 전부 명세에 있는지, 명세의
플레이북이 전부 어느 워크스페이스에서든 도달 가능한지.

워크스페이스 대부분은 **하나의 hermes 프로필(`sales-agent`)** 위에서 돕니다.
스킬·메모리·모델 설정을 한 곳에 두기 위해서이고, 각 워크스페이스가 자기 플레이북을
쓰도록 만드는 것은 `agents.ts`의 `instructions` 필드입니다 — hermes가 이를 run 단위
임시 시스템 프롬프트로 받습니다.

### 화면

읽는 사람 대부분이 비개발자라, 진입점은 **홈 보드**(`/`)입니다 — 업무 영역 7개와
워크스페이스 23개를 각각 한 문장 설명과 실제 질문 예시와 함께 펼쳐 놓습니다.
이전에는 `/`가 첫 워크스페이스로 리다이렉트해서, 앱이 무엇을 할 수 있는지 알 방법이
없었습니다. 영역마다 색과 아이콘이 하나씩 있고 홈·사이드바·헤더에서 동일하게 쓰이므로
(`src/lib/stage-meta.ts`), 목록을 읽지 않고 모양으로 찾아갈 수 있습니다. 사이드바 23개
항목은 영역별로 접히며, 지금 있는 영역은 항상 펼쳐집니다.

## 오케스트레이션을 이 앱에 두지 않는 이유

에이전트 프레임워크(LangGraph 등)를 쓰지 않습니다. hermes api_server가 이미
오케스트레이터입니다:

| 보통 그래프로 짜는 것 | hermes가 이미 제공하는 것 |
|---|---|
| 툴 호출 루프 | 에이전트 내부 툴/스킬/서브에이전트 |
| human-in-the-loop 인터럽트 | `approval.request` + `POST /v1/runs/{id}/approval` |
| 스트리밍·중간 상태 | `GET /v1/runs/{id}/events` (SSE) |
| 대화 상태 | `conversation_history` / `session_id` |
| 취소 | `POST /v1/runs/{id}/stop` |

MI와 영업 현황진단도 같은 이유로 재구현하지 않습니다.

- `mi-report`는 코퍼스 인제스트(Confluence, SEC EDGAR, DART, 한경, 뉴스),
  하이브리드 검색, 근거 검증, LLM Wiki를 이미 갖고 있습니다 — 질문은
  `/agent/chat/stream`, 주간 리포트 작성은 `/report/generate/stream` + `/report/render`.
- `marketing-agent`는 실적 자료를 채널별 진단·지표·전략 3축·Action Items로
  바꾸는 10개 에이전트 하네스입니다. 축자 인용 그라운딩과 판단 보류 표기까지
  들어 있어 다시 만들면 반드시 더 나빠집니다 — `POST /sources` → `/pipeline/run`.

## 세 백엔드, 하나의 프로토콜

셋의 인터페이스가 전부 다릅니다:

| 백엔드 | 인터페이스 |
|---|---|
| hermes | SSE `{"event": "message.delta" \| "tool.started" \| "run.completed" …}` |
| mi-report | SSE `{"type": "delta" \| "progress" \| "done" \| "error"}` |
| marketing-agent | **SSE 없음** — `/pipeline/run`이 블로킹 POST로 구조화된 리포트 반환 |

서버에서 전부 hermes 형태로 번역합니다 (`src/lib/mi-report.ts`,
`src/lib/marketing-agent.ts`). 브라우저는 어휘 하나만 알면 되고,
`useRun`·`run-events.ts`는 백엔드를 구분하지 않습니다.

marketing-agent는 SSE가 없어 UI가 수 분간 죽어 보이므로, 어댑터가 단계마다
진행 프레임을 직접 냅니다 — 실제로 일어나는 일을 정직하게 표시하되, 에이전트가
스트리밍해 준 것은 아닙니다.

## 반드시 알아야 할 것 세 가지

**1. run의 모든 요청에 `X-Hermes-Upstream`이 필요합니다.**
게이트웨이는 요청마다 업스트림을 새로 고릅니다(헤더 > 모델 별칭 > 모델 접두사 >
기본값). `contract-review`에서 시작한 run의 이벤트 스트림을 헤더 없이 요청하면 기본
업스트림으로 가고, 그쪽은 그 `run_id`를 몰라 404 `run_not_found`를 냅니다.
라이브 게이트웨이에서 재현 확인했습니다. `src/lib/hermes.ts`가 강제합니다.

**2. 파일 업로드는 경로 전달 방식입니다.**
hermes `/v1/runs`는 `file`/`input_file` 파트를 거부합니다 — 텍스트와 이미지만 받습니다.
대신 에이전트가 `read_file` 툴로 디스크를 읽을 수 있으므로, 업로드는
`~/.hermes/business-web-staging/<session>/`에 쓰고 그 절대경로를 프롬프트에
적어 넘깁니다. **웹 서버와 hermes 에이전트가 같은 파일시스템을 공유해야 동작합니다.**
서버를 분리하면 `src/lib/staging.ts`가 바뀌어야 합니다.

**3. mi-report의 세션 ID를 직접 만들면 안 됩니다.**
mi-report는 자기 세션 ID(`mi-agent-<hex>`)를 발급하고 소유권을 검증합니다. 이 앱의
세션 ID를 그대로 넘기면 에이전트가 돌기도 전에 404입니다. 첫 턴은 세션 ID 없이
보내고, `done` 프레임이 돌려준 ID를 기억해 다음 턴에 씁니다 (`src/lib/mi-sessions.ts`).

## 실행

```sh
cp .env.example .env.local     # HERMES_GATEWAY_KEY 채우기
chmod 600 .env.local
npm install
npm run dev                    # http://localhost:3100
```

의존 서비스:

```sh
# hermes-gateway
cd ~/gitspace/AIFde && uv run hermes-gateway

# 영업 실행 프로필 (고객사 브리핑 · 미팅 정리 · 제안서 · 딜/파이프라인)
sales-agent gateway run

# 계약서 분석 프로필
contract-review gateway run

# mi-report 백엔드
cd ~/gitspace/mi-report/backend && .venv/bin/python -m uvicorn app.main:app --port 8000
# 또는: cd ~/gitspace/mi-report && docker compose up

# marketing-agent 백엔드 (영업 현황진단) — hermes marketing-agent 프로필(:8654) 필요
hermes -p marketing-agent gateway run
cd ~/gitspace/marketing-agent/backend && .venv/bin/python -m uvicorn app.main:app --port 8012
```

검증 게이트: `npm run test && npm run typecheck && npm run build`

## 구조

```
브라우저  (게이트웨이 키를 절대 보지 않음)
   ▼
Next.js route handlers  (src/app/api/**)
   ├─ backend: "hermes"     → Bearer + X-Hermes-Upstream → hermes-gateway :8700
   └─ backend: "mi-report"  → mi-report FastAPI :8000 → hermes 형태로 번역
```

| 파일 | 역할 |
|---|---|
| `src/lib/agents.ts` | 워크스페이스 ↔ 백엔드·스킬 매핑. **워크스페이스 추가는 이 파일만 고칩니다.** |
| `src/lib/hermes.ts` | 서버 전용 게이트웨이 클라이언트. 키 보관, 업스트림 핀 고정 |
| `src/lib/mi-report.ts` | mi-report 클라이언트 (코퍼스 Q&A + 주간 리포트) + 이벤트 번역 + 출처 렌더링 |
| `src/lib/marketing-agent.ts` | marketing-agent 클라이언트 + 진행 프레임 생성 + 리포트 Markdown 렌더 |
| `src/lib/mi-sessions.ts` | 이 앱 세션 ↔ mi-report 세션 매핑 |
| `src/lib/pending-runs.ts` | mi-report run의 POST↔events 사이 프롬프트 보관 |
| `src/lib/staging.ts` | 업로드 파일 스테이징 (경로 살균, 확장자 허용목록, TTL 정리) |
| `src/lib/run-events.ts` | hermes run 이벤트 타입 + 증분 SSE 파서 |
| `src/lib/redact.ts` | 전송 전 고객정보 마스킹 |
| `src/components/useRun.ts` | 워크스페이스 하나의 대화·run 상태 |

## 보안 태세

- 게이트웨이 클라이언트 키는 **서버에만** 있습니다. 빌드 산출물·응답 HTML에 없음을 확인했습니다.
- 고객정보 마스킹은 **기본 켜짐**, **서버에서** 적용됩니다. 자매 프로젝트
  `sales-agent-desktop`의 보안 검토가 `PROTECT_DEFAULT = true`로 결론 낸 것과 같은
  판단이며, 브라우저를 조작해도 끌 수 없습니다.
- 업로드는 확장자 허용목록, 25MB 상한, 파일명·세션 ID 살균, 스테이징 루트 밖 경로
  거부, 파일 0600 / 디렉터리 0700, 24시간 TTL 정리를 적용합니다.

### 마스킹의 한계 — 반드시 알고 쓸 것

- **마스킹은 패턴 매칭이라 노출 축소이지 보장이 아닙니다.** 이메일·전화(휴대폰·유선)·
  주민번호·사업자번호·카드번호(Luhn 검증)·API 키/토큰·IP를 잡습니다.
  고객사명·담당자 이름·직책은 잡지 않습니다.
- **되돌릴 수 없습니다.** 값이 자리표시자로 바뀌므로 에이전트가 실제 주소로 메일을
  쓸 수 없습니다. `sales-agent-desktop`의 `pii-gateway.ts`가 쓰는 가역 토큰화
  (`[[EMAIL:…]]` → 응답 후 복원)가 다음 단계입니다.
- **업로드 파일 내용에는 마스킹이 적용되지 않습니다.** 파일은 원본 그대로 디스크에
  쓰이고 에이전트가 원본을 읽습니다. 마스킹은 프롬프트 텍스트에만 걸립니다.
  계약서에 담긴 개인정보는 그대로 모델에 전달됩니다.

## 알려진 한계

- **로그인이 없습니다.** mi-report에는 전원이 `MI_REPORT_USER_ID` 하나의 세션·메모리
  스코프를 공유하며 들어갑니다. 다중 사용자 운영 전에 반드시 해결해야 합니다.
- **MI 주간 리포트 생성이 아직 완주하지 못합니다.** 원인은 mi-report 쪽이고
  business-web 문제가 아닙니다. 이번 작업에서 두 겹을 벗겼습니다
  ([mi-report#98](https://github.com/kos2001/mi-report/pull/98)):
  1. `gateway.chat()`이 agno `RunOutput.content`가 비면 `str(resp)`로 폴백해
     10만 자 repr을 정상 데이터인 척 흘려보냈습니다 → 엉뚱한 `JSON 파싱 실패`.
  2. `extract_json`이 첫 `{`만 시도해 산문 속 중괄호에 걸렸습니다.

  둘을 고치고 빈 응답 재시도(3회)를 넣자 파이프라인이 훨씬 멀리 갔지만, 여전히
  한 호출이 3회를 모두 소진하며 실패합니다. **남은 원인은 모델/프로바이더 수준의
  높은 빈 응답 발생률**로 보이며, 다음 진단 단계는 OpenRouter 응답 원문을 직접
  들여다보는 것입니다. MI **질문 답변**(코퍼스 Q&A)은 정상 동작합니다.
- **리드 발굴(prospecting)과 견적(quote) 워크스페이스가 없습니다.** 전자는 외부
  데이터 소스, 후자는 가격 정책·승인 라인이 필요해 지금 붙일 근거가 없습니다.
- **영업 현황진단은 회차를 매번 새로 만듭니다.** 이전 회차와의 타임라인 연속성
  (marketing-agent가 지원하는 기능)을 이 앱에서는 아직 쓰지 않습니다.
- **MI 워크스페이스는 승인 흐름을 지원하지 않습니다.** mi-report가 hermes의
  `approval.request`를 중계하지 않아, 승인이 필요한 도구는 에이전트가 우회합니다.
- **대화가 서버에 저장되지 않습니다.** 새로고침하면 사라집니다. (mi-report는 자기
  쪽에 세션을 영속화하지만 이 앱이 그 목록을 읽지 않습니다.)
- 서버 상태(`pending-runs`, `mi-sessions`)가 인메모리라 단일 인스턴스 전제입니다.
