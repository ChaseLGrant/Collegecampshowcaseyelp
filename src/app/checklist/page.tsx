import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Is this camp worth it? A checklist before you pay",
  description: "Questions to ask before registering for a college recruiting camp, ID camp or showcase: who attends, what it costs, and how to check.",
  alternates: { canonical: "/checklist" },
};

const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "Fit",
    items: [
      "Is your athlete realistically in range for the schools attending (level, academics, position)?",
      "Does the event match your athlete's grad year? Many camps say “all ages” but coaches focus on specific classes.",
      "Have you contacted the coaches you hope to see before the event, so they know to look for your athlete?",
    ],
  },
  {
    title: "Who will actually be there",
    items: [
      "Which college coaches are confirmed — by name — and how was that confirmed?",
      "Is the list “attending” or just “invited”? Ask the organizer which.",
      "What is the coach-to-athlete ratio? Ask how many athletes registered last year.",
    ],
  },
  {
    title: "Cost",
    items: [
      "What is the full cost: registration, fees, travel, lodging, meals and missed work or school?",
      "What is the refund or weather policy if the event is cancelled or your athlete is injured?",
      "Would the same money cover a more targeted option, such as a single school's prospect camp?",
    ],
  },
  {
    title: "What you get",
    items: [
      "Will your athlete get measurable results (times, velocities, video) you can send to coaches afterward?",
      "Is there time for direct conversation with coaches, or is it mostly drills and games?",
      "What do families who attended say? Read first-hand reviews and look for patterns, not single opinions.",
    ],
  },
  {
    title: "Red flags",
    items: [
      "Promises of scholarships, offers, rankings or “guaranteed exposure.” No event can guarantee these.",
      "Pressure to pay today, or prices that only appear after you hand over contact details.",
      "Coach lists without names, schools or dates, or a registration page you can't trace to the organizer.",
    ],
  },
];

export default function ChecklistPage() {
  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="h1">Is this camp worth it?</h1>
      <p className="mt-2 muted">A checklist for parents and athletes before paying for a college recruiting camp, ID camp or showcase. Use it alongside the facts and reviews on each Camp Check listing.</p>
      <div className="mt-8 space-y-6">
        {SECTIONS.map((s) => (
          <section key={s.title} className="card p-5">
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {s.items.map((i) => (
                <li key={i} className="flex gap-2"><span aria-hidden="true" className="mt-0.5 inline-block h-4 w-4 flex-none rounded border border-navy-300" />{i}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-8 text-sm muted">Camp Check is independent and does not guarantee recruiting exposure, offers or roster placement from any event. <Link href="/search" className="link">Search camps</Link> or <Link href="/methodology" className="link">see how our ratings work</Link>.</p>
    </div>
  );
}
