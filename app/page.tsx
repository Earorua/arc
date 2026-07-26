import Link from "next/link";
import { PrecisionPathHero } from "./components/brand/precision-path-hero";
import { SiteHeader } from "./components/brand/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <PrecisionPathHero />
        <section className="editorial-section method-preview">
          <p className="section-index">01 · Method</p>
          <h2>路线不是课程目录。它是一组有依赖、有证据、有时间预算的决定。</h2>
          <Link href="/method">Explore the method →</Link>
        </section>
        <section className="editorial-section product-preview">
          <p className="section-index">02 · Product</p>
          <div>
            <strong>Today</strong>
            <span>只做今天最重要的 45 分钟。</span>
          </div>
          <div>
            <strong>Path</strong>
            <span>看清十八周如何抵达岗位目标。</span>
          </div>
          <div>
            <strong>Proof</strong>
            <span>把完成记录变成可分享的能力证据。</span>
          </div>
        </section>
        <section className="final-cta">
          <h2>
            Start with direction.
            <br />
            Finish with proof.
          </h2>
          <Link className="primary-action" href="/setup">
            Build my path →
          </Link>
        </section>
      </main>
    </>
  );
}
