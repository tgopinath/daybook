import Link from "next/link";

export const metadata = { title: "Privacy policy" };

const UPDATED = "24 November 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-surface px-5 py-12 sm:px-8">
      <article className="mx-auto max-w-[680px] text-[15px] leading-relaxed text-fg-2">
        <Link href="/login" className="mb-10 inline-flex items-center gap-2.5 text-fg no-underline">
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <span className="text-[17px] font-semibold tracking-tight">MyDiary</span>
        </Link>
        <h1 className="text-[28px] font-semibold tracking-tight text-fg">Privacy policy</h1>
        <p className="mt-1 text-[13px] text-fg-3">Last updated {UPDATED}</p>

        <Section title="What MyDiary is">
          MyDiary is a personal organiser for tasks, goals, reminders, calendar events, habits, notes and personal information. It&apos;s a personal
          project, not a commercial service. There are no ads and your data is never sold or shared for marketing.
        </Section>

        <Section title="What we store">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Your account: name, email address, an optional profile photo, and a securely hashed password if you set one.</li>
            <li>Everything you add: tasks, goals, reminders, events, habits, notes, settings and AI assistant conversations.</li>
            <li>Sign-in sessions (a random token, stored only as a hash) and, if you allow notifications, your browser&apos;s push subscription.</li>
          </ul>
        </Section>

        <Section title="Signing in with Google">
          If you choose Continue with Google, Google shares your name, email address, profile photo and a Google account ID with MyDiary. They&apos;re
          used only to create and sign in to your account. MyDiary doesn&apos;t get your Google password and doesn&apos;t access any other Google data,
          such as Gmail, Drive or Contacts.
        </Section>

        <Section title="How it's protected">
          Data is sent over HTTPS. Fields in Personal Information are encrypted at rest with AES-256-GCM. Only you can see your data, and every request is
          checked against your signed-in account.
        </Section>

        <Section title="Services that process data">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Vercel hosts the app, and Neon hosts the database (both in the United States).</li>
            <li>Google handles Google sign-in when you use it.</li>
            <li>Your browser&apos;s push service (for example Google, Mozilla or Apple) delivers reminder notifications if you turn them on.</li>
            <li>If the AI assistant is enabled, the messages you send it and a summary of your tasks and schedule go to the configured AI provider to answer you.</li>
          </ul>
        </Section>

        <Section title="Your choices">
          In Settings → Data you can export everything as a file, remove sample data, or delete your account. Deleting your account permanently removes all of
          your data. Demo sessions use a temporary sample account that&apos;s deleted when you exit, or after a few hours.
        </Section>

        <Section title="Contact">
          Questions about your data: <a className="text-primary underline underline-offset-2" href="mailto:tgopinath1992@gmail.com">tgopinath1992@gmail.com</a>.
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-[17px] font-semibold text-fg">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
