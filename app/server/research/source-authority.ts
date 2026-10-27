import type { ResearchCandidateResource } from "../../contracts/research";

type Authority = {
  publisher: string;
  publisherCountry: "US" | "CN";
  aliases: readonly string[];
  hosts: readonly string[];
  path: RegExp;
  kind: "university-course" | "company-course" | "official-reference";
  scope: string;
};

// Publisher provenance checked against official pages on 2026-10-24. This is a
// bounded initial catalog, not a claim that every page is current, free or relevant.
// Add publishers only with an official provenance check; never trust model labels,
// an entire marketplace, arbitrary university subdomains or community content.
const authorities: readonly Authority[] = [
  { publisher: "MIT", publisherCountry: "US", aliases: ["MIT", "MIT OpenCourseWare", "MIT OCW", "Massachusetts Institute of Technology", "麻省理工学院"], hosts: ["ocw.mit.edu", "www.ocw.mit.edu"], path: /^\/courses\/[^/]+(?:\/|$)/u, kind: "university-course", scope: "/courses/<course>/" },
  { publisher: "Harvard University", publisherCountry: "US", aliases: ["Harvard", "Harvard University", "Harvard CS50", "CS50", "哈佛大学"], hosts: ["cs50.harvard.edu"], path: /^\/(?:x|ai|python|sql|web|r|business|cybersecurity)\/(?:$|[^~])/u, kind: "university-course", scope: "/x/, /ai/, /python/, /sql/, /web/, /r/, /business/, /cybersecurity/" },
  { publisher: "Stanford University", publisherCountry: "US", aliases: ["Stanford", "Stanford University", "Stanford Engineering Everywhere", "Stanford SEE", "Stanford CS229", "斯坦福大学"], hosts: ["see.stanford.edu"], path: /^\/Course\/[a-z]+\d+(?:\/|$)/iu, kind: "university-course", scope: "/Course/<course-code>" },
  { publisher: "Stanford University", publisherCountry: "US", aliases: ["Stanford", "Stanford University", "Stanford CS229", "斯坦福大学"], hosts: ["cs229.stanford.edu"], path: /^\/(?:$|index\.html$|main_notes\.pdf$|materials(?:\.html|-.*\.pdf)|notes\/|lectures\/|section\/)/u, kind: "university-course", scope: "/, /main_notes.pdf, /materials.html, /notes/, /lectures/, /section/" },
  { publisher: "Yale University", publisherCountry: "US", aliases: ["Yale", "Yale University", "Open Yale Courses", "耶鲁大学"], hosts: ["oyc.yale.edu"], path: /^\/[a-z-]+\/[a-z]+-\d{3}(?:-\d{2})?(?:\/|$)/u, kind: "university-course", scope: "/<department>/<course-code>" },
  { publisher: "Google", publisherCountry: "US", aliases: ["Google", "Google for Developers", "Google Developers", "Google Cloud", "谷歌"], hosts: ["developers.google.com", "developers.google.cn"], path: /^\/machine-learning\/[^/]+(?:\/|$)/u, kind: "company-course", scope: "/machine-learning/<course-or-module>" },
  { publisher: "Google", publisherCountry: "US", aliases: ["Google", "Google Cloud", "Google Skills", "Google Cloud Skills Boost", "谷歌"], hosts: ["www.skills.google", "skills.google", "www.cloudskillsboost.google", "cloudskillsboost.google"], path: /^\/(?:course_templates|paths)\/\d+(?:\/|$)/u, kind: "company-course", scope: "/course_templates/<id> or /paths/<id>; verify price and actual lessons" },
  { publisher: "Microsoft", publisherCountry: "US", aliases: ["Microsoft", "Microsoft Learn", "Microsoft Corporation", "微软"], hosts: ["learn.microsoft.com"], path: /^\/(?:[a-z]{2}-[a-z]{2}\/)?training\/(?:modules|paths)\/[^/]+(?:\/|$)/u, kind: "company-course", scope: "/<locale>/training/modules/<module> or /<locale>/training/paths/<path>" },
  { publisher: "Microsoft", publisherCountry: "US", aliases: ["Microsoft", "Microsoft Learn", "Microsoft Corporation", "微软"], hosts: ["learn.microsoft.com"], path: /^\/(?:[a-z]{2}-[a-z]{2}\/)?(?:azure|fabric|power-bi|sql|dotnet)\/[^/]+(?:\/|$)/u, kind: "official-reference", scope: "/<locale>/azure/, /fabric/, /power-bi/, /sql/, /dotnet/ (official documentation only)" },
  { publisher: "Microsoft Research", publisherCountry: "US", aliases: ["Microsoft", "Microsoft Research", "微软研究院", "微软"], hosts: ["www.microsoft.com", "microsoft.com"], path: /^\/[a-z]{2}-[a-z]{2}\/research\/(?:publication|project|group)\/[^/]+(?:\/|$)/u, kind: "official-reference", scope: "/<locale>/research/publication/, /project/, /group/ (primary research only)" },
  { publisher: "dbt Labs", publisherCountry: "US", aliases: ["dbt", "dbt Labs", "dbt Developer Hub"], hosts: ["docs.getdbt.com"], path: /^\/(?:docs|guides|best-practices|reference)\/[^/]+(?:\/|$)/u, kind: "official-reference", scope: "/docs/, /guides/, /best-practices/, /reference/ (dbt-specific instruction only)" },
  { publisher: "Kimball Group", publisherCountry: "US", aliases: ["Kimball Group", "The Kimball Group", "Ralph Kimball"], hosts: ["www.kimballgroup.com", "kimballgroup.com"], path: /^\/data-warehouse-business-intelligence-resources\/kimball-techniques(?:\/|$)/u, kind: "official-reference", scope: "/data-warehouse-business-intelligence-resources/kimball-techniques/ (original dimensional modeling reference)" },
  { publisher: "Alibaba Cloud", publisherCountry: "CN", aliases: ["Alibaba Cloud", "Alibaba Cloud Academy", "阿里云", "阿里云学院"], hosts: ["edu.alibabacloud.com"], path: /^\/course\/\d+(?:\/info)?\/?$/u, kind: "company-course", scope: "/course/<id> or /course/<id>/info (official Academy course; keep the exact searched URL and verify lessons and separate cloud-service costs)" },
];

const normalizePublisher = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");

export function hasVerifiedLearningAuthority(resource: ResearchCandidateResource): boolean {
  const url = new URL(resource.url); // Already canonicalized by the source auditor.
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  return authorities.some(authority => authority.hosts.includes(url.hostname)
    && authority.path.test(url.pathname)
    && authority.aliases.some(alias => normalizePublisher(alias) === normalizePublisher(resource.provider))
    && (authority.kind !== "official-reference" || (resource.format !== "course" && resource.format !== "practice")));
}

// The exact catalog used by validation also guides search, so the provider does
// not have to guess which publishers or teaching surfaces the app can verify.
export const RESEARCH_SOURCE_AUTHORITY_POLICY = "Learning-resource authority is mandatory for every primary, alternative and reference resource. "
  + "Prefer free open courses from leading universities in the United States for foundations. For official company courses, prefer US-headquartered technology companies first, then leading Chinese technology companies. Both free and paid company courses are eligible; verify their actual cost and access. This is a preference among comparably suitable courses: relevance, level and accessible teaching content take precedence over geography. Publisher country is independent of course language, URL locale and hosting location; use the verified catalog metadata, never infer nationality from an English name or a .com/.cn address. Match the actual skill and prerequisites; never add a prestigious but irrelevant course. "
  + "Use only the verified publisher and teaching/reference surfaces below, with the listed publisher label. Official technical references supplement courses where appropriate; they are not substitutes for a missing course syllabus. "
  + "Reject woshipm.com training, unverified bootcamps, marketing enrollment pages, unofficial mirrors, personal/community posts and course aggregators. Coursera, edX or YouTube alone does not establish the course publisher; use a verified official teaching entry instead. "
  + "A catalog match is publisher provenance only: still verify actual lessons, current access, cost and relevance. Paid company courses are allowed with truthful cost=paid or mixed and a verified free alternative. Do not invent a URL to fit this catalog. If credible coverage is unavailable, preserve the gap for review. "
  + JSON.stringify(authorities.map(({ publisher, publisherCountry, hosts, scope, kind }) => ({ publisher, publisherCountry, hosts, scope, kind })));
