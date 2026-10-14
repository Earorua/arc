import { SiteHeader } from "../components/brand/site-header";
import { LearningCoach } from "../components/agents/learning-coach";

export const metadata = { title: "学习规划师" };
export default function CoachPage() {
  return <><SiteHeader /><LearningCoach /></>;
}
