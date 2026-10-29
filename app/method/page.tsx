import Link from "next/link";
import { SiteHeader } from "../components/brand/site-header";
import { flagshipRole } from "../data/flagship-role";
import "./method.css";

export default function MethodPage() {
  return (
    <>
      <SiteHeader current="method" />
      <main id="main-content" tabIndex={-1} className="reading-page method-page" lang="zh-CN">
        <header className="method-intro">
          <p className="eyebrow">学习方法 <span lang="en">· Method</span></p>
          <h1>把目标，变成每天可完成的一步</h1>
          <p className="lede">从岗位需要的能力出发，结合你的基础和时间，安排能留下具体成果的练习。</p>
        </header>
        <div className="method-example-context"><span>贯穿这三步的公开样例</span><strong>{flagshipRole.name}</strong></div>
        <ol className="method-sequence">
          <li>
            <div className="method-step-heading"><span className="section-index">01</span><h2>如何判断学什么</h2></div>
            <div className="method-step-content"><p>先确定目标需要哪些能力，再看技能之间的先后关系，结合你已有的基础决定从哪里开始。</p>
              <div className="method-example"><span>同一个例子 · 表单提交</span><h3>让界面能可靠地提交数据</h3><p>这个任务会用到 React、TypeScript 与 HTTP 接口。先理解 Web 与类型基础，再处理客户端和服务端的边界。</p></div>
            </div>
          </li>
          <li>
            <div className="method-step-heading"><span className="section-index">02</span><h2>如何安排今天</h2></div>
            <div className="method-step-content"><p>把路线拆成有时间预算的学习单元。每次练习都说清要做什么、按什么步骤做，以及完成后留下什么。</p>
              <div className="method-example"><span>样例任务 · {flagshipRole.today.minutes} 分钟</span><h3>{flagshipRole.today.title}</h3><p>{flagshipRole.today.steps.map(({ label }) => label).join("；")}。</p></div>
            </div>
          </li>
          <li>
            <div className="method-step-heading"><span className="section-index">03</span><h2>如何确认学会</h2></div>
            <div className="method-step-content"><p>留下可回看的作品与说明，把练习结果关联到技能。完成记录与作品审核分别展示，清楚区分做过、提交过和验证过。</p>
              <div className="method-example"><span>同一项任务 · 作品证据</span><h3>一份能复现结果的代码变更</h3><p>保存 Git 提交或实现说明，分别记录有效输入和空值的处理结果，让别人能检查这次表单提交的实现。</p></div>
            </div>
          </li>
        </ol>
        <footer className="method-next"><Link className="primary-action" href="/showcase?view=path">查看完整样例</Link></footer>
      </main>
    </>
  );
}
