import * as protobuf from 'protobufjs';
import { join } from 'path';

// Helper to decode protoPayload
export async function decodeGcpAuditLogs(entries: any[]): Promise<string[]> {
  const protoPath = join(__dirname, '../schemas/auditlog.proto');
  const root = await protobuf.load(protoPath);
  const AuditLog = root.lookupType('google.cloud.audit.AuditLog');

  const logs: string[] = [];

  for (const entry of entries) {
    try {
      const rawValue = entry?.data?.value;

      if (!rawValue) {
        continue;
      }

      if (rawValue && typeof rawValue === 'object') {
        const byteArray = Object.values(rawValue);
        const buffer = Buffer.from(byteArray as number[]);

        const decoded = AuditLog.decode(buffer);
        const readable = AuditLog.toObject(decoded, {
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
        });

        logs.push(JSON.stringify(readable, null, 2));
      } else {
        logs.push('[Missing protoPayload or value]');
      }
    } catch (err) {
      console.error('Failed to decode log entry:', err);
      logs.push('[Failed to decode]');
    }
  }

  return logs;
}
