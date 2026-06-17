/** MCP formatting for messaging tools with live Pub/Sub overlay (MSG-10). */

export interface LiveVerificationView {
  status: string;
  expectedTopicShortId?: string | null;
  liveTopicShortId?: string | null;
  liveTopicFullName?: string | null;
  verifiedAt?: string | null;
  evidenceSource?: string | null;
}

export interface PubSubResourceRow {
  shortId?: string;
  role?: string;
  resourceKind?: string;
  fullResourceId?: string | null;
  liveVerification?: LiveVerificationView | null;
}

export interface FlowGap {
  gapType: string;
  description: string;
  hopOrder?: number | null;
  topicShortId?: string | null;
}

export interface HopParticipantSummary {
  serviceName?: string;
  repo?: string;
  serviceId?: string;
  linkedClassSimpleName?: string;
  role?: string;
  transport?: string;
  label?: string;
}

export interface CrossRepoHopSummary {
  order?: number;
  topicShortId?: string;
  transport?: string;
  summaryLine?: string;
  publishers?: HopParticipantSummary[];
  subscribers?: HopParticipantSummary[];
}

export interface LivePubSubEnvelope {
  livePubSubStatus?: string | null;
  livePubSubVerifiedCount?: number | null;
  livePubSubSkippedCount?: number | null;
}

export interface ResponseEnvelope<T> extends LivePubSubEnvelope {
  schemaVersion?: string;
  freshnessStatus?: string;
  data: T;
}

function liveStatusLine(envelope: LivePubSubEnvelope): string | null {
  if (!envelope.livePubSubStatus || envelope.livePubSubStatus === "DISABLED") {
    return null;
  }
  return (
    `Live GCP Pub/Sub: **${envelope.livePubSubStatus}**` +
    ` (verified=${envelope.livePubSubVerifiedCount ?? 0}, skipped=${envelope.livePubSubSkippedCount ?? 0})`
  );
}

function formatLiveVerification(live: LiveVerificationView): string {
  if (live.status === "OK") {
    return `OK → ${live.liveTopicShortId ?? live.expectedTopicShortId ?? "?"}`;
  }
  if (live.status === "TOPIC_MISMATCH") {
    return `TOPIC_MISMATCH: live=${live.liveTopicShortId}, expected=${live.expectedTopicShortId}`;
  }
  return live.status;
}

function formatGapLine(gap: FlowGap): string {
  const hopRef = gap.hopOrder != null ? `hop ${gap.hopOrder}` : "hop ?";
  const topicRef = gap.topicShortId ? `\`${gap.topicShortId}\`` : "?";
  return `- **[${hopRef}] ${gap.gapType}** · ${topicRef}: ${gap.description}`;
}

export function formatPubSubInventoryResponse(envelope: ResponseEnvelope<PubSubResourceRow[]>): string {
  const lines: string[] = ["## Pub/Sub inventory"];
  const liveLine = liveStatusLine(envelope);
  if (liveLine) lines.push(liveLine);

  const rows = envelope.data ?? [];
  lines.push(`Resources: **${rows.length}**`);

  const subs = rows.filter((r) => r.role === "SUBSCRIBE" || r.resourceKind === "SUBSCRIPTION");
  if (subs.length > 0) {
    lines.push("\n### Subscriptions");
    for (const sub of subs) {
      let line = `- \`${sub.shortId}\``;
      if (sub.liveVerification) {
        line += ` — ${formatLiveVerification(sub.liveVerification)}`;
      }
      lines.push(line);
    }
  }

  const topics = rows.filter((r) => r.role === "PUBLISH" || r.resourceKind === "TOPIC");
  if (topics.length > 0) {
    lines.push("\n### Topics");
    for (const topic of topics) {
      lines.push(`- \`${topic.shortId}\` (${topic.role ?? "PUBLISH"})`);
    }
  }

  return lines.join("\n");
}

interface CrossRepoHop {
  order?: number;
  topicShortId?: string;
  transport?: string;
  subscribers?: Array<{ shortId?: string; serviceId?: string; liveVerification?: LiveVerificationView | null }>;
  publishers?: Array<{ shortId?: string; serviceId?: string; serviceName?: string }>;
}

export interface CrossRepoReport {
  startTopic?: string;
  envLane?: string;
  hops?: CrossRepoHop[];
  gaps?: FlowGap[];
  consistencyHints?: unknown[];
  hopSummaries?: CrossRepoHopSummary[];
  narrative?: string[];
}

export interface SingleServiceReport {
  topicShortId?: string;
  envLane?: string;
  steps?: unknown[];
  gaps?: FlowGap[];
  pubsubResources?: PubSubResourceRow[];
}

function formatCrossRepoFromNarrative(cross: CrossRepoReport): string[] {
  const lines: string[] = [];
  for (const line of cross.narrative ?? []) {
    if (line.trim()) {
      lines.push(line);
    }
  }
  return lines;
}

function formatCrossRepoFromHopSummaries(cross: CrossRepoReport): string[] {
  const lines: string[] = [];
  for (const hop of cross.hopSummaries ?? []) {
    if (hop.summaryLine) {
      lines.push(hop.summaryLine);
      continue;
    }
    lines.push(
      `Hop ${hop.order ?? "?"} · \`${hop.topicShortId ?? "?"}\` [${hop.transport ?? "?"}]`
    );
    for (const pub of hop.publishers ?? []) {
      lines.push(`  ← publish: ${pub.label ?? pub.serviceName ?? pub.serviceId ?? "?"}`);
    }
    for (const sub of hop.subscribers ?? []) {
      lines.push(`  → subscribe: ${sub.label ?? sub.serviceName ?? sub.serviceId ?? "?"}`);
    }
  }
  return lines;
}

function formatCrossRepoFromRawHops(cross: CrossRepoReport): string[] {
  const lines: string[] = [];
  for (const hop of cross.hops ?? []) {
    lines.push(`\n### Hop ${hop.order ?? "?"} — \`${hop.topicShortId}\` [${hop.transport ?? "?"}]`);
    if (hop.publishers?.length) {
      lines.push(
        `Publishers: ${hop.publishers.map((p) => p.serviceName ?? p.serviceId ?? p.shortId).join(", ")}`
      );
    }
    for (const sub of hop.subscribers ?? []) {
      let subLine = `- subscriber \`${sub.shortId}\` (${sub.serviceId ?? "?"})`;
      if (sub.liveVerification) {
        subLine += ` — ${formatLiveVerification(sub.liveVerification)}`;
      }
      lines.push(subLine);
    }
  }
  return lines;
}

function formatCrossRepoGaps(cross: CrossRepoReport, skipTypes: Set<string>): string[] {
  const lines: string[] = [];
  const gaps = (cross.gaps ?? []).filter((g) => !skipTypes.has(g.gapType));
  if (gaps.length === 0) {
    return lines;
  }
  const hasNarrativeGaps = (cross.narrative ?? []).some((line) => line.startsWith("Gaps:"));
  if (hasNarrativeGaps) {
    return lines;
  }
  lines.push("\n### Gaps");
  for (const gap of gaps) {
    lines.push(formatGapLine(gap));
  }
  return lines;
}

export function formatTraceTopicFlowResponse(
  envelope: ResponseEnvelope<CrossRepoReport | SingleServiceReport>,
  crossRepo: boolean
): string {
  const lines: string[] = [
    crossRepo ? "## Cross-repo event flow trace" : "## Single-service event flow trace",
  ];
  const liveLine = liveStatusLine(envelope);
  if (liveLine) lines.push(liveLine);

  const report = envelope.data;
  if (!report) {
    lines.push("_No trace data._");
    return lines.join("\n");
  }

  if (crossRepo) {
    const cross = report as CrossRepoReport;
    lines.push(`Topic: \`${cross.startTopic ?? "?"}\` · env: **${cross.envLane ?? "?"}**`);
    lines.push(`Hops: **${cross.hops?.length ?? cross.hopSummaries?.length ?? 0}**`);

    if ((cross.narrative ?? []).length > 0) {
      lines.push("");
      lines.push(...formatCrossRepoFromNarrative(cross));
    } else if ((cross.hopSummaries ?? []).length > 0) {
      lines.push("");
      lines.push(...formatCrossRepoFromHopSummaries(cross));
      lines.push(...formatCrossRepoGaps(cross, new Set()));
    } else {
      lines.push(...formatCrossRepoFromRawHops(cross));
      lines.push(...formatCrossRepoGaps(cross, new Set()));
    }
  } else {
    const single = report as SingleServiceReport;
    lines.push(`Topic: \`${single.topicShortId ?? "?"}\` · env: **${single.envLane ?? "?"}**`);
    lines.push(`Steps: **${single.steps?.length ?? 0}**`);
    const subs = (single.pubsubResources ?? []).filter(
      (r) => r.role === "SUBSCRIBE" || r.resourceKind === "SUBSCRIPTION"
    );
    if (subs.length > 0) {
      lines.push("\n### Subscriptions (live overlay)");
      for (const sub of subs) {
        let line = `- \`${sub.shortId}\``;
        if (sub.liveVerification) {
          line += ` — ${formatLiveVerification(sub.liveVerification)}`;
        }
        lines.push(line);
      }
    }
  }

  const gcpGaps = (report.gaps ?? []).filter((g) => g.gapType.startsWith("GCP_"));
  if (gcpGaps.length > 0) {
    lines.push("\n### ⚠️ GCP drift gaps");
    for (const gap of gcpGaps) {
      lines.push(formatGapLine(gap));
    }
  } else if (envelope.livePubSubStatus === "OK") {
    lines.push("\nGCP subscriptions match indexed topology.");
  }

  return lines.join("\n");
}

export function formatMessagingFullJson(envelope: unknown): string {
  return "Full JSON:\n" + JSON.stringify(envelope, null, 2);
}

export function parseFullJsonBlock(text: string): unknown {
  const marker = "Full JSON:\n";
  const idx = text.indexOf(marker);
  return JSON.parse(idx >= 0 ? text.slice(idx + marker.length) : text);
}
