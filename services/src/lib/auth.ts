import { createHmac, randomBytes } from "node:crypto";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError } from "./errors";
import { ddb, tableName } from "./ddb";

export interface Account {
  acctId: string;
  name: string;
  groqKeyEnc?: string;
}

export const generateApiKey = () => `ut_live_${randomBytes(24).toString("hex")}`;

export const hashApiKey = (key: string, pepper: string) =>
  createHmac("sha256", pepper).update(key).digest("hex");

export async function requireAccount(event: {
  headers?: Record<string, string | undefined>;
}): Promise<Account> {
  const authHeader = event.headers?.authorization ?? event.headers?.Authorization ?? "";
  const m = authHeader.match(/^Bearer (ut_live_[0-9a-f]{48})$/);
  if (!m) throw new ApiError(401, "unauthorized", "Missing or malformed API key");
  const hash = hashApiKey(m[1], process.env.KEY_PEPPER!);
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :k",
      ExpressionAttributeValues: { ":k": `KEYHASH#${hash}` },
    }),
  );
  const item = res.Items?.[0];
  if (!item) throw new ApiError(401, "unauthorized", "Unknown API key");
  return item as Account;
}
