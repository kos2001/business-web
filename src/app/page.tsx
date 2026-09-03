import Link from "next/link";
import { AGENTS, STAGES } from "@/lib/agents";
import { STAGE_META } from "@/lib/stage-meta";
import StageIcon from "@/components/StageIcon";

/**
 * The home board.
 *
 * This route used to `redirect()` straight into the first workspace, which was
 * fine when there were seven of them and the reader was the person who wrote
 * the roster. With twenty-three, someone opening the app for the first time has
 * no way to learn what it can do — and this team is mostly non-developers, who
 * will not go hunting through a sidebar to find out.
 *
 * So the entry point is a map of the work instead: every domain, every
 * workspace, each with a plain sentence and a real example question. Nothing
 * here is interactive beyond the links, so it stays a server component.
 */
export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="border-b border-line pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">영업 에이전트</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          하고 싶은 일을 고르면 그 업무 전용 에이전트가 열립니다. 각 에이전트는
          영업팀 플레이북을 그대로 따르므로, 자료를 붙여넣거나 파일을 첨부하고
          평소 쓰는 말로 요청하면 됩니다.
        </p>
        <p className="mt-3 text-xs text-ink-soft">
          어디로 갈지 모르겠다면 —{" "}
          <Link href="/w/discovery" className="font-medium text-accent hover:underline">
            미팅 정리
          </Link>
          가 가장 자주 쓰입니다.
        </p>
      </header>

      <div className="flex flex-col gap-9 pt-8">
        {STAGES.map((stage) => {
          const meta = STAGE_META[stage];
          const items = AGENTS.filter((a) => a.stage === stage);

          return (
            <section key={stage}>
              <div className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    color: meta.color,
                    backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                  }}
                >
                  <StageIcon stage={stage} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">{stage}</h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                    {meta.what}
                  </p>
                </div>
              </div>

              <ul className="mt-3.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((agent) => (
                  <li key={agent.slug}>
                    <Link
                      href={`/w/${agent.slug}`}
                      className="group flex h-full flex-col rounded-xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-sm"
                      style={{ borderTopColor: meta.color, borderTopWidth: 2.5 }}
                    >
                      <span className="text-sm font-medium group-hover:text-accent">
                        {agent.label}
                      </span>
                      <span className="mt-1 text-xs leading-relaxed text-ink-soft">
                        {agent.blurb}
                      </span>
                      {/* A real question the workspace answers — far more use
                          than a feature list to someone deciding where to go. */}
                      <span className="mt-3 border-t border-line pt-2 text-[11px] leading-relaxed text-ink-soft/80">
                        예) {agent.starters[0]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <footer className="mt-12 border-t border-line pt-5 text-xs leading-relaxed text-ink-soft">
        고객 정보가 들어간 자료를 붙여넣어도 됩니다. 전송 전에 이메일·전화번호·
        주민번호·사업자번호·카드번호를 자동으로 가립니다 — 각 화면 아래
        &lsquo;고객정보 보호&rsquo;가 켜져 있는지 확인하세요.
      </footer>
    </div>
  );
}
