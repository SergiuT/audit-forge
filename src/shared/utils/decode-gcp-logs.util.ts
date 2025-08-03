import * as protobuf from 'protobufjs';
import * as path from 'path';

let auditLogRoot: protobuf.Root;
let AuditLogType: protobuf.Type;
// Helper to decode protoPayload
export async function decodeGcpAuditLogs(entries: any[]): Promise<string[]> {
  const protoPath = path.resolve(__dirname, '../schemas/auditlog.proto');
  auditLogRoot = await protobuf.load(protoPath);
  AuditLogType = auditLogRoot.lookupType('google.cloud.audit.AuditLog');

  return entries.map((entry) => {
    try {
      const payload = entry.metadata?.protoPayload;

      if (payload && payload.value && Buffer.isBuffer(payload.value)) {
        const decoded = AuditLogType.decode(payload.value);
        const json = AuditLogType.toObject(decoded, {
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
        });

        return JSON.stringify({
          timestamp: entry.metadata.timestamp,
          logName: entry.metadata.logName,
          resource: entry.metadata.resource,
          severity: entry.metadata.severity,
          protoPayload: json,
        }, null, 2);
      }

      return JSON.stringify(entry.metadata, null, 2);
    } catch (err) {
      console.warn('Failed to decode log entry', err);
      return JSON.stringify(entry.metadata, null, 2);
    }
  });
}
