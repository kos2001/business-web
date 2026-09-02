import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "영업 에이전트 워크스페이스",
  description: "hermes-agent 기반 영업팀 업무 에이전트",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
