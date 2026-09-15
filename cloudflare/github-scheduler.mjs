// Dedicated GitHub scheduler. Cron: */10 * * * * (UTC).
// GH_TOKEN: Contents read/write for keroppa88/202608 AND keroppa88/chart0.
// SCHEDULE_ENABLED: false until migration is ready.
export const SCHEDULES = {
  "40 7 * * 1-5": ["scheduled-chart0-daily"],
  "0 10 * * 1-5": ["scheduled-collect-jp"],
  "0 22 * * 1-5": [
    "scheduled-collect-usa",
    "scheduled-fear-greed",
    "scheduled-matsui",
    "scheduled-rates"
  ],
  "0 9 * * 1-5": [
    "scheduled-japan-stocks",
    "scheduled-jpx-index",
    "scheduled-nikkei-index",
    "scheduled-nikkei-jp",
    "scheduled-nikkei-kabu",
    "scheduled-nikkei-rank",
    "scheduled-yomiuri"
  ],
  "20 9 * * 1-5": [
    "scheduled-market-commodity"
  ],
  "10 0 * * 2-6": [
    "scheduled-market-crypto"
  ],
  "10 23 * * 1-5": [
    "scheduled-market"
  ],
  "0 23 * * 1-5": [
    "scheduled-nikkei-us"
  ],
  "30 9 * * 1-5": [
    "scheduled-ratios",
    "scheduled-stocks-copy"
  ]
};

export function scheduledEvents(scheduledTime) {
  const date = new Date(scheduledTime);
  return Object.entries(SCHEDULES).flatMap(([cron, events]) => {
    const [minute, hour, , , days] = cron.split(" ");
    const [first, last] = days.split("-").map(Number);
    return date.getUTCMinutes() === Number(minute) &&
      date.getUTCHours() === Number(hour) &&
      date.getUTCDay() >= first && date.getUTCDay() <= last ? events : [];
  });
}

export async function runSchedule(controller, env, send = fetch) {
  // 配備だけでは有効化しない。GitHub側の切替と合わせて設定する。
  console.log("cron received", new Date(controller.scheduledTime).toISOString());
  if (env.SCHEDULE_ENABLED !== "true") { console.log("scheduler disabled"); return; }
  const events = scheduledEvents(controller.scheduledTime);
  if (!events.length) { console.log("no jobs due"); return; }
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN が未設定");
  const results = await Promise.allSettled(events.map(async (event) => {
    const repo = ["scheduled-chart0-daily", "scheduled-collect-jp", "scheduled-collect-usa"].includes(event)
      ? "keroppa88/chart0" : "keroppa88/202608";
    const response = await send(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GH_TOKEN}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "github-scheduler"
      },
      body: JSON.stringify({
        event_type: event,
        client_payload: { scheduled_at: new Date(controller.scheduledTime).toISOString() }
      })
    });
    // 応答不明時の自動再送は二重起動になるため行わず、失敗をログへ残す。
    if (response.status !== 204) throw new Error(`${event}: GitHub HTTP ${response.status}`);
    console.log(`dispatch accepted: ${event}`);
  }));
  const errors = results.filter(r => r.status === "rejected").map(r => r.reason);
  if (errors.length) throw new AggregateError(errors, errors.map(String).join("; "));
}

export default {
  async scheduled(controller, env) {
    await runSchedule(controller, env);
  },
  async fetch() {
    return new Response("github-scheduler: scheduled events only", {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
};
