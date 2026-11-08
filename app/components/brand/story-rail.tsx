const chapters = [
  ["01", "Understand", "See what the role really needs"],
  ["02", "Build", "Make something you can check each day"],
  ["03", "Prove", "Let your work show your skills"],
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
            <small lang="en">{description}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}
