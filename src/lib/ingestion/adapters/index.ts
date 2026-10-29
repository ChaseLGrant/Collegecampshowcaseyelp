import type { SourceAdapter, SourceRecord } from "../types";
import { csvAdapter } from "./csv";
import { icalAdapter } from "./ical";
import { jsonFeedAdapter } from "./json-feed";
import { schemaOrgAdapter } from "./schema-org";

export const ADAPTERS: Record<SourceRecord["adapter"], SourceAdapter | null> = {
  schema_org: schemaOrgAdapter,
  ical: icalAdapter,
  json_feed: jsonFeedAdapter,
  csv: csvAdapter,
  manual: null, // manual submissions enter the queue directly
};
