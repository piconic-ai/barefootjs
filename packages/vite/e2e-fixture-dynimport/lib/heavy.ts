// Stand-in for an app module that lives OUTSIDE the `components` dir, so a
// relative specifier reaching it has to be re-anchored when the template is
// emitted to a directory at a different depth.
export function heavy(): number {
  return 42
}
