import { task } from "@trigger.dev/sdk";

// Smoke-test task proving the trigger.dev wiring works end-to-end:
// it runs in `trigger.dev dev` and after `trigger.dev deploy`. No external
// dependencies, so it stays green regardless of Supabase / OpenRouter config.
export const helloTask = task({
  id: "hello",
  run: async (payload: { name?: string }) => {
    const name = payload?.name ?? "Gekko";
    console.log(`Hello, ${name} — trigger.dev is wired up.`);
    return { greeting: `Hello, ${name}` };
  },
});
