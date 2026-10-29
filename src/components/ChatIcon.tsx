/** Small, application-owned icons shared by the two chat composers. */
export function ChatIcon({ name }: { name: "new" | "history" | "export" | "settings" | "more" | "send" | "stop" | "retry" }) {
  const paths = {
    new: "M12 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3l4 3v-3h7a2 2 0 0 0 2-2v-5M18 2v8m-4-4h8",
    history: "M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 2",
    export: "M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5",
    settings: "m9 3 1-2h4l1 2 2 1 3 0 2 4-2 2v3l2 2-2 4-3 0-2 1-1 2h-4l-1-2-2-1H4l-2-4 2-2v-3L2 8l2-4h3Z M16 11a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    send: "M12 20V4m-7 7 7-7 7 7",
    stop: "M6 6h12v12H6Z",
    retry: "M3 11a9 9 0 1 1 2 7M3 4v7h7",
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={name === "more" ? 4 : 1.7} strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>;
}
