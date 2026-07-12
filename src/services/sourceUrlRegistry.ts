let activeObjectUrl: string | null = null;

export function commitSourceObjectUrl(nextObjectUrl: string | null): void {
  const previous = activeObjectUrl;
  activeObjectUrl = nextObjectUrl;
  if (previous && previous !== nextObjectUrl) URL.revokeObjectURL(previous);
}

export function discardPreparedObjectUrl(objectUrl: string | null): void {
  if (objectUrl && objectUrl !== activeObjectUrl) URL.revokeObjectURL(objectUrl);
}
