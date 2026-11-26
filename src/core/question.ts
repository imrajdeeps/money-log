// The app's own "are you sure?" card shows a question as a heading with what follows from it underneath.

/** Splits "Delete the goal? Its top-ups go too." into the heading and the line under it. */
export function splitQuestion(text: string): { title: string; body: string } {
  const at = text.search(/\?(\s|$)/);
  if (at < 0) return { title: text.trim(), body: '' };
  return { title: text.slice(0, at + 1).trim(), body: text.slice(at + 1).trim() };
}
