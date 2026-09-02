import { redirect } from "next/navigation";
import { AGENTS } from "@/lib/agents";

export default function Home() {
  redirect(`/w/${AGENTS[0].slug}`);
}
