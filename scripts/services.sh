#!/usr/bin/env bash
# business-web 서비스 5종을 한 번에 다룬다.
#
#   ./scripts/services.sh status    상태 (기본)
#   ./scripts/services.sh start     내려간 것만 올린다
#   ./scripts/services.sh restart   전부 재기동
#   ./scripts/services.sh logs      최근 로그
#   ./scripts/services.sh install   launchd 에 등록 (최초 1회)
#
# ## 왜 이 스크립트가 있나
#
# 서비스는 launchd LaunchAgent 로 등록돼 있고 로그인 시 뜨도록 설정돼 있다. 다만
# 이 머신에서는 **KeepAlive 자동 재시작이 동작하지 않는 것을 실측으로 확인했다** —
# 프로세스를 죽이면 launchd 가 죽음은 감지하지만(state 변경) 재시작을 시도하지
# 않는다(runs 카운터 그대로). hermes 가 자체 설치한 서비스도 마찬가지였으므로 이
# 레포의 plist 문제가 아니라 환경 조건이다.
#
# 그래서 실질적인 복구 수단은 `kickstart` 이고, 이 스크립트가 그것을 감싼다.
set -uo pipefail

UID_="$(id -u)"

# 라벨:포트:표시이름
#
# mi-report(:8000) 와 marketing-agent(:8012) 는 여기서 뺐다. 두 워크스페이스가
# sales-agent 로 옮겨가면서 business-web 은 더 이상 그 서비스들을 부르지 않는다.
# 각자 별도 저장소의 앱이므로 launchd 등록 자체는 건드리지 않았다 — 이 스크립트가
# 관리하지 않을 뿐이다. 완전히 내리려면 launchctl 로 직접 unload 해야 한다.
SERVICES=(
  "ai.hermes.gateway-sales-agent:8660:sales-agent"
  "dev.businessweb.hermes-gateway:8700:hermes-gateway"
  "dev.businessweb.web:3100:business-web"
)

alive() { # 포트가 실제로 응답하는가. launchd 의 PID 보다 이쪽이 진실에 가깝다.
  local port="$1"
  if [ "$port" = "3100" ]; then
    curl -sf -m 3 -o /dev/null "http://127.0.0.1:$port/" 2>/dev/null
  else
    curl -sf -m 3 "http://127.0.0.1:$port/health" >/dev/null 2>&1
  fi
}

status() {
  printf "%-18s %-7s %-8s %s\n" "서비스" "포트" "PID" "상태"
  printf -- "─%.0s" {1..46}; echo
  local down=0 pid label port name
  for s in "${SERVICES[@]}"; do
    IFS=: read -r label port name <<<"$s"
    pid="$(launchctl list 2>/dev/null | awk -v l="$label" '$3==l{print $1}')"
    [ -z "$pid" ] && pid="미등록"
    if alive "$port"; then
      printf "%-18s %-7s %-8s %s\n" "$name" ":$port" "$pid" "정상"
    else
      printf "%-18s %-7s %-8s %s\n" "$name" ":$port" "$pid" "내려감"
      down=$((down+1))
    fi
  done
  [ "$down" -gt 0 ] && echo && echo "${down}개 내려감 — './scripts/services.sh start' 로 올립니다."
  return 0
}

kick() { launchctl kickstart "gui/$UID_/$1" >/dev/null 2>&1; }

start() {
  local started=0 all label port name
  for s in "${SERVICES[@]}"; do
    IFS=: read -r label port name <<<"$s"
    if alive "$port"; then
      echo "  $name 이미 정상"
    else
      echo "  $name 기동…"; kick "$label"; started=$((started+1))
    fi
  done
  if [ "$started" -eq 0 ]; then echo; status; return 0; fi
  # 게이트웨이는 업스트림을 물어보며 뜨므로 웹보다 늦다.
  echo; echo "기동 대기…"
  for _ in $(seq 1 20); do
    all=1
    for s in "${SERVICES[@]}"; do
      IFS=: read -r _ port _ <<<"$s"; alive "$port" || all=0
    done
    [ "$all" -eq 1 ] && break
    sleep 4
  done
  echo; status
}

restart() {
  local label name
  for s in "${SERVICES[@]}"; do
    IFS=: read -r label _ name <<<"$s"
    echo "  $name 재기동"; launchctl kickstart -k "gui/$UID_/$label" >/dev/null 2>&1
  done
  echo; echo "기동 대기…"; sleep 12; status
}

logs() {
  for f in ~/Library/Logs/business-web/*.error.log; do
    [ -s "$f" ] || continue
    echo "═══ $(basename "$f") ═══"; tail -8 "$f"; echo
  done
  echo "═══ sales-agent ═══"
  tail -8 ~/.hermes/profiles/sales-agent/logs/gateway.error.log 2>/dev/null
}

install() {
  local dir; dir="$(cd "$(dirname "$0")/.." && pwd)"
  # 웹은 빌드 산출물을 서빙하므로 빌드가 없으면 뜨자마자 죽는다.
  [ -f "$dir/.next/BUILD_ID" ] || { echo "ERROR: .next 빌드가 없습니다. 'npm run build' 후 재실행."; exit 1; }
  for f in "$dir"/launchd/*.plist; do
    local base; base="$(basename "$f")"
    cp "$f" "$HOME/Library/LaunchAgents/$base"
    launchctl unload "$HOME/Library/LaunchAgents/$base" 2>/dev/null
    launchctl load -w "$HOME/Library/LaunchAgents/$base" 2>&1 | head -1
    echo "  등록 $base"
  done
  echo
  echo "sales-agent 는 hermes 가 관리합니다: hermes -p sales-agent gateway install"
  echo "그다음 './scripts/services.sh start'."
}

case "${1:-status}" in
  status) status ;;
  start) start ;;
  restart) restart ;;
  logs) logs ;;
  install) install ;;
  *) echo "사용: $0 [status|start|restart|logs|install]"; exit 1 ;;
esac
