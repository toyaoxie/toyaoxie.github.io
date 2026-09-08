// ---- Single source of truth for News ----
// To add a new story:
//   1. Add an entry to the TOP of this array (slug must match a folder under /news/<slug>/).
//   2. Copy /news/_template/index.html to /news/<slug>/index.html and fill it in.
// Nothing else needs to change — the homepage teaser and the /news.html archive both read from here.
//
// NOTE: every "image" below points at the portrait (yao-xie.png) as a placeholder —
// there are no real per-story photos yet. Swap each one for a real image once you have it
// (drop the file in /news/<slug>/ and update the path here).
const newsItems = [
  {
    slug: "dublin-tech-week-2026",
    date: "2026",
    category: "SPEAKING",
    title: "Featured contributor at Dublin Tech Week",
    summary: "Spoke on \u201cResearch to Startup\u201d innovation pathways alongside European Commission and Parliament liaison offices in Ireland.",
    image: "/yao-xie.png"
  },
  {
    slug: "ecis-2026-associate-editor",
    date: "2026",
    category: "ACADEMIC LEADERSHIP",
    title: "Invited as Associate Editor for ECIS 2026",
    summary: "Overseeing peer review and meta-review decisions for the European Conference on Information Systems.",
    image: "/yao-xie.png"
  },
  {
    slug: "bera-ecr-journey",
    date: "2026",
    category: "RESEARCH",
    title: "Paper accepted at BERA ECR Journey",
    summary: "New research accepted for presentation at the BERA Early Career Researcher event.",
    image: "/yao-xie.png"
  },
  {
    slug: "who-bulletin-publication",
    date: "2025",
    category: "PUBLICATION",
    title: "Published in the WHO Bulletin",
    summary: "\u201cTowards an inclusive digital health ecosystem\u201d appeared in the Bulletin of the World Health Organization.",
    image: "/yao-xie.png"
  },
  {
    slug: "aies-2025-presentation",
    date: "2025",
    category: "PUBLICATION",
    title: "AI Contextual Framework presented at AAAI/ACM AIES",
    summary: "A zoning approach to AI governance, reframing oversight as well-being efficacy.",
    image: "/yao-xie.png"
  },
  {
    slug: "rcsi-ucd-scholarship",
    date: "2025",
    category: "RECOGNITION",
    title: "Awarded the RCSI & UCD Campus Scholarship",
    summary: "Supporting One Health field training as part of the PhD programme.",
    image: "/yao-xie.png"
  }
];
