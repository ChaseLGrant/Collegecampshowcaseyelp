import Link from "next/link";
import { DIRECTORY_SPORTS, directoryPath, sportLabel } from "@/lib/sports";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-navy-100 bg-navy-50">
      <div className="container-page grid gap-8 py-10 text-sm sm:grid-cols-3">
        <div>
          <a href="https://theathletemarket.com" target="_blank" rel="noopener" className="flex items-center gap-2.5" aria-label="Camp Check by The Athlete Market (opens theathletemarket.com)">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/athlete-market-mark.webp" alt="The Athlete Market logo" width={50} height={40} className="h-10 w-auto" />
            <span className="font-bold">Camp Check</span>
          </a>
          <p className="mt-2 muted">An independent directory of college recruiting camps and showcases from The Athlete Market. Real reviews, independent research.</p>
        </div>
        <div>
          <p className="font-semibold">Browse by sport</p>
          <ul className="mt-2 grid grid-cols-2 gap-1">
            {DIRECTORY_SPORTS.map((s) => (
              <li key={s}><Link className="hover:text-brand" href={directoryPath(s)}>{sportLabel(s)} camps</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-semibold">Trust & help</p>
          <ul className="mt-2 space-y-1">
            <li><Link className="hover:text-brand" href="/methodology">How ratings & research work</Link></li>
            <li><Link className="hover:text-brand" href="/submit-camp">Submit a camp</Link></li>
            <li><Link className="hover:text-brand" href="/pricing">Recruiting Insider</Link></li>
            <li><Link className="hover:text-brand" href="/checklist">Is this camp worth it? checklist</Link></li>
          </ul>
        </div>
      </div>
      <p className="container-page pb-2 text-sm">
        Camp Check is a free resource from{" "}
        <a href="https://theathletemarket.com" target="_blank" rel="noopener" className="font-medium text-brand hover:underline">The Athlete Market ↗</a>
      </p>
      <p className="container-page pb-8 text-xs text-navy-500">
        Camp Check does not guarantee recruiting exposure, scholarship offers or roster placement from any event. Verify details with the organizer before registering.
      </p>
    </footer>
  );
}
