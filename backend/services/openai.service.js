/**
 * LUMEN AI focus insight generator.
 *
 * Uses the user's own focus analytics as input to OpenAI when
 * OPENAI_API_KEY is configured. If the key is missing or the API
 * is unavailable, we keep the original local rule-based insight.
 */

const db = require("../config/databse");
const analytics = require("./analytics.service");

function bestHourBlock(userId) {
  const row = db
    .prepare(
      `SELECT CAST(strftime('%H', started_at, 'localtime') AS INTEGER) AS hour, COUNT(*) AS n
       FROM focus_sessions
       WHERE user_id = ? AND status = 'completed' AND started_at >= datetime('now', '-28 days')
       GROUP BY hour ORDER BY n DESC, hour ASC LIMIT 1`
    )
    .get(userId);
  return row ? row.hour : null;
}

function buildLocalInsight(userId) {
  const week = analytics.weekly(userId);
  const pad = (n) => String(n).padStart(2, "0");

  if (week.sessions === 0) {
    return {
      title: "Start your first session to unlock insights.",
      body: "Once you complete a few focus sessions, Lumen AI will start spotting your best hours and patterns."
    };
  }

  const hour = bestHourBlock(userId);
  if (hour === null) {
    return {
      title: "Finish a full session to find your best window.",
      body:
        "You've started " +
        week.sessions +
        " session" +
        (week.sessions === 1 ? "" : "s") +
        " this week but none has run to the end yet. Complete one and Lumen AI can start spotting your rhythm."
    };
  }

  const windowEnd = (hour + 2) % 24;
  return {
    title: "Your best focus window starts around " + pad(hour) + ":00.",
    body:
      "Your completion rate this week is " +
      week.completionRate +
      "%, with most finished sessions between " +
      pad(hour) +
      ":00 and " +
      pad(windowEnd) +
      ":00. Protecting that window tends to produce your longest runs."
  };
}

function collectInsightData(userId) {
  const week = analytics.weekly(userId);
  const month = analytics.monthly(userId, 28);
  const topSounds = analytics.topSounds(userId, 3, 28);
  const hour = bestHourBlock(userId);

  return {
    period: "last 28 days",
    week: {
      range: week.range,
      focusedMinutes: Math.round(week.totalSeconds / 60),
      sessions: week.sessions,
      completedSessions: week.completedSessions,
      abandonedSessions: week.abandonedSessions,
      completionRate: week.completionRate,
      averageSessionMinutes: Math.round(week.averageSessionSeconds / 60)
    },
    last28Days: {
      range: month.range,
      focusedMinutes: Math.round(month.totalSeconds / 60),
      sessions: month.sessions,
      completedSessions: month.completedSessions,
      completionRate: month.completionRate,
      currentStreakDays: analytics.streak(userId),
      bestStreakDays: analytics.bestStreak(userId)
    },
    bestHour: hour,
    topSounds: topSounds.map((s) => ({
      name: s.name,
      artist: s.meta,
      focusedMinutes: Math.round(s.seconds / 60)
    }))
  };
}

function extractText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function parseInsight(text) {
  try {
    const parsed = JSON.parse(text);
    if (
      parsed &&
      typeof parsed.title === "string" &&
      typeof parsed.body === "string"
    ) {
      return {
        title: parsed.title.trim(),
        body: parsed.body.trim()
      };
    }
  } catch (_) {
    // The model was asked for JSON; if it still returns plain text,
    // keep the response useful instead of crashing the analytics page.
  }

  return {
    title: "Your latest focus pattern",
    body: text.trim()
  };
}

async function generateInsight(userId) {
  const apiKey = process.env.OPENAI_API_KEY;

  // Keep the portfolio demo useful even before an API key is configured.
  if (!apiKey) return buildLocalInsight(userId);

  const data = collectInsightData(userId);

  if (data.week.sessions === 0 && data.last28Days.sessions === 0) {
    return buildLocalInsight(userId);
  }

  const prompt = [
    "You are Lumen AI, a calm and concise productivity coach.",
    "Analyze only the user's focus-session analytics below.",
    "Do not invent facts or claim to know anything outside these numbers.",
    "Return valid JSON with exactly two string fields: title and body.",
    "The title should be short and specific.",
    "The body should be 1-2 natural sentences with one useful observation or suggestion.",
    "Do not mention that you are an AI or that a model was used.",
    "Do not use markdown.",
    "",
    JSON.stringify(data, null, 2)
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        input: prompt,
        max_output_tokens: 180
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      return buildLocalInsight(userId);
    }

    const result = await response.json();
    const text = extractText(result);

    if (!text) {
      return buildLocalInsight(userId);
    }

    return parseInsight(text);
  } catch (error) {
    console.error("OpenAI request failed:", error);
    return buildLocalInsight(userId);
  }
}

module.exports = { generateInsight };
