const pool = require("../database/db");

const unlockAchievement = async (userId, achievementId) => {
  const existing = await pool.query(
    `
    SELECT *
    FROM "FloFlo".user_achievement
    WHERE user_id = $1
    AND achievement_id = $2
    `,
    [Number(userId), Number(achievementId)]
  );

  if (existing.rows.length > 0) {
    return null;
  }

  const result = await pool.query(
    `
    INSERT INTO "FloFlo".user_achievement
    (
      user_id,
      achievement_id,
      unlocked_at
    )
    VALUES ($1, $2, NOW())
    RETURNING *
    `,
    [Number(userId), Number(achievementId)]
  );

  return result.rows[0];
};

const checkAndUnlockAchievements = async (userId) => {
  const progressResult = await pool.query(
    `
    SELECT *
    FROM "FloFlo".user_progress
    WHERE user_id = $1
    `,
    [Number(userId)]
  );

  if (progressResult.rows.length === 0) {
    return [];
  }

  const progress = progressResult.rows[0];

  const achievementsResult = await pool.query(
    `
    SELECT *
    FROM "FloFlo".achievement
    ORDER BY required_value ASC
    `
  );

  const unlockedAchievements = [];

  for (const achievement of achievementsResult.rows) {
    let currentValue = 0;

    if (achievement.required_type === "points") {
      currentValue = Number(progress.points || 0);
    }

    if (achievement.required_type === "completed_conversations") {
      currentValue = Number(progress.completed_conversations || 0);
    }

    if (achievement.required_type === "completed_places") {
      currentValue = Number(progress.completed_places || 0);
    }

    if (achievement.required_type === "completed_routines") {
      currentValue = Number(progress.completed_routines || 0);
    }

    if (achievement.required_type === "completed_moods") {
      currentValue = Number(progress.completed_moods || 0);
    }

    if (achievement.required_type === "level") {
      currentValue = Number(progress.level || 1);
    }

    if (currentValue >= Number(achievement.required_value)) {
      const unlocked = await unlockAchievement(userId, achievement.id);

      if (unlocked) {
        unlockedAchievements.push(achievement);
      }
    }
  }

  return unlockedAchievements;
};

const getAchievementsByUser = async (userId) => {
  const result = await pool.query(
    `
    SELECT 
      a.id,
      a.name,
      a.description,
      a.icon,
      CASE 
        WHEN ua.id IS NULL THEN false
        ELSE true
      END AS unlocked,
      ua.unlocked_at
    FROM "FloFlo".achievement a
    LEFT JOIN "FloFlo".user_achievement ua
      ON ua.achievement_id = a.id
      AND ua.user_id = $1
    ORDER BY a.id;
    `,
    [Number(userId)]
  );

  return result.rows;
};

module.exports = {
  unlockAchievement,
  checkAndUnlockAchievements,
  getAchievementsByUser,
};