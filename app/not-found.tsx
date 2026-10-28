import Link from "next/link";

export default function NotFound() {
  return <main className="reading-page not-found-page" id="main-content" tabIndex={-1} lang="zh-CN">
    <Link className="wordmark" href="/" aria-label="Arc. 首页" lang="en">Arc.</Link>
    <p className="section-index">404 · 页面未找到</p>
    <h1>这个页面暂时找不到了</h1>
    <p className="lede">链接可能已变更。你可以回到今日学习，或从首页重新开始。</p>
    <div className="not-found-actions"><Link className="primary-action" href="/today">回到今日学习</Link><Link className="text-action" href="/">返回首页</Link></div>
  </main>;
}
