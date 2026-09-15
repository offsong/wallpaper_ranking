const fs = require("fs");
const path = require("path");
const {cert, initializeApp} = require("firebase-admin/app");
const {FieldValue, getFirestore} = require("firebase-admin/firestore");

const MIN_SCORE = 3;
const DEFAULT_MIN_COUNT = 20;
const MAX_COUNT = 100;
const VERSION_CONFIG_URL =
  "https://offsong.github.io/version_check/version.json";
// Static JSON mirror of popularSummary/current, published to
// https://offsong.github.io/popular/{appId}.json so the Android client can read it
// with a plain HTTPS GET instead of a Firestore read (which required creating an
// anonymous Firebase Auth user on every fresh install just to view the ranking).
const JSON_OUTPUT_DIR = process.env.POPULAR_JSON_OUTPUT_DIR || null;

async function main() {
  const serviceAccount = readServiceAccount();
  const expectedProjectId = process.env.FIREBASE_PROJECT_ID;
  if (expectedProjectId && serviceAccount.project_id !== expectedProjectId) {
    throw new Error(
        `Credential project ${serviceAccount.project_id} does not match ` +
        `FIREBASE_PROJECT_ID ${expectedProjectId}`,
    );
  }

  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  const db = getFirestore();
  const minimumCount = await loadPopularMinCount(db);
  const snapshot = await db.collectionGroup("popularWallpapers")
      .get();

  const candidatesByApp = new Map();
  for (const document of snapshot.docs) {
    const data = document.data();
    const appDocument = document.ref.parent.parent;
    if (!appDocument || data.appId !== appDocument.id ||
        data.imageId !== document.id || !Number.isFinite(data.score) ||
        data.score < MIN_SCORE) {
      continue;
    }

    if (!candidatesByApp.has(data.appId)) {
      candidatesByApp.set(data.appId, []);
    }
    candidatesByApp.get(data.appId).push({
      imageId: data.imageId,
      score: data.score,
      updatedAt: timestampMillis(data.updatedAt),
    });
  }
  let updatedApps = 0;
  for (const [appId, candidates] of candidatesByApp) {
    candidates.sort(compareCandidates);
    if (candidates.length < minimumCount) continue;

    const images = candidates.slice(0, MAX_COUNT)
        .map((candidate) => candidate.imageId);
    const updatedAt = new Date();
    await db.collection("gameApps").doc(appId)
        .collection("popularSummary").doc("current")
        .set({
          images,
          updatedAt: FieldValue.serverTimestamp(),
          minimumScore: MIN_SCORE,
          minimumCount,
          eligibleCount: candidates.length,
        });
    writeJsonSummary(appId, images, updatedAt);
    updatedApps += 1;
  }

  console.log("Popular summaries refreshed", {
    projectId: serviceAccount.project_id,
    eligibleDocuments: snapshot.size,
    candidateApps: candidatesByApp.size,
    updatedApps,
    minimumCount,
  });
}
function readServiceAccount() {
  const value = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!value) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(value);
  } catch (error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON", {
      cause: error,
    });
  }
  if (!serviceAccount.project_id || !serviceAccount.client_email ||
      !serviceAccount.private_key) {
    throw new Error("Firebase service account JSON is missing required fields");
  }
  return serviceAccount;
}

async function loadPopularMinCount(db) {
  const cache = db.collection("systemConfig").doc("popular");
  try {
    const response = await fetch(VERSION_CONFIG_URL, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`version.json returned ${response.status}`);

    const root = await response.json();
    const value = root && root.ad_config && root.ad_config.popular_min_count;
    if (!isValidMinimumCount(value)) {
      throw new Error("version.json has an invalid popular_min_count");
    }

    await cache.set({
      minimumCount: value,
      sourceUrl: VERSION_CONFIG_URL,
      fetchedAt: FieldValue.serverTimestamp(),
    });
    return value;
  } catch (error) {
    console.warn("Could not refresh popular_min_count", error);
    const cached = await cache.get();
    const value = cached.exists ? cached.get("minimumCount") : null;
    return isValidMinimumCount(value) ? value : DEFAULT_MIN_COUNT;
  }
}
function isValidMinimumCount(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_COUNT;
}

// Mirrors the same ranking as a static JSON file, in the format documented in
// popular_pipeline/README.md, for the Android client to fetch directly.
function writeJsonSummary(appId, images, updatedAt) {
  if (!JSON_OUTPUT_DIR) return;
  try {
    fs.mkdirSync(JSON_OUTPUT_DIR, {recursive: true});
    const filePath = path.join(JSON_OUTPUT_DIR, `${appId}.json`);
    const body = JSON.stringify({
      updatedAt: updatedAt.toISOString(),
      images,
    });
    fs.writeFileSync(filePath, body);
  } catch (error) {
    console.error(`Failed to write JSON summary for ${appId}`, error);
  }
}

function timestampMillis(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

function compareCandidates(left, right) {
  return right.score - left.score ||
    right.updatedAt - left.updatedAt ||
    left.imageId.localeCompare(right.imageId);
}

main().catch((error) => {
  console.error("Popular summary refresh failed", error);
  process.exitCode = 1;
});
