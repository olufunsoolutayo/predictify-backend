/**
 * A catalog of common SQL injection payloads used for security regression testing.
 * Collected from OWASP and common SQLi testing guidelines.
 */
export const sqlInjectionPayloads: string[] = [
  // 1. Tautologies (always true conditions)
  "' OR '1'='1",
  "' OR 1=1 --",
  "1 OR 1=1",
  "\" OR \"\"=\"",
  "' OR 'x'='x",

  // 2. Piggybacked / Stacked Queries
  "'; DROP TABLE users; --",
  "1; DROP TABLE users",
  "'; SELECT pg_sleep(5); --",
  "'; SELECT 1; --",

  // 3. UNION-based Injections
  "' UNION SELECT null --",
  "' UNION SELECT null, null, null --",
  "' UNION SELECT username, password FROM users --",

  // 4. Boolean-based and error-based logic
  "' AND 1=2 --",
  "1 AND 1=2",
  "' AND (SELECT 1 FROM (SELECT(SLEEP(5)))a) --",

  // 5. Comments and special characters
  "/*",
  "--",
  "'; --",
  "admin' --",
  "admin' #",
  "'--"
];
