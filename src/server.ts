import path from "node:path";
import express from "express";
import { fileURLToPath } from "node:url";
import { createCaptureSchema, createEvidenceSchema, createExtractionSchema, createUserActionSchema, recomputeSignalsSchema, reviewExtractionSchema } from "./lib/schemas.js";
import { createRepository } from "./lib/data.js";
import { asyncHandler, errorHandler, HttpError, requestLogger } from "./lib/http.js";
import type { Repository } from "./lib/repository.js";
import type { SubjectType } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..", "web");
export function createApp(repository: Repository) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(requestLogger);
  app.use("/app", express.static(webRoot));

  async function resolveUserId(req: express.Request): Promise<string> {
    const headerUser = req.header("x-user-id");
    if (headerUser) {
      const user = await repository.getUserById(headerUser);
      if (!user) {
        throw new HttpError(401, "Unknown user");
      }
      return user.id;
    }
    const defaultUser = await repository.getDefaultUser();
    return defaultUser.id;
  }

  app.get("/api/v1/search", asyncHandler(async (req, res) => {
    const q = String(req.query.q || "");
    const type = String(req.query.type || "all");
    res.json(await repository.search(q, type));
  }));

  app.get("/api/v1/evidence", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    const reviewed = req.query.reviewed === undefined ? undefined : req.query.reviewed === "true";
    res.json(await repository.listEvidence(userId, { reviewed }));
  }));

  app.post("/api/v1/evidence", asyncHandler(async (req, res) => {
    const payload = createEvidenceSchema.parse(req.body);
    const result = await repository.createEvidence({
      ...payload,
      license_notes: payload.license_notes ?? null,
    });
    console.log(JSON.stringify({ type: "audit", event: "evidence_ingested", evidence_id: result.evidence.id, created: result.created }));
    res.status(result.created ? 201 : 200).json(result);
  }));

  app.get("/api/v1/evidence/:id", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    const item = await repository.getEvidenceById(req.params.id, userId);
    if (!item) {
      throw new HttpError(404, "Evidence not found");
    }
    res.json(item);
  }));

  app.post("/api/v1/extractions", asyncHandler(async (req, res) => {
    const payload = createExtractionSchema.parse(req.body);
    const extraction = await repository.createExtraction(payload);
    console.log(JSON.stringify({ type: "audit", event: "extraction_recorded", extraction_id: extraction.id, evidence_id: extraction.evidence_id }));
    res.status(201).json(extraction);
  }));

  app.post("/api/v1/extractions/:id/review", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    const payload = reviewExtractionSchema.parse(req.body);
    try {
      const extraction = await repository.reviewExtraction(req.params.id, {
        ...payload,
        reviewed_by: userId,
      });
      console.log(JSON.stringify({ type: "audit", event: "extraction_reviewed", extraction_id: extraction.id, review_status: extraction.review_status }));
      res.json(extraction);
    } catch (error) {
      if (error instanceof Error && error.message === "EXTRACTION_NOT_FOUND") {
        throw new HttpError(404, "Extraction not found");
      }
      throw error;
    }
  }));

  app.post("/api/v1/user-actions", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    const payload = createUserActionSchema.parse(req.body);
    const action = await repository.createUserAction({
      ...payload,
      user_id: userId,
    });
    res.status(201).json(action);
  }));

  app.get("/api/v1/discoveries", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    const minConfidence = req.query.min_confidence === undefined ? undefined : Number(req.query.min_confidence);
    const discoveries = await repository.listDiscoveries(userId, {
      subject_type: req.query.subject_type as SubjectType | undefined,
      subject_id: req.query.subject_id as string | undefined,
      status: req.query.status as "suggested" | "captured" | "dismissed" | "flagged_for_review" | undefined,
      min_confidence: Number.isNaN(minConfidence) ? undefined : minConfidence,
    });
    res.json(discoveries);
  }));

  app.get("/api/v1/discoveries/:id", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    const discovery = await repository.getDiscoveryById(req.params.id, userId);
    if (!discovery) {
      throw new HttpError(404, "Discovery not found");
    }
    res.json(discovery);
  }));

  app.get("/api/v1/discoveries/:id/explanation", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    const discovery = await repository.getDiscoveryById(req.params.id, userId);
    if (!discovery) {
      throw new HttpError(404, "Discovery not found");
    }
    res.json(discovery.explanation_json);
  }));

  app.post("/api/v1/discoveries/:id/capture", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    const note = typeof req.body.note === "string" ? req.body.note : null;
    try {
      const capture = await repository.captureDiscovery(userId, { discovery_id: req.params.id, note });
      res.status(201).json(capture);
    } catch (error) {
      if (error instanceof Error && error.message === "DISCOVERY_NOT_FOUND") {
        throw new HttpError(404, "Discovery not found");
      }
      if (error instanceof Error && error.message === "EVIDENCE_NOT_REVIEWED") {
        throw new HttpError(400, "Capture blocked until evidence reviewed", "Review linked evidence before capture.");
      }
      throw error;
    }
  }));

  app.post("/api/v1/captures", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    const payload = createCaptureSchema.parse(req.body);
    try {
      const capture = await repository.captureDiscovery(userId, payload);
      res.status(201).json(capture);
    } catch (error) {
      if (error instanceof Error && error.message === "DISCOVERY_NOT_FOUND") {
        throw new HttpError(404, "Discovery not found");
      }
      if (error instanceof Error && error.message === "EVIDENCE_NOT_REVIEWED") {
        throw new HttpError(400, "Capture blocked until evidence reviewed", "Review linked evidence before capture.");
      }
      throw error;
    }
  }));

  app.get("/api/v1/me", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    const user = await repository.getUserById(userId);
    if (!user) {
      throw new HttpError(404, "User not found");
    }
    res.json(user);
  }));

  app.get("/api/v1/me/captures", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    res.json(await repository.listCaptures(userId));
  }));

  app.get("/api/v1/watchlist", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    res.json(await repository.listWatchlist(userId));
  }));

  app.get("/api/v1/leaderboards", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    res.json(await repository.getLeaderboards(userId));
  }));

  app.post("/api/v1/captures/:id/share", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    try {
      res.json(await repository.shareCapture(userId, req.params.id));
    } catch (error) {
      if (error instanceof Error && error.message === "CAPTURE_NOT_FOUND") {
        throw new HttpError(404, "Capture not found");
      }
      throw error;
    }
  }));

  app.post("/api/v1/signals/recompute", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    const payload = recomputeSignalsSchema.parse(req.body);
    const result = await repository.recomputeSubject(payload.subject_type, payload.subject_id, userId);
    console.log(JSON.stringify({ type: "audit", event: "signals_recomputed", subject_type: payload.subject_type, subject_id: payload.subject_id, discoveries: result.discoveries.length }));
    res.json(result);
  }));

  app.get("/api/v1/people/:id", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    const profile = await repository.getEntityProfile("person", req.params.id, userId);
    if (!profile) {
      throw new HttpError(404, "Person not found");
    }
    res.json(profile);
  }));

  app.get("/api/v1/organizations/:id", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    const profile = await repository.getEntityProfile("org", req.params.id, userId);
    if (!profile) {
      throw new HttpError(404, "Organization not found");
    }
    res.json(profile);
  }));

  app.get("/api/v1/events/:id", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    const profile = await repository.getEntityProfile("event", req.params.id, userId);
    if (!profile) {
      throw new HttpError(404, "Event not found");
    }
    res.json(profile);
  }));

  app.get("/api/v1/scores/:subjectType/:subjectId", asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    const profile = await repository.getEntityProfile(req.params.subjectType as SubjectType, req.params.subjectId, userId);
    if (!profile) {
      throw new HttpError(404, "Subject not found");
    }
    res.json(profile.scores);
  }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }
    return res.sendFile(path.join(webRoot, "index.html"));
  });

  app.use(errorHandler);
  return app;
}

const app = createApp(createRepository());

const port = Number(process.env.PORT || 3000);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`Vetala API running on :${port}`);
  });
}

export default app;
