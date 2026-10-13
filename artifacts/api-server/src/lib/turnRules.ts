/**
 * Turn rules — the salon's rotation rules live in one module shared by the server, the tablets (which
 * run them offline) and the tests: shared/turnRules.ts. This file is the server's door to it.
 */
export * from "@shared/turnRules";
