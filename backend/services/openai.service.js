/**
 * LUMEN AI focus insight generator.
 *
 * Uses the user's focus analytics as input to OpenAI.
 * If there is no usable analytics data, it returns an honest local message.
 * If OpenAI is configured but fails, the error is surfaced instead of
 * silently pretending the result was AI-generated.
 */

const db = require("../config/databse");
const analytics = require("./analytics.service");
const { ApiError } = require("../utils/helpers");

function bestHourBlock(userId) {
  const row = db
    .prepare(
      `SELECT CAST(strftime('%H', started_at, 'localtime') AS INTEGER) AS hour,
              COUNT(*) AS n
       FROM focus_sessions
       WHERE user_id = ?
         AND status = 'completed'
         AND started_at >= datetime('now', '-28 days')
       GROUP BY hour
       ORDER BY n DESC, hour ASC
       LIMIT 1`
    )
    .get(userId);

  return row ? row.hour : null;
}

function buildNoDataInsight() {
  return {
    title: "Complete a focus session to unlock LUMEN AI.",
    body:
      "Once you have finished sessions, LUMEN AI will analyze your actual focus patterns and generate a personalized insight.",
    source: "local"
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
      averageSessionMinutes: Math.round(
        week.averageSessionSeconds / 60
      )
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

    topSounds: topSounds.map((sound) => ({
      name: sound.name,
      artist: sound.meta,
      focusedMinutes: Math.round(sound.seconds / 60)
    }))
  };
}

async function generateInsight(userId) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new ApiError(
      503,
      "LUMEN AI is not configured on the server."
    );
  }

  const data = collectInsightData(userId);

  if (data.week.sessions === 0 && data.last28Days.sessions === 0) {
    return buildNoDataInsight();
  }

  const prompt = [
    "You are LUMEN AI, a calm and concise productivity coach.",
    "Analyze only the user's focus-session analytics below.",
    "Do not invent facts.",
    "Do not use information outside the supplied analytics.",
    "Return one concise personalized insight.",
    "The title must be short and specific.",
    "The body must be 1-2 natural sentences.",
    "Give one useful observation or practical suggestion.",
    "Do not mention being an AI model.",
    "Do not use markdown.",
    "",
    JSON.stringify(data, null, 2)
  ].join("\n");

  try {
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-5.6-luna",

          input: prompt,

          max_output_tokens: 180,

          text: {
            format: {
              type: "json_schema",
              name: "lumen_insight",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  title: {
                    type: "string"
                  },
                  body: {
                    type: "string"
                  }
                },
                required: ["title", "body"],
                additionalProperties: false
              }
            }
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        "OpenAI API error:",
        response.status,
        errorText
      );

      throw new ApiError(
        502,
        "LUMEN AI could not generate an insight right now."
      );
    }

    const result = await response.json();

    let text = "";

    if (
      typeof result.output_text === "string" &&
      result.output_text.trim()
    ) {
      text = result.output_text.trim();
    } else {
      for (const item of result.output || []) {
        for (const content of item.content || []) {
          if (
            typeof content.text === "string" &&
            content.text.trim()
          ) {
            text += content.text;
          }
        }
      }

      text = text.trim();
    }

    if (!text) {
      throw new ApiError(
        502,
        "LUMEN AI returned an empty insight."
      );
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      console.error(
        "Invalid LUMEN AI JSON:",
        text
      );

      throw new ApiError(
        502,
        "LUMEN AI returned an invalid insight."
      );
    }

    if (
      !parsed ||
      typeof parsed.title !== "string" ||
      typeof parsed.body !== "string"
    ) {
      throw new ApiError(
        502,
        "LUMEN AI returned an invalid insight."
      );
    }

    return {
      title: parsed.title.trim(),
      body: parsed.body.trim(),
      source: "openai"
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    console.error("OpenAI request failed:", error);

    throw new ApiError(
      502,
      "LUMEN AI is temporarily unavailable."
    );
  }
}

module.exports = {
  generateInsight
};