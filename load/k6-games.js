/* global __ENV */
import http from "k6/http";
import { check } from "k6";

// 100,000 completed games/day is about 1.16 requests/second.
// The peak scenario holds 100 completions/second for 30 seconds.
// Point STAGING_URL at a staging Worker. This script does not call production by itself.
const base = __ENV.STAGING_URL;
if (!base || !base.startsWith("https://")) {
  throw new Error("Set STAGING_URL to the staging https origin, for example https://staging.example.workers.dev");
}

export const options = {
  scenarios: {
    daily_average: {
      executor: "constant-arrival-rate",
      rate: 2,
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 20,
      maxVUs: 50,
      exec: "completeGame",
    },
    peak_burst: {
      executor: "constant-arrival-rate",
      rate: 100,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 150,
      maxVUs: 300,
      startTime: "2m",
      exec: "completeGame",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

export function completeGame() {
  const response = http.post(
    `${base.replace(/\/$/, "")}/api/paid/games/complete`,
    JSON.stringify({
      edition: "west",
      answers: [[1], [0], [0, 1, 2], [0], [0], [1], [0], [0, 1, 2], [0], [0], [0, 1, 2], [0]],
    }),
    { headers: { "content-type": "application/json" } },
  );
  check(response, { "game completed": (result) => result.status === 200 });
}
