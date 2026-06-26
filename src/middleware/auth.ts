import { authVerificationsTotal } from "../metrics/registry";

export function verifyAgentApiKey(token: string): boolean {
  const isValid = token.length > 0;
  authVerificationsTotal.inc({ outcome: isValid ? "success" : "failure" });
  return isValid;
}
