const pool = require("../database/db");

const getParentDashboard = async (userId) => {
  const userIdNumber = Number(userId);

  const dbInfo = await pool.query(`
    SELECT 
      current_database(),
      current_user,
      inet_server_addr(),
      inet_server_port()
  `);

  console.log("INFO BD NODE:", dbInfo.rows);

  const achievementRows = await pool.query(`
  SELECT *
  FROM "FloFlo".user_achievement
  LIMIT 5
`);

  console.log("ROWS:", achievementRows.rows);

  const emotions = await pool.query(
    `SELECT COUNT(*) FROM "FloFlo".mood WHERE user_id = $1`,
    [userIdNumber],
  );

  const routines = await pool.query(
    `SELECT COUNT(*) FROM "FloFlo".routine WHERE user_id = $1`,
    [userIdNumber],
  );

  const places = await pool.query(
    `SELECT COUNT(*) FROM "FloFlo".place WHERE user_id = $1`,
    [userIdNumber],
  );

  const contacts = await pool.query(
    `SELECT COUNT(*) FROM "FloFlo".user_contact WHERE user_id = $1`,
    [userIdNumber],
  );

  const conversations = await pool.query(
    `
    SELECT
      (
        SELECT COUNT(*)
        FROM "FloFlo".conversation
      )
      +
      (
        SELECT COUNT(*)
        FROM "FloFlo".user_contact_conversation
        WHERE user_id = $1
      ) AS count
    `,
    [userIdNumber],
  );

  const achievements = await pool.query(
    `
    SELECT COUNT(*)
    FROM "FloFlo".user_achievement
    WHERE user_id = $1
    `,
    [userIdNumber],
  );

  const latestAchievements = await pool.query(
    `
  SELECT 
    a.id,
    a.name,
    a.description,
    a.icon,
    ua.unlocked_at
  FROM "FloFlo".user_achievement ua
  JOIN "FloFlo".achievement a
    ON a.id = ua.achievement_id
  WHERE ua.user_id = $1
  ORDER BY ua.unlocked_at DESC
  LIMIT 3
  `,
    [userIdNumber],
  );

  return {
    emotions: Number(emotions.rows[0].count),
    routines: Number(routines.rows[0].count),
    places: Number(places.rows[0].count),
    contacts: Number(contacts.rows[0].count),
    conversations: Number(conversations.rows[0].count),
    achievements: Number(achievements.rows[0].count),
    latestAchievements: latestAchievements.rows,
  };
};

module.exports = {
  getParentDashboard,
};
