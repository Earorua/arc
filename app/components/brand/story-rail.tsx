const chapters = [
  ["01", "Understand", "看清岗位真正需要什么"],
  ["02", "Build", "每天完成一个可验证结果"],
  ["03", "Prove", "让作品成为能力证据"],
] as const;

export function StoryRail() {
  return (
    <ol className="story-rail" aria-label="Arc learning method" lang="en">
      {chapters.map(([number, title, description], index) => (
        <li
          className={index === 0 ? "story-chapter is-active" : "story-chapter"}
          key={title}
        >
          <span>{number}</span>
          <div>
            <strong>{title}</strong>
            <small lang="zh-CN">{description}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}
