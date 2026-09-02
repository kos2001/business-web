# business-web

영업팀용 agent 웹 서비스. 백엔드는 **hermes-agent api_server**이고, 웹 계층은
`hermes-gateway`(기본 `127.0.0.1:8700`)를 통해 그 에이전트들을 호출합니다.

## 오케스트레이션을 이 앱에 두지 않는 이유

에이전트 프레임워크(LangGraph 등)를 쓰지 않습니다. 필요가 없어서입니다 —
hermes api_server가 이미 오케스트레이터입니다:

| 보통 그래프로 짜는 것 | hermes가 이미 제공하는 것 |
|---|---|
| 툴 호출 루프 | 에이전트 내부 툴/스킬/서브에이전트 |
| human-in-the-loop 인터럽트 | `approval.request` 이벤트 + `POST /v1/runs/{id}/approval` |
| 스트리밍·중간 상태 | `GET /v1/runs/{id}/events` (SSE) |
| 대화 상태 | `conversation_history` / `session_id` |
| 취소 | `POST /v1/runs/{id}/stop` |

웹에 두 번째 오케스트레이터를 두면 "지금 누구 차례인가"를 두 시스템이 서로 다르게
판단하게 됩니다. 이 앱은 `/v1/runs`의 충실한 클라이언트로만 존재합니다.

## 반드시 알아야 할 제약

**run에 속한 모든 요청에 `X-Hermes-Upstream` 헤더를 붙여야 합니다.**

게이트웨이는 요청마다 업스트림을 새로 고릅니다(헤더 > 모델 별칭 > 모델 접두사 >
기본값). `mi-report`에서 시작한 run의 이벤트 스트림을 헤더 없이 요청하면 기본
업스트림으로 가고, 그쪽은 그 `run_id`를 모르므로 404 `run_not_found`를 돌려줍니다.
실제 게이트웨이에서 재현 확인했습니다. `src/lib/hermes.ts`가 이걸 강제합니다.

## 실행

```sh
cp .env.example .env.local
# HERMES_GATEWAY_KEY 에 ~/gitspace/AIFde/.env 의 GATEWAY_CLIENT_KEYS 첫 값을 넣습니다
chmod 600 .env.local

npm install
npm run dev          # http://localhost:3100
```

게이트웨이가 떠 있어야 합니다:

```sh
cd ~/gitspace/AIFde && uv run hermes-gateway
curl -s localhost:8700/health
```

검증 게이트: `npm run test && npm run typecheck && npm run build`

## 구조

```
브라우저
  │  게이트웨이 키를 절대 보지 않음
  ▼
Next.js route handlers  (src/app/api/**)
  │  Bearer <GATEWAY_CLIENT_KEYS> + X-Hermes-Upstream: <업스트림>
  ▼
hermes-gateway :8700
  ▼
hermes-agent api_server  (mi-report :8644, doc-parser, agent-cowork …)
```

| 파일 | 역할 |
|---|---|
| `src/lib/agents.ts` | 워크스페이스 ↔ 업스트림 매핑. **워크스페이스 추가는 이 파일만 고칩니다.** |
| `src/lib/hermes.ts` | 서버 전용 게이트웨이 클라이언트. 키 보관, 업스트림 핀 고정 |
| `src/lib/run-events.ts` | hermes run 이벤트 타입 + 증분 SSE 파서 |
| `src/lib/redact.ts` | 전송 전 고객정보 마스킹 |
| `src/components/useRun.ts` | 워크스페이스 하나의 대화·run 상태 |
| `src/components/Workspace.tsx` | UI |

## 보안 태세

- 게이트웨이 클라이언트 키는 **서버에만** 있습니다. `NEXT_PUBLIC_` 접두어를 붙이면
  브라우저로 유출됩니다 — 붙이지 마세요. 빌드 산출물에 키가 없는지 확인했습니다.
- 고객정보 마스킹은 **기본 켜짐**이고 **서버에서** 적용됩니다. 자매 프로젝트
  `sales-agent-desktop`의 보안 검토가 `PROTECT_DEFAULT = true`로 결론 낸 것과 같은
  판단입니다. 브라우저를 조작해도 끌 수 없습니다.
- 마스킹은 패턴 매칭이라 **노출 축소이지 보장이 아닙니다.** 이메일·전화·주민번호·
  사업자번호·카드번호를 잡습니다. 고객사명·직책 같은 건 잡지 않습니다.

## 알려진 한계

- **계약서 분석 워크스페이스는 임시 매핑입니다.** 현재 `doc-parser` 업스트림을
  가리키는데, 이 프로필은 하드웨어 데이터시트·매뉴얼 분석용으로 만들어졌습니다.
  실제로 물어보면 에이전트 스스로 "계약서 검토는 도구 범위 밖"이라고 답합니다.
  전용 계약서 프로필(계약서 코퍼스 인덱싱 + 조항 스키마)이 필요합니다.
- 고객관리는 `agent-cowork`(범용)로 붙여 뒀습니다. 영업 전용 프로필로 교체 대상입니다.
- 첨부파일 업로드가 없습니다. 계약서 분석에는 사실상 필수라 다음 작업 1순위입니다.
- 대화가 서버에 저장되지 않습니다. 새로고침하면 사라집니다.
