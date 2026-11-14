import { tr } from '../../core/i18n.ts';

// Asked before a goal is deleted, from the goal's own screen and from the slide-to-remove row alike.
export const confirmRemoveGoal = (name: string): boolean =>
  window.confirm(tr('Delete the goal "{0}"? Its top-ups are deleted with it. This cannot be undone.', name));
