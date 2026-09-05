/**
 * Fills the stores with data shaped like real use, so the pages can be looked
 * at in the state they will actually be in.
 *
 * Every page has been verified empty and verified once with two or three rows.
 * Neither says what happens at forty — whether the overdue float still reads,
 * whether the domain row wraps, whether a long Korean title breaks the layout.
 * The interesting bugs live there.
 *
 * ## Not a fixture
 *
 * This writes to whatever database the environment points at, so it refuses to
 * run against the production paths unless told twice. A seed script that can
 * quietly overwrite someone's real action items is the same fault the test
 * suite had, and it is not worth repeating for convenience.
 *
 *   npx tsx scripts/seed.ts --db /tmp/seed         # into a scratch copy
 *   npx tsx scripts/seed.ts --db /tmp/seed --clear # wipe it first
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const dbDir = args[args.indexOf("--db") + 1];
const clear = args.includes("--clear");

if (!dbDir || dbDir.startsWith("--")) {
  console.error(
    "사용법: npx tsx scripts/seed.ts --db <디렉터리> [--clear]\n" +
      "  운영 데이터를 덮지 않도록 대상 디렉터리를 반드시 지정해야 합니다.",
  );
  process.exit(1);
}

if (dbDir.includes(".hermes/business-web-data")) {
  console.error(
    "거부: 운영 데이터 디렉터리입니다. 스크래치 경로를 지정하세요.\n" +
      "  이 스크립트는 실제 액션 아이템을 덮어쓸 수 있습니다.",
  );
  process.exit(1);
}

async function main() {
  mkdirSync(dbDir, { recursive: true, mode: 0o700 });
  process.env.ACTIONS_DB_PATH = join(dbDir, "actions.db");
  process.env.DEFECTS_DB_PATH = join(dbDir, "defects.db");

  const { createAction, updateAction, listActions } = await import("../src/lib/actions");
  const { recordDefect } = await import("../src/lib/defects");

  function iso(offsetDays: number): string {
    return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
  }

  if (clear) {
    const { _resetForTests: clearActions } = await import("../src/lib/actions");
    const { _resetForTests: clearDefects } = await import("../src/lib/defects");
    clearActions();
    clearDefects();
  }

  /**
   * Deliberately uneven. Real follow-ups are not evenly spread: 계약 carries most
   * of them because that is where the team is, several have no owner because the
   * playbooks refuse to invent one, and a few are long enough to test wrapping.
   */
  const ACTIONS: Parameters<typeof createAction>[0][] = [
    { title: "제11조 배경 IP 유보 문구 확정 (표준공급계약서_2026 유보 문구 재인용)", workspace: "contract", owner: "김대리", due: iso(-6) },
    { title: "제5조 지연배상 상한 신설안 법무 검토 의뢰", workspace: "contract", owner: "김대리", due: iso(-2) },
    { title: "제8조 간접손해 배제 문구 상대 회신에 포함", workspace: "contract", due: iso(1) },
    { title: "누락된 비밀유지·불가항력 조항 보완 초안 준비", workspace: "contract", owner: "박과장", due: iso(4) },
    { title: "갑 측 승인 권한자와 결재선 확인", workspace: "contract" },
    { title: "2차본에서 되돌아간 조항이 있는지 대조", workspace: "contract-diff", owner: "김대리", due: iso(-1) },
    { title: "우리 요청 3건 중 미반영 2건 재요청 문안 작성", workspace: "contract-diff", due: iso(2) },
    { title: "무제한 배상 조항 유효성 법무 질의서 송부", workspace: "contract-legal", owner: "이차장", due: iso(3) },
    { title: "질의 회신 기한을 협상 일정에서 역산해 확정", workspace: "contract-legal" },
    { title: "필수·교환·수용 구분 확정 후 협상 순서 정리", workspace: "contract-plan", owner: "박과장", due: iso(5) },
    { title: "지연배상 후퇴선 3단계 숫자 근거 마련", workspace: "contract-plan", due: iso(-4) },
    { title: "공급계약서 초안에 확정 필요 항목 표시", workspace: "contract-draft", owner: "김대리", due: iso(8) },
    { title: "만료 임박 계약 3건 갱신 협상 일정 잡기", workspace: "contract-ops", owner: "이차장", due: iso(11) },
    { title: "단가표 유효기간 지난 건 점검", workspace: "contract-ops" },
    { title: "B사 30석 확대 견적 요청 팔로업", workspace: "pipeline", owner: "박과장", due: iso(-3) },
    { title: "무응답 2주 경과 건 전화로 상태 확인", workspace: "pipeline", owner: "박과장", due: iso(0) },
    { title: "경쟁사 제안 대비 우리 강점 한 장 정리", workspace: "competitive", due: iso(6) },
    { title: "A사 첫 미팅 참석자 명단과 목적 확정", workspace: "account-brief", owner: "김대리", due: iso(2) },
    { title: "이번 분기 시황 요약을 판매계획에 반영", workspace: "market", due: iso(9) },
    { title: "설계 진입 샘플 3건 상태 업데이트", workspace: "design-win", owner: "이차장", due: iso(-8) },
    { title: "분기 리뷰 자료에 이행률 수치 채우기", workspace: "qbr", owner: "박과장", due: iso(14) },
    { title: "재고 소진 임박 품목 공급 계획 확인", workspace: "supply", due: iso(7) },
  ];

  const created = ACTIONS.map((a) => createAction(a));

  // A spread of statuses, including one stalled long enough to be a finding.
  updateAction(created[1].id, { status: "in_progress" });
  updateAction(created[5].id, { status: "in_progress" });
  updateAction(created[9].id, { status: "in_progress" });
  for (const i of [3, 12, 16, 18, 20]) updateAction(created[i].id, { status: "done" });
  updateAction(created[13].id, { status: "dropped", note: "단가표 갱신으로 불필요" });

  /**
   * Defects that recur, so the improvement page has both a profile-scoped pattern
   * (one habit across several workspaces) and a playbook-scoped one.
   */
  const DEFECTS: Parameters<typeof recordDefect>[0][] = [
    { workspace: "contract", kind: "spelling", quote: "지연배상율", reason: "'지연배상률'의 오타입니다." },
    { workspace: "contract-plan", kind: "spelling", quote: "배상율 인하", reason: "'배상률'의 오타입니다." },
    { workspace: "pipeline", kind: "spelling", quote: "연체 배상율", reason: "'연체 배상률'의 오타입니다." },
    { workspace: "contract-legal", kind: "number", quote: "민법 제393조", reason: "감액 근거는 제398조 제2항입니다." },
    { workspace: "contract-legal", kind: "number", quote: "민법 제393조 감액", reason: "감액 근거는 제398조 제2항입니다." },
    { workspace: "contract-legal", kind: "number", quote: "제393조에 따라 감액", reason: "감액 근거는 제398조 제2항입니다." },
    { workspace: "contract", kind: "number", quote: "40일이면 계약금액을 초과", reason: "2.5% × 40 은 정확히 100% 이며 초과가 아닙니다." },
    { workspace: "contract-diff", kind: "table-misread", quote: "월 최소물량 상한 8,000개", reason: "최소물량을 상한으로 읽었습니다." },
  ];
  for (const d of DEFECTS) recordDefect(d);

  const items = listActions();
  console.log(`시드 완료 → ${dbDir}`);
  console.log(`  액션 ${items.length}건 (기한 지남 ${items.filter((i) => i.due && i.due < iso(0) && (i.status === "open" || i.status === "in_progress")).length}, 담당 미정 ${items.filter((i) => !i.owner).length})`);
  console.log(`  결함 ${DEFECTS.length}건`);
  console.log(`\n실행:  ACTIONS_DB_PATH=${join(dbDir, "actions.db")} DEFECTS_DB_PATH=${join(dbDir, "defects.db")} npm start`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
