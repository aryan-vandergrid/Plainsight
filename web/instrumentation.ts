export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { listLaunches } = await import("./lib/server/launches");
  listLaunches().catch(() => {});
}
