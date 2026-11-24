import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/overview");
  return (
    <main className="flex min-h-dvh bg-surface">
      {/* Brand panel — desktop only */}
      <section className="relative hidden w-[46%] max-w-[640px] flex-col justify-between overflow-hidden border-r border-line bg-primary-soft p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <span className="text-lg font-semibold tracking-tight">MyDiary</span>
        </div>
        <div className="relative z-10 max-w-[440px]">
          <DiaryIllustration />
          <h2 className="mt-10 text-[30px] leading-[1.15] font-semibold tracking-tight text-fg">Organise your life, one day at a time.</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-2">Tasks, goals, habits, reminders and notes, together in one calm place.</p>
        </div>
        <p className="text-[12.5px] text-fg-3">Private by default. Your personal information is encrypted at rest.</p>
      </section>

      {/* Sign-in panel */}
      <section className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <img src="/icon.svg" alt="" className="h-9 w-9" />
            <span className="text-lg font-semibold tracking-tight">MyDiary</span>
          </div>
          {children}
          <p className="mt-10 text-center text-[12px] text-fg-3">
            <a href="/privacy" className="hover:text-fg-2 hover:underline">Privacy policy</a>
          </p>
        </div>
      </section>
    </main>
  );
}

/** Open diary with a checklist and a small calendar card, drawn in the app's own colours. */
function DiaryIllustration() {
  return (
    <svg viewBox="0 0 440 280" className="w-full max-w-[420px]" role="img" aria-label="An open diary with a checklist and a calendar">
      <defs>
        <filter id="soft" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#2b2470" floodOpacity="0.10" />
        </filter>
      </defs>
      {/* Book */}
      <g filter="url(#soft)">
        <path d="M30 40c40-14 110-14 190 6v214c-80-20-150-20-190-6z" fill="var(--surface)" stroke="var(--border-strong)" />
        <path d="M410 40c-40-14-110-14-190 6v214c80-20 150-20 190-6z" fill="var(--surface)" stroke="var(--border-strong)" />
      </g>
      <path d="M220 46v214" stroke="var(--border-strong)" strokeWidth="2" />
      {/* Bookmark */}
      <path d="M352 30h22v52l-11-9-11 9z" fill="var(--primary)" />
      {/* Left page: checklist */}
      <text x="58" y="82" fontSize="15" fontWeight="600" fill="var(--text)" fontFamily="Inter, system-ui, sans-serif">Today</text>
      {[
        { y: 110, w: 104, done: true },
        { y: 142, w: 120, done: true },
        { y: 174, w: 88, done: false },
        { y: 206, w: 112, done: false },
      ].map((r) => (
        <g key={r.y}>
          <circle cx="66" cy={r.y} r="8" fill={r.done ? "var(--primary)" : "none"} stroke={r.done ? "var(--primary)" : "var(--border-strong)"} strokeWidth="2" />
          {r.done && <path d={`M62 ${r.y}l3 3 5-6`} stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          <rect x="84" y={r.y - 4} width={r.w} height="8" rx="4" fill={r.done ? "var(--border)" : "var(--border-strong)"} />
        </g>
      ))}
      {/* Right page: mini calendar + habit dots */}
      <text x="248" y="82" fontSize="15" fontWeight="600" fill="var(--text)" fontFamily="Inter, system-ui, sans-serif">This week</text>
      {Array.from({ length: 7 }).map((_, i) => (
        <g key={i}>
          <rect x={248 + i * 21} y="100" width="16" height="16" rx="5" fill={i === 3 ? "var(--primary)" : i < 3 ? "var(--primary-soft)" : "var(--surface-2)"} stroke={i < 3 ? "var(--primary)" : "var(--border)"} strokeOpacity={i < 3 ? 0.35 : 1} />
        </g>
      ))}
      <rect x="248" y="140" width="128" height="44" rx="10" fill="var(--surface-2)" stroke="var(--border)" />
      <rect x="248" y="140" width="4" height="44" rx="2" fill="var(--primary)" />
      <rect x="262" y="152" width="70" height="7" rx="3.5" fill="var(--border-strong)" />
      <rect x="262" y="166" width="46" height="6" rx="3" fill="var(--border)" />
      <rect x="248" y="198" width="128" height="8" rx="4" fill="var(--surface-2)" />
      <rect x="248" y="198" width="84" height="8" rx="4" fill="var(--success)" />
    </svg>
  );
}
