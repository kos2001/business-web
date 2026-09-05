#!/usr/bin/env bash
# hermes `sales-agent` 프로필 셋업 — business-web 의 hermes 워크스페이스 스무 개가
# 이 프로필 하나 위에서 돈다.
#
# 이 스크립트가 있는 이유: 프로필은 ~/.hermes 에 살고 git 밖이라, 레포만 클론해서는
# 앱이 절대 동작하지 않는다. 프로필이 없으면 워크스페이스는 백엔드 없음으로,
# 플레이북이 없으면 "정상"으로 보이면서 답변 품질만 조용히 떨어진다
# (README 의 "플레이북 설치 확인" 참고).
#
# 기본은 dry-run — 수행할 작업만 출력한다. 실제 적용은 --apply.
# 참조: ~/gitspace/marketing-agent/scripts/setup_hermes_profile.sh
set -euo pipefail

PROFILE=sales-agent
PORT=8660

# 모델은 여기가 원본이다. 프로필의 config.yaml 은 git 밖이라, 이 값이 레포에 없으면
# 새로 설치할 때마다 hermes 기본값으로 돌아간다. 왜 이 모델인지는 README 의
# "모델을 고르는 기준" 에 측정치와 함께 적혀 있다 — 취향이 아니라 관측 결과다.
MODEL="${SALES_MODEL:-z-ai/glm-5.3-flash}"
PROFILE_DIR="$HOME/.hermes/profiles/$PROFILE"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOUL_SRC="$REPO_DIR/profiles/$PROFILE/SOUL.md"

# 플레이북 원본은 두 곳이다.
#  - 공유 번들: sales-agent-desktop 이 관리한다. 여기서 복제하지 않고 참조한다 —
#    같은 파일이 두 곳에서 갈라지면 어느 쪽이 진짜인지 알 수 없게 된다.
#  - 레포 자체: business-web 만 쓰는 플레이북. 데스크톱 앱에는 해당 워크스페이스가
#    없으므로 그쪽 번들에 넣을 자리가 없고, 그렇다고 프로필에만 두면 git 밖으로
#    새어 나간다. 레포 것이 번들 위에 덮인다.
PLAYBOOK_SRC="${SALES_SKILLS_SRC:-$HOME/gitspace/sales-agent-desktop/resources/sales-skills/sales}"
REPO_PLAYBOOKS="$REPO_DIR/profiles/$PROFILE/playbooks"

APPLY=false
[ "${1:-}" = "--apply" ] && APPLY=true

say() { echo "[setup] $*"; }
run() { if $APPLY; then "$@"; else say "(dry-run) $*"; fi; }
die() { echo "[setup] ERROR: $*" >&2; exit 1; }

command -v hermes >/dev/null 2>&1 || die "hermes CLI 를 찾을 수 없다. hermes-agent 설치 후 재실행."
[ -f "$SOUL_SRC" ] || die "SOUL.md 없음: $SOUL_SRC"
[ -d "$PLAYBOOK_SRC" ] || die "플레이북 원본 없음: $PLAYBOOK_SRC
  sales-agent-desktop 을 클론하거나 SALES_SKILLS_SRC 로 경로를 지정하라."

# ── 1) 프로필 ────────────────────────────────────────────────────────────────
if [ -d "$PROFILE_DIR" ]; then
  say "프로필 존재: $PROFILE_DIR (생성 생략)"
else
  run hermes profile create "$PROFILE" --no-alias \
    --description "B2B 영업 실무 어시스턴트 — business-web 의 hermes 워크스페이스 백엔드"
fi

# ── 2) SOUL.md ──────────────────────────────────────────────────────────────
# 레포가 원본이다. 프로필 쪽을 직접 고치면 다음 셋업에서 덮여 사라진다.
run cp "$SOUL_SRC" "$PROFILE_DIR/SOUL.md"

# ── 3) 플레이북 ─────────────────────────────────────────────────────────────
bundled=$(find "$PLAYBOOK_SRC" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')
local_pb=0
[ -d "$REPO_PLAYBOOKS" ] && local_pb=$(find "$REPO_PLAYBOOKS" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')
say "플레이북 설치: 공유 번들 ${bundled}종 + 레포 ${local_pb}종 → $PROFILE_DIR/skills/sales"
if $APPLY; then
  mkdir -p "$PROFILE_DIR/skills/sales"
  cp -R "$PLAYBOOK_SRC"/. "$PROFILE_DIR/skills/sales"/
  [ -d "$REPO_PLAYBOOKS" ] && cp -R "$REPO_PLAYBOOKS"/. "$PROFILE_DIR/skills/sales"/
  chmod -R go-rwx "$PROFILE_DIR/skills/sales"
fi

# ── 4) api_server ───────────────────────────────────────────────────────────
# 키는 프로필 .env 에 둔다. hermes 는 env 를 config.yaml 의 token 보다 우선하므로,
# config 만 고치면 조용히 무시된다 — 이 우선순위가 진단이 어려운 401 의 단골 원인이다.
ENV_FILE="$PROFILE_DIR/.env"
if $APPLY; then
  if [ -f "$ENV_FILE" ] && grep -q "^API_SERVER_KEY=" "$ENV_FILE"; then
    say "API_SERVER_KEY 이미 설정됨 (유지)"
  else
    {
      echo "API_SERVER_ENABLED=true"
      echo "API_SERVER_KEY=$(python3 -c "import secrets; print('sa-'+secrets.token_hex(24))")"
      echo "API_SERVER_PORT=$PORT"
      echo "API_SERVER_HOST=127.0.0.1"
    } >> "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    say "API_SERVER_KEY 생성 (값은 출력하지 않는다)"
  fi
else
  say "(dry-run) $ENV_FILE 에 API_SERVER_ENABLED/KEY/PORT($PORT)/HOST 추가"
fi

# ── 5) 모델 ─────────────────────────────────────────────────────────────────
# 이미 다른 값으로 설정돼 있으면 덮되 무엇을 바꾸는지 말한다. 조용히 갈아 끼우면
# 누가 왜 바꿨는지 모르는 채로 답변 품질만 달라진다.
current="$(hermes -p "$PROFILE" config get model.default 2>/dev/null || true)"
if [ "$current" = "$MODEL" ]; then
  say "모델 이미 $MODEL"
elif [ -n "$current" ]; then
  run hermes -p "$PROFILE" config set model.default "$MODEL"
  say "모델 변경: $current → $MODEL"
else
  run hermes -p "$PROFILE" config set model.default "$MODEL"
  say "모델 설정: $MODEL"
fi

# ── 6) 플레이북 커버리지 검증 ───────────────────────────────────────────────
# 앱이 이름으로 부르는 플레이북이 실제로 깔렸는지 여기서 확인한다. 런타임에도
# /api/agents 가 같은 검사를 하지만, 셋업 단계에서 잡는 편이 훨씬 싸다.
if $APPLY; then
  python3 - "$REPO_DIR/src/lib/playbooks.ts" "$PROFILE_DIR/skills/sales" <<'PY'
import os, re, sys
src = open(sys.argv[1], encoding="utf-8").read()
block = src[src.index("PLAYBOOKS_BY_DOMAIN"):]
declared = set(re.findall(r'"([a-z][a-z0-9-]+)"', block))
m = re.search(r'ALWAYS_ON_PLAYBOOK = "([^"]+)"', src)
if m:
    declared.add(m.group(1))
installed = set(os.listdir(sys.argv[2]))
missing = sorted(declared - installed)
print(f"[setup] 선언 {len(declared)}종 / 설치 {len(installed)}종")
if missing:
    print("[setup] ERROR: 앱이 부르는데 설치되지 않은 플레이북:", ", ".join(missing))
    print("[setup]   sales-agent-desktop 번들이 오래됐을 수 있다. 그쪽을 먼저 갱신하라.")
    raise SystemExit(1)
print("[setup] 플레이북 커버리지 OK")
PY
fi

# ── 다음 단계 ───────────────────────────────────────────────────────────────
cat <<EOF

[setup] 다음 단계 (이 스크립트가 하지 않는 것):

  1. 프로필 기동
       hermes -p $PROFILE gateway run          # 포그라운드
       curl -s http://127.0.0.1:$PORT/health

  2. hermes-gateway 에 등록 — 앱은 게이트웨이를 거쳐서만 붙는다.
     프로필 키를 앱에 주지 않기 위해서다(폐기 가능한 클라이언트 키만 쥔다).
       python3 ~/.claude/skills/hermes-gateway/scripts/build_env.py \\
               --gateway-dir ~/gitspace/AIFde --dry-run   # 먼저 확인
       python3 ~/.claude/skills/hermes-gateway/scripts/build_env.py \\
               --gateway-dir ~/gitspace/AIFde
       pkill -f hermes-gateway && (cd ~/gitspace/AIFde && uv run hermes-gateway &)

  3. 앱 .env.local — 게이트웨이의 GATEWAY_CLIENT_KEYS 값 하나를 넣는다
     (프로필의 API_SERVER_KEY 가 아니다)
       HERMES_GATEWAY_URL=http://127.0.0.1:8700
       HERMES_GATEWAY_KEY=<gw-...>

  4. 확인
       curl -s localhost:3100/api/agents | python3 -m json.tool | grep -c '"status": "ok"'
EOF
