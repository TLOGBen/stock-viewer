import express from "express";
import type { RequestHandler } from "express";

/**
 * middleware/json — JSON body parser for incoming requests.
 * Centralized here so the composition root and action layer don't reach into
 * express body-parsing details.
 */
export function jsonBody(): RequestHandler {
  return express.json();
}
