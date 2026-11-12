/** Keep the modal isolated without changing existing inert state on cleanup. */
export function containResearchDialogFocus(dialog: HTMLElement, shell: HTMLElement, close: () => void) {
  const document = dialog.ownerDocument;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const background = new Map<HTMLElement, boolean>();
  for (let branch: HTMLElement | null = shell; branch?.parentElement; branch = branch.parentElement) {
    for (const sibling of Array.from(branch.parentElement.children)) {
      if (sibling !== branch && sibling instanceof HTMLElement && !background.has(sibling)) {
        background.set(sibling, sibling.inert);
        sibling.inert = true;
      }
    }
    if (branch.parentElement === document.body) break;
  }
  const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]'))
    .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[inert]') && element.getClientRects().length > 0);
  const enter = () => (controls()[0] ?? dialog).focus({ preventScroll: true });
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const elements = controls();
    const first = elements[0];
    const last = elements.at(-1);
    if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
    const inside = dialog.contains(document.activeElement);
    if (event.shiftKey && (!inside || document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (!inside || document.activeElement === last || document.activeElement === dialog)) {
      event.preventDefault(); first.focus();
    }
  };
  const focusin = (event: FocusEvent) => {
    if (event.target instanceof Node && !dialog.contains(event.target)) enter();
  };
  document.addEventListener('keydown', keydown);
  document.addEventListener('focusin', focusin);
  enter();
  return () => {
    document.removeEventListener('keydown', keydown);
    document.removeEventListener('focusin', focusin);
    for (const [element, wasInert] of background) element.inert = wasInert;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
}
