const capabilities = [
  {
    title: "找到当前最值得学的内容",
    description: "学习规划结合你的目标、基础和可用时间，梳理现有路线的学习重点，说明先学什么、为什么这样安排。",
    example: "我每周只有 4 小时，基础也不太扎实，应该先从哪里开始？",
  },
  {
    title: "把目标拆成可检查的阶段成果",
    description: "把路线中的任务组织成阶段目标，写清每个阶段要完成什么、达到什么标准，让你知道下一步该往哪里走。",
    example: "学完这一阶段，我应该能独立做出什么？",
  },
  {
    title: "在进度变化时重新梳理路线",
    description: "遇到持续卡点，或在设置中调整了学习时间后，可以通过学习规划重新安排未完成任务。先查看计划差异，再决定是否采用。",
    example: "最近总卡在基础部分，帮我调整接下来的学习顺序。",
  },
  {
    title: "把眼前的问题讲清楚",
    description: "学习伙伴结合当前任务和已有学习资料，用例子解释概念、拆解解题思路。需要更细的说明时，可以开启深入讲解并继续追问。",
    example: "这一步我没理解，能用一个简单例子说明，再带我拆解吗？",
  },
];

export function CoachOverview() {
  return <section className="coach-overview" aria-labelledby="coach-overview-title" lang="zh-CN">
    <div className="coach-overview-heading">
      <p className="section-index">WHAT YOUR COACH CAN DO</p>
      <h2 id="coach-overview-title">从「该学什么」，<br />到「这一步怎么做」。</h2>
      <p>学习规划帮你看清整条路线，学习伙伴陪你解决当前的问题。</p>
    </div>
    <ol className="coach-capabilities">
      {capabilities.map((capability, index) => <li key={capability.title}>
        <span className="coach-capability-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <div>
          <h3>{capability.title}</h3>
          <p>{capability.description}</p>
          <blockquote><span>你可以这样问</span><p>“{capability.example}”</p></blockquote>
        </div>
      </li>)}
    </ol>
    <div className="coach-getting-started">
      <div><p className="section-index">HOW TO START</p><h3>带着你的目标开始。</h3></div>
      <ol>
        <li><strong>01 / 完成学习设置</strong><p>登录后，填写目标、当前基础和可用时间，建立自己的学习路线。</p></li>
        <li><strong>02 / 说出当前的困难</strong><p>需要整体安排，就在本页提交规划重点；遇到具体问题，打开右下角的学习伙伴。</p></li>
        <li><strong>03 / 查看建议，再行动</strong><p>规划建议确认后才会更新路线。答疑中发现需要调整计划，也可以把问题带到学习规划继续梳理。</p></li>
      </ol>
      <p className="coach-account-note">你的学习目标、对话和规划记录都归属于当前登录账号。</p>
    </div>
  </section>;
}

export function CoachRouteArt() {
  return <div className="coach-route-art" aria-hidden="true"><span className="coach-art-label">A THOUGHTFUL WAY FORWARD</span>
    <svg viewBox="0 0 320 260" fill="none"><path d="M24 225H95Q122 225 122 198V159Q122 130 151 130H196Q225 130 225 101V64Q225 36 254 36H297" stroke="currentColor" strokeWidth="2" />
      <path d="M288 28L297 36L288 44" stroke="currentColor" strokeWidth="2" /><circle cx="34" cy="225" r="7" fill="var(--ivory)" stroke="currentColor" strokeWidth="2" />
      <circle cx="155" cy="130" r="7" fill="var(--signal)" /><circle cx="258" cy="36" r="7" fill="var(--charcoal)" />
      <path d="M34 207V50M155 112V50" stroke="var(--hairline)" strokeDasharray="3 5" />
      <text x="20" y="34">01</text><text x="143" y="34">02</text><text x="247" y="17">03</text></svg>
    <div className="coach-art-legend"><span>理解现在</span><span>梳理重点</span><span>走向目标</span></div>
  </div>;
}
