import type { Tag as TagT } from "@/lib/types";

const tone = {
  neutral: "bg-white/5 text-muted",
  bad: "bg-bad/10 text-bad",
  good: "bg-good/10 text-good",
};

export function Tag({ tag }: { tag: TagT }) {
  return (
    <span
      title={tag.detail}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${tone[tag.tone]}`}
    >
      {tag.label}
    </span>
  );
}
