import { useId } from "react";
import { CodeBlock, sectionHeadingClass } from "../ui/Page";

/** A labelled region holding one formatted JSON value. */
export function JsonSection({
  title,
  value,
  className,
}: {
  title: string;
  value: unknown;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={className}>
      <h3 id={id} className={sectionHeadingClass}>
        {title}
      </h3>
      <CodeBlock className="text-fg">{JSON.stringify(value, null, 2)}</CodeBlock>
    </section>
  );
}
